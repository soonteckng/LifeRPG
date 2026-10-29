/* global __dirname */
// Round 83: the reward layer is gone. People are initials; nothing in the app reads rewards.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
const root = path.resolve(__dirname, '..');

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : /\.(tsx?|js)$/.test(entry.name) ? [full] : [];
  });
}
function loadInitials() {
  const file = path.join(root, 'src/components/InitialsAvatar.tsx');
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(name => ({
    'react-native': { View: 'View', StyleSheet: { create: value => value } }, './AppText': { Text: 'Text' },
    '../constants/theme': { colors: { progress: '#000' } }, react: require('react'), 'react/jsx-runtime': require('react/jsx-runtime'),
  })[name], module, module.exports);
  return module.exports;
}

test('initials take the first and last word, and fall back calmly for an empty name', () => {
  const { initialsOf } = loadInitials();
  assert.equal(initialsOf('Soon Teck'), 'ST');
  assert.equal(initialsOf('aina'), 'A');
  assert.equal(initialsOf('  Mary Jane Watson '), 'MW');
  assert.equal(initialsOf(''), '?'); assert.equal(initialsOf(null), '?');
});

test('a person keeps the same tint everywhere, and every tint keeps the light initials readable', () => {
  const { initialsTint } = loadInitials();
  assert.equal(initialsTint('player-1'), initialsTint('player-1'));
  const luminance = hex => {
    const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(c => c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const tints = new Set(Array.from({ length: 200 }, (_, i) => initialsTint('id-' + i)));
  assert.ok(tints.size > 1);
  for (const tint of tints) assert.ok((luminance('#F5F7FF') + 0.05) / (luminance(tint) + 0.05) >= 4.5, `${tint} keeps 4.5:1 contrast`);
});

test('nothing in the app imports the removed reward layer', () => {
  const removed = /from ["'][^"']*(?:\/rewards\/|\/adventurer\/|useRewards|rewardsStore|rewardsService|rewardCatalog|levelPreview|dailyAchievementQueue|dailyEffortCelebration|sessionReturn|GlobalRewardListener|PostSessionCelebration|LevelUpModal|LevelTierSheet|Milestones(?:Row|Sheet)|CharacterMark|CharacterPortrait|SessionReveal|CampDecorations)["']/;
  const offenders = walk(path.join(root, 'src')).filter(file => removed.test(fs.readFileSync(file, 'utf8')));
  assert.deepEqual(offenders.map(file => path.relative(root, file)), []);
  assert.equal(fs.existsSync(path.join(root, 'src/app/outfits.tsx')), false, 'no Outfits screen');
});

test('Home and Profile show initials, with no level, Stardust, trail or pack', () => {
  const home = fs.readFileSync(path.join(root, 'src/app/(tabs)/index.tsx'), 'utf8');
  const profile = fs.readFileSync(path.join(root, 'src/app/profile.tsx'), 'utf8');
  for (const source of [home, profile]) {
    assert.match(source, /InitialsAvatar/);
    assert.doesNotMatch(source, /Stardust|TrailSheet|LevelTierSheet|HomePack|current_xp|Outfits/);
  }
});

test('the chosen-rewards migration can never be pushed by mistake', () => {
  const migrations = fs.readdirSync(path.join(root, 'supabase/migrations'));
  assert.equal(migrations.some(name => /chosen_rewards/.test(name)), false);
  assert.ok(fs.existsSync(path.join(root, 'docs/archive/never-run-round80_chosen_rewards.sql')));
});
