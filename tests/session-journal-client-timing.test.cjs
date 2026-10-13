/* global __dirname */
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
const modules = new Map();
function load(file) {
  const filename = path.resolve(__dirname, '..', file);
  if (modules.has(filename)) return modules.get(filename).exports;
  const mod = { exports: {} }; modules.set(filename, mod);
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  new Function('require', 'module', 'exports', code)(name => name.startsWith('.')
    ? load(path.relative(path.resolve(__dirname, '..'), `${path.resolve(path.dirname(filename), name)}.ts`)) : require(name), mod, mod.exports);
  return mod.exports;
}
const domain = load('src/utils/sessionJournal.ts'), schema = load('src/utils/sessionJournalSchema.ts');
const storage = load('src/services/sessionJournalStore.ts');
const scope = { backendId: 'client-timing-domain', ownerId: '11111111-1111-4111-8111-111111111111' };
const id = n => `44444444-4444-4444-8444-${String(n).padStart(12, '0')}`;
const clock = ms => ({ wallTimeMs: 1000000 + ms, monotonicTimeMs: null, bootId: null });
const setup = { targetSeconds: 60, activityType: 'learning', taskId: null, subjectId: 1, notes: null, title: 'Learn' };
const act = (journal, action) => domain.applyJournalAction(journal, { ...action, epoch: journal.admission.epoch, expectedRevision: journal.revision });
const admitted = () => domain.applyJournalAction(domain.createJournal(scope), { type: 'admit', epoch: 1, expectedRevision: 0 });
const started = (draft = setup) => act(admitted(), { type: 'local_start', clientSessionId: id(1), setup: draft, clock: clock(0) });
const finished = () => act(started(), { type: 'local_expire', clientSessionId: id(1), operationId: id(2), clock: clock(90000) });
test('v1 remains the default; the first actual local timing action explicitly promotes to v2', () => {
  assert.equal(admitted().schemaVersion, 1); assert.equal(started().schemaVersion, 2);
  assert.deepEqual(schema.parseJournalEnvelope(schema.serializeJournalEnvelope(finished()), scope), finished());
});
test('expiry freezes the canonical target endpoint rather than the late tick time', () => {
  const j = finished(), request = domain.buildClientSessionSubmission(j.records[0]);
  assert.equal(request.endedAtMs, 1060000); assert.equal(request.segments[0].endedAtMs, 1060000);
  assert.equal(j.records[0].observedAtMs, 1060000); assert.equal(j.commands[0].createdAtMs, 1090000);
});
test('retries, defer and dismissal never change the original import payload or remove pending work', () => {
  let j = finished(); const original = JSON.stringify(j.commands[0].request);
  j = act(j, { type: 'defer_sync', clientSessionId: id(1), nowMs: 1100000, delayMs: 2000, reasonCode: 'connection', waitingAuth: false });
  j = act(j, { type: 'dismiss', clientSessionId: id(1), dismissedAtMs: 1100001 }); j = act(j, { type: 'compact' });
  assert.equal(JSON.stringify(j.commands[0].request), original); assert.equal(domain.queuedClientCompletions(j, scope).length, 1);
  assert.equal(domain.isJournalRecordPrunable(j, j.records[0]), false);
});
test('a detached submission cannot mutate the saved setup or active intervals', () => {
  const j = finished(); const submission = domain.buildClientSessionSubmission(j.records[0]);
  submission.setup.targetSeconds = 1; submission.segments[0].endedAtMs = 1000001;
  assert.equal(j.records[0].setup.targetSeconds, 60); assert.equal(j.commands[0].request.segments[0].endedAtMs, 1060000);
});
test('two simultaneous open records remain forbidden even when many completions can queue', () => {
  assert.throws(() => act(started(), { type: 'local_start', clientSessionId: id(9), setup, clock: clock(1) }));
  let j = finished(); j = act(j, { type: 'local_start', clientSessionId: id(9), setup, clock: clock(60000) });
  assert.equal(j.records.length, 2); assert.equal(domain.queuedClientCompletions(j, scope).length, 1);
});
test('100 pending records are preserved and the 101st refuses safely; settled records compact when capacity needs it', () => {
  let j = admitted();
  for (let n = 1; n <= 100; n++) {
    j = act(j, { type: 'local_start', clientSessionId: id(n * 2), setup: { ...setup, targetSeconds: 1 }, clock: clock(n * 1000) });
    j = act(j, { type: 'local_expire', clientSessionId: id(n * 2), operationId: id(n * 2 + 1), clock: clock(n * 1000 + 1000) });
  }
  assert.equal(j.records.length, 100); const raw = schema.serializeJournalEnvelope(j);
  assert.throws(() => act(j, { type: 'local_start', clientSessionId: id(900), setup, clock: clock(102000) }));
  assert.equal(schema.serializeJournalEnvelope(j), raw);
  for (let n = 1; n <= 25; n++) j = act(j, { type: 'acknowledge_import', clientSessionId: id(n * 2), verifiedScope: scope,
    receipt: { sessionId: id(1000 + n), durationSeconds: 1, result: { already_completed: false } } });
  j = act(j, { type: 'local_start', clientSessionId: id(900), setup, clock: clock(102000) });
  assert.ok(j.records.length <= 100); assert.equal(domain.queuedClientCompletions(j, scope).length, 75);
});
test('256 active intervals are valid; a 257th Resume refuses while early End remains available', () => {
  let j = started({ ...setup, targetSeconds: 28800 });
  for (let n = 0; n < 256; n++) {
    j = act(j, { type: 'local_pause', clientSessionId: id(1), clock: clock(n * 2 + 1) });
    if (n < 255) j = act(j, { type: 'local_resume', clientSessionId: id(1), clock: clock(n * 2 + 2) });
  }
  assert.equal(j.records[0].clientTiming.segments.length, 256);
  assert.throws(() => act(j, { type: 'local_resume', clientSessionId: id(1), clock: clock(513) }));
  j = act(j, { type: 'local_cancel', clientSessionId: id(1), clock: clock(514) });
  assert.equal(j.records[0].state, 'cancelled'); assert.equal(j.commands.length, 0);
});
test('long-paused pure local work cannot resume beyond 24 hours but may be ended without rewards', () => {
  let j = act(started(), { type: 'local_pause', clientSessionId: id(1), clock: clock(1) });
  assert.throws(() => act(j, { type: 'local_resume', clientSessionId: id(1), clock: clock(86400001) }));
  j = act(j, { type: 'local_cancel', clientSessionId: id(1), clock: clock(86400002) });
  assert.equal(j.records[0].state, 'cancelled'); assert.equal(j.records[0].sync.receipt, null);
});
test('changed immutable intervals, forged prefixes and credential fields cannot be deserialized as valid v2', () => {
  const baseline = finished();
  for (const change of [j => { j.records[0].clientTiming.serverConfirmedMs = 1; }, j => { j.commands[0].request.endedAtMs++; },
    j => { j.records[0].clientTiming.segments[0].startedAtMs++; }, j => { j.records[0].clientTiming.access_token = 'not-a-token'; },
    j => { j.records[0].clientTiming.segments.push({ startedAtMs: 1060000, endedAtMs: null }); }]) {
    const corrupted = JSON.parse(JSON.stringify(baseline)); change(corrupted); assert.throws(() => schema.validateJournalEnvelope(corrupted, scope));
  }
});
test('clock rollback cannot resume before the last closed interval; provenance is never changed by a reboot', () => {
  let j = act(started(), { type: 'local_pause', clientSessionId: id(1), clock: clock(1000) });
  assert.throws(() => act(j, { type: 'local_resume', clientSessionId: id(1), clock: clock(500) }));
  j = act(j, { type: 'local_resume', clientSessionId: id(1), clock: clock(1000) });
  assert.equal(domain.deriveJournalTimer(j.records[0], { ...clock(2000), bootId: 'new', monotonicTimeMs: 5000000 }).remainingMs, 58000);
  assert.equal(j.records[0].verification, 'client_reported');
});
test('a differently owned acknowledgement cannot settle a pending offline record', () => {
  assert.throws(() => act(finished(), { type: 'acknowledge_import', clientSessionId: id(1), verifiedScope: { ...scope, backendId: 'other' },
    receipt: { sessionId: id(800), durationSeconds: 60, result: {} } }));
});
test('promotion archives the exact v1 bytes once before writing v2 and retains that read-only backup', async () => {
  const values = new Map(), events = [];
  const adapter = { getItem: async key => values.get(key) ?? null, setItem: async (key, raw) => { events.push(key); values.set(key, raw); } };
  const store = storage.createSessionJournalStore(adapter, scope), before = `\n${JSON.stringify(admitted(), null, 2)}\n`;
  values.set(store.key, before);
  await store.update(j => act(j, { type: 'local_start', clientSessionId: id(1), setup, clock: clock(0) }));
  const backup = `${store.key}:backup:v1:1`;
  assert.equal(values.get(backup), before); assert.deepEqual(events, [backup, store.key]);
  await store.update(j => act(j, { type: 'local_pause', clientSessionId: id(1), clock: clock(1) }));
  assert.equal(values.get(backup), before); assert.equal(events.filter(key => key === backup).length, 1);
});
test('failed or unverifiable legacy backup leaves the original v1 source untouched', async () => {
  for (const mode of ['fail', 'lost']) {
    const values = new Map(); let store;
    const adapter = { getItem: async key => values.get(key) ?? null, setItem: async (key, raw) => {
      if (key.includes(':backup:')) { if (mode === 'fail') throw Error('storage fixture'); return; }
      values.set(key, raw);
    } };
    store = storage.createSessionJournalStore(adapter, scope); const before = JSON.stringify(admitted()); values.set(store.key, before);
    await assert.rejects(() => store.update(j => act(j, { type: 'local_start', clientSessionId: id(1), setup, clock: clock(0) })));
    assert.equal(values.get(store.key), before);
  }
});
test('a stored terminal import cannot be retimed or discarded by an arbitrary store transform', async () => {
  const values = new Map(), adapter = { getItem: async key => values.get(key) ?? null, setItem: async (key, raw) => values.set(key, raw) };
  const store = storage.createSessionJournalStore(adapter, scope); values.set(store.key, schema.serializeJournalEnvelope(finished())); const before = values.get(store.key);
  await assert.rejects(() => store.update(j => ({ ...j, revision: j.revision + 1, records: [], commands: [] })));
  assert.equal(values.get(store.key), before);
});

test('empty open intervals can close immediately but completed effort cannot be removed from storage', async () => {
  const values = new Map(), adapter = { getItem: async key => values.get(key) ?? null, setItem: async (key, raw) => values.set(key, raw) };
  const store = storage.createSessionJournalStore(adapter, scope); values.set(store.key, schema.serializeJournalEnvelope(started()));
  await store.update(j => act(j, { type: 'local_pause', clientSessionId: id(1), clock: clock(0) }));
  await store.update(j => act(j, { type: 'local_resume', clientSessionId: id(1), clock: clock(1) }));
  await store.update(j => act(j, { type: 'local_pause', clientSessionId: id(1), clock: clock(2) }));
  const before = values.get(store.key);
  await assert.rejects(() => store.update(j => {
    j.revision++; j.records[0].revision++; j.records[0].clientTiming.segments = []; j.records[0].elapsedMs = 0; return j;
  }));
  assert.equal(values.get(store.key), before);
});
