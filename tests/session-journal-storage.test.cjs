/* global __dirname */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), ts = require("typescript");

function load(file, mocks = {}, cache = new Map()) {
  const filename = path.resolve(__dirname, "..", file);
  if (cache.has(filename)) return cache.get(filename).exports;
  const mod = { exports: {} }; cache.set(filename, mod);
  const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  new Function("require", "module", "exports", code)(name => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (!name.startsWith(".")) return require(name);
    const target = path.resolve(path.dirname(filename), name);
    const ext = ["", ".ts", ".tsx"].find(suffix => fs.existsSync(target + suffix));
    return load(path.relative(path.resolve(__dirname, ".."), target + ext), mocks, cache);
  }, mod, mod.exports);
  return mod.exports;
}
const api = load("src/services/sessionJournalStore.ts");
const domain = load("src/utils/sessionJournal.ts");
const scope = { backendId: "synthetic-backend", ownerId: "11111111-1111-4111-8111-111111111111" };
const otherScope = { ...scope, ownerId: "22222222-2222-4222-8222-222222222222" };
function memoryStorage() {
  const values = new Map(), commits = [], reads = [];
  const storage = {
    values, commits, reads, beforeRead: null, beforeWrite: null,
    async getItem(key) { reads.push(key); if (storage.beforeRead) await storage.beforeRead(key); return values.get(key) ?? null; },
    async setItem(key, value) { if (storage.beforeWrite) await storage.beforeWrite(key, value); values.set(key, value); commits.push({ key, value }); },
  };
  return storage;
}
function next(journal) { return { ...journal, revision: journal.revision + 1 }; }
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }
const errorCode = code => error => { assert.equal(error.code, code); assert.doesNotMatch(error.message, /do-not-display-this-draft/); return true; };
const identity = (prefix, index) => `${prefix}-1111-4111-8111-${index.toString(16).padStart(12, "0")}`;
function settledJournal(count) {
  const journal = domain.createJournal(scope);
  journal.admission = { epoch: 1, active: true }; journal.revision = 1;
  const start = Date.UTC(2026, 9, 1);
  for (let index = 1; index <= count; index++) {
    const startedAtMs = start + index * 120000, completedAtMs = startedAtMs + 60000;
    const serverSessionId = identity("bbbbbbbb", index), clientSessionId = identity("aaaaaaaa", index);
    const record = {
      clientSessionId, serverSessionId, revision: 3, state: "completed",
      setup: { targetSeconds: 60, activityType: "other", taskId: null, subjectId: null, notes: null, title: "Synthetic focus" },
      startedAtMs, elapsedMs: 60000, clockAnchor: null, endsAtMs: completedAtMs,
      completedAtMs, observedAtMs: completedAtMs + 500, dismissedAtMs: null,
      verification: "server_timed", clockWarning: false,
      sync: { state: "synced", attempts: 0, nextAttemptAtMs: null, reasonCode: null,
        receipt: { sessionId: serverSessionId, durationSeconds: 60, result: { xp: 1, gold: 0 } } },
    };
    journal.records.push(record);
    journal.commands.push({ operationId: identity("cccccccc", index), clientSessionId, kind: "complete", status: "acknowledged",
      createdAtMs: completedAtMs, request: { serverSessionId, completedAtMs, targetSeconds: 60 } });
  }
  return journal;
}
function apply(store, action) {
  return store.update(current => domain.applyJournalAction(current, {
    epoch: current.admission.epoch, expectedRevision: current.revision, ...action,
  }));
}

test("a missing journal loads without writing, then a saved revision survives a new store", async () => {
  const backend = memoryStorage(), store = api.createSessionJournalStore(backend, scope);
  const fresh = await store.load();
  assert.equal(fresh.kind, "ready"); assert.equal(fresh.journal.revision, 0);
  assert.deepEqual(fresh.journal.scope, scope); assert.equal(backend.commits.length, 0);
  const saved = await store.update(next);
  assert.equal(saved.revision, 1);
  assert.deepEqual((await api.createSessionJournalStore(backend, scope).load()).journal, saved);
});

test("multiple store instances serialize read-modify-write against the same backend and key", async () => {
  const backend = memoryStorage(), a = api.createSessionJournalStore(backend, scope), b = api.createSessionJournalStore(backend, { ...scope });
  await Promise.all(Array.from({ length: 40 }, (_, index) => (index % 2 ? a : b).update(next)));
  assert.equal((await a.load()).journal.revision, 40);
  assert.deepEqual(backend.commits.map(commit => JSON.parse(commit.value).revision), Array.from({ length: 40 }, (_, index) => index + 1));
});

