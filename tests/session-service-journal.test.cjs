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
const OTHER_SCOPE = { ...SCOPE, ownerId: '22222222-2222-4222-8222-222222222222' };
const SERVER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const OTHER_SERVER = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const T0 = 1800000000000;
const SETUP = { targetSeconds: 30, activityType: 'learning', taskId: 7, subjectId: 9, notes: 'Read a chapter', title: 'Learning' };
const clone = value => JSON.parse(JSON.stringify(value));
const clock = elapsedMs => ({ wallTimeMs: T0 + elapsedMs, monotonicTimeMs: 1000 + elapsedMs, bootId: 'boot-a' });
const iso = elapsedMs => new Date(T0 + elapsedMs).toISOString();
function row(overrides = {}) {
  return {
    id: SERVER, user_id: SCOPE.ownerId, task_id: 7, subject_id: 9, activity_type: 'learning',
    target_duration_seconds: 30, elapsed_seconds: 0, duration_seconds: 0, status: 'active',
    notes: 'Read a chapter', started_at: iso(0), last_resumed_at: iso(0), paused_at: null,
    completed_at: null, credit_result: null, ...overrides,
  };
}
function savedResult(overrides = {}) {
  return {
    session_id: SERVER, duration_seconds: 30, already_completed: false,
    goal_reached_now: false, credit_version: 1, character_xp_earned: 0, character_remainder_seconds: 30,
    area_xp_earned: 0, area_remainder_seconds: 30, credited_date: '2027-01-15', ...overrides,
  };
}
function setup({ responses = [], rpcData = SERVER, rpcError = null, rpcStatus = 200, rpcThrows = null,
  onRpc = () => {}, verify = async () => SCOPE, currentScope = () => SCOPE, currentEpoch = () => 1, elapsedMs = 4251 } = {}) {
  const queries = [], rpcs = [], events = [];
  const supabase = {
    async rpc(name, params) {
      events.push('rpc'); rpcs.push({ name, params }); onRpc();
      if (rpcThrows) throw rpcThrows;
      return { data: rpcData, error: rpcError, status: rpcStatus };
    },
    from(table) {
      const query = { table, filters: [], selection: null, count: null, order: null, range: null, maybeSingle: false };
      const chain = {
        select(fields, options) { query.selection = fields; query.count = options?.count ?? null; return chain; },
        eq(field, value) { query.filters.push(['eq', field, value]); return chain; },
        in(field, values) { query.filters.push(['in', field, values]); return chain; },
        order(field, options) { query.order = [field, options]; return chain; },
        range(first, last) { query.range = [first, last]; return chain; },
        maybeSingle() { query.maybeSingle = true; return chain; },
        then(resolve, reject) {
          events.push('query'); queries.push(query);
          return Promise.resolve(responses.shift() ?? { data: null, error: null, count: null }).then(resolve, reject);
        },
      };
      return chain;
    },
  };
  const api = load('src/services/sessionService.ts', { '../../lib/supabase': { supabase } });
  const transport = api.createJournalSessionTransport(SCOPE, {
    ensureVerifiedScope: async () => { events.push('verify'); return verify(); },
    currentScope, currentEpoch, getClock: () => clock(elapsedMs),
  });
  return { api, transport, queries, rpcs, events };
}
const errorCode = expected => error => error && error.code === expected;

test('every transport request requires fresh exact owner/backend before sending', async () => {
  for (const verified of [null, OTHER_SCOPE, { ...SCOPE, backendId: 'different-backend' }]) {
    const mock = setup({ verify: async () => verified });
    for (const action of [
      () => mock.transport.start(SETUP), () => mock.transport.pause(SERVER), () => mock.transport.resume(SERVER),
      () => mock.transport.cancel(SERVER), () => mock.transport.complete(SERVER),
      () => mock.transport.readSession(SERVER), () => mock.transport.readOpenSessions(),
    ]) await assert.rejects(action, errorCode(verified ? 'scope_mismatch' : 'auth_unavailable'));
    assert.deepEqual(mock.rpcs, []);
    assert.deepEqual(mock.queries, []);
  }
});

test('owner changes after a sent RPC prevent an acknowledgement under the new owner', async () => {
  let current = SCOPE;
  const mock = setup({ currentScope: () => current, onRpc: () => { current = OTHER_SCOPE; } });
  await assert.rejects(() => mock.transport.start(SETUP), errorCode('scope_mismatch'));
  assert.equal(mock.rpcs.length, 1);
  assert.deepEqual(mock.events, ['verify', 'rpc']);
});

