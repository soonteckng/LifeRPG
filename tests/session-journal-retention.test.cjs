/* global __dirname, Buffer */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const cache = new Map();
function load(file) {
  const filename = path.resolve(__dirname, '..', file);
  if (cache.has(filename)) return cache.get(filename).exports;
  const mod = { exports: {} }; cache.set(filename, mod);
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function('require', 'module', 'exports', code)(name => {
    if (!name.startsWith('.')) return require(name);
    return load(path.relative(path.resolve(__dirname, '..'), `${path.resolve(path.dirname(filename), name)}.ts`));
  }, mod, mod.exports);
  return mod.exports;
}
const domain = load('src/utils/sessionJournal.ts');
const schema = load('src/utils/sessionJournalSchema.ts');
const wire = load('src/types/sessionJournal.ts');
const scope = { backendId: 'retention-test', ownerId: '11111111-1111-4111-8111-111111111111' };
const setup = { targetSeconds: 1, activityType: 'other', taskId: null, subjectId: null, notes: null, title: 'Learning' };
const clone = value => JSON.parse(JSON.stringify(value));
const id = (prefix, number) => `${prefix}0000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
const clock = time => ({ wallTimeMs: time, monotonicTimeMs: time, bootId: 'retention-boot' });
const act = (journal, action) => domain.applyJournalAction(journal, {
  epoch: journal.admission.epoch, expectedRevision: journal.revision, ...action,
});
function admitted() { return act(domain.createJournal(scope), { type: 'admit', epoch: 1 }); }
function start(journal, number, time = number * 10000) {
  journal = act(journal, { type: 'prepare_start', clientSessionId: id('2', number), operationId: id('3', number), setup, clock: clock(time) });
  return act(journal, { type: 'acknowledge_start', operationId: id('3', number), snapshot: {
    serverSessionId: id('4', number), state: 'running', startedAtMs: time, elapsedMs: 0, observedClock: clock(time),
  } });
}
function finish(journal, number, time = number * 10000, padding = null) {
  journal = act(journal, { type: 'expire', clientSessionId: id('2', number), operationId: id('5', number), clock: clock(time + 1000) });
  return act(journal, { type: 'acknowledge_completion', operationId: id('5', number), receipt: {
    sessionId: id('4', number), durationSeconds: 1,
    result: { session_id: id('4', number), duration_seconds: 1, ...(padding === null ? {} : { padding }) },
  } });
}
function settled(count, commandsPerRecord = 1, padding = null) {
  const seed = finish(start(admitted(), 1), 1).records[0];
  const journal = admitted();
  journal.records = Array.from({ length: count }, (_, index) => {
    const number = index + 1, record = clone(seed), time = number * 10000;
    record.clientSessionId = id('2', number); record.serverSessionId = id('4', number);
    record.startedAtMs = time; record.endsAtMs = time + 1000;
    record.completedAtMs = time + 1000; record.observedAtMs = time + 1000;
    record.sync.receipt = { sessionId: record.serverSessionId, durationSeconds: 1,
      result: { session_id: record.serverSessionId, duration_seconds: 1, ...(padding === null ? {} : { padding }) } };
    return record;
  });
  journal.commands = journal.records.flatMap((record, index) => Array.from({ length: commandsPerRecord }, (_, commandIndex) => ({
    operationId: id('6', index * commandsPerRecord + commandIndex + 1), clientSessionId: record.clientSessionId,
    kind: 'complete', status: 'acknowledged', createdAtMs: record.completedAtMs,
    request: { serverSessionId: record.serverSessionId, completedAtMs: record.completedAtMs, targetSeconds: 1 },
  })));
  return schema.validateJournalEnvelope(journal, scope);
}
function rejectedDrafts(count) {
  const journal = admitted();
  for (let number = 1; number <= count; number++) {
    const prepared = act(admitted(), { type: 'prepare_start', clientSessionId: id('2', number), operationId: id('3', number), setup, clock: clock(number * 10000) });
    const rejected = act(prepared, { type: 'reject_command', operationId: id('3', number), reasonCode: 'definitive_rejection' });
    journal.records.push(rejected.records[0]); journal.commands.push(rejected.commands[0]);
  }
  return schema.validateJournalEnvelope(journal, scope);
}

test('more than one hundred confirmed sessions remain usable without an age floor', () => {
  let journal = admitted();
  for (let number = 1; number <= 130; number++) {
    const before = journal.revision;
    journal = finish(start(journal, number), number);
    assert.equal(journal.revision, before + 4);
    assert.ok(journal.records.length <= wire.JOURNAL_RETAIN_SETTLED_RECORDS);
    assert.ok(journal.commands.length <= wire.JOURNAL_MAX_COMMANDS);
    assert.equal(journal.records.at(-1).sync.receipt.sessionId, id('4', number));
  }
  assert.ok(!journal.records.some(record => record.clientSessionId === id('2', 1)));
});

test('compact retains the newest twenty settled records and removes their commands atomically', () => {
  const journal = settled(100, 10), before = clone(journal);
  const compacted = act(journal, { type: 'compact' });
  assert.equal(compacted.revision, journal.revision + 1);
  assert.equal(compacted.records.length, 20); assert.equal(compacted.commands.length, 200);
  assert.deepEqual(compacted.records.map(record => record.clientSessionId), before.records.slice(80).map(record => record.clientSessionId));
  assert.deepEqual(journal, before);
  const replay = act(compacted, { type: 'compact' });
  assert.deepEqual(replay, compacted); assert.notEqual(replay, compacted);
  const appended = act(journal, { type: 'prepare_start', clientSessionId: id('2', 101), operationId: id('3', 101), setup, clock: clock(2000000) });
  assert.equal(appended.revision, journal.revision + 1);
  assert.equal(appended.records.length, 21); assert.equal(appended.commands.length, 201);
});

test('protected-only capacity refuses session 101; explicit dismissal releases room safely', () => {
  const journal = rejectedDrafts(100), before = clone(journal);
  const nextStart = { type: 'prepare_start', clientSessionId: id('2', 101), operationId: id('3', 101), setup, clock: clock(2000000) };
  assert.throws(() => act(journal, nextStart), error => error.code === 'too_large');
  assert.deepEqual(journal, before);
  const dismissed = act(journal, { type: 'dismiss', clientSessionId: id('2', 1), dismissedAtMs: 2000000 });
  assert.ok(domain.isJournalRecordPrunable(dismissed, dismissed.records[0]));
  const replay = act(dismissed, { type: 'dismiss', clientSessionId: id('2', 1), dismissedAtMs: 3000000 });
  assert.deepEqual(replay, dismissed);
  const appended = act(dismissed, nextStart);
  assert.equal(appended.records.length, 100);
  assert.ok(!appended.records.some(record => record.clientSessionId === id('2', 1)));
  assert.equal(appended.records.filter(record => record.sync.state === 'rejected').length, 99);
});

test('active and unresolved work cannot be dismissed or pruned', () => {
  let journal = start(admitted(), 1);
  assert.equal(domain.isJournalRecordPrunable(journal, journal.records[0]), false);
  assert.throws(() => act(journal, { type: 'dismiss', clientSessionId: id('2', 1), dismissedAtMs: 20000 }), error => error.code === 'invalid_transition');
  journal = act(journal, { type: 'expire', clientSessionId: id('2', 1), operationId: id('5', 1), clock: clock(11000) });
  journal = act(journal, { type: 'mark_unknown', operationId: id('5', 1) });
  assert.equal(domain.isJournalRecordPrunable(journal, journal.records[0]), false);
  assert.deepEqual(act(journal, { type: 'compact' }), journal);
  assert.throws(() => act(journal, { type: 'dismiss', clientSessionId: id('2', 1), dismissedAtMs: 20000 }));
});

test('command 1001 fails without pruning active history but can prune a settled record below the ceiling', () => {
  let active = start(admitted(), 200, 3000000);
  const record = active.records[0];
  active.commands.push(...Array.from({ length: 999 }, (_, index) => ({
    operationId: id('7', index + 1), clientSessionId: record.clientSessionId, kind: 'pause', status: 'acknowledged',
    createdAtMs: 3000000, request: { serverSessionId: record.serverSessionId, clock: clock(3000000) },
  })));
  schema.validateJournalEnvelope(active, scope);
  const before = clone(active);
  const pause = { type: 'prepare_transition', clientSessionId: record.clientSessionId, operationId: id('8', 1), kind: 'pause', clock: clock(3000100) };
  assert.throws(() => act(active, pause), error => error.code === 'too_large');
  assert.deepEqual(active, before);
  const history = settled(1, 999);
  history.records.push(clone(record)); history.commands.push(clone(active.commands[0]));
  const saved = act(history, pause);
  assert.equal(saved.records.length, 1); assert.equal(saved.commands.length, 2);
  assert.equal(saved.records[0].clientSessionId, record.clientSessionId);
  assert.equal(saved.revision, history.revision + 1);
});

test('receipt byte pressure prunes older settled cache while retaining the newly confirmed receipt', () => {
  let journal = settled(16, 1, 'x'.repeat(30000));
  assert.ok(Buffer.byteLength(schema.serializeJournalEnvelope(journal)) < wire.JOURNAL_MAX_BYTES);
  journal = start(journal, 200, 3000000);
  const saved = finish(journal, 200, 3000000, 'y'.repeat(30000));
  assert.ok(Buffer.byteLength(schema.serializeJournalEnvelope(saved)) <= wire.JOURNAL_MAX_BYTES);
  assert.ok(saved.records.some(record => record.clientSessionId === id('2', 200)));
  assert.ok(saved.records.length < 17);
});
