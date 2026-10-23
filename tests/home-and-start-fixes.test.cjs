/* global __dirname */
// Home: your greeting and name open Profile like your picture; Start cards
// keep one-word names whole instead of breaking them mid-word.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
const root = path.resolve(__dirname, '..');

test('the whole name block on Home opens Profile', () => {
  const home = fs.readFileSync(path.join(root, 'src/app/(tabs)/index.tsx'), 'utf8');
  assert.match(home, /<TouchableOpacity testID="home-name" onPress=\{openProfile\} accessibilityRole="button"/);
  assert.match(home, /testID="home-avatar"[^>]*onPress=\{openProfile\}/);
});

test('one-word names shrink to stay whole; longer names wrap with hyphens', () => {
  const src = fs.readFileSync(path.join(root, 'src/components/SavedRoutinesCard.tsx'), 'utf8');
  const fn = src.slice(src.indexOf('export function fitName'), src.indexOf('export default function SavedRoutinesCard'));
  const code = ts.transpileModule(fn.replace('export ', ''), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const fitName = new Function(`${code}; return fitName;`)();
  assert.deepEqual(fitName('Mathematics'), { numberOfLines: 1, adjustsFontSizeToFit: true, minimumFontScale: 0.7 });
  assert.deepEqual(fitName('  Read before bed '), { numberOfLines: 2, android_hyphenationFrequency: 'normal' });
  assert.equal((src.match(/\{\.\.\.fitName\(/g) || []).length, 3, 'routines, study chips and the grid all use it');
});