test("an owner with a blocked save does not block a different owner on the same backend", async () => {
  const backend = memoryStorage(), a = api.createSessionJournalStore(backend, scope), b = api.createSessionJournalStore(backend, otherScope);
  const reached = deferred(), release = deferred();
  backend.beforeWrite = async key => { if (key === a.key) { reached.resolve(); await release.promise; } };
  const savingA = a.update(next); await reached.promise;
  assert.equal((await b.update(next)).revision, 1); assert.notEqual(a.key, b.key);
  release.resolve(); await savingA;
  assert.deepEqual((await a.load()).journal.scope, scope);
  assert.deepEqual((await b.load()).journal.scope, otherScope);
});

test("backend namespaces remain independent for the same owner", async () => {
  const backend = memoryStorage(), a = api.createSessionJournalStore(backend, scope), b = api.createSessionJournalStore(backend, { ...scope, backendId: "other-backend" });
  assert.notEqual(a.key, b.key); await a.update(next);
  assert.equal((await b.load()).journal.revision, 0);
});

test("save completes before a new state is returned, and caller aliases cannot mutate it", async () => {
  const backend = memoryStorage(), requested = { ...scope }, store = api.createSessionJournalStore(backend, requested);
  requested.ownerId = otherScope.ownerId;
  const reached = deferred(), release = deferred(); let exposed = false, proposed;
  backend.beforeWrite = async () => { reached.resolve(); await release.promise; };
  const saving = store.update(current => {
    proposed = { ...current, revision: current.revision + 1, admission: { epoch: 1, active: true } };
    return proposed;
  }).then(value => { exposed = true; return value; });
  await reached.promise; assert.equal(exposed, false); assert.equal(backend.values.has(store.key), false);
  proposed.scope.ownerId = otherScope.ownerId; proposed.admission.active = false;
  release.resolve(); const saved = await saving;
  assert.equal(saved.admission.active, true); assert.deepEqual(saved.scope, scope);
  saved.admission.active = false; saved.scope.backendId = "caller-change";
  const loaded = await store.load(); assert.equal(loaded.journal.admission.active, true); assert.deepEqual(loaded.journal.scope, scope);
  loaded.journal.admission.active = false;
  assert.equal((await store.load()).journal.admission.active, true);
});

test("a failed write exposes no new state and cannot poison the next queued update", async () => {
  const backend = memoryStorage(), store = api.createSessionJournalStore(backend, scope); let fail = true;
  backend.beforeWrite = async () => { if (fail) { fail = false; throw new Error("do-not-display-this-draft"); } };
  const rejected = store.update(next), accepted = store.update(next);
  await assert.rejects(rejected, errorCode("write_failed"));
  assert.equal((await accepted).revision, 1); assert.equal(backend.commits.length, 1);
  assert.equal((await store.load()).journal.revision, 1);
});

test("read and transform errors are sanitized and later work remains usable", async () => {
  const backend = memoryStorage(), store = api.createSessionJournalStore(backend, scope); let fail = true;
  backend.beforeRead = async () => { if (fail) { fail = false; throw new Error("do-not-display-this-draft"); } };
  await assert.rejects(store.load(), errorCode("read_failed"));
  await assert.rejects(store.update(() => { throw new Error("do-not-display-this-draft"); }), errorCode("transform_failed"));
  assert.equal((await store.update(next)).revision, 1);
});

test("semantic no-ops do not save; changed state needs exactly one revision increment and the same scope", async () => {
  const backend = memoryStorage(), store = api.createSessionJournalStore(backend, scope);
  await store.update(current => ({ commands: current.commands, records: current.records, admission: current.admission, revision: current.revision, scope: current.scope, schemaVersion: current.schemaVersion }));
  assert.equal(backend.commits.length, 0);
  await assert.rejects(store.update(current => ({ ...current, admission: { epoch: 1, active: true } })), errorCode("revision_mismatch"));
  await assert.rejects(store.update(current => ({ ...current, revision: current.revision + 2 })), errorCode("revision_mismatch"));
  await assert.rejects(store.update(current => ({ ...current, revision: current.revision + 1, scope: otherScope })), error => { assert.equal(error.code, "invalid_update"); assert.equal(error.reason, "scope_mismatch"); return true; });
  assert.equal(backend.commits.length, 0); assert.equal((await store.update(next)).revision, 1);
});

