/* global __dirname */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
function load(file, mocks, cache = new Map()) {
  const filename = path.resolve(__dirname, '..', file);
  if (cache.has(filename)) return cache.get(filename).exports;
  const mod = { exports: {} }; cache.set(filename, mod);
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function('require', 'module', 'exports', code)(name => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (!name.startsWith('.')) return require(name);
    const dependency = path.resolve(path.dirname(filename), name);
    return load(path.relative(path.resolve(__dirname, '..'), dependency.endsWith('.ts') ? dependency : `${dependency}.ts`), mocks, cache);
  }, mod, mod.exports);
  return mod.exports;
}
const SCOPE = { backendId: 'fixture-backend', ownerId: '11111111-1111-4111-8111-111111111111' };
const OTHER = { ...SCOPE, ownerId: '22222222-2222-4222-8222-222222222222' };
const CLIENT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SERVER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const T0 = 1800000000000;
const WEEK = 604800000;
const SETUP = { targetSeconds: 60, activityType: 'learning', taskId: null, subjectId: 9, notes: 'Read', title: 'Read a chapter' };
const clone = value => JSON.parse(JSON.stringify(value));
const errorCode = expected => error => error?.code === expected;
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
function capability(overrides = {}) {
  return { policy_version: 1, offline_enabled: true, owner_id: SCOPE.ownerId, server_time: new Date(T0).toISOString(),
    max_cached_grant_age_seconds: 604800, max_age_seconds: 604800, max_span_seconds: 86400, max_target_seconds: 28800,
    max_segments: 256, max_future_skew_seconds: 120, clock_tolerance_seconds: 15, max_client_reported_daily_seconds: 57600, ...overrides };
}
function submission(overrides = {}) {
  return { policyVersion: 1, clientSessionId: CLIENT, serverSessionId: null, expectedRevision: null,
    setup: clone(SETUP), startedAtMs: T0, endedAtMs: T0 + 60000, ending: 'completed',
    segments: [{ startedAtMs: T0, endedAtMs: T0 + 60000 }], clockWarning: false,
    serverConfirmedMs: 0, serverObservedAtMs: null, ...overrides };
}
function receipt(overrides = {}) {
  return { session_id: SERVER, duration_seconds: 60, already_completed: false, xp_earned: 1, gold_earned: 0,
    level: 1, current_xp: 1, gold: 0, leveled_up: false, daily_goal_minutes: 60, daily_completed_minutes: 1,
    daily_goal_completed: false, streak_count: 1, credit_version: 1, character_xp_earned: 1,
    area_xp_earned: 1, character_remainder_seconds: 0, area_remainder_seconds: 0, daily_completed_seconds: 60,
    goal_reached_now: false, credited_date: '2027-01-15', ...overrides };
}
function accepted(overrides = {}) {
  return { outcome: 'accepted', client_session_id: CLIENT, session_id: SERVER, sync_revision: 1,
    verification_class: 'client_reported', ending: 'completed', receipt: receipt(), ...overrides };
}
function snapshot(overrides = {}) {
  return { id: SERVER, user_id: SCOPE.ownerId, task_id: null, subject_id: 9, activity_type: 'learning',
    target_duration_seconds: 60, elapsed_seconds: 5, duration_seconds: 0, status: 'active', notes: 'Read',
    started_at: new Date(T0).toISOString(), last_resumed_at: new Date(T0 + 5000).toISOString(), paused_at: null,
    completed_at: null, credit_result: null, sync_revision: 1, client_session_id: CLIENT,
    server_time: new Date(T0 + 10000).toISOString(), sync_handoff: { revision: 1, observed_at_ms: T0 + 10000, confirmed_ms: 10000 }, ...overrides };
}
function fixture({ responses = [], verify, storage, rpc } = {}) {
  const memory = new Map(), calls = [], events = [];
  let now = T0, current = SCOPE, epoch = 1, verified = SCOPE;
  const backend = { rpc: async (name, params) => {
    events.push('rpc'); calls.push({ name, params: clone(params) });
    return rpc ? rpc(name, params) : responses.shift() ?? { data: capability({ server_time: new Date(now).toISOString() }), error: null };
  } };
  const api = load('src/services/offlineSessionService.ts', { '../../lib/supabase': { supabase: backend } });
  const adapter = storage ?? { getItem: async key => memory.get(key) ?? null, setItem: async (key, value) => { memory.set(key, value); } };
  const options = {
    storage: adapter, now: () => now, currentScope: () => current, currentEpoch: () => epoch,
    ensureVerifiedScope: async () => { events.push('verify'); return verify ? verify() : verified; },
    getClock: () => ({ wallTimeMs: now, monotonicTimeMs: null, bootId: null }),
  };
  return { api, memory, calls, events, adapter, options, cache: api.createOfflineCapabilityCache(SCOPE, options),
    transport: api.createOfflineSessionTransport(SCOPE, options), setNow: value => { now = value; },
    setCurrent: value => { current = value; }, setEpoch: value => { epoch = value; }, setVerified: value => { verified = value; } };
}

