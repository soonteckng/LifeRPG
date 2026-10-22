// Round 47: intro save functions for signed-in accounts only, intro checks
// that match the app, one streak everywhere, and a developer's goal any time.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '..');
const sql = fs.readFileSync(path.join(root, 'supabase/migrations/20261023090000_security_streak_dev_goal.sql'), 'utf8');
const section = (start, end) => sql.slice(sql.indexOf(start), end ? sql.indexOf(end) : undefined);

test('the intro save functions are for signed-in accounts and match the app checks', () => {
  assert.match(sql, /revoke all on function public\.complete_onboarding\(text, text, text, integer\) from public, anon;/);
  assert.match(sql, /revoke all on function public\.finish_onboarding\(\) from public, anon;/);
  assert.match(sql, /grant execute on function public\.complete_onboarding\(text, text, text, integer\) to authenticated;/);
  assert.match(sql, /p_daily_goal_minutes < 30/); assert.doesNotMatch(sql, /p_daily_goal_minutes < 15/);
  assert.match(sql, /char_length\(v_name\) > 15/);
  assert.doesNotMatch(sql, /username_sign_in_email_v1|handle_new_user/, 'sign-in and sign-up stay as they are');
});

test('only developers skip the weekly goal limit, and nothing else changes for anyone else', () => {
  const schedule = section('create or replace function public.schedule_daily_goal', 'create or replace function public.get_daily_goal_settings');
  assert.match(schedule, /if not v_developer and v_last is not null and statement_timestamp\(\)<v_last\+interval '168 hours'/);
  assert.match(schedule, /p_goal_minutes<30 or p_goal_minutes>480/, 'the 30 to 480 range still applies to developers');
  assert.match(schedule, /::date\+1;/, 'a new goal still starts the next day');
  const settings = section('create or replace function public.get_daily_goal_settings');
  assert.match(settings, /if v_developer then v_next := null; end if;/);
  assert.doesNotMatch(sql, /delete from|truncate|alter table|drop /i, 'no stored data or tables are changed');
  assert.equal((sql.match(/update public\.profiles/g) || []).length, 1, 'only the existing intro save writes a profile, as before');
});

if (process.env.SESSION_SQL_PGLITE_ROOT) {
  let moduleRoot = process.env.SESSION_SQL_PGLITE_ROOT;
  if (!fs.existsSync(path.join(moduleRoot, 'package.json'))) moduleRoot = path.join(moduleRoot, '@electric-sql', 'pglite');
  const { PGlite } = require(moduleRoot);
  const user = '11111111-1111-4111-8111-111111111111';
  test('SQL: the squad streak counts focus days in a row, like Home and Progress', async () => {
    const db = new PGlite();
    try {
      await db.exec(`create schema liferpg_squad_private;
        create table public.activity_sessions(user_id uuid, status text, duration_seconds int, completed_at timestamptz);`);
      await db.exec(section('create or replace function liferpg_squad_private.focus_streak', 'revoke all on function liferpg_squad_private.focus_streak'));
      const streak = async () => (await db.query(`select liferpg_squad_private.focus_streak($1::uuid, 'Asia/Kuala_Lumpur') as n`, [user])).rows[0].n;
      // n days ago, a minute before this moment: never in the future, one per local day.
      const add = (n, extra = {}) => db.exec(`insert into public.activity_sessions values ('${user}', '${extra.status ?? 'completed'}', ${extra.seconds ?? 600}, now() - interval '${n} days' - interval '1 minute')`);
      assert.equal(await streak(), 0, 'nothing yet');
      await add(1); await add(2); await add(3);
      assert.equal(await streak(), 3, 'yesterday still counts until you focus today');
      await add(0); await add(0);
      assert.equal(await streak(), 4, 'two sessions on one day are one focus day');
      await add(5);
      assert.equal(await streak(), 4, 'a gap ends the run');
      await add(4, { seconds: 0 }); await add(4, { status: 'abandoned' });
      assert.equal(await streak(), 4, 'empty or unfinished sessions never count');
      await db.exec(`delete from public.activity_sessions where completed_at > now() - interval '2 days' - interval '2 minutes'`);
      assert.equal(await streak(), 0, 'no focus today or yesterday means no current streak');
    } finally { await db.close(); }
  });
}
