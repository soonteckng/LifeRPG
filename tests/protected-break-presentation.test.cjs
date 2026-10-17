const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
function load(file, cache = new Map()) {
  const filename = path.resolve(__dirname, '..', file);
  if (cache.has(filename)) return cache.get(filename).exports;
  const mod = { exports: {} }; cache.set(filename, mod);
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'module', 'exports', code)(name => {
    if (!name.startsWith('.')) return require(name);
    const target = path.resolve(path.dirname(filename), name);
    return load(path.relative(path.resolve(__dirname, '..'), target + ['.ts', '.tsx'].find(ext => fs.existsSync(target + ext))), cache);
  }, mod, mod.exports);
  return mod.exports;
}

test('a protected break shows as its own state with the break countdown, not as a pause', () => {
  const { sessionDockState } = load('src/utils/sessionReporting.ts');
  const base = { isCompleted: false, isRunning: false, actionError: null, sessionSummary: null, timeLeft: 1500 };
  assert.deepEqual(sessionDockState({ ...base, breakSecondsLeft: 252 }), { label: 'On break', detail: '04:12', icon: 'cafe-outline' });
  assert.equal(sessionDockState({ ...base, breakSecondsLeft: 0 }).label, 'Session paused');
  assert.equal(sessionDockState({ ...base, isCompleted: true, sessionSummary: {}, breakSecondsLeft: 30 }).label, 'Session saved');
});

test('the protection service warns a minute before a break ends and only announces a natural end', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '..', 'modules/focus-protection-spike/android/src/main/java/expo/modules/focusprotection/ProtectionService.kt'), 'utf8');
  assert.match(source, /BREAK_WARNING_MS = 60_000L/);
  assert.match(source, /onBreak && breakMs <= BREAK_WARNING_MS && !breakWarned/);
  assert.match(source, /wasOnBreak && !onBreak && lastBreakMs <= 1500/);
  assert.match(source, /IMPORTANCE_HIGH/);
});