test("a malformed update is refused before persistence without quarantining the valid prior state", async () => {
  const backend = memoryStorage(), store = api.createSessionJournalStore(backend, scope);
  await store.update(next); const before = backend.values.get(store.key);
  await assert.rejects(store.update(current => ({ ...current, revision: current.revision + 1, password: "do-not-display-this-draft" })), errorCode("invalid_update"));
  assert.equal(backend.values.get(store.key), before); assert.equal(backend.commits.length, 1);
});

test("corrupt JSON, unknown versions and foreign-owner records are archived without replacing the source", async () => {
  for (const [raw, reason] of [
    ["{do-not-display-this-draft", "invalid_json"],
    [JSON.stringify({ schemaVersion: 9, draft: "do-not-display-this-draft" }), "unsupported_version"],
    ["null", "invalid_record"],
  ]) {
    const backend = memoryStorage(), store = api.createSessionJournalStore(backend, scope); backend.values.set(store.key, raw);
    const loaded = await store.load(); assert.equal(loaded.kind, "quarantined"); assert.equal(loaded.reason, reason);
    assert.equal(JSON.parse(backend.values.get(loaded.quarantineKey)).raw, raw);
    assert.equal(backend.values.get(store.key), raw); assert.equal(Object.hasOwn(loaded, "raw"), false);
    await assert.rejects(store.update(next), errorCode("recovery_required")); assert.equal(backend.values.get(store.key), raw);
    assert.equal(backend.commits.length, 1, "identical archives are reused rather than overwritten");
  }
  const backend = memoryStorage(), foreign = api.createSessionJournalStore(backend, otherScope), mine = api.createSessionJournalStore(backend, scope);
  await foreign.update(next); const raw = backend.values.get(foreign.key); backend.values.set(mine.key, raw);
  const loaded = await mine.load(); assert.equal(loaded.reason, "scope_mismatch"); assert.equal(backend.values.get(mine.key), raw);
});

test("failed quarantine leaves original bytes intact and recovery cannot erase them", async () => {
  const backend = memoryStorage(), store = api.createSessionJournalStore(backend, scope), raw = "do-not-display-this-draft";
  backend.values.set(store.key, raw); backend.beforeWrite = async () => { throw new Error(raw); };
  await assert.rejects(store.load(), errorCode("quarantine_failed"));
  assert.equal(backend.values.get(store.key), raw); assert.equal(backend.values.size, 1);
  await assert.rejects(store.resetQuarantined(`${store.key}:quarantine:0`), errorCode("invalid_quarantine"));
  backend.beforeWrite = null; const loaded = await store.load();
  assert.equal(loaded.kind, "quarantined"); assert.equal(backend.values.get(store.key), raw);
});

test("quarantine verifies its saved copy and never overwrites an older archive", async () => {
  const backend = memoryStorage(), store = api.createSessionJournalStore(backend, scope);
  const oldKey = `${store.key}:quarantine:0`, old = "an earlier unreadable archive";
  backend.values.set(oldKey, old); backend.values.set(store.key, "unreadable source");
  const loaded = await store.load(); assert.equal(loaded.quarantineKey, `${store.key}:quarantine:1`); assert.equal(backend.values.get(oldKey), old);
  const badBackend = memoryStorage(), bad = api.createSessionJournalStore(badBackend, scope);
  badBackend.values.set(bad.key, "unreadable source");
  badBackend.setItem = async () => {};
  await assert.rejects(bad.load(), errorCode("quarantine_failed")); assert.equal(badBackend.values.get(bad.key), "unreadable source");
});

test("explicit recovery verifies the archived source, preserves the archive and refuses changed or foreign data", async () => {
  const backend = memoryStorage(), store = api.createSessionJournalStore(backend, scope), raw = "unreadable source";
  backend.values.set(store.key, raw); const loaded = await store.load();
  const reset = await api.createSessionJournalStore(backend, scope).resetQuarantined(loaded.quarantineKey);
  assert.equal(reset.revision, 0); assert.equal((await store.load()).kind, "ready");
  assert.equal(JSON.parse(backend.values.get(loaded.quarantineKey)).raw, raw);
  await store.update(next); const saved = backend.values.get(store.key);
  await assert.rejects(store.resetQuarantined(loaded.quarantineKey), errorCode("source_changed"));
  assert.equal(backend.values.get(store.key), saved);
  await assert.rejects(api.createSessionJournalStore(backend, otherScope).resetQuarantined(loaded.quarantineKey), errorCode("invalid_quarantine"));
});