test('offline capability starts disabled and cache keys separate owner and backend', async () => {
  const f = fixture();
  assert.equal(f.cache.readFreshGrant(), null);
  assert.equal(await f.cache.load(), null);
  assert.deepEqual(f.calls, []);
  assert.notEqual(f.cache.key, f.api.offlineCapabilityKey(OTHER));
  assert.notEqual(f.cache.key, f.api.offlineCapabilityKey({ ...SCOPE, backendId: 'other-backend' }));
});
test('fresh verified policy is durably cached with no token or raw response fields', async () => {
  const f = fixture({ responses: [{ data: capability({ access_token: 'should-not-be-cached' }), error: null }] });
  const grant = await f.cache.refresh();
  assert.equal(grant.policyVersion, 1);
  assert.equal(grant.expiresAtMs, T0 + WEEK);
  assert.deepEqual(f.events, ['verify', 'rpc']);
  assert.deepEqual(f.calls, [{ name: 'session_sync_capabilities_v1', params: {} }]);
  assert.ok(!f.memory.get(f.cache.key).includes('should-not-be-cached'));
  grant.scope.ownerId = OTHER.ownerId;
  assert.deepEqual(f.cache.readFreshGrant().scope, SCOPE);
});
test('cache restores only exact valid owner/backend policy before seven-day expiry', async () => {
  const f = fixture(); await f.cache.refresh(); f.setNow(T0 + WEEK - 1);
  const restored = f.api.createOfflineCapabilityCache(SCOPE, f.options);
  assert.ok(await restored.load());
  f.setNow(T0 + WEEK); assert.equal(restored.readFreshGrant(), null);
  const other = f.api.createOfflineCapabilityCache(OTHER, { ...f.options, currentScope: () => OTHER });
  assert.equal(await other.load(), null);
});
test('no fresh verification means no capability RPC or cache write', async () => {
  for (const verified of [null, OTHER, { ...SCOPE, backendId: 'wrong-backend' }]) {
    const f = fixture(); f.setVerified(verified);
    assert.equal(await f.cache.refresh(), null); assert.deepEqual(f.calls, []); assert.equal(f.memory.size, 0);
  }
});
test('capability reply after account or epoch change cannot authorize or save a grant', async () => {
  for (const change of ['owner', 'epoch']) {
    const pending = deferred(); const f = fixture({ rpc: () => pending.promise });
    const promise = f.cache.refresh(); await new Promise(setImmediate);
    if (change === 'owner') f.setCurrent(OTHER); else f.setEpoch(2);
    pending.resolve({ data: capability(), error: null });
    assert.equal(await promise, null); assert.equal(f.memory.size, 0);
  }
});
test('transient capability refresh retains a still-valid same-owner grant', async () => {
  const f = fixture({ responses: [{ data: capability(), error: null }, { data: null, error: { code: '503' }, status: 503 }] });
  await f.cache.refresh(); f.setNow(T0 + 5000);
  assert.equal((await f.cache.refresh()).grantedAtMs, T0);
  f.setCurrent(OTHER); assert.equal(f.cache.readFreshGrant(), null);
  assert.equal(f.cache.readFreshGrant(OTHER), null);
});
test('unsupported endpoint durably disables an old grant without changing online functions', async () => {
  const f = fixture({ responses: [{ data: capability(), error: null }, { data: null, error: { code: 'PGRST202' } }] });
  await f.cache.refresh(); assert.equal(await f.cache.refresh(), null);
  assert.equal(f.cache.readFreshGrant(), null);
  assert.equal(await f.api.createOfflineCapabilityCache(SCOPE, f.options).load(), null);
  assert.deepEqual(f.calls.map(item => item.name), ['session_sync_capabilities_v1', 'session_sync_capabilities_v1']);
});
test('explicitly disabled or unknown policy version drops old cached capability', async () => {
  for (const update of [{ offline_enabled: false }, { policy_version: 2 }]) {
    const f = fixture({ responses: [{ data: capability(), error: null }, { data: capability(update), error: null }] });
    await f.cache.refresh(); assert.equal(await f.cache.refresh(), null);
    assert.equal(JSON.parse(f.memory.get(f.cache.key)).grant, null);
  }
});
test('unsupported policy limits and foreign capability owner never enable offline', async () => {
  for (const update of [{ max_segments: 512 }, { max_span_seconds: 604800 }, { max_cached_grant_age_seconds: 604801 },
    { max_cached_grant_age_seconds: 0 }, { owner_id: OTHER.ownerId }, { server_time: new Date(T0 + 15001).toISOString() }]) {
    const f = fixture({ responses: [{ data: capability(update), error: null }] });
    assert.equal(await f.cache.refresh(), null); assert.equal(f.memory.size, 0);
  }
});
test('poisoned, future, oversize and stale cache records fail closed', async () => {
  for (const mutate of [entry => { entry.grant.grantedAtMs++; }, entry => { entry.grant.lastSeenAtMs++; },
    entry => { entry.grant.expiresAtMs += 1; }, entry => { entry.grant.policyVersion = 2; },
    entry => { entry.grant.secret_key = 'not-allowed'; }, entry => { entry.scope.ownerId = OTHER.ownerId; }]) {
    const f = fixture(); await f.cache.refresh();
    const entry = JSON.parse(f.memory.get(f.cache.key)); mutate(entry); f.memory.set(f.cache.key, JSON.stringify(entry));
    assert.equal(await f.api.createOfflineCapabilityCache(SCOPE, f.options).load(), null);
  }
  const f = fixture(); f.memory.set(f.cache.key, 'x'.repeat(4097)); assert.equal(await f.cache.load(), null);
});
test('clock rollback invalidates and persists disabled marker until fresh online verification', async () => {
  const f = fixture(); await f.cache.refresh(); f.setNow(T0 + 10000); assert.ok(f.cache.readFreshGrant());
  f.setNow(T0 + 9999); assert.equal(f.cache.readFreshGrant(), null); await new Promise(setImmediate);
  f.setNow(T0 + 20000); assert.equal(f.cache.readFreshGrant(), null);
  assert.equal(await f.api.createOfflineCapabilityCache(SCOPE, f.options).load(), null);
  assert.ok(await f.cache.refresh());
});
test('loading a valid grant records its high-water clock for a later restart', async () => {
  const f = fixture(); await f.cache.refresh(); f.setNow(T0 + 10000);
  const cache = f.api.createOfflineCapabilityCache(SCOPE, f.options); await cache.load();
  f.setNow(T0 + 9999); assert.equal(await f.api.createOfflineCapabilityCache(SCOPE, f.options).load(), null);
});
test('clock rollback during an in-flight capability probe cannot authorize', async () => {
  const pending = deferred(); const f = fixture({ rpc: () => pending.promise });
  const promise = f.cache.refresh(); await new Promise(setImmediate); f.setNow(T0 - 1);
  pending.resolve({ data: capability(), error: null }); assert.equal(await promise, null);
  assert.equal(JSON.parse(f.memory.get(f.cache.key)).grant, null);
});
test('capability persistence failure never returns a volatile offline grant', async () => {
  const f = fixture({ storage: { getItem: async () => null, setItem: async () => { throw Error('full'); } } });
  assert.equal(await f.cache.refresh(), null); assert.equal(f.cache.readFreshGrant(), null);
});
test('clear fences a pending same-owner refresh and persists disabled cache', async () => {
  const pending = deferred(); const f = fixture({ rpc: () => pending.promise });
  const refresh = f.cache.refresh(); await new Promise(setImmediate); const clear = f.cache.clear();
  pending.resolve({ data: capability(), error: null }); assert.equal(await refresh, null); await clear;
  assert.equal(f.cache.readFreshGrant(), null); assert.equal(JSON.parse(f.memory.get(f.cache.key)).grant, null);
});
test('simultaneous capability operations keep write order and cannot revive an unsupported policy', async () => {
  const f = fixture({ responses: [{ data: capability(), error: null }, { data: null, error: { code: 'PGRST202' } }] });
  await Promise.all([f.cache.refresh(), f.cache.refresh()]);
  assert.equal(f.cache.readFreshGrant(), null); assert.equal(JSON.parse(f.memory.get(f.cache.key)).grant, null);
});