test('same-owner connection loss after a start reply preserves its known server UUID', async () => {
  let online = true, checks = 0;
  const mock = setup({
    verify: async () => { checks++; if (!online) throw Error('Network unavailable'); return SCOPE; },
    onRpc: () => { online = false; }, currentScope: () => SCOPE, currentEpoch: () => 1,
  });
  const serverSessionId = await mock.transport.start(SETUP);
  assert.equal(serverSessionId, SERVER);
  assert.equal(checks, 1);
  assert.deepEqual(mock.events, ['verify', 'rpc']);
  await assert.rejects(() => mock.transport.readSession(serverSessionId), errorCode('auth_unavailable'));
  assert.equal(mock.queries.length, 0);
  assert.equal(mock.rpcs.length, 1);
});

test('a genuine admission epoch change also fences a successful same-owner reply', async () => {
  let epoch = 1;
  const mock = setup({ currentEpoch: () => epoch, onRpc: () => { epoch = 2; } });
  await assert.rejects(() => mock.transport.start(SETUP), errorCode('scope_mismatch'));
  assert.equal(mock.rpcs.length, 1);
});

test('only mutating pre-dispatch failures prove that no RPC was sent', async () => {
  const denied = setup({ verify: async () => { throw Error('Network unavailable'); } });
  await assert.rejects(() => denied.transport.start(SETUP), error => error.failureKind === 'auth' && error.requestSent === false);
  await assert.rejects(() => denied.transport.pause(SERVER), error => error.requestSent === false);
  assert.deepEqual(denied.rpcs, []);
  await assert.rejects(() => denied.transport.readSession(SERVER), error => error.requestSent === undefined);
  const invalid = setup();
  await assert.rejects(() => invalid.transport.start({ ...SETUP, targetSeconds: 0 }), error => error.requestSent === false);
  assert.deepEqual(invalid.rpcs, []);
  const sent = setup({ rpcThrows: Error('Network outcome unknown') });
  await assert.rejects(() => sent.transport.start(SETUP), error => error.requestSent === true);
  assert.equal(sent.rpcs.length, 1);
  const malformedReply = setup({ rpcData: savedResult({ duration_seconds: 0 }) });
  await assert.rejects(() => malformedReply.transport.complete(SERVER), error => error.requestSent === true);
  const failedRead = setup({ responses: [{ data: null, error: { code: '22023', message: 'read failed' }, status: 400 }] });
  await assert.rejects(() => failedRead.transport.readSession(SERVER), error => error.requestSent === undefined);
});

test('existing legacy RPC names and five-argument start payload stay unchanged', async () => {
  const mock = setup();
  assert.equal(await mock.transport.start(SETUP), SERVER);
  await mock.transport.pause(SERVER);
  await mock.transport.resume(SERVER);
  await mock.transport.cancel(SERVER);
  assert.deepEqual(mock.rpcs, [
    { name: 'start_activity_session', params: { p_target_duration_seconds: 30, p_activity_type: 'learning', p_task_id: 7, p_subject_id: 9, p_notes: 'Read a chapter' } },
    { name: 'pause_activity_session', params: { p_session_id: SERVER } },
    { name: 'resume_activity_session', params: { p_session_id: SERVER } },
    { name: 'cancel_activity_session', params: { p_session_id: SERVER } },
  ]);
});

test('known-ID read includes terminal rows and explicit ownership without open-only filtering', async () => {
  const result = savedResult();
  const mock = setup({ responses: [{ data: row({ status: 'completed', duration_seconds: 30, elapsed_seconds: 30, completed_at: iso(30000), last_resumed_at: null, credit_result: result }), error: null }] });
  const saved = await mock.transport.readSession(SERVER);
  assert.equal(saved.serverSessionId, SERVER);
  assert.equal(saved.status, 'completed');
  assert.equal(saved.snapshot, null);
  assert.equal(saved.completedAtMs, T0 + 30000);
  assert.deepEqual(saved.receipt, { sessionId: SERVER, durationSeconds: 30, result });
  assert.deepEqual(mock.queries[0].filters, [['eq', 'user_id', SCOPE.ownerId], ['eq', 'id', SERVER]]);
  assert.equal(mock.queries[0].selection, '*');
  assert.equal(mock.queries[0].maybeSingle, true);
  assert.deepEqual(mock.rpcs, []);
});