test("a failed explicit reset leaves the source and its durable quarantine unchanged", async () => {
  const backend = memoryStorage(), store = api.createSessionJournalStore(backend, scope), raw = "unreadable source";
  backend.values.set(store.key, raw); const loaded = await store.load(), archive = backend.values.get(loaded.quarantineKey);
  backend.beforeWrite = async key => { if (key === store.key) throw new Error("do-not-display-this-draft"); };
  await assert.rejects(store.resetQuarantined(loaded.quarantineKey), errorCode("write_failed"));
  assert.equal(backend.values.get(store.key), raw); assert.equal(backend.values.get(loaded.quarantineKey), archive);
});

test("pending work survives restart; generic transforms cannot erase work or replace immutable identities and receipts", async () => {
  const backend = memoryStorage(), store = api.createSessionJournalStore(backend, scope);
  const record = {
    clientSessionId: "33333333-3333-4333-8333-333333333333", serverSessionId: "44444444-4444-4444-8444-444444444444", revision: 2, state: "completed",
    setup: { targetSeconds: 60, activityType: "other", taskId: null, subjectId: null, notes: "synthetic draft", title: "Synthetic focus" },
    startedAtMs: 100000, elapsedMs: 60000, clockAnchor: null, endsAtMs: 160000, completedAtMs: 160000, observedAtMs: 160500, dismissedAtMs: null,
    verification: "server_timed", clockWarning: false, sync: { state: "pending", attempts: 1, nextAttemptAtMs: 170000, reasonCode: "network", receipt: null },
  };
  const command = { operationId: "55555555-5555-4555-8555-555555555555", clientSessionId: record.clientSessionId, kind: "complete", status: "unknown", createdAtMs: 160000, request: { serverSessionId: record.serverSessionId, completedAtMs: record.completedAtMs, targetSeconds: record.setup.targetSeconds } };
  await store.update(current => ({ ...current, revision: current.revision + 1, records: [record], commands: [command] }));
  record.setup.notes = "caller mutation"; command.request.serverSessionId = "caller mutation";
  const restarted = api.createSessionJournalStore(backend, scope); await restarted.update(next);
  const journal = (await restarted.load()).journal;
  assert.equal(journal.records[0].setup.notes, "synthetic draft");
  assert.equal(journal.commands[0].request.serverSessionId, journal.records[0].serverSessionId);
  assert.equal(journal.records[0].sync.state, "pending"); assert.equal(journal.commands[0].status, "unknown");
  const saved = backend.values.get(store.key);
  await assert.rejects(restarted.update(current => ({ ...next(current), records: [], commands: [] })), errorCode("invalid_update"));
  await assert.rejects(restarted.update(current => ({ ...next(current), commands: [] })), errorCode("invalid_update"));
  for (const change of [
    item => { item.setup.title = "Changed after start"; },
    item => { item.serverSessionId = "66666666-6666-4666-8666-666666666666"; },
    item => { item.startedAtMs++; },
    item => { item.endsAtMs++; },
    item => { item.observedAtMs++; },
    item => { item.clockWarning = true; },
  ]) await assert.rejects(restarted.update(current => { const updated = next(current); change(updated.records[0]); return updated; }), errorCode("invalid_update"));
  await assert.rejects(restarted.update(current => { const updated = next(current); updated.records[0].completedAtMs++; updated.commands[0].request.completedAtMs++; return updated; }), errorCode("invalid_update"));
  for (const change of [
    item => { item.kind = "cancel"; },
    item => { item.createdAtMs++; },
    item => { item.request.serverSessionId = "66666666-6666-4666-8666-666666666666"; },
  ]) await assert.rejects(restarted.update(current => { const updated = next(current); change(updated.commands[0]); return updated; }), errorCode("invalid_update"));
  assert.equal(backend.values.get(store.key), saved);
  const receipt = { sessionId: journal.records[0].serverSessionId, durationSeconds: 60, result: { xp: 1, gold: 0 } };
  await restarted.update(current => {
    const updated = next(current); updated.records[0].sync = { ...updated.records[0].sync, state: "synced", receipt };
    updated.commands[0].status = "acknowledged"; return updated;
  });
  const acknowledged = backend.values.get(store.key);
  await assert.rejects(restarted.update(current => { const updated = next(current); updated.records[0].sync.receipt.result.xp = 99; return updated; }), errorCode("invalid_update"));
  await assert.rejects(restarted.update(current => ({ ...next(current), commands: [] })), errorCode("invalid_update"));
  await restarted.update(current => { const updated = next(current); updated.records[0].sync.receipt.result = { gold: 0, xp: 1 }; return updated; });
  assert.deepEqual((await restarted.load()).journal.records[0].sync.receipt, receipt);
  assert.notEqual(backend.values.get(store.key), acknowledged, "semantic receipt equality permits an otherwise valid next revision");
  await restarted.update(current => ({ ...next(current), records: [], commands: [] }));
  assert.deepEqual((await restarted.load()).journal.records, [], "a safe settled record and all its commands may be pruned together");
});

