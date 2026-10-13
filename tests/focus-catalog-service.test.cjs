const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
function load(file, mocks = {}, cache = new Map()) {
  const filename = path.resolve(__dirname, '..', file);
  if (cache.has(filename)) return cache.get(filename).exports;
  const module = { exports: {} }; cache.set(filename, module);
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  new Function('require', 'module', 'exports', code)(name => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    const target = path.resolve(path.dirname(filename), name) + '.ts';
    return load(path.relative(path.resolve(__dirname, '..'), target), mocks, cache);
  }, module, module.exports);
  return module.exports;
}
const catalogue = load('src/utils/focusAreas.ts');
const full = catalogue.FOCUS_AREAS.map((area, index) => ({ id: index + 1, title: area.title, level: 1, current_xp: 0, color_code: area.color }));
const legacy = [
  { id: 10, title: 'General', level: 2, current_xp: 15 },
  { id: 11, title: 'Knowledge', level: 4, current_xp: 33 },
  { id: 12, title: 'Life Admin', level: 1, current_xp: 7 },
  { id: 13, title: 'Fitness & Health', level: 3, current_xp: 9 },
];
function service(rows, options = {}) {
  const calls = [], owners = options.owners ?? ['account-a']; let checks = 0;
  const supabase = {
    auth: { getUser: async () => {
      const id = owners[Math.min(checks++, owners.length - 1)];
      return { data: { user: id ? { id } : null }, error: null };
    } },
    from: table => {
      calls.push(['from', table]);
      return { select: () => ({ eq: (column, owner) => {
        calls.push(['filter', column, owner]);
        return { order: async () => ({ data: rows, error: null }) };
      } }) };
    },
    rpc: async (name, params) => { calls.push(['rpc', name, params]); return { data: options.repaired ?? full, error: options.error ?? null }; },
  };
  return { calls, api: load('src/services/taskService.ts', { '../../lib/supabase': { supabase } }) };
}
test('complete catalogues load owned real IDs without repair or changing earned XP', async () => {
  const rows = [...full, { id: 90, title: 'My ceramics', level: 3, current_xp: 17 }];
  const before = JSON.stringify(rows), { api, calls } = service(rows);
  const result = await api.getSubjects();
  assert.equal(result.length, 7); assert.equal(result.at(-1).id, 90);
  assert.equal(result.at(-1).current_xp, 17); assert.equal(JSON.stringify(rows), before);
  assert.deepEqual(calls, [['from', 'subjects'], ['filter', 'user_id', 'account-a']]);
});
test('legacy four-area accounts request only the scoped repair and retain their IDs and balances', async () => {
  const repaired = [...legacy, full[2], full[3]];
  const { api, calls } = service(legacy, { repaired });
  const result = await api.getSubjects();
  assert.equal(catalogue.missingFocusAreas(result).length, 0);
  assert.equal(result.find(area => area.id === 11).current_xp, 33);
  assert.deepEqual(calls.at(-1), ['rpc', 'ensure_focus_area_catalog', { expected_owner: 'account-a' }]);
  assert.deepEqual(result.map(area => catalogue.focusAreaTitle(area.title)), full.map(area => area.title));
});
test('aliases share canonical labels and count as existing areas instead of creating duplicates', () => {
  const aliases = ['General', 'Study', 'Projects', 'Creative practice', 'Personal life', 'Health'];
  assert.deepEqual(aliases.map(catalogue.focusAreaTitle), full.map(area => area.title));
  assert.equal(catalogue.missingFocusAreas(aliases.map(title => ({ title }))).length, 0);
  assert.deepEqual(catalogue.missingFocusAreas(legacy).map(area => area.title), ['Work & projects', 'Creativity']);
});
test('an unavailable repair or incomplete result cannot silently attribute a missing category to General', async () => {
  await assert.rejects(service(legacy, { error: { code: 'PGRST202' } }).api.getSubjects(), /complete focus area list/);
  await assert.rejects(service(legacy, { repaired: legacy }).api.getSubjects(), /incomplete/);
});
test('sign-out or an account switch fences category reads and repair', async () => {
  const signedOut = service(full, { owners: [null] });
  await assert.rejects(signedOut.api.getSubjects(), /signed in/); assert.deepEqual(signedOut.calls, []);
  const before = service(legacy, { owners: ['account-a', 'account-b'] });
  await assert.rejects(before.api.getSubjects(), /Account changed/); assert.equal(before.calls.some(call => call[0] === 'rpc'), false);
  const after = service(legacy, { owners: ['account-a', 'account-a', 'account-b'] });
  await assert.rejects(after.api.getSubjects(), /Account changed/);
  assert.equal(after.calls.filter(call => call[0] === 'rpc').length, 1);
  await assert.rejects(service(full, { owners: ['account-a', 'account-b'] }).api.getSubjects(), /Account changed/);
});
