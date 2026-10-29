/* global __dirname */
// Rest days: one rule, in the app and on the server. The squad streak and
// your own streak must never disagree.
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), ts = require("typescript");
const root = path.resolve(__dirname, "..");
function load(file, cache = new Map()) {
  const filename = path.resolve(root, file);
  if (cache.has(filename)) return cache.get(filename).exports;
  const module = { exports: {} }; cache.set(filename, module);
  const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function("require", "module", "exports", code)(name => name.startsWith(".") ? load(path.relative(root, path.resolve(path.dirname(filename), name) + ".ts"), cache) : require(name), module, module.exports);
  return module.exports;
}
const { focusStreakWithRest, bestFocusStreak } = load("src/utils/focusDays.ts");
const { shiftDay } = load("src/utils/progressAnalytics.ts");
const TODAY = "2026-10-30";
const ago = (...offsets) => offsets.map(n => shiftDay(TODAY, -n));
const run = (from, to) => Array.from({ length: from - to + 1 }, (_, i) => from - i); // days ago, inclusive

test("without rest days earned, a missed day ends the streak as before", () => {
  assert.deepEqual(focusStreakWithRest(ago(...run(5, 0)), TODAY), { current: 6, longest: 6, restDays: 0, rested: [] });
  assert.equal(focusStreakWithRest(ago(...run(5, 1)), TODAY).current, 5, "yesterday keeps it alive while today still has a chance");
  assert.equal(focusStreakWithRest(ago(...run(5, 2)), TODAY).current, 0, "a missed yesterday with no rest day ends it");
  assert.equal(focusStreakWithRest(ago(4, 3, 1, 0), TODAY).current, 2, "a gap inside resets the count");
  assert.deepEqual(focusStreakWithRest([], TODAY), { current: 0, longest: 0, restDays: 0, rested: [] });
});

test("every 7 focus days earn a rest day, a missed day uses it, and it's never more than 2", () => {
  const seven = focusStreakWithRest(ago(...run(6, 0)), TODAY);
  assert.deepEqual([seven.current, seven.restDays], [7, 1]);
  const bridged = focusStreakWithRest(ago(...run(9, 3), 1, 0), TODAY);
  assert.deepEqual([bridged.current, bridged.restDays, bridged.rested], [9, 0, [shiftDay(TODAY, -2)]], "rested days keep it going but don't count");
  const pending = focusStreakWithRest(ago(...run(8, 2)), TODAY);
  assert.deepEqual([pending.current, pending.restDays, pending.rested], [7, 0, [shiftDay(TODAY, -1)]], "a missed yesterday uses one too");
  const capped = focusStreakWithRest(ago(...run(29, 0)), TODAY);
  assert.deepEqual([capped.current, capped.restDays], [30, 2], "30 days earn 4, but you hold at most 2");
  const twoGap = focusStreakWithRest(ago(...run(20, 6), ...run(3, 0)), TODAY);
  assert.equal(twoGap.current, 19, "two rest days bridge two missed days in a row");
  const tooLong = focusStreakWithRest(ago(...run(20, 7), ...run(3, 0)), TODAY);
  assert.equal(tooLong.current, 4, "three missed days end it, even with two rest days");
  assert.equal(focusStreakWithRest(ago(...run(13, 0)), TODAY).restDays, 2);
  assert.equal(bestFocusStreak(ago(...run(40, 31), 29, ...run(5, 0))), 11, "the longest streak counts the same way");
});

if (process.env.SESSION_SQL_PGLITE_ROOT) test("the squads' server streak gives exactly the app's answer on 300 random histories", async () => {
  const { PGlite } = require(path.join(process.env.SESSION_SQL_PGLITE_ROOT, "@electric-sql/pglite"));
  const db = new PGlite();
  try {
    await db.exec(fs.readFileSync(path.join(root, "tests/sql/progression-bootstrap.sql"), "utf8"));
    await db.exec("set time zone 'UTC'; create schema if not exists liferpg_squad_private;");
    await db.exec(fs.readFileSync(path.join(root, "supabase/migrations/20261029120000_round82_rest_days.sql"), "utf8"));
    const today = (await db.query("select (now() at time zone 'UTC')::date::text as d")).rows[0].d;
    let seed = 82; const random = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    for (let n = 0; n < 300; n++) {
      const user = `82828282-0000-4000-8000-${String(n).padStart(12, "0")}`;
      const days = [], density = 0.55 + random() * 0.45;
      for (let k = 0; k < 60; k++) if (random() < density) days.push(shiftDay(today, -k));
      await db.query("insert into auth.users(id) values($1)", [user]);
      for (const day of days) await db.query(`insert into public.activity_sessions(user_id, status, duration_seconds, target_duration_seconds, completed_at, started_at)
        values($1, 'completed', 600, 600, ($2::date + time '00:01') at time zone 'UTC', ($2::date + time '00:00') at time zone 'UTC')`, [user, day]);
      const server = (await db.query("select liferpg_squad_private.focus_streak($1, 'UTC') as s", [user])).rows[0].s;
      assert.equal(server, focusStreakWithRest(days, today).current, `history ${n}: ${days.slice().reverse().join(",")}`);
    }
  } finally { await db.close(); }
});

test("the app's streak read goes back far enough for rest days to bridge older gaps", async () => {
  const progressAnalytics = load("src/utils/progressAnalytics.ts"), focusDays = load("src/utils/focusDays.ts");
  const code = ts.transpileModule(fs.readFileSync(path.join(root, "src/services/progressService.ts"), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true, target: ts.ScriptTarget.ES2022 } }).outputText;
  const now = new Date("2026-10-30T10:00:00Z"), today = progressAnalytics.dateKey(now, "UTC");
  for (const daysAgo of [[...run(20, 4), ...run(2, 0)], [...run(13, 0)], [...run(40, 30), ...run(26, 0)], [9, 8, ...run(6, 1)], [3]]) {
    const days = daysAgo.map(n => shiftDay(today, -n));
    const rows = days.flatMap((d, i) => [{ id: `${i}a`, completed_at: `${d}T08:00:00Z`, duration_seconds: 600 }, { id: `${i}b`, completed_at: `${d}T07:00:00Z`, duration_seconds: 600 }])
      .sort((x, y) => y.completed_at.localeCompare(x.completed_at)); // newest first, like the real query
    let reads = 0;
    const chain = { select: () => chain, order: () => chain, eq: () => chain, gt: () => chain, lte: () => chain, gte: () => chain, lt: () => chain,
      range: (from, to) => { reads++; return Promise.resolve({ data: rows.slice(from, to + 1), error: null }); } };
    const mod = { exports: {} };
    new Function("require", "module", "exports", code)(name => name === "../../lib/supabase" ? { supabase: { from: () => chain } }
      : name === "../utils/progressAnalytics" ? progressAnalytics : name === "../utils/focusDays" ? focusDays : name === "./taskService" ? { getSubjects: async () => [] } : require(name), mod, mod.exports);
    const detail = await mod.exports.getFocusStreakDetail("UTC", now);
    assert.deepEqual(detail.current, focusStreakWithRest(days, today).current, `days ago: ${daysAgo.join(",")}`);
  }
});