test("saved compaction removes settled records and commands together and continues past record 100 in one month", async () => {
  const backend = memoryStorage(), store = api.createSessionJournalStore(backend, scope), original = settledJournal(100);
  backend.values.set(store.key, JSON.stringify(original));
  const compacted = await apply(store, { type: "compact" });
  assert.equal(compacted.records.length, 20); assert.equal(compacted.commands.length, 20);
  assert.deepEqual(compacted.records.map(item => item.clientSessionId), original.records.slice(-20).map(item => item.clientSessionId));
  const operationId = identity("dddddddd", 101), clientSessionId = identity("aaaaaaaa", 101);
  const startedAtMs = Date.UTC(2026, 9, 1) + 101 * 120000;
  const afterStart = await apply(store, { type: "prepare_start", operationId, clientSessionId,
    setup: { targetSeconds: 60, activityType: "other", taskId: null, subjectId: null, notes: null, title: "Session 101" },
    clock: { wallTimeMs: startedAtMs, monotonicTimeMs: null, bootId: null } });
  assert.equal(afterStart.records.find(item => item.clientSessionId === clientSessionId).state, "not_started");
  const restored = (await api.createSessionJournalStore(backend, scope).load()).journal;
  assert.deepEqual(restored, afterStart); assert.equal(backend.commits.length, 2);
});

test("capacity-pressure pruning permits session 101 and can go below the settled ceiling without removing undisclosed rejections", async () => {
  for (const rejectedCount of [0, 99]) {
    const backend = memoryStorage(), store = api.createSessionJournalStore(backend, scope), original = settledJournal(100);
    for (let index = 0; index < rejectedCount; index++) {
      original.records[index].sync = { ...original.records[index].sync, state: "rejected", receipt: null, reasonCode: "not_accepted" };
      original.commands[index].status = "rejected";
    }
    backend.values.set(store.key, JSON.stringify(original));
    const clientSessionId = identity("aaaaaaaa", 101);
    const saved = await apply(store, { type: "prepare_start", operationId: identity("dddddddd", 101), clientSessionId,
      setup: { targetSeconds: 60, activityType: "other", taskId: null, subjectId: null, notes: null, title: "Session 101" },
      clock: { wallTimeMs: Date.UTC(2026, 9, 1) + 101 * 120000, monotonicTimeMs: null, bootId: null } });
    assert.ok(saved.records.length <= 100); assert.equal(saved.records.at(-1).clientSessionId, clientSessionId);
    assert.equal(saved.records.filter(item => item.sync.state === "rejected").length, rejectedCount);
    for (let index = 0; index < rejectedCount; index++) {
      assert.deepEqual(saved.records.find(item => item.clientSessionId === original.records[index].clientSessionId), original.records[index]);
    }
    assert.deepEqual((await store.load()).journal, saved);
  }
});

test("a failed compaction save preserves all records and a retry still uses the latest source", async () => {
  const backend = memoryStorage(), store = api.createSessionJournalStore(backend, scope), original = settledJournal(100);
  const raw = JSON.stringify(original); backend.values.set(store.key, raw);
  backend.beforeWrite = async () => { throw new Error("do-not-display-this-draft"); };
  await assert.rejects(apply(store, { type: "compact" }), errorCode("write_failed"));
  assert.equal(backend.values.get(store.key), raw); assert.deepEqual((await store.load()).journal, original);
  backend.beforeWrite = null; const compacted = await apply(store, { type: "compact" });
  assert.equal(compacted.records.length, 20); assert.equal(compacted.revision, original.revision + 1);
});

