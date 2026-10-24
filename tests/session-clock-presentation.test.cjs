/* global __dirname */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../src/utils/sessionClockPresentation.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const exportsUnderTest = {};
new Function('exports', compiled)(exportsUnderTest);
const { sessionClockReading, matchingSessionClockReading } = exportsUnderTest;
const scope = '["owner-a","backend",1]';
const snapshot = changes => ({
  record: { clientSessionId: 'session-a', revision: 4, state: 'running' },
  timeLeft: 9, displayTimeLeft: null, interaction: null, breakSecondsLeft: 0,
  restoring: false, busy: false, error: null, restoreError: false, syncStatus: 'idle',
  ending: false, unsyncedSessionCount: 0, finishing: false, recovered: false,
  offlineAvailable: true, cloudSaveVersion: 0, rewardsVisible: false, ...changes,
});

test('ordinary clock ticks, including exact zero, retain their precise value without a context transition', () => {
  const context = sessionClockReading(snapshot(), scope);
  for (const timeLeft of [8, 1, 0]) {
    const tick = sessionClockReading(snapshot({ timeLeft }), scope);
    assert.equal(tick.contextKey, context.contextKey);
    assert.equal(matchingSessionClockReading(context, tick).timeLeft, timeLeft);
  }
});

test('a clock notification cannot overtake any committed coarse session transition', () => {
  const previous = sessionClockReading(snapshot(), scope);
  for (const change of [
    { record: { clientSessionId: 'session-b', revision: 4, state: 'running' } },
    { record: { clientSessionId: 'session-a', revision: 5, state: 'completed' } },
    { busy: true }, { finishing: true }, { restoring: true }, { ending: true },
    { interaction: { kind: 'pause', timeLeft: 0 } }, { displayTimeLeft: 0 },
    { breakSecondsLeft: 1 }, { error: 'Waiting to confirm' }, { restoreError: true },
    { syncStatus: 'waiting' }, { unsyncedSessionCount: 1 }, { recovered: true },
    { offlineAvailable: false }, { cloudSaveVersion: 1 }, { rewardsVisible: true },
  ]) {
    const next = sessionClockReading(snapshot({ ...change, timeLeft: 0 }), scope);
    assert.equal(matchingSessionClockReading(previous, next), previous, JSON.stringify(change));
    assert.equal(matchingSessionClockReading(next, next), next, 'the committed transition immediately accepts its matching clock');
  }
});

test('a break ending in the background never pairs its zero with the previous paused break context', () => {
  const breakContext = sessionClockReading(snapshot({ timeLeft: 57, breakSecondsLeft: 3 }), scope);
  const resumed = sessionClockReading(snapshot({ timeLeft: 55, breakSecondsLeft: 0 }), scope);
  assert.equal(matchingSessionClockReading(breakContext, resumed).breakSecondsLeft, 3);
  assert.equal(matchingSessionClockReading(resumed, breakContext).breakSecondsLeft, 0);
  assert.equal(matchingSessionClockReading(resumed, breakContext).timeLeft, 55);
});

test('clock readings from another owner, backend or admission cannot enter the current presentation', () => {
  const previous = sessionClockReading(snapshot(), scope);
  for (const nextScope of ['["owner-b","backend",1]', '["owner-a","other-backend",1]', '["owner-a","backend",2]']) {
    const current = sessionClockReading(snapshot({ record: null, restoring: true, timeLeft: 0 }), nextScope);
    assert.equal(matchingSessionClockReading(current, previous), current);
    assert.equal(matchingSessionClockReading(previous, current), previous);
  }
});
