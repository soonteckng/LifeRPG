/* global __dirname */
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
const read = file => fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');
function load(file) {
  const mod = { exports: {} };
  const code = ts.transpileModule(read(file), { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  new Function('require', 'module', 'exports', code)(name => name.startsWith('.') ? new Proxy({}, { get: () => () => '#000' }) : require(name), mod, mod.exports);
  return mod.exports;
}

test('period totals read in hours and minutes, like the rest of the app', () => {
  const { totalLabel, durationLabel } = load('src/utils/progressAnalytics.ts');
  assert.equal(totalLabel(3 * 3600 + 16 * 60 + 30), '3h 16m');
  assert.equal(totalLabel(77 * 60), '1h 17m');
  assert.equal(totalLabel(2 * 3600), '2h');
  assert.equal(totalLabel(45), '45s', 'under a minute still shows something');
  assert.equal(totalLabel(0), '0m');
  assert.equal(durationLabel(90), '1m 30s', 'a single session keeps its exact time');
  const progress = read('src/app/(tabs)/progress.tsx');
  assert.match(progress, /\{totalLabel\(analytics\.seconds\)\}/);
  assert.match(progress, /<Text style=\{s\.categoryTime\}>\{totalLabel\(area\.seconds\)\}<\/Text>/);
});

test('squad progress bars are teal, like every other progress bar', () => {
  assert.match(read('src/components/HomeSections.tsx'), /tileFillBar: \{ height: 6, borderRadius: 3, backgroundColor: colors\.progress \}/);
  assert.match(read('src/components/SquadBoard.tsx'), /fill: \{ height: 8, borderRadius: 4, backgroundColor: colors\.progress \}/);
});