test("rejected work stays protected until explicit dismissal is saved and its timestamp cannot revert", async () => {
  const backend = memoryStorage(), store = api.createSessionJournalStore(backend, scope), original = settledJournal(21);
  const rejected = original.records[0]; rejected.sync = { ...rejected.sync, state: "rejected", receipt: null, reasonCode: "not_accepted" };
  original.commands[0].status = "rejected"; backend.values.set(store.key, JSON.stringify(original));
  const compacted = await apply(store, { type: "compact" });
  assert.ok(compacted.records.some(item => item.clientSessionId === rejected.clientSessionId));
  await assert.rejects(store.update(current => ({ ...next(current),
    records: current.records.filter(item => item.clientSessionId !== rejected.clientSessionId),
    commands: current.commands.filter(item => item.clientSessionId !== rejected.clientSessionId) })), errorCode("invalid_update"));
  const dismissedAtMs = rejected.completedAtMs + 1000;
  backend.beforeWrite = async () => { throw new Error("do-not-display-this-draft"); };
  const before = backend.values.get(store.key);
  await assert.rejects(apply(store, { type: "dismiss", clientSessionId: rejected.clientSessionId, dismissedAtMs }), errorCode("write_failed"));
  assert.equal(backend.values.get(store.key), before);
  backend.beforeWrite = null; const dismissed = await apply(store, { type: "dismiss", clientSessionId: rejected.clientSessionId, dismissedAtMs });
  assert.equal(dismissed.records.find(item => item.clientSessionId === rejected.clientSessionId).dismissedAtMs, dismissedAtMs);
  for (const replacement of [null, dismissedAtMs + 1]) {
    await assert.rejects(store.update(current => { const updated = next(current); updated.records.find(item => item.clientSessionId === rejected.clientSessionId).dismissedAtMs = replacement; return updated; }), errorCode("invalid_update"));
  }
  const afterCompact = await apply(store, { type: "compact" });
  assert.equal(afterCompact.records.some(item => item.clientSessionId === rejected.clientSessionId), false);
  assert.equal(afterCompact.commands.some(item => item.clientSessionId === rejected.clientSessionId), false);
});

test("compaction preserves unknown completion and waiting-auth work even when all other records are settled", async () => {
  for (const syncState of ["pending", "waiting_auth"]) {
    const backend = memoryStorage(), store = api.createSessionJournalStore(backend, scope), original = settledJournal(100);
    const pending = original.records[0]; pending.sync = { ...pending.sync, state: syncState, receipt: null };
    original.commands[0].status = "unknown"; backend.values.set(store.key, JSON.stringify(original));
    const compacted = await apply(store, { type: "compact" });
    assert.deepEqual(compacted.records.find(item => item.clientSessionId === pending.clientSessionId), pending);
    assert.deepEqual(compacted.commands.find(item => item.clientSessionId === pending.clientSessionId), original.commands[0]);
    assert.equal(compacted.records.length, 21);
    await assert.rejects(store.update(current => ({ ...next(current), records: [], commands: [] })), errorCode("invalid_update"));
  }
});

test("a retained settled record cannot lose one of its acknowledged commands", async () => {
  const backend = memoryStorage(), store = api.createSessionJournalStore(backend, scope), original = settledJournal(2);
  backend.values.set(store.key, JSON.stringify(original)); const before = backend.values.get(store.key);
  await assert.rejects(store.update(current => ({ ...next(current), commands: current.commands.slice(1) })), errorCode("invalid_update"));
  assert.equal(backend.values.get(store.key), before);
});

test("the optional AsyncStorage adapter keeps backend identity across factories", async () => {
  const backend = memoryStorage();
  const adapter = load("src/services/sessionJournalAsyncStorage.ts", { "@react-native-async-storage/async-storage": { __esModule: true, default: backend } });
  const a = adapter.createAsyncStorageSessionJournalStore(scope), b = adapter.createAsyncStorageSessionJournalStore({ ...scope });
  await Promise.all([a.update(next), b.update(next)]);
  assert.equal((await a.load()).journal.revision, 2); assert.equal(backend.commits.length, 2);
});