test('active snapshot preserves elapsed milliseconds from ISO anchors instead of restarting the target', async () => {
  const mock = setup({ responses: [{ data: row({ elapsed_seconds: 2, last_resumed_at: iso(1000) }), error: null }] });
  const restored = await mock.transport.readSession(SERVER);
  assert.equal(restored.snapshot.elapsedMs, 5251);
  assert.equal(restored.snapshot.observedClock.wallTimeMs, T0 + 4251);
  assert.equal(restored.startedAtMs, T0);
  assert.equal(restored.timingSource, 'server_record_with_local_clock');
  assert.equal(restored.clockWarning, false);
  assert.deepEqual(restored.setup, { ...SETUP, title: null });
});

test('paused snapshot uses saved server seconds regardless of elapsed phone time', async () => {
  const mock = setup({ elapsedMs: 80000, responses: [{ data: row({ status: 'paused', elapsed_seconds: 4, last_resumed_at: null, paused_at: iso(4000) }), error: null }] });
  const restored = await mock.transport.readSession(SERVER);
  assert.equal(restored.status, 'paused');
  assert.equal(restored.snapshot.elapsedMs, 4000);
  assert.equal(restored.timingSource, 'server_record');
  assert.deepEqual(mock.rpcs, []);
});

test('future server anchors flag clock drift without inventing negative elapsed time', () => {
  const { api } = setup();
  const mapped = api.mapActivitySessionRow(row({ started_at: iso(20000), last_resumed_at: iso(20000) }), SCOPE, clock(0));
  assert.equal(mapped.snapshot.elapsedMs, 0);
  assert.equal(mapped.clockWarning, true);
  const small = api.mapActivitySessionRow(row({ started_at: iso(15000), last_resumed_at: iso(15000) }), SCOPE, clock(0));
  assert.equal(small.clockWarning, false);
  assert.equal(small.snapshot.elapsedMs, 0);
});

test('complete owned open read distinguishes an empty list, exact unique row and ambiguity', async () => {
  for (const data of [[], [row()], [row(), row({ id: OTHER_SERVER })]]) {
    const mock = setup({ responses: [{ data, count: data.length, error: null }] });
    const read = await mock.transport.readOpenSessions();
    assert.equal(read.complete, true);
    assert.equal(read.sessions.length, data.length);
    assert.equal(mock.queries[0].count, 'exact');
    assert.deepEqual(mock.queries[0].filters, [['eq', 'user_id', SCOPE.ownerId], ['in', 'status', ['active', 'paused']]]);
    assert.deepEqual(mock.queries[0].range, [0, 99]);
    assert.equal(mock.queries[0].maybeSingle, false);
    assert.deepEqual(mock.rpcs, []);
  }
});

test('missing exact count or truncated rows never prove a unique complete open list', async () => {
  for (const count of [null, 2, undefined]) {
    const mock = setup({ responses: [{ data: [row()], count, error: null }] });
    const read = await mock.transport.readOpenSessions();
    assert.equal(read.complete, false);
    assert.equal(read.sessions.length, 1);
    assert.equal(mock.queries.length, 1);
  }
});

test('pagination reads all owned rows and rejects count drift or duplicate rows as incomplete', async () => {
  const page = Array.from({ length: 100 }, (_, index) => row({ id: `30000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}` }));
  const full = setup({ responses: [{ data: page, count: 101, error: null }, { data: [row()], count: 101, error: null }] });
  const result = await full.transport.readOpenSessions();
  assert.equal(result.complete, true);
  assert.equal(result.sessions.length, 101);
  assert.deepEqual(full.queries[1].range, [100, 199]);
  const changed = setup({ responses: [{ data: page, count: 101, error: null }, { data: [row()], count: 100, error: null }] });
  assert.equal((await changed.transport.readOpenSessions()).complete, false);
  const duplicate = setup({ responses: [{ data: page, count: 101, error: null }, { data: [page[0]], count: 101, error: null }] });
  assert.equal((await duplicate.transport.readOpenSessions()).complete, false);
});

test('ownership, row identity and malformed timing cannot masquerade as a saved snapshot', async () => {
  for (const bad of [row({ user_id: OTHER_SCOPE.ownerId }), row({ id: OTHER_SERVER }), row({ last_resumed_at: 'invalid-time' }), row({ target_duration_seconds: 0 })]) {
    const mock = setup({ responses: [{ data: bad, error: null }] });
    await assert.rejects(() => mock.transport.readSession(SERVER));
    assert.deepEqual(mock.rpcs, []);
  }
  const missing = setup({ responses: [{ data: null, error: null }] });
  assert.equal(await missing.transport.readSession(SERVER), null);
});

