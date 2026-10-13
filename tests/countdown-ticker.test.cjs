/* global __dirname */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
const mod = { exports: {} };
new Function('module', 'exports', ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/utils/countdownTicker.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText)(mod, mod.exports);
const { createCountdownTicker } = mod.exports;

function timers() {
  const realSet = global.setTimeout, realClear = global.clearTimeout;
  const queued = new Map(); let serial = 0, now = 0;
  global.setTimeout = (callback, delay) => { const id = ++serial; queued.set(id, { callback, at: now + delay }); return id; };
  global.clearTimeout = id => queued.delete(id);
  return { queued, get now() { return now; },
    next(late = 0) {
      const [id, event] = [...queued.entries()].sort((a, b) => a[1].at - b[1].at)[0];
      queued.delete(id); now = event.at + late; event.callback();
    },
    restore() { global.setTimeout = realSet; global.clearTimeout = realClear; },
  };
}

test('deadline-aligned ticks display each second steadily from a fractional start', () => {
  const clock = timers(); let ticker;
  try {
    const deadline = 5127, changes = []; let previous = Math.ceil(deadline / 1000);
    ticker = createCountdownTicker(() => {
      const current = Math.ceil(Math.max(0, deadline - clock.now) / 1000);
      if (current !== previous) changes.push([current, clock.now]);
      previous = current;
    }, () => Math.min(200, ((deadline - clock.now) % 1000 || 1000) + 4));
    while (clock.now < deadline) clock.next();
    assert.deepEqual(changes.map(change => change[0]), [5, 4, 3, 2, 1, 0]);
    assert.deepEqual(changes.map(change => change[1]), [131, 1131, 2131, 3131, 4131, 5131]);
  } finally { ticker?.dispose(); clock.restore(); }
});

test('late callbacks catch up to the deadline rather than shifting every following second', () => {
  const clock = timers(); let ticker;
  try {
    const changes = [], deadline = 3127;
    ticker = createCountdownTicker(() => changes.push(clock.now),
      () => Math.min(200, ((deadline - clock.now) % 1000 || 1000) + 4));
    clock.next(240); // A busy JS frame delays one update.
    while (clock.now < 1131) clock.next();
    assert.equal(changes[0], 371);
    assert.equal(changes.at(-1), 1131);
    assert.equal(clock.queued.size, 1);
  } finally { ticker?.dispose(); clock.restore(); }
});

test('rescheduling after a control change keeps one timer and disposal stops all future ticks', () => {
  const clock = timers(); let ticker;
  try {
    let calls = 0, delay = 200;
    ticker = createCountdownTicker(() => { calls++; ticker.reschedule(); }, () => delay);
    delay = 44; ticker.reschedule(); ticker.reschedule();
    assert.equal(clock.queued.size, 1);
    clock.next(); assert.equal(clock.now, 44); assert.equal(calls, 1); assert.equal(clock.queued.size, 1);
    const lateCallback = [...clock.queued.values()][0].callback;
    ticker.dispose(); ticker.reschedule(); lateCallback();
    assert.equal(calls, 1); assert.equal(clock.queued.size, 0);
  } finally { ticker?.dispose(); clock.restore(); }
});
