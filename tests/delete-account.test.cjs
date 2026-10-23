/* global __dirname */
// Settings → Delete account: one confirmation, the server deletes the account
// (squads pass to the next member first), the phone forgets it, then sign out.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
const React = require('react'), { act, create } = require('react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT = true;
const root = path.resolve(__dirname, '..');
const sql = fs.readFileSync(path.join(root, 'supabase/migrations/20261023100000_delete_account.sql'), 'utf8');
function load(file, mocks) {
  const mod = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  new Function('require', 'module', 'exports', code)(name => Object.hasOwn(mocks, name) ? mocks[name] : require(name), mod, mod.exports);
  return mod.exports;
}
const host = type => function Host(props) { return React.createElement(type, props, props.children); };
const owner = 'e7147605-e165-48bf-acf2-bcfdd095b6a5', other = '11111111-1111-4111-8111-111111111111';

test('the server function is for signed-in accounts, needs the confirm word, and hands squads on first', () => {
  assert.match(sql, /revoke all on function public\.delete_my_account_v1\(text\) from public, anon;/);
  assert.match(sql, /grant execute on function public\.delete_my_account_v1\(text\) to authenticated;/);
  assert.match(sql, /p_confirm is distinct from 'DELETE'/);
  assert.ok(sql.indexOf('leave_squad_v1') < sql.indexOf('delete from auth.users'), 'squads are handed on before the account goes');
  assert.match(sql, /delete from auth\.users where id = v_user;/, 'only your own account');
});

test('the phone forgets only the deleted account', async () => {
  let keys = [`liferpg:routines:v1:prod:${owner}`, `liferpg:session-journal:v1:prod:${encodeURIComponent(owner)}`, `liferpg:tour:v1:${owner}`, `liferpg:tour:v1:${other}`, 'liferpg:app-preferences:v1'];
  const removed = [];
  const api = load('src/services/accountDeletion.ts', {
    '@react-native-async-storage/async-storage': { getAllKeys: async () => keys, multiRemove: async list => { removed.push(...list); keys = keys.filter(k => !list.includes(k)); } },
    '../../lib/supabase': { supabase: { rpc: async (name, args) => (name === 'delete_my_account_v1' && args.p_confirm === 'DELETE' ? { data: { status: 'deleted' }, error: null } : { data: null, error: { message: 'no' } }) } },
  });
  assert.equal(await api.deleteMyAccount(), true);
  await api.forgetAccountOnPhone(owner);
  assert.deepEqual(keys, [`liferpg:tour:v1:${other}`, 'liferpg:app-preferences:v1'], 'another account and shared settings stay');
  await api.forgetAccountOnPhone('not-an-id');
  assert.equal(removed.length, 3, 'nothing is removed for a malformed owner');
});

async function screen({ session = false, online = true, unsynced = 0, deleted = true, developer = false } = {}) {
  const log = [], timers = [];
  const realSet = global.setTimeout, realClear = global.clearTimeout;
  // The ten-second wait runs on a fake clock, one tick per "second".
  global.setTimeout = (fn, ms) => { if (ms === 1000) { timers.push(fn); return timers.length; } return realSet(fn, ms); };
  global.clearTimeout = id => { if (typeof id === 'number' && id <= timers.length) timers[id - 1] = null; else realClear(id); };
  const Delete = load('src/components/DeleteAccount.tsx', {
    react: React,
    'react-native': { View: host('View'), StyleSheet: { create: v => v } },
    '@gorhom/bottom-sheet': { BottomSheetScrollView: host('Scroll') },
    './AppText': { Text: host('Text') },
    './AppSheet': props => props.visible ? React.createElement('Sheet', props, props.header, props.children) : null,
    './SheetTextInput': props => React.createElement('Input', props),
    './MotionPressable': host('Press'),
    './PersonalUI': { PersonalButton: props => React.createElement('Button', props), p: {} },
    '../constants/theme': { colors: new Proxy({}, { get: () => '#000' }) },
    './SettingsList': { SettingsGroup: host('Group'), SettingsRow: props => React.createElement('Row', props) },
    './SheetConfirmation': props => React.createElement('Confirm', props),
    '../context/AuthContext': { useAuth: () => ({ accessMode: online ? 'online' : 'offline', signOut: async () => { log.push('signOut'); return { error: null }; } }) },
    '../context/UserContext': { useUser: () => ({ profile: { id: owner, username: '8k' } }) },
    '../context/TimerContext': { useTimer: () => ({ hasOpenSession: session, unsyncedSessionCount: unsynced }) },
    '../services/accountDeletion': { deleteMyAccount: async () => { log.push('delete'); return deleted; }, forgetAccountOnPhone: async id => { log.push(`forget:${id}`); } },
    '../services/developerAccess': { useIsDeveloper: () => developer },
  });
  let renderer; await act(async () => { renderer = create(React.createElement(Delete.default)); });
  const find = id => renderer.root.findAll(n => n.props.testID === id && typeof n.type !== 'string')[0];
  return { renderer, log, row: () => renderer.root.findByType('Row'), confirm: () => renderer.root.findAllByType('Confirm')[0], footer: () => renderer.root.findByType('Group').props.footer,
    sheet: () => renderer.root.findAllByType('Sheet')[0], input: () => find('delete-account-name'), button: () => find('delete-account-confirm'),
    tick: async (n = 1) => { for (let i = 0; i < n; i++) await act(async () => { const fn = timers.filter(Boolean).at(-1); timers.length = 0; fn?.(); }); },
    cleanup: async () => { await act(async () => renderer.unmount()); global.setTimeout = realSet; global.clearTimeout = realClear; } };
}

test('deleting takes two steps: what goes, then your username and a ten-second wait', async () => {
  const ui = await screen({ unsynced: 2 });
  try {
    await act(async () => ui.row().props.onPress());
    assert.match(ui.confirm().props.message, /deleted for good/);
    assert.match(ui.confirm().props.message, /Squads you lead pass to the next member/);
    assert.match(ui.confirm().props.message, /2 sessions on this phone haven’t synced yet and will be lost too/);
    assert.equal(ui.confirm().props.confirmLabel, 'Continue', 'step one never deletes');
    await act(async () => ui.confirm().props.onConfirm());
    assert.equal(ui.confirm(), undefined); assert.ok(ui.sheet());
    assert.deepEqual(ui.log, [], 'nothing is deleted yet');
    assert.equal(ui.button().props.disabled, true);
    assert.equal(ui.button().props.accessibilityLabel, 'Delete forever (10)');
    await act(async () => ui.input().props.onChangeText(' 8K '));
    assert.equal(ui.button().props.disabled, true, 'the name alone is not enough before the wait');
    await ui.tick(9);
    assert.equal(ui.button().props.accessibilityLabel, 'Delete forever (1)'); assert.equal(ui.button().props.disabled, true);
    await ui.tick(1);
    assert.equal(ui.button().props.accessibilityLabel, 'Delete forever'); assert.equal(ui.button().props.disabled, false);
    await act(async () => ui.input().props.onChangeText('8'));
    assert.equal(ui.button().props.disabled, true, 'a wrong name locks it again');
    await act(async () => ui.input().props.onChangeText('8k'));
    await act(async () => { ui.button().props.onPress(); ui.button().props.onPress(); });
    assert.deepEqual(ui.log, ['delete', `forget:${owner}`, 'signOut'], 'one deletion, even with a double tap');
  } finally { await ui.cleanup(); }
});

test('Keep my account at either step changes nothing, and the wait starts over next time', async () => {
  const ui = await screen();
  try {
    await act(async () => ui.row().props.onPress());
    await act(async () => ui.confirm().props.onCancel());
    assert.equal(ui.confirm(), undefined);
    await act(async () => ui.row().props.onPress());
    await act(async () => ui.confirm().props.onConfirm());
    await ui.tick(10);
    await act(async () => ui.renderer.root.findAllByType('Button').find(b => b.props.title === 'Keep my account').props.onPress());
    assert.equal(ui.sheet(), undefined);
    await act(async () => ui.row().props.onPress());
    await act(async () => ui.confirm().props.onConfirm());
    assert.equal(ui.button().props.accessibilityLabel, 'Delete forever (10)');
    assert.equal(ui.input().props.value, '', 'the typed name is cleared');
    assert.deepEqual(ui.log, []);
  } finally { await ui.cleanup(); }
});

test('a failed deletion keeps the account and the phone copy, and says so', async () => {
  const ui = await screen({ deleted: false });
  try {
    await act(async () => ui.row().props.onPress());
    await act(async () => ui.confirm().props.onConfirm());
    await act(async () => ui.input().props.onChangeText('8k'));
    await ui.tick(10);
    await act(async () => ui.button().props.onPress());
    assert.deepEqual(ui.log, ['delete']);
    assert.equal(ui.sheet(), undefined);
    assert.match(ui.footer(), /Couldn’t delete your account/);
  } finally { await ui.cleanup(); }
});

test('deleting waits for a session to end and needs internet', async () => {
  for (const [options, pattern] of [[{ session: true }, /Finish or end your session/], [{ online: false }, /needs internet/]]) {
    const ui = await screen(options);
    try { assert.equal(ui.row().props.disabled, true); assert.match(ui.footer(), pattern); } finally { await ui.cleanup(); }
  }
});

if (process.env.SESSION_SQL_PGLITE_ROOT) {
  let moduleRoot = process.env.SESSION_SQL_PGLITE_ROOT;
  if (!fs.existsSync(path.join(moduleRoot, 'package.json'))) moduleRoot = path.join(moduleRoot, '@electric-sql', 'pglite');
  const { PGlite } = require(moduleRoot);
  const me = '11111111-1111-4111-8111-111111111111', friend = '22222222-2222-4222-8222-222222222222';
  test('SQL: deleting your account hands your squad to your friend, then removes only you', async () => {
    const db = new PGlite();
    try {
      await db.exec(fs.readFileSync(path.join(root, 'tests/sql/progression-bootstrap.sql'), 'utf8'));
      await db.exec(`insert into auth.users(id) values ('${me}'),('${friend}');
        insert into public.profiles(id, username, avatar) values ('${me}','Me','🌱'),('${friend}','Friend','🌱') on conflict (id) do update set username = excluded.username;`);
      await db.exec(fs.readFileSync(path.join(root, 'supabase/migrations/20261018140000_study_squads.sql'), 'utf8'));
      await db.exec(fs.readFileSync(path.join(root, 'supabase/migrations/20261018200000_squad_limits.sql'), 'utf8'));
      await db.exec(sql);
      await db.exec(`set role authenticated; set request.jwt.claim.sub='${me}'`);
      const call = async (q, args) => (await db.query(`select ${q} as r`, args)).rows[0].r;
      const made = await call(`public.create_squad_v1('dddddddd-dddd-4ddd-8ddd-000000000001'::uuid, 'Crew', $1::uuid, now() - interval '1 day')`, [me]);
      await db.exec(`set request.jwt.claim.sub='${friend}'`);
      await call(`public.join_squad_v1($1, $2::uuid, now() - interval '1 day')`, [made.squad.code, friend]);
      await db.exec(`set request.jwt.claim.sub='${me}'`);
      await assert.rejects(db.query(`select public.delete_my_account_v1('yes')`), /Confirm deletion first/);
      assert.deepEqual(await call(`public.delete_my_account_v1('DELETE')`), { status: 'deleted' });
      await db.exec('reset role');
      assert.deepEqual((await db.query('select id from auth.users order by id')).rows.map(r => r.id), [friend], 'only your account is gone');
      const squad = (await db.query(`select owner_id, closed_at from liferpg_squad_private.squads where id = $1`, [made.squad.id])).rows[0];
      assert.equal(squad.owner_id, friend, 'your friend now leads the squad'); assert.equal(squad.closed_at, null);
      assert.equal((await db.query(`select count(*)::int n from liferpg_squad_private.members where user_id = $1`, [me])).rows[0].n, 0);
      await db.exec(`set role anon; set request.jwt.claim.sub=''`);
      await assert.rejects(db.query(`select public.delete_my_account_v1('DELETE')`), /permission denied/);
    } finally { await db.close(); }
  });
}

test('Settings shows Delete account after Sign out, at the bottom', () => {
  const settings = fs.readFileSync(path.join(root, 'src/app/settings.tsx'), 'utf8');
  assert.ok(settings.indexOf('title="Sign out"') < settings.indexOf('<DeleteAccount />'));
  assert.ok(settings.indexOf('<DeleteAccount />') < settings.indexOf('<AppBuildInfo />'));
});

test('the username sheet rises above the keyboard, like the other sheets with a text box', () => {
  const src = fs.readFileSync(path.join(root, 'src/components/DeleteAccount.tsx'), 'utf8');
  assert.match(src, /keyboardBehavior="interactive" androidKeyboardInputMode="adjustPan" visible=\{step === "type" && !protectedAccount\}/);
});

test('a developer account is protected: the row is locked, nothing opens, and the server refuses too', async () => {
  const ui = await screen({ developer: true });
  try {
    assert.equal(ui.row().props.disabled, true); assert.equal(ui.row().props.value, 'Locked');
    await act(async () => ui.row().props.onPress());
    assert.equal(ui.confirm(), undefined); assert.equal(ui.sheet(), undefined);
    assert.match(ui.footer(), /protected/);
    assert.deepEqual(ui.log, []);
    const sql = fs.readFileSync(path.join(root, 'supabase/migrations/20261024140100_round58_dev_protection.sql'), 'utf8');
    assert.match(sql, /liferpg_auth_private\.developers where user_id = v_user\) then\n\s+raise exception 'This account is protected/);
  } finally { await ui.cleanup(); }
});
