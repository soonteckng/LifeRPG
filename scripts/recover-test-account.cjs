// LOCAL NODE ONLY. Never import into the Expo application or deploy this helper.
/* global __dirname */
const { Buffer } = require('node:buffer');
const { createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');

const project = 'msuelivxpsfizkddjjfg';
const userId = 'e7147605-e165-48bf-acf2-bcfdd095b6a5';
const oldEmail = 'test@email.com';
const newEmail = 'zzz685913@gmail.com';
const tables = ['profiles', 'subjects', 'tasks', 'rewards', 'daily_progress', 'activity_sessions', 'reward_chests'];

class RecoveryError extends Error {}
function requireCheck(condition, message) {
  if (!condition) throw new RecoveryError(message);
}
function unwrap(result, step) {
  requireCheck(!result.error && result.data, `${step} failed. No provider details or credentials were logged.`);
  return result.data;
}
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
async function snapshot(client) {
  const records = {};
  for (const table of tables) {
    const rows = [];
    for (let offset = 0; ; offset += 200) {
      const page = unwrap(await client.from(table).select('*')
        .eq(table === 'profiles' ? 'id' : 'user_id', userId).order(table === 'daily_progress' ? 'progress_date' : 'id').range(offset, offset + 199), `Read ${table}`);
      rows.push(...page);
      if (page.length < 200) break;
      requireCheck(offset < 200000, 'Snapshot pagination limit reached; stopped safely.');
    }
    records[table] = rows;
  }
  requireCheck(records.profiles.length === 1 && records.profiles[0].id === userId && records.profiles[0].username === 'Soon Teck', 'Expected Soon Teck profile was not found; stopped.');
  return { digest: createHash('sha256').update(canonical(records)).digest('hex'), counts: Object.fromEntries(tables.map(table => [table, records[table].length])) };
}
async function assertAvailableEmail(client) {
  for (let page = 1; ; page++) {
    const data = unwrap(await client.auth.admin.listUsers({ page, perPage: 200 }), 'Check target email availability');
    requireCheck(Array.isArray(data.users), 'Invalid user-list response; stopped.');
    for (const user of data.users) {
      const emails = [user.email, user.email_change, user.new_email, ...(user.identities || []).map(identity => identity.identity_data?.email)];
      requireCheck(!emails.some(email => typeof email === 'string' && email.toLowerCase() === newEmail), 'Target email is already associated with an account; stopped.');
    }
    if (data.users.length < 200) return;
    requireCheck(page < 10000, 'User pagination limit reached; stopped safely.');
  }
}
async function recover(client, apply = false) {
  const beforeUser = unwrap(await client.auth.admin.getUserById(userId), 'Verify account').user;
  requireCheck(beforeUser?.id === userId && beforeUser.email === oldEmail, 'Account no longer matches the expected original ID/email; stopped.');
  await assertAvailableEmail(client);
  const before = await snapshot(client);
  // Recheck immediately before the only possible mutation.
  const current = unwrap(await client.auth.admin.getUserById(userId), 'Recheck account').user;
  requireCheck(current?.id === userId && current.email === oldEmail, 'Account changed during verification; stopped.');
  if (!apply) return { mode: 'read-only', verified: true, userId, email: oldEmail, profile: 'Soon Teck', counts: before.counts };
  // Intentionally ONLY email: no password, metadata, confirmation flag or session operation.
  const updated = unwrap(await client.auth.admin.updateUserById(userId, { email: newEmail }), 'Email update (may have succeeded; inspect before retrying)').user;
  requireCheck(updated?.id === userId && updated.email === newEmail, 'Update result did not match; inspect account before any retry.');
  const afterUser = unwrap(await client.auth.admin.getUserById(userId), 'Verify updated account').user;
  requireCheck(afterUser?.id === userId && afterUser.email === newEmail && afterUser.created_at === beforeUser.created_at, 'Post-update identity verification failed; do not retry or roll back automatically.');
  const after = await snapshot(client);
  requireCheck(after.digest === before.digest, 'Email updated, but account data changed during verification. Investigate; no rollback was attempted.');
  return { mode: 'email-updated', userId, email: newEmail, profile: 'Soon Teck', accountDataUnchanged: true, counts: after.counts };
}
function loadKey() {
  let key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    let local;
    try { local = readFileSync(resolve(__dirname, '../.env.admin.local'), 'utf8'); }
    catch { throw new RecoveryError('Configure the ignored .env.admin.local file privately; never paste a key in chat.'); }
    const match = local.match(/^SUPABASE_(?:SECRET_KEY|SERVICE_ROLE_KEY)\s*=\s*(.+)$/m);
    key = match?.[1]?.trim().replace(/^(['"])(.*)\1$/, '$2');
  }
  requireCheck(key && (key.startsWith('sb_secret_') || key.startsWith('eyJ')), 'A server-only secret or service_role key is required in .env.admin.local.');
  if (key.startsWith('eyJ')) {
    let claims;
    try { claims = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString('utf8')); }
    catch { throw new RecoveryError('Invalid administrator key format.'); }
    requireCheck(claims.role === 'service_role' && claims.ref === project, 'Legacy key must be service_role for the specified project.');
  }
  return key;
}
async function main() {
  requireCheck(process.argv.length <= 3 && (!process.argv[2] || process.argv[2] === '--apply'), 'Usage: node scripts/recover-test-account.cjs [--apply]');
  const { createClient } = require('@supabase/supabase-js');
  const client = createClient(`https://${project}.supabase.co`, loadKey(), { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  console.log(JSON.stringify(await recover(client, process.argv[2] === '--apply')));
}
if (require.main === module) main().catch(error => {
  // Never print raw API errors, requests, response objects, keys or stack traces.
  console.error(error instanceof RecoveryError ? error.message : 'Administrator operation failed; sensitive details suppressed. Inspect account state before retrying.');
  process.exitCode = 1;
});
module.exports = { recover };