test('completion uses only unchanged server RPC and retains a detached serializable receipt', async () => {
  const raw = savedResult();
  const mock = setup({ rpcData: raw });
  const receipt = await mock.transport.complete(SERVER);
  assert.deepEqual(receipt.result, raw);
  receipt.result.character_xp_earned = 999;
  assert.equal(raw.character_xp_earned, 0);
  assert.deepEqual(mock.rpcs, [{ name: 'complete_activity_session', params: { p_session_id: SERVER } }]);
  assert.equal(JSON.parse(JSON.stringify(receipt)).durationSeconds, 30);
});

test('legacy completed row without additive receipt remains readable for idempotent result recovery', async () => {
  const legacy = row({ status: 'completed', elapsed_seconds: 30, duration_seconds: 30, completed_at: iso(30000), last_resumed_at: null });
  delete legacy.credit_result;
  const mock = setup({ responses: [{ data: legacy, error: null }] });
  const restored = await mock.transport.readSession(SERVER);
  assert.equal(restored.status, 'completed');
  assert.equal(restored.serverSessionId, SERVER);
  assert.equal(restored.receipt, null);
  assert.equal(restored.snapshot, null);
  assert.deepEqual(mock.rpcs, []);
});

test('receipt identity mismatches or non-JSON content remain unconfirmed', async () => {
  for (const raw of [
    savedResult({ session_id: OTHER_SERVER }), savedResult({ duration_seconds: 0 }),
    savedResult({ already_completed: 'true' }), savedResult({ nested: { access_token: 'fixture_not_a_credential' } }),
    savedResult({ value: NaN }),
  ]) {
    const mock = setup({ rpcData: raw });
    await assert.rejects(() => mock.transport.complete(SERVER), errorCode('invalid_response'));
    assert.equal(mock.rpcs.length, 1);
  }
});

test('server timing rejection is sanitized and never triggers another ending RPC', async () => {
  const mock = setup({ rpcError: { code: 'P0001', message: 'Session has not reached its target duration yet', privatePayload: 'fixture_do_not_expose' }, rpcStatus: 400 });
  await assert.rejects(() => mock.transport.complete(SERVER), error => error.code === 'request_failed' && error.failureKind === 'transient' && !error.message.includes('fixture_do_not_expose'));
  assert.equal(mock.rpcs.length, 1);
  assert.equal(mock.rpcs[0].name, 'complete_activity_session');
});

test('explicit transactional start rejection is definitive while network and server failures stay unknown', async () => {
  for (const rpcError of [
    { code: 'P0001', message: 'You already have an unfinished session' },
    { code: '22023', message: 'invalid input' },
    { code: '42501', message: 'permission denied' },
  ]) {
    const mock = setup({ rpcError, rpcStatus: 400 });
    await assert.rejects(() => mock.transport.start(SETUP), error => error.failureKind === 'definitive' && mock.api.classifySessionTransportError(error) === 'definitive');
    assert.equal(mock.rpcs.length, 1);
  }
  const network = setup({ rpcThrows: Error('fixture_network_details_not_public') });
  await assert.rejects(() => network.transport.start(SETUP), error => error.failureKind === 'transient' && !error.message.includes('fixture_network_details_not_public'));
  const server = setup({ rpcError: { code: 'P0001', message: 'infrastructure failure' }, rpcStatus: 503 });
  await assert.rejects(() => server.transport.start(SETUP), error => error.failureKind === 'transient');
  const auth = setup({ rpcError: { code: 'PGRST301', message: 'expired credentials' }, rpcStatus: 401 });
  await assert.rejects(() => auth.transport.start(SETUP), error => error.failureKind === 'auth');
  const denied = setup({ rpcError: { code: '42501', message: 'permission denied' }, rpcStatus: 403 });
  await assert.rejects(() => denied.transport.start(SETUP), error => error.failureKind === 'definitive');
  const readFailed = setup({ responses: [{ data: null, error: { code: '22023', message: 'invalid read' }, status: 400 }] });
  await assert.rejects(() => readFailed.transport.readSession(SERVER), error => error.failureKind === 'transient');
});

test('reading an unknown control outcome never pauses, resumes or cancels at the present time', async () => {
  const mock = setup({ responses: [{ data: row({ status: 'paused', elapsed_seconds: 4, paused_at: iso(4000), last_resumed_at: null }), error: null }] });
  const result = await mock.transport.readSession(SERVER);
  assert.equal(result.status, 'paused');
  assert.deepEqual(mock.rpcs, []);
});
