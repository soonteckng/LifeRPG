const test = require('node:test');
const assert = require('node:assert/strict');
const { recover } = require('../scripts/recover-test-account.cjs');
const id = 'e7147605-e165-48bf-acf2-bcfdd095b6a5';
function fixture(options = {}) {
  let email = options.email || 'test@email.com';
  const writes = [];
  const client = {
    auth: { admin: {
      getUserById: async requested => {
        assert.equal(requested, id);
        return { data: { user: { id, email, created_at: '2026-01-01' } } };
      },
      listUsers: async ({ page }) => ({ data: { users: options.users ? options.users(page) : [{ id, email }] } }),
      updateUserById: async (requested, attributes) => {
        writes.push({ requested, attributes });
        email = attributes.email;
        return { data: { user: { id, email } } };
      },
    } },
    from: table => {
      const query = {
        select: () => query,
        eq: (column, value) => { assert.equal(value, id); assert.equal(column, table === 'profiles' ? 'id' : 'user_id'); return query; },
        order: column => { assert.equal(column, table === 'daily_progress' ? 'progress_date' : 'id'); return query; },
        range: async () => ({ data: table === 'profiles' ? [{ id, username: options.username || 'Soon Teck', gold: options.changed && writes.length ? 1 : 0 }] : [] }),
      };
      return query;
    },
  };
  return { client, writes };
}
test('admin recovery dry run verifies without writes', async () => {
  const { client, writes } = fixture();
  assert.equal((await recover(client)).mode, 'read-only');
  assert.deepEqual(writes, []);
});
test('admin recovery writes ONLY email to the exact existing ID', async () => {
  const { client, writes } = fixture();
  const result = await recover(client, true);
  assert.equal(result.accountDataUnchanged, true);
  assert.deepEqual(writes, [{ requested: id, attributes: { email: 'zzz685913@gmail.com' } }]);
});
test('admin recovery stops on wrong original email or profile', async () => {
  for (const options of [{ email: 'someone@example.com' }, { username: 'Someone Else' }]) {
    const { client, writes } = fixture(options);
    await assert.rejects(recover(client, true));
    assert.deepEqual(writes, []);
  }
});
test('target email conflict on a later page or identity prevents writes', async () => {
  const { client, writes } = fixture({ users: page => page === 1 ? Array.from({ length: 200 }, () => ({ email: 'other@example.com' })) : [{ identities: [{ identity_data: { email: 'ZZZ685913@gmail.com' } }] }] });
  await assert.rejects(recover(client, true), /already associated/);
  assert.deepEqual(writes, []);
});
test('post-update account-data mismatch fails without rollback or extra writes', async () => {
  const { client, writes } = fixture({ changed: true });
  await assert.rejects(recover(client, true), /account data changed/);
  assert.equal(writes.length, 1);
});
test('verification provider errors fail closed without printing error contents', async () => {
  const { client, writes } = fixture();
  client.auth.admin.getUserById = async () => ({ error: { message: 'sensitive-provider-details' } });
  await assert.rejects(recover(client, true), error => !error.message.includes('sensitive-provider-details'));
  assert.deepEqual(writes, []);
});