test('submission requires fresh exact scope and epoch before any RPC', async () => {
  for (const verified of [null, OTHER, { ...SCOPE, backendId: 'wrong-backend' }]) {
    const f = fixture(); f.setVerified(verified);
    await assert.rejects(() => f.transport.submit(CLIENT, submission()), error => error.requestSent === false);
    await assert.rejects(() => f.transport.readSnapshot(SERVER), errorCode(verified ? 'scope_mismatch' : 'auth_unavailable'));
    assert.deepEqual(f.calls, []);
  }
});
test('submission freezes exact payload before awaiting auth and accepts only matched receipt', async () => {
  const gate = deferred(); const f = fixture({ verify: () => gate.promise, responses: [{ data: accepted(), error: null }] });
  const value = submission(), promise = f.transport.submit(CLIENT, value);
  value.setup.notes = 'changed'; value.segments[0].endedAtMs -= 1000; gate.resolve(SCOPE);
  const result = await promise;
  assert.equal(result.outcome, 'accepted'); assert.equal(result.receipt.sessionId, SERVER);
  assert.deepEqual(f.calls, [{ name: 'submit_client_session_v1', params: { client_session_id: CLIENT, submission: submission() } }]);
  result.receipt.result.xp_earned = 900;
  assert.equal(f.calls[0].params.submission.setup.notes, 'Read');
});
test('pure client UUID may map to a different server UUID on both accepted and replay replies', async () => {
  for (const outcome of ['accepted', 'already_saved']) {
    const f = fixture({ responses: [{ data: accepted({ outcome }), error: null }] });
    const result = await f.transport.submit(CLIENT, submission());
    assert.equal(result.clientSessionId, CLIENT); assert.equal(result.serverSessionId, SERVER); assert.equal(result.outcome, outcome);
  }
});
test('RPC losing reply or changing account after dispatch remains uncertain', async () => {
  const f = fixture({ rpc: async () => { throw Error('network'); } });
  await assert.rejects(() => f.transport.submit(CLIENT, submission()), error => error.requestSent === true && error.failureKind === 'transient');
  const pending = deferred(); const changed = fixture({ rpc: () => pending.promise });
  const promise = changed.transport.submit(CLIENT, submission()); await new Promise(setImmediate); changed.setEpoch(2);
  pending.resolve({ data: accepted(), error: null });
  await assert.rejects(promise, error => error.code === 'scope_mismatch' && error.requestSent === true);
});
test('malformed request identities, intervals, bounds and credentials are refused before RPC', async () => {
  const variants = [submission({ clientSessionId: SERVER }), submission({ endedAtMs: T0 - 1 }),
    submission({ endedAtMs: T0 + 86400001 }), submission({ serverConfirmedMs: 1 }), submission({ expectedRevision: 1 }),
    submission({ segments: [{ startedAtMs: T0 + 100, endedAtMs: T0 + 99 }] }),
    submission({ segments: [{ startedAtMs: T0 - 1, endedAtMs: T0 + 20 }] }),
    submission({ segments: [{ startedAtMs: T0, endedAtMs: T0 + 40000 }, { startedAtMs: T0 + 30000, endedAtMs: T0 + 60000 }] }),
    submission({ segments: Array.from({ length: 257 }, (_, i) => ({ startedAtMs: T0 + i, endedAtMs: T0 + i + 1 })) }),
    { ...submission(), access_token: 'no' }];
  for (const value of variants) {
    const f = fixture(); await assert.rejects(() => f.transport.submit(CLIENT, value), errorCode('invalid_request'));
    assert.deepEqual(f.calls, []);
  }
});
test('malformed receipt, foreign mapping and unknown outcome cannot be acknowledged', async () => {
  for (const data of [accepted({ client_session_id: SERVER }), accepted({ outcome: 'ok' }), accepted({ sync_revision: -1 }),
    accepted({ receipt: receipt({ session_id: CLIENT }) }), accepted({ receipt: receipt({ duration_seconds: 59 }) }),
    accepted({ receipt: receipt({ xp_earned: -1 }) }), accepted({ receipt: receipt({ service_role: 'no' }) }),
    accepted({ receipt: receipt({ daily_goal_completed: 'yes' }) })]) {
    const f = fixture({ responses: [{ data, error: null }] });
    await assert.rejects(() => f.transport.submit(CLIENT, submission()), error => error.code === 'invalid_response' && error.requestSent === true);
  }
});
test('typed server rejection is a result and never pretends to be saved', async () => {
  const data = { outcome: 'rejected', reason_code: 'overlap', client_session_id: CLIENT, session_id: null,
    sync_revision: null, verification_class: null };
  const f = fixture({ responses: [{ data, error: null }] });
  assert.deepEqual(await f.transport.submit(CLIENT, submission()), { outcome: 'rejected', reasonCode: 'overlap', clientSessionId: CLIENT,
    serverSessionId: null, revision: null, verification: null });
  const bad = fixture({ responses: [{ data: { ...data, reason_code: 'invented' }, error: null }] });
  await assert.rejects(() => bad.transport.submit(CLIENT, submission()), errorCode('invalid_response'));
});
test('mixed submission accepts only its existing server row and cannot switch ending', async () => {
  const mixed = submission({ serverSessionId: SERVER, expectedRevision: 2, serverConfirmedMs: 10000, serverObservedAtMs: T0 + 10000,
    segments: [{ startedAtMs: T0 + 10000, endedAtMs: T0 + 60000 }] });
  const f = fixture({ responses: [{ data: accepted({ sync_revision: 3 }), error: null }] });
  assert.equal((await f.transport.submit(CLIENT, mixed)).serverSessionId, SERVER);
  for (const data of [accepted({ session_id: CLIENT, receipt: receipt({ session_id: CLIENT }) }), accepted({ ending: 'cancelled', receipt: null })]) {
    const bad = fixture({ responses: [{ data, error: null }] });
    await assert.rejects(() => bad.transport.submit(CLIENT, mixed), errorCode('invalid_response'));
  }
});
test('mixed cancelled submission accepts a receipt-free cancellation only', async () => {
  const value = submission({ serverSessionId: SERVER, expectedRevision: 2, serverConfirmedMs: 10000, serverObservedAtMs: T0 + 10000,
    endedAtMs: T0 + 30000, ending: 'cancelled', segments: [{ startedAtMs: T0 + 10000, endedAtMs: T0 + 30000 }] });
  const f = fixture({ responses: [{ data: accepted({ ending: 'cancelled', receipt: null }), error: null }] });
  const result = await f.transport.submit(CLIENT, value);
  assert.equal(result.ending, 'cancelled'); assert.equal(result.receipt, null);
  const bad = fixture({ responses: [{ data: accepted({ ending: 'cancelled' }), error: null }] });
  await assert.rejects(() => bad.transport.submit(CLIENT, value), errorCode('invalid_response'));
});
test('absent import endpoint is explicitly disabled and never dispatches a legacy RPC', async () => {
  const f = fixture({ responses: [{ data: null, error: { code: 'PGRST202' } }] });
  await assert.rejects(() => f.transport.submit(CLIENT, submission()), errorCode('repair_unavailable'));
  assert.deepEqual(f.calls.map(item => item.name), ['submit_client_session_v1']);
});
test('an already saved same-row completion may settle End, but a newly accepted completion cannot change the End claim', async () => {
  const value = submission({ serverSessionId: SERVER, expectedRevision: 2, serverConfirmedMs: 10000, serverObservedAtMs: T0 + 10000,
    endedAtMs: T0 + 30000, ending: 'cancelled', segments: [{ startedAtMs: T0 + 10000, endedAtMs: T0 + 30000 }] });
  const f = fixture({ responses: [{ data: accepted({ outcome: 'already_saved', verification_class: 'server_timed', receipt: receipt({ already_completed: true }) }), error: null }] });
  const result = await f.transport.submit(CLIENT, value);
  assert.equal(result.ending, 'completed'); assert.equal(result.outcome, 'already_saved'); assert.equal(result.receipt.sessionId, SERVER);
  const bad = fixture({ responses: [{ data: accepted(), error: null }] });
  await assert.rejects(() => bad.transport.submit(CLIENT, value), errorCode('invalid_response'));
});
test('snapshot anchors elapsed to exact server handoff despite network delay', async () => {
  const f = fixture({ responses: [{ data: snapshot(), error: null }] }); f.setNow(T0 + 12000);
  const result = await f.transport.readSnapshot(SERVER, CLIENT);
  assert.equal(result.handoff.confirmedMs, 10000);
  assert.equal(result.session.snapshot.elapsedMs, 10000);
  assert.deepEqual(result.session.snapshot.observedClock, { wallTimeMs: T0 + 10000, monotonicTimeMs: null, bootId: null });
  assert.equal(result.handoff.observedAtMs, T0 + 10000);
  assert.deepEqual(f.calls, [{ name: 'session_sync_snapshot_v1', params: { server_session_id: SERVER, client_session_id: CLIENT } }]);
});
test('snapshot marks substantial local clock skew without inventing extra elapsed', async () => {
  const f = fixture({ responses: [{ data: snapshot(), error: null }] }); f.setNow(T0 + 26000);
  const result = await f.transport.readSnapshot(SERVER, CLIENT);
  assert.equal(result.session.snapshot.elapsedMs, 10000);
  assert.equal(result.session.clockWarning, true);
});
test('snapshot refuses missing handoff, stale revision and foreign owner/mapping', async () => {
  for (const data of [snapshot({ sync_handoff: null }), snapshot({ sync_handoff: { revision: 2, observed_at_ms: T0 + 10000, confirmed_ms: 10000 } }),
    snapshot({ user_id: OTHER.ownerId }), snapshot({ client_session_id: SERVER }), snapshot({ id: CLIENT }),
    snapshot({ sync_handoff: { revision: 1, observed_at_ms: T0 + 10000, confirmed_ms: 60001 } })]) {
    const f = fixture({ responses: [{ data, error: null }] });
    await assert.rejects(() => f.transport.readSnapshot(SERVER, CLIENT));
  }
});
test('missing owned snapshot returns null without inventing session state', async () => {
  const f = fixture({ responses: [{ data: null, error: null }] });
  assert.equal(await f.transport.readSnapshot(SERVER), null);
});

test('reopening the app reuses a grant issued minutes ago, and asks again once it is older', async () => {
  const f = fixture({ responses: [{ data: capability(), error: null }, { data: capability(), error: null }] });
  await f.cache.refresh();
  assert.equal(f.calls.length, 1);
  const reused = await f.cache.refreshIfStale();
  assert.ok(reused, 'the recent grant is still offered');
  assert.equal(f.calls.length, 1, 'no extra round trip on reopen');
  assert.equal(f.cache.readFreshGrant() !== null, true);
});
test('a missing grant is always asked for on reopen', async () => {
  const f = fixture({ responses: [{ data: capability(), error: null }] });
  assert.ok(await f.cache.refreshIfStale());
  assert.deepEqual(f.calls.map(item => item.name), ['session_sync_capabilities_v1']);
});
test('after ten minutes a reopen asks the server again, so a switched-off offline mode is noticed', async () => {
  const f = fixture({ responses: [{ data: capability(), error: null }] });
  await f.cache.refresh();
  f.setNow(T0 + 10 * 60 * 1000 + 1);
  await f.cache.refreshIfStale();
  assert.equal(f.calls.length, 2, 'an older grant is checked again');
});
