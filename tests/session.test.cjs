const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const React = require("react");
const { act, create } = require("react-test-renderer");

global.IS_REACT_ACT_ENVIRONMENT = true;
global.__DEV__ = false;

// Render the production components with native primitives and network boundaries
// replaced. These tests exercise state and actions, not native layout or gestures.
function load(relativePath, mocks, cache = new Map()) {
  const filename = path.resolve(__dirname, "..", relativePath);
  if (cache.has(filename)) return cache.get(filename).exports;
  const module = { exports: {} };
  cache.set(filename, module);
  const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
    fileName: filename,
  }).outputText;
  const localRequire = (name) => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if(name.endsWith('/SessionProtectionControl')) return Object.assign(()=>null,{ProtectionSettingsSheet:()=>null});
    if(name.endsWith('/SessionProtectionContext')) return {SessionProtectionProvider:props=>props.children};
    if (name === "expo-haptics") return {selectionAsync:async()=>{}};
    if (name.endsWith("/UserContext")) return mocks["../../context/UserContext"] ?? {useUser:()=>({hapticsEnabled:false})};
    if (name.endsWith("/LevelTierSheet")) return props=>React.createElement("TierSheet",props);
      if (name.endsWith("/FeatureTour")) return {FeatureTourProvider: props=>props.children, TourAnchor: props=>props.children, TourScrollView: mocks["react-native"]?.ScrollView || (props=>React.createElement("ScrollView",props,props.children)), useFeatureTour:()=>({start(){}}), prepareFeatureTour:async()=>{}};
      if (name.endsWith("/DailyGoalSheet")) return props=>React.createElement("GoalSheet",props);
      if (["/GuidedPreferenceSheet", "/SaveSuggestedQuest"].some(suffix => name.endsWith(suffix))) return props => React.createElement("GuidedBoundary", props);
      if (name === "@react-native-async-storage/async-storage") return { getItem: async () => null, setItem: async () => {} };
      if (name.endsWith("/MotionPressable")) return mocks["react-native"]?.Pressable || mocks["react-native"]?.TouchableOpacity || (props => React.createElement("Button", props, props.children));
      if (name.endsWith("/GlassSurface")) return props => React.createElement("View", {...props, testID:"glass-surface"});
      if (name.endsWith("/SlidingSelection")) return props => React.createElement("View", {...props, style:[props.style,{left:props.index === 0 ? "0%" : "50%"}]});
    { const study = require('./helpers/study-stubs.cjs')(name); if (study) return study; }
    if (!name.startsWith(".")) return require(name);
    const target = path.resolve(path.dirname(filename), name);
    const extension = ["", ".ts", ".tsx"].find((ext) => fs.existsSync(target + ext));
    return load(path.relative(path.resolve(__dirname, ".."), target + extension), mocks, cache);
  };
  new Function("require", "module", "exports", code)(localRequire, module, module.exports);
  return module.exports;
}

const host = (name) => (props) => React.createElement(name, props, props.children);
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return {promise, resolve, reject}; };
const result = { already_completed: false, xp_earned: 30, gold_earned: 5, minutes: 1, duration_seconds: 60, level: 2, leveled_up: false };
const PROVIDER_NOW = 1_800_000_000_000;
const PROVIDER_SCOPE = { backendId: "fixture-backend", ownerId: "11111111-1111-4111-8111-111111111111" };
const SESSION_ID = "bbbbbbbb-bbbb-4bbb-8bbb-000000000001";
const fixtureServerId = (value) => {
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)) return value;
  let hash = 0;
  for (const letter of String(value)) hash = (Math.imul(hash, 31) + letter.charCodeAt(0)) >>> 0;
  return value === "session-1" ? SESSION_ID : `bbbbbbbb-bbbb-4bbb-8bbb-${hash.toString(16).padStart(12, "0")}`;
};
const definitiveServerRejection = () => Object.assign(Error("Server rejected the request"), { failureKind: "definitive", requestSent: true });

async function providerSetup(overrides = {}, notifications = null, nativeLifecycle = null, protectionNative = null) {
  let state, show = true, tick, foreground;
  const summarySnapshots = [], timerFrames = [];
  const calls = [];
  const realInterval = global.setInterval, realClear = global.clearInterval, realNow = Date.now;
  let now = PROVIDER_NOW, uuidIndex = 0, serverIndex = 0, loadedInitial = false, sessionReads = 0;
  const serverRows = new Map(), rowScopes = new Map(), values = new Map();
  let beforeWrite = null, refreshCapability = async () => null;
  const storage = { getItem: async key => values.get(key) ?? null, setItem: async (key, value) => {
    if (beforeWrite) await beforeWrite(key, value);
    values.set(key, value);
  } };
  global.setInterval = (fn) => { tick = fn; return 1; };
  global.clearInterval = () => {};
  Date.now = () => now;
  const service = {
    getOpenActivitySession: async () => null,
    startActivitySession: async (params) => { calls.push(["start", params]); return `bbbbbbbb-bbbb-4bbb-8bbb-${String(++serverIndex).padStart(12, "0")}`; },
    pauseActivitySession: async (id) => { calls.push(["pause",id]); },
    resumeActivitySession: async (id) => { calls.push(["resume",id]); },
    cancelActivitySession: async (id) => { calls.push(["cancel",id]); },
    completeActivitySession: async (id) => {
      calls.push(["complete",id]); const target = serverRows.get(id).target_duration_seconds;
      return { ...result, session_id: id, duration_seconds: target, minutes: Math.floor(target / 60) };
    },
    ...overrides,
  };
  // The fake SERVER boundary keeps SQL-style rows. The production journal,
  // controller, writer and provider remain real; no controller decision is mocked.
  const mapper = load("src/services/sessionService.ts", { "../../lib/supabase": { supabase: {} } }).mapActivitySessionRow;
  const observe = () => ({ wallTimeMs: now, monotonicTimeMs: null, bootId: null });
  function normalizeRow(source) {
    const id = fixtureServerId(source.id), elapsed = source.elapsed_seconds ?? 0;
    const status = source.status ?? "active";
    const started = source.started_at ?? new Date(now - elapsed * 1000).toISOString();
    return { user_id: PROVIDER_SCOPE.ownerId, task_id: null, subject_id: null, activity_type: "other", notes: null,
      duration_seconds: 0, elapsed_seconds: elapsed, completed_at: null, credit_result: null, ...source, id,
      started_at: started, last_resumed_at: status === "active" ? source.last_resumed_at ?? new Date(now).toISOString() : null,
      paused_at: status === "paused" ? source.paused_at ?? new Date(now).toISOString() : null };
  }
  async function initialRows() {
    if (loadedInitial) return;
    const source = await service.getOpenActivitySession();
    loadedInitial = true;
    if (source) { const row = normalizeRow(source); serverRows.set(row.id, row); rowScopes.set(row.id, PROVIDER_SCOPE); }
  }
  const elapsed = row => row.elapsed_seconds * 1000 + (row.status === "active" ? Math.max(0, now - Date.parse(row.last_resumed_at)) : 0);
  service.createJournalSessionTransport = scope => ({
    async start(setup) {
      const id = fixtureServerId(await service.startActivitySession({ targetDurationSeconds: setup.targetSeconds,
        activityType: setup.activityType, taskId: setup.taskId, subjectId: setup.subjectId, notes: setup.notes }));
      const row = normalizeRow({ id, target_duration_seconds: setup.targetSeconds, activity_type: setup.activityType,
        task_id: setup.taskId, subject_id: setup.subjectId, notes: setup.notes, status: "active", started_at: new Date(now).toISOString() });
      serverRows.set(id, row); rowScopes.set(id, scope); return id;
    },
    async pause(id) {
      await service.pauseActivitySession(id);
      const row = serverRows.get(id); row.elapsed_seconds = Math.floor(elapsed(row) / 1000);
      row.status = "paused"; row.last_resumed_at = null; row.paused_at = new Date(now).toISOString();
    },
    async resume(id) {
      await service.resumeActivitySession(id);
      const row = serverRows.get(id); row.status = "active"; row.last_resumed_at = new Date(now).toISOString(); row.paused_at = null;
    },
    async cancel(id) {
      await service.cancelActivitySession(id);
      const row = serverRows.get(id); row.status = "cancelled"; row.completed_at = new Date(now).toISOString();
    },
    async complete(id) {
      const row = serverRows.get(id);
      if (row.status === "completed") return { sessionId: id, durationSeconds: row.duration_seconds, result: { ...row.credit_result, already_completed: true, goal_reached_now: false } };
      const saved = { ...await service.completeActivitySession(id), session_id: id };
      row.status = "completed"; row.duration_seconds = saved.duration_seconds; row.elapsed_seconds = saved.duration_seconds;
      row.completed_at = new Date(now).toISOString(); row.credit_result = saved;
      return { sessionId: id, durationSeconds: saved.duration_seconds, result: saved };
    },
    async readSession(id) {
      sessionReads++; await initialRows(); const owner = rowScopes.get(id);
      return serverRows.has(id) && owner?.ownerId === scope.ownerId && owner?.backendId === scope.backendId ? mapper(serverRows.get(id), scope, observe()) : null;
    },
    async readOpenSessions() {
      await initialRows();
      // Mirror the real transport's backend scope and account RLS. A delayed
      // old-account receipt must not become an incoming account's server row.
      return { complete: true, sessions: [...serverRows.values()].filter(row => {
        const owner = rowScopes.get(row.id);
        return owner?.ownerId === scope.ownerId && owner?.backendId === scope.backendId && ["active", "paused"].includes(row.status);
      }).map(row => mapper(row, scope, observe())) };
    },
  });
  const reloadProfile = async () => true;
  let verifications = 0; const verificationKinds = [];
  const auth = { user: { id: PROVIDER_SCOPE.ownerId }, localOwner: { id: PROVIDER_SCOPE.ownerId, backendId: PROVIDER_SCOPE.backendId },
    accessMode: "online", admissionEpoch: 1, verifyCurrentOwner: async options => { verifications++; verificationKinds.push(options?.fresh ? "fresh" : "reuse"); return { id: PROVIDER_SCOPE.ownerId, backendId: PROVIDER_SCOPE.backendId }; } };
  const flush = () => new Promise(resolve => setImmediate(resolve));
  // Legacy fixture sessions keep their original controls. Protection cases use
  // the production readiness function, replacing only the device boundary.
  const prepareProtectedSession = protectionNative
    ? load("src/services/protectedSessionStart.ts", {
      "react-native": { Platform: { OS: "android" } },
      "@react-native-async-storage/async-storage": storage,
      "./nativeFocusProtection": { getSessionProtectionModule: async () => protectionNative },
    }).prepareProtectedSession
    : async () => false;
  const { TimerProvider, useTimer } = load("src/context/TimerContext.tsx", {
    "react-native": { Platform: { OS: "android" }, AppState: { addEventListener: (_, fn) => { foreground=fn; return { remove() {} }; } } },
    "expo": { isRunningInExpoGo: () => false },
    "expo-modules-core": { uuid: { v4: () => `aaaaaaaa-aaaa-4aaa-8aaa-${String(++uuidIndex).padStart(12, "0")}` } },
    "@react-native-async-storage/async-storage": storage,
    "expo-notifications": notifications,
    "expo-haptics": { notificationAsync: async () => {}, NotificationFeedbackType: { Success: "success" } },
    "../services/protectedSessionStart": { prepareProtectedSession },
    "../services/sessionService": service,
    "../services/offlineSessionService": {
      createOfflineCapabilityCache: () => ({ load: async () => null, refresh: async () => null, refreshIfStale: () => refreshCapability(), readFreshGrant: () => null }),
      createOfflineSessionTransport: () => ({ readSnapshot: async () => null, submit: async () => { throw Error("Offline capability is disabled in this legacy fixture"); } }),
    },
    "../utils/countdownTicker": { createCountdownTicker: (callback) => {
      const handle = setInterval(callback, 200);
      return { reschedule() {}, dispose() { clearInterval(handle); } };
    } },
    ...(nativeLifecycle ? { "../services/nativeSessionCountdown": { createNativeSessionCountdownLifecycle: () => nativeLifecycle } } : {}),
    "./UserContext": { useUser: () => ({ reloadProfile }) },
    "./AuthContext": { useAuth: () => auth },
  });
  function Capture() {
    state = useTimer();
    summarySnapshots.push({ owner: auth.user?.id, backend: auth.localOwner?.backendId, epoch: auth.admissionEpoch, summary: state.sessionSummary });
    timerFrames.push({ owner: auth.user?.id, backend: auth.localOwner?.backendId, epoch: auth.admissionEpoch,
      sessionId: state.sessionId, timeLeft: state.timeLeft, isRunning: state.isRunning,
      isCompleted: state.isCompleted, hasOpenSession: state.hasOpenSession, summary: state.sessionSummary });
    return null;
  }
  function Page() { return React.createElement("Page"); }
  // A screen that never shows the countdown, like Home or a tab.
  let stillRenders = 0, still;
  function Still() { still = useTimer({ live: false }); stillRenders++; return null; }
  function Harness() { return React.createElement(TimerProvider,null,React.createElement(Capture),React.createElement(Still),show && React.createElement(Page)); }
  let renderer;
  await act(async () => { renderer=create(React.createElement(Harness)); await flush(); });
  return {
    state: () => state, still: () => still, stillRenders: () => stillRenders, calls, verifications: () => verifications, verificationKinds: () => [...verificationKinds], summarySnapshots, timerFrames, sessionReads: () => sessionReads,
    beforeWrite: callback => { beforeWrite = callback; }, refreshCapability: callback => { refreshCapability = callback; },
    persistedJournal: () => JSON.parse([...values].find(([key]) => key.startsWith("liferpg:session-journal:v1:"))?.[1] ?? "null"),
    run: async (fn) => { await act(async () => { await fn(state); await flush(); }); },
    advance: async (seconds) => { now += seconds*1000; await act(async () => { tick?.(); await flush(); }); },
    backgroundTime: (seconds) => { now += seconds*1000; },
    foreground: async () => { await act(async () => { foreground("active"); await flush(); }); },
    background: async () => { await act(async () => { foreground("background"); await flush(); }); },
    page: async (visible) => { show=visible; await act(async () => renderer.update(React.createElement(Harness))); },
    connection: async (mode) => { auth.accessMode=mode; await act(async()=>{renderer.update(React.createElement(Harness));await flush();}); },
    changeScope: async (kind) => {
      if (kind === "owner") { auth.user = { id: "22222222-2222-4222-8222-222222222222" }; auth.localOwner = { ...auth.localOwner, id: auth.user.id }; }
      if (kind === "backend") auth.localOwner = { ...auth.localOwner, backendId: "other-backend" };
      auth.admissionEpoch++;
      auth.verifyCurrentOwner = async () => ({ id: auth.user.id, backendId: auth.localOwner.backendId });
      await act(async () => { renderer.update(React.createElement(Harness)); await flush(); });
    },
    cleanup: async () => { await act(async () => { renderer.unmount(); await flush(); }); global.setInterval=realInterval; global.clearInterval=realClear; Date.now=realNow; },
  };
}


test("provider blocks repeated starts and preserves an unknown start without reissuing it", async () => {
  const pending = deferred();
  let starts = 0;
  const ui = await providerSetup({ startActivitySession: () => { starts++; return starts === 1 ? pending.promise : Promise.resolve("retry-session"); } });
  let first;
  await ui.run((s) => { first=s.startTimer(1800,"Read"); void s.startTimer(1800,"Read"); });
  assert.equal(starts,1);
  assert.equal(ui.state().actionBusy,true);
  await ui.run(async () => { pending.reject(Error("Offline")); await first; });
  assert.equal(ui.state().hasOpenSession,true);
  assert.equal(ui.state().awaitingStart,true);
  assert.equal(ui.state().isRunning,false);
  assert.match(ui.state().actionError,/Waiting to confirm/);
  assert.equal(ui.state().actionBusy,false);
  await ui.run((s) => s.retryAction());
  await ui.run((s) => s.startTimer(1800,"Read"));
  assert.equal(starts,1);
  assert.equal(ui.state().hasOpenSession,true);
  assert.equal(ui.state().duration,1800);
  assert.equal(ui.state().awaitingStart,true);
  await ui.cleanup();
});

function nativeForegroundHarness() {
  let projection = null, token = null, launch = null;
  let sequence = 0;
  return { ownsNative: () => true, activate: async () => true,
    async publish(value) { projection = value; return true; },
    async clear() { projection = null; return true; }, async dispose() {},
    issue(kind) {
      assert.ok(projection, 'The real provider must publish the active journal before this notification tap');
      const nonce = `90000000-0000-4000-8000-${String(++sequence).padStart(12,'0')}`;
      token = { version: 1, identity: JSON.parse(JSON.stringify(projection.identity)), operationId: nonce, kind };
      launch = nonce; return nonce;
    },
    async consumeAction(nonce) {
      if (!token || nonce !== token.operationId) return null;
      const issued = token; token = null; return issued;
    },
    async takeForegroundAction() { const captured = launch; launch = null; return captured; },
  };
}
test('warm notification Pause/Resume keeps strict revisions through foreground and uses each real control once', async () => {
  const native = nativeForegroundHarness(), ui = await providerSetup({}, null, native);
  try {
    await ui.run(s => s.startTimer(60, 'Read'));
    const pause = native.issue('pause'), before = ui.verifications();
    await ui.foreground();
    assert.equal(ui.verifications(), before, 'A trusted launch must not replace its action revision before consumption');
    await ui.run(s => s.consumeNotificationAction(pause));
    assert.equal(ui.state().isRunning, false);
    assert.equal(ui.calls.filter(c => c[0] === 'pause').length, 1);
    const resume = native.issue('resume');
    await ui.foreground(); await ui.run(s => s.consumeNotificationAction(resume));
    assert.equal(ui.state().isRunning, true);
    assert.equal(ui.calls.filter(c => c[0] === 'resume').length, 1);
    const verified = ui.verifications();
    await ui.foreground();
    assert.ok(ui.verifications() > verified, 'An ordinary subsequent foreground still reconciles with the server');
  } finally { await ui.cleanup(); }
});
test('warm End consumed before foreground still opens confirmation without incidental reconciliation or cancellation', async () => {
  const native = nativeForegroundHarness(), ui = await providerSetup({}, null, native);
  try {
    await ui.run(s => s.startTimer(60, 'Read'));
    const nonce = native.issue('end'); let result;
    await ui.run(async s => { result = await s.consumeNotificationAction(nonce); });
    assert.equal(result, 'end'); const verified = ui.verifications();
    await ui.foreground(); assert.equal(ui.verifications(), verified);
    assert.equal(ui.calls.some(c => c[0] === 'cancel' || c[0] === 'complete'), false);
    await ui.foreground(); assert.ok(ui.verifications() > verified);
  } finally { await ui.cleanup(); }
});

test("only countdown screens re-render each second; the rest of the app sees state changes but not ticks", async () => {
  const ui=await providerSetup();
  try {
    await ui.run((s)=>s.startTimer(1800,"Read"));
    await ui.advance(1);
    const before=ui.stillRenders();
    for (let second=0; second<5; second++) await ui.advance(1);
    assert.equal(ui.state().timeLeft,1794,'the countdown keeps its exact seconds');
    assert.equal(ui.stillRenders(),before,'Home and the tabs do not re-render for each second');
    assert.equal(ui.still().isRunning,true);assert.equal(ui.still().hasOpenSession,true);
    await ui.run((s)=>s.pauseTimer());
    assert.ok(ui.stillRenders()>before,'a real change, like pausing, still reaches them at once');
    assert.equal(ui.still().isRunning,false);
  } finally { await ui.cleanup(); }
});

test("starting a session always checks the account with the server; later steps reuse a recent check", async () => {
  const ui=await providerSetup();
  try {
    await ui.run((s)=>s.startTimer(1800,"Read"));
    const atStart=ui.verificationKinds();
    assert.ok(atStart.includes("fresh"),'Start asks the server, which also notices a dead connection before sending');
    await ui.advance(5);
    await ui.run((s)=>s.pauseTimer());
    const later=ui.verificationKinds().slice(atStart.length);
    assert.ok(later.length>0 && later.every(kind=>kind==="reuse"),'pausing reuses the recent check instead of a new round trip');
    assert.equal(ui.state().isRunning,false);
  } finally { await ui.cleanup(); }
});

test("a normal start reads as running at once; it says Checking only if confirming is unusually slow", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let release; const gate = new Promise(resolve => { release = resolve; });
  const ui=await providerSetup({ startActivitySession: async () => { await gate; return "bbbbbbbb-bbbb-4bbb-8bbb-000000000001"; } });
  try {
    let pending;
    await ui.run((s)=>{ pending=s.startTimer(1800,"Read"); });
    assert.equal(ui.state().awaitingStart,true,'the start is still being confirmed');
    assert.equal(ui.state().startCheckVisible,false,'but it reads as a running session straight away');
    assert.equal(ui.state().isRunning,true);
    await act(async()=>{ t.mock.timers.tick(3000); });
    assert.equal(ui.state().startCheckVisible,true,'only an unusually slow confirmation says Checking');
    release(); await act(async()=>{ await pending; });
    assert.equal(ui.state().awaitingStart,false); assert.equal(ui.state().startCheckVisible,false);
  } finally { await ui.cleanup(); t.mock.timers.reset(); }
});

test("minimise/reopen keeps running and paused identity, settings and remaining time", async () => {
  const ui=await providerSetup();
  await ui.run((s)=> { s.setLinkedTaskId(7); s.setTargetAttributeId(3); s.setActivityType("read"); });
  await ui.run((s)=>s.startTimer(1800,"Read"));
  await ui.advance(10);
  await ui.page(false); await ui.page(true);
  assert.equal(ui.state().timeLeft,1790);
  assert.equal(ui.state().isRunning,true);
  await ui.run((s)=>s.pauseTimer());
  await ui.page(false); await ui.page(true);
  await ui.run((s)=> { s.setLinkedTaskId(99); s.setTargetAttributeId(99); s.setActivityType("work"); s.setDurationInMinutes(15); return s.startTimer(900); });
  assert.equal(ui.state().isRunning,false);
  assert.equal(ui.state().linkedTaskId,7);
  assert.equal(ui.state().targetAttributeId,3);
  assert.equal(ui.state().activityType,"read");
  assert.equal(ui.state().duration,1800);
  assert.equal(ui.state().timeLeft,1790);
  assert.equal(ui.calls.filter(([name])=>name==="start").length,1);
  await ui.run((s)=>s.resumeTimer());
  assert.equal(ui.state().timeLeft,1790);
  await ui.cleanup();
});

test("closing a confirmed result clears active presentation without re-awarding", async () => {
  const ui=await providerSetup();
  await ui.run((s)=>s.startTimer(60,"Read"));
  await ui.advance(61);
  assert.equal(ui.state().isCompleted,true);
  assert.equal(ui.state().rewardsVisible,true);
  const summary=ui.state().sessionSummary;
  await ui.run((s)=>s.clearCompletionModal());
  assert.equal(ui.state().rewardsVisible,false);
  assert.equal(ui.state().sessionSummary,null);
  assert.equal(ui.state().summaryViewed,false);
  await ui.run((s)=>s.acknowledgeSummary());
  assert.equal(ui.state().sessionSummary,null);
  assert.equal(ui.state().isCompleted,false);
  assert.equal(summary.durationSeconds,60);
  await ui.page(false); await ui.page(true);
  await ui.run((s)=>s.retryCompletion());
  assert.equal(ui.calls.filter(([name])=>name==="complete").length,1);
  await ui.run((s)=>s.resetTimer());
  assert.equal(ui.state().sessionSummary,null);
  assert.equal(ui.calls.filter(([name])=>name==="cancel").length,0);
  await ui.cleanup();
});

test("saved summaries clear in the first render of a different owner, backend or admission", async () => {
  for (const kind of ["owner", "backend", "admission"]) {
    const ui = await providerSetup();
    try {
      await ui.run(s => s.startTimer(60, "Read")); await ui.advance(60);
      assert.ok(ui.state().sessionSummary);
      const before = ui.summarySnapshots.length;
      await ui.changeScope(kind);
      const after = ui.summarySnapshots.slice(before);
      assert.ok(after.length > 0);
      assert.ok(after.every(snapshot => snapshot.summary === null), `${kind} must not expose the outgoing saved result`);
    } finally { await ui.cleanup(); }
  }
});

test("failed completion remains visible and retries the same session ID", async () => {
  let attempts=0;
  const ui=await providerSetup({ completeActivitySession: async(id)=>{ assert.equal(id,SESSION_ID); if (++attempts===1) throw Error("Offline"); return {...result,already_completed:true}; } });
  await ui.run((s)=>s.startTimer(60));
  await ui.advance(61);
  assert.equal(ui.state().isCompleted,true);
  assert.match(ui.state().actionError,/Waiting to confirm your progress/);
  await ui.run((s)=>s.retryCompletion());
  assert.equal(attempts,2);
  assert.equal(ui.state().rewardsVisible,false);
  assert.equal(ui.state().sessionSummary.xpEarned,30);
  await ui.cleanup();
});

test("unknown End preserves its stop intent and retries cancellation against the same owned server session", async () => {
  let attempts=0;
  const ui=await providerSetup({ cancelActivitySession: async()=>{ if(++attempts===1) throw Error("Offline"); } });
  await ui.run((s)=>s.startTimer(1800));
  await ui.run((s)=>s.resetTimer());
  assert.equal(ui.state().hasOpenSession,false);
  assert.equal(ui.state().isRunning,false);
  assert.equal(ui.state().endingSession,true);
  assert.equal(ui.state().unsyncedSessionCount,1);
  await ui.run((s)=>s.retryAction());
  assert.equal(attempts,2);
  assert.equal(ui.state().hasOpenSession,false);
  assert.equal(ui.state().isRunning,false);
  assert.equal(ui.state().endingSession,false);
  assert.equal(ui.state().unsyncedSessionCount,0);
  assert.equal(ui.calls.filter(([name])=>name==="complete").length,0);
  await ui.cleanup();
});

test("provider shows immediate Pause and Resume while awaiting confirmation, and a durable End hides the active timer", async () => {
  const pauseGate=deferred(),resumeGate=deferred(),cancelGate=deferred();
  const ui=await providerSetup({pauseActivitySession:async()=>pauseGate.promise,resumeActivitySession:async()=>resumeGate.promise,cancelActivitySession:async()=>cancelGate.promise});
  try {
    await ui.run(s=>s.startTimer(1800));let pauseRequest;
    await ui.run(s=>{pauseRequest=s.pauseTimer();});assert.equal(ui.state().isRunning,false);assert.equal(ui.state().interactionKind,"pause");
    const remaining=ui.state().timeLeft;await ui.advance(2);assert.equal(ui.state().timeLeft,remaining);
    await ui.run(async()=>{pauseGate.resolve();await pauseRequest;});assert.equal(ui.state().interactionKind,null);
    assert.equal(ui.state().timeLeft,remaining, 'successful Pause cannot replace the frozen numeral with the later server value');
    let resumeRequest;await ui.run(s=>{resumeRequest=s.resumeTimer();});assert.equal(ui.state().isRunning,true);assert.equal(ui.state().interactionKind,"resume");
    await ui.advance(2); assert.equal(ui.state().timeLeft,remaining-2);
    await ui.run(async()=>{resumeGate.resolve();await resumeRequest;});assert.equal(ui.state().interactionKind,null);
    assert.equal(ui.state().timeLeft,remaining-2, 'successful Resume cannot rewind its running preview');
    let endRequest;await ui.run(s=>{endRequest=s.resetTimer();});
    assert.equal(ui.state().endingSession,true);assert.equal(ui.state().hasOpenSession,false);assert.equal(ui.state().isRunning,false);
    assert.equal(ui.state().sessionSummary,null);assert.equal(ui.calls.filter(call=>call[0]==="complete").length,0);
    await ui.run(async()=>{cancelGate.resolve();await endRequest;});assert.equal(ui.state().endingSession,false);
  } finally {pauseGate.resolve();resumeGate.resolve();cancelGate.resolve();await ui.cleanup();}
});

test("Done on a pending server End stays acknowledged when cancellation confirms and preserves the queued stop",async()=>{
  const cancelGate=deferred();let cancellations=0,endRequest;
  const ui=await providerSetup({cancelActivitySession:async()=>{cancellations++;await cancelGate.promise;}});
  try {
    await ui.run(s=>s.startTimer(60));const stoppedId=ui.state().sessionId;
    await ui.run(s=>{endRequest=s.resetTimer();});
    assert.equal(ui.state().endingSession,true);assert.equal(ui.state().unsyncedSessionCount,1);
    await ui.run(s=>{s.acknowledgeSummary();s.clearCompletionModal();});
    assert.equal(ui.state().summaryViewed,true);
    assert.equal(ui.state().endingSession,true,'Done must preserve the unconfirmed cancellation');
    assert.equal(ui.state().unsyncedSessionCount,1);assert.equal(ui.state().sessionId,stoppedId);
    await ui.run(s=>s.reviewSummary());
    assert.equal(ui.state().summaryViewed,false,'explicit Review can reopen the saved stop without resending it');
    assert.equal(ui.state().endingSession,true);assert.equal(ui.state().unsyncedSessionCount,1);
    assert.equal(ui.state().sessionId,stoppedId);assert.equal(cancellations,1);
    await ui.run(s=>{s.acknowledgeSummary();s.clearCompletionModal();});
    assert.equal(ui.state().summaryViewed,true);assert.equal(ui.state().unsyncedSessionCount,1);
    await ui.run(s=>s.startTimer(60));assert.equal(ui.calls.filter(c=>c[0]==='start').length,1);
    await ui.run(async()=>{cancelGate.resolve();await endRequest;});
    assert.equal(ui.state().endingSession,false);assert.equal(ui.state().sessionEnded,true);
    assert.equal(ui.state().unsyncedSessionCount,0);assert.equal(ui.state().summaryViewed,true,'a late successful End must not reopen its dismissed result');
    assert.equal(ui.state().sessionId,stoppedId);assert.equal(ui.state().sessionSummary,null);
    assert.equal(ui.state().rewardsVisible,false);assert.equal(cancellations,1);
    assert.equal(ui.calls.filter(c=>c[0]==='complete').length,0);
    await ui.run(s=>s.startTimer(60));assert.equal(ui.state().hasOpenSession,true);
    assert.equal(ui.calls.filter(c=>c[0]==='start').length,2);assert.equal(cancellations,1);
  }finally{cancelGate.resolve();await ui.cleanup();}
});

test("provider shares one fresh owner proof per session operation without retaining it for the next tap",async()=>{
  const ui=await providerSetup();
  try {
    const initial=ui.verifications();await ui.run(s=>s.startTimer(60));assert.equal(ui.verifications(),initial+1);
    await ui.run(s=>s.pauseTimer());assert.equal(ui.verifications(),initial+2);
    await ui.run(s=>s.resumeTimer());assert.equal(ui.verifications(),initial+3);
    await ui.run(s=>s.resetTimer());assert.equal(ui.verifications(),initial+4);
    assert.equal(ui.state().unsyncedSessionCount,0);
  } finally {await ui.cleanup();}
});

test("verified reconnection bypasses a pending completion backoff instead of waiting for its old offline retry time",async()=>{
  let online=false,attempts=0;
  const ui=await providerSetup({completeActivitySession:async()=>{attempts++;if(!online)throw Error('Offline');return result;}});
  try {
    await ui.run(s=>s.startTimer(60));await ui.connection('local-only');await ui.advance(61);
    assert.equal(ui.state().syncStatus,'waiting');const before=attempts;
    online=true;await ui.connection('online');
    assert.equal(attempts,before+1);assert.equal(ui.state().syncStatus,'saved');assert.ok(ui.state().sessionSummary);
  } finally {await ui.cleanup();}
});

test("restored paused sessions cannot be replaced by Start", async () => {
  const ui=await providerSetup({getOpenActivitySession: async()=>({ id:"saved",task_id:4,subject_id:2,activity_type:"work",target_duration_seconds:1200,elapsed_seconds:60,status:"paused",notes:"keep" })});
  assert.equal(ui.state().isRestoring,false);
  assert.equal(ui.state().timeLeft,1140);
  await ui.run((s)=>s.startTimer(1800));
  assert.equal(ui.calls.length,0);
  assert.equal(ui.state().linkedTaskId,4);
  assert.equal(ui.state().notes,"keep");
  await ui.cleanup();
});

test("duration parser rejects ambiguous input rather than silently substituting",()=>{
  const {validatedSessionMinutes}=load("src/utils/sessionSetup.ts",{});
  for(const input of ["","0","481","2.5","20x","-5"]) assert.equal(validatedSessionMinutes(input),null);
  for(const input of ["1","30","480"]) assert.equal(validatedSessionMinutes(input),Number(input));
});

async function screenSetup(initial = {}, questOverrides = {}, deferExit = false, motionPreference = {value:true}, platform = "android", freshTimerResult = false, nativeNodes = null) {
  const calls = [], keyboardListeners = {}, animations = [];
  const cache = new Map();
  const lifecycle = load("src/services/globalSessionLifecycle.ts", {}, cache).globalSessionLifecycle;
  let exitCallback;
  let keyboard = false, back;
  let state = {
    duration:1800,timeLeft:1800,isRunning:false,isCompleted:false,hasOpenSession:false,
    isRestoring:false,restoreError:false,actionBusy:false,actionError:null,rewardsVisible:false,
    endingSession:false,awaitingStart:false,syncStatus:"idle",unsyncedSessionCount:0,
    linkedTaskId:null,targetAttributeId:1,activityType:"other",sessionSummary:null,
    startTimer: async(...args)=>{calls.push(["start",...args]);},
    pauseTimer: async()=>{calls.push(["pause"]);}, resumeTimer: async()=>{calls.push(["resume"]);},
    resetTimer: async()=>{calls.push(["reset"]);}, retryAction: async()=>{calls.push(["retry"]);},
    retryRestore:()=>{calls.push(["restore"]);}, retryCompletion:async()=>{calls.push(["complete"]);},
    setLinkedTaskId:(value)=>{calls.push(["task",value]);},setTargetAttributeId:(value)=>{calls.push(["area",value]);},
    setActivityType:(value)=>{calls.push(["activity",value]);},setDurationInMinutes:(value)=>{calls.push(["duration",value]);},setDurationInSeconds:(value)=>{calls.push(["seconds",value]);},
    setNotes:value=>calls.push(["notes",value]),resolveQuestTitle:()=>{},clearCompletionModal:()=>{},acknowledgeSummary:()=>calls.push(["summary-viewed"]),
    ...initial,
  };
  const router = {canGoBack:()=>true,goBack:()=>calls.push(["dismiss"]),isFocused:()=>state.focused !== false,getState:()=>({routes:[{},{}]}),addListener:()=>()=>{}};
  const quests = {tasks:[{id:7,title:"A long quest title worth finishing",target_minutes:30,subject_id:1,is_due_today:true,is_completed_today:false}],
    subjects:[{id:1,title:"General"}],loading:false,error:false,refresh:async()=>{},...questOverrides};
  const studyChoice={value:questOverrides.studyChoice ?? null,listeners:new Set()};
  let savedRoutines={scope:{ownerId:state.ownerId ?? 'owner-a',backendId:state.backendId ?? 'test-backend'},ready:true,routines:[],...questOverrides.savedRoutines};
  const Screen=load("src/components/SessionScreen.tsx",{
    "react-native-svg":{__esModule:true,default:host("Svg"),Circle:host("Circle")},
    "react-native":{
      View:host("View"),Text:host("Text"),TextInput:host("Input"),TouchableOpacity:host("Button"),
      ScrollView:host("Scroll"),KeyboardAvoidingView:host("KeyboardView"),ActivityIndicator:host("Spinner"),
      PanResponder:{create:(handlers)=>({panHandlers:handlers})},
      Platform:{OS:platform},useWindowDimensions:()=>({height:640,width:320,fontScale:1.5}),
      StyleSheet:{create:(s)=>s,hairlineWidth:1,absoluteFill:{}},
      Keyboard:{isVisible:()=>keyboard,dismiss:()=>{keyboard=false;keyboardListeners.keyboardDidHide?.();calls.push(["keyboard"]);},addListener:(event,fn)=>{keyboardListeners[event]=fn;return{remove(){}};}},
      BackHandler:{addEventListener:(_,fn)=>{back=fn;return{remove(){}};}},
      Animated:{createAnimatedComponent:component=>component,Value:class {constructor(value){this.value=value;} setValue(value){this.value=value;} stopAnimation(){} interpolate(config){return {source:this,config};}},View:host("AnimatedView"),timing:(value,config)=>({start(callback){animations.push({...config,from:value.value});if(deferExit && config.toValue===-0.12) exitCallback=callback;else { value.setValue(config.toValue); callback?.({finished:true}); }},stop(){}})},
    },
    "expo-router":{Stack:{Screen:host("Options")},useNavigation:()=>router,useFocusEffect:(effect)=>React.useEffect(effect,[effect]),
      useLocalSearchParams:()=>({countdownAction:state.notificationNonce})},
    "expo-router/react-navigation":{usePreventRemove:()=>{}},
    "@expo/vector-icons":{Ionicons:host("Icon")},
    "@gorhom/bottom-sheet":{BottomSheetScrollView:host("SheetScroll"),TouchableOpacity:host("Button")},
    "react-native-safe-area-context":{SafeAreaView:host("SafeArea"),useSafeAreaInsets:()=>({bottom:34,top:24})},
    "./AppHeader":p=>React.createElement("Button",{onPress:p.onBack,accessibilityLabel:p.backLabel},p.title),
    "./LevelUpModal":p=>!p.ending ? React.createElement("CompletionPopup",p) : React.createElement(p.visible ? "Sheet" : "EndedPopup",{...p,label:"session ended",motionMode:"timed",onRequestClose:p.onClose},
      p.visible && React.createElement("Text",{},"Your session has stopped. Ending early does not earn recorded time or XP."),
      p.visible && p.pending && React.createElement("Text",{},"Your stop is saved on this phone. Reconnect to confirm it."),
      p.visible && p.pending && React.createElement("Button",{disabled:p.syncBusy,onPress:p.onRetry},"Retry ending session"),
      p.visible && React.createElement("Button",{accessibilityLabel:"Done ending session",onPress:p.onClose},"Done")),
    "./AppSheet":(p)=>p.visible?React.createElement("Sheet",p,p.header,p.children):null,
    "./SessionCountdown":p=>React.createElement("DurationControl",p,React.createElement("View",{testID:"session-countdown"})),
    "./session/SessionReveal":{__esModule:true,default:p=>React.createElement("SessionReveal",p)},
    "./session/SessionBackdrop":{__esModule:true,default:p=>React.createElement("Backdrop",p),SessionIntroWords:p=>React.createElement("IntroWords",p)},
    "./FocusDurationSheet":p=>p.visible?React.createElement("DurationSheet",{...p,onConfirm:seconds=>{p.onSave(seconds);p.onClose();}}):null,
    "./SheetConfirmation":(p)=>React.createElement("Confirm",p),
    "../context/TimerContext":{useTimer:()=>freshTimerResult ? {...state} : state},"../context/QuestContext":{useQuests:()=>quests},
    "../context/AuthContext":{useAuth:()=>({accessMode:state.accessMode ?? 'online',user:{id:state.ownerId ?? 'owner-a'},
      localOwner:{id:state.ownerId ?? 'owner-a',backendId:state.backendId ?? 'test-backend'},admissionEpoch:state.admissionEpoch ?? 1})},
    "../hooks/useSavedRoutines":{useSavedRoutines:()=>savedRoutines},
    "./SubjectSetupRow":p=>React.createElement("SubjectRow",p),
    "../hooks/useReducedMotion":{useReducedMotion:()=>motionPreference.value},
    "../hooks/useRewards":require("./helpers/rewards-store-mock.cjs"),
  }, cache).default;
  let renderer;
  await act(async()=>{renderer=create(React.createElement(Screen),nativeNodes ? {createNodeMock:nativeNodes} : undefined);});
  const text=(node)=>typeof node==="string"?node:(node.children??[]).map(text).join("");
  // Setup mirrors Home: Length is one row whose sheet holds presets and custom time.
  // Category rows read "Learning. Reading, studying…"; tests address them by their name.
  const button=(label)=>renderer.root.findAllByType("Button").find((node)=>node.props.accessibilityLabel===label||text(node)===label||label==="Set a custom focus duration"&&node.props.testID==="focus-duration-chip")
    ?? renderer.root.findAllByType("Button").find(node=>node.props.accessibilityLabel?.startsWith(label+". "));
  return {
    calls,animations,button,root:()=>renderer.root,output:()=>text(renderer.root),
    // The tab that opened the session sets its one mode; tests switch it here.
    mode:async(next)=>{await act(async()=>load("src/services/setupMode.ts",{},cache).setupMode.choose(next));},
    press:async(label)=>{
      const preset=/^Use (\d+) minutes$/.exec(label);
      if(preset&&!button(label)){
        await act(async()=>button("Set a custom focus duration").props.onPress());
        await act(async()=>renderer.root.findByType("DurationSheet").props.onConfirm(Number(preset[1])*60));return;
      }
      const node=button(label);assert.ok(node,label);await act(async()=>node.props.onPress());},
    update:async(changes)=>{state={...state,...changes};await act(async()=>renderer.update(React.createElement(Screen)));},
    updateRoutines:async(changes)=>{savedRoutines={...savedRoutines,...changes};await act(async()=>renderer.update(React.createElement(Screen)));},
    dismissResult:async(sessionId=state.sessionId ?? null, overrides={})=>{await act(async()=>lifecycle.dismissResult({
      ownerId:state.ownerId ?? 'owner-a',scope:JSON.stringify([state.backendId ?? 'test-backend',state.ownerId ?? 'owner-a',state.admissionEpoch ?? 1]),sessionId,...overrides}));},
    keyboard:async()=>{keyboard=true;await act(async()=>keyboardListeners.keyboardDidShow());},
    back:async()=>{await act(async()=>back());},
    finishExit:async(finished=true)=>{await act(async()=>exitCallback?.({finished}));},
    reopen:async(changes={})=>{await act(async()=>renderer.unmount());state={...state,...changes};await act(async()=>{renderer=create(React.createElement(Screen));});},
    cleanup:async()=>{await act(async()=>renderer.unmount());},
  };
}

test("Round 76: walker lane uses ancestor-relative ring/area measurements and rejects stale owner callbacks", async () => {
  const ringCallbacks=[],areaCallbacks=[],surface={};
  const nodes=element=>element.props.testID==='session-surface'?surface:element.props.testID==='session-ring-layer'?{
    measureLayout: (relative,done)=>{assert.equal(relative,surface);ringCallbacks.push(done);}
  }:element.props.testID==='session-timer-anchor'?{
    measureLayout:(relative,done)=>{assert.equal(relative,surface);areaCallbacks.push(done);},measureInWindow(){}
  }:null;
  const ui=await screenSetup({hasOpenSession:true,isRunning:true}, {},false,{value:true},'android',false,nodes);
  const measure=()=>ui.root().findAllByType('AnimatedView').find(node=>node.props.testID==='session-ring-layer').props.onLayout();
  const band=()=>ui.root().findByType('Backdrop').props.focusBand;
  try{
    assert.equal(band(),null,'never use an old screen fraction before measuring');
    await act(async()=>measure()); await act(async()=>ringCallbacks.at(-1)(0,120,240,240));
    await act(async()=>areaCallbacks.at(-1)(0,80,320,430));
    assert.equal(band().ringBottom,360);assert.equal(band().areaBottom,510);
    await act(async()=>measure()); const obsolete=ringCallbacks.at(-1);
    await act(async()=>measure()); await act(async()=>ringCallbacks.at(-1)(0,140,240,240));
    await act(async()=>areaCallbacks.at(-1)(0,80,320,400));
    await act(async()=>obsolete(0,40,240,240)); await act(async()=>areaCallbacks.at(-1)(0,80,320,600));
    assert.equal(band().ringBottom,380);assert.equal(band().areaBottom,480,'an obsolete read cannot replace the current free lane');
    await act(async()=>measure()); await act(async()=>ringCallbacks.at(-1)(0,120,240,240)); const oldArea=areaCallbacks.at(-1);
    await ui.update({ownerId:'owner-b',admissionEpoch:2});assert.equal(band(),null);
    await act(async()=>oldArea(0,80,320,430));assert.equal(band(),null,'old-account geometry never paints on the new account');
  }finally{await ui.cleanup();}
});

test("a fresh ready Android Start persists protection and renders the break control after reconciliation", async () => {
  let readinessChecks = 0;
  const native = { formatVersion: 3, capabilities: async () => {
    readinessChecks++;
    return { supported: true, usage: true, overlay: true, notifications: true };
  } };
  const provider = await providerSetup({}, null, null, native);
  let screen;
  try {
    await provider.run(timer => timer.startTimer(120, "Fresh protected session"));
    assert.equal(readinessChecks, 1, "Start checks the production native readiness boundary");
    assert.equal(provider.calls.filter(([name]) => name === "start").length, 1);
    assert.equal(provider.state().protectedSession, true);
    assert.equal(provider.state().hasOpenSession, true);
    assert.equal(provider.state().actionError, null);
    const started = provider.persistedJournal();
    assert.equal(started.schemaVersion, 3);
    assert.deepEqual(started.records[0].protection, { breakStartedAtMs: null, breakEndsAtMs: null });
    screen = await screenSetup(provider.state());
    assert.ok(screen.button("Take a break"), "a new protected session exposes its one break");
    assert.equal(screen.button("Take a break").props.disabled, false);
    assert.equal(screen.button("Pause"), undefined);
    assert.equal(screen.button("Resume"), undefined);

    const readsBeforeForeground = provider.sessionReads();
    await provider.background();
    provider.backgroundTime(2);
    await provider.foreground();
    assert.ok(provider.sessionReads() > readsBeforeForeground, "foreground actually reconciles the server session");
    assert.equal(provider.state().protectedSession, true);
    assert.deepEqual(provider.persistedJournal().records[0].protection, started.records[0].protection);
    await screen.update(provider.state());
    assert.ok(screen.button("Take a break"), "server reconciliation cannot turn the break into legacy Pause");
    assert.equal(provider.calls.filter(([name]) => name === "start").length, 1);
  } finally {
    await screen?.cleanup();
    await provider.cleanup();
  }
});

test("a protected Start names its session for app protection at the tap, before the server replies", async () => {
  const native = { formatVersion: 3, capabilities: async () => ({ supported: true, usage: true, overlay: true, notifications: true }) };
  let release; const reply = new Promise(resolve => { release = resolve; });
  const provider = await providerSetup({ startActivitySession: async params => { await reply; return `bbbbbbbb-bbbb-4bbb-8bbb-${"1".padStart(12, "0")}`; } }, null, null, native);
  try {
    let starting;
    await provider.run(timer => { starting = timer.startTimer(120, "Protected at the tap"); });
    for (let i = 0; i < 5 && !provider.state().protectionSessionId; i++) await provider.run(() => {});
    const early = provider.state();
    assert.equal(early.awaitingStart, true, "the server has not confirmed yet");
    assert.ok(early.protectionSessionId, "protection already has a session to cover");
    assert.equal(early.protectedSession, true); assert.equal(early.isRunning, true);
    release(); await provider.run(() => starting);
    assert.equal(provider.state().protectionSessionId, early.protectionSessionId, "confirming keeps the same session, so the lease is never restarted");
    assert.equal(provider.state().hasOpenSession, true);
  } finally { await provider.cleanup(); }
});

test("Android Start with missing protection access cannot create an ordinary timer or server session", async () => {
  for (const missing of ["supported", "usage", "overlay", "notifications", "updated-build"]) {
    const native = { formatVersion: missing === "updated-build" ? 2 : 3,
      capabilities: async () => ({ supported: true, usage: true, overlay: true, notifications: true, [missing]: false }) };
    const provider = await providerSetup({}, null, null, native);
    try {
      await provider.run(timer => timer.startTimer(120, "Must not start"));
      assert.equal(provider.calls.filter(([name]) => name === "start").length, 0, missing);
      assert.equal(provider.state().hasOpenSession, false, missing);
      assert.equal(provider.state().protectionSetupRequired, true, missing);
      assert.match(provider.state().actionError, missing === "updated-build" ? /updated Android build/ : /Set up session protection/, missing);
      assert.equal(provider.persistedJournal().records.length, 0, missing);
    } finally { await provider.cleanup(); }
  }
});

test("opening Custom keeps the timer display and applied duration stable",async()=>{
  const ui=await screenSetup();
  const control=ui.root().findByType("DurationControl"),before=control.props;
  await ui.press("Set a custom focus duration");
  const after=ui.root().findByType("DurationControl").props;
  assert.equal(ui.root().findByType("DurationControl"),control);
  assert.equal(after.seconds,before.seconds);
  assert.equal(ui.root().findByType("DurationSheet").props.seconds,1800);
  await ui.cleanup();
});

test('the retained Session screen cannot consume notification End behind the global offline surface', async () => {
  const pending = deferred(); let consumed = 0;
  const ui = await screenSetup({ sessionId: SESSION_ID, hasOpenSession: true, isRunning: true,
    notificationNonce: '90000000-0000-4000-8000-000000000001',
    consumeNotificationAction: () => { consumed++; return pending.promise; } });
  try {
    await ui.update({ actionBusy: true });
    await act(async () => { pending.resolve('end'); });
    assert.equal(consumed, 0,'the stable connection coordinator owns notification actions');
    assert.equal(ui.root().findAllByType('Confirm').length,0);
    assert.equal(ui.calls.some(c => c[0] === 'reset'), false);
  } finally { await ui.cleanup(); }
});
test('a late notification End response cannot prompt for a replacement session', async () => {
  const pending = deferred();
  const ui = await screenSetup({ sessionId: SESSION_ID, hasOpenSession: true, isRunning: true,
    notificationNonce: '90000000-0000-4000-8000-000000000001', consumeNotificationAction: () => pending.promise });
  try {
    await ui.update({ sessionId: 'bbbbbbbb-bbbb-4bbb-8bbb-000000000002' });
    await act(async () => { pending.resolve('end'); });
    assert.equal(ui.root().findAllByType('Confirm').length, 0);
  } finally { await ui.cleanup(); }
});
test('a late notification End response cannot prompt over a finished session', async () => {
  const pending = deferred();
  const ui = await screenSetup({ sessionId: SESSION_ID, hasOpenSession: true, isRunning: true,
    notificationNonce: '90000000-0000-4000-8000-000000000001', consumeNotificationAction: () => pending.promise });
  try {
    await ui.update({ hasOpenSession: false, isRunning: false, isCompleted: true });
    await act(async () => { pending.resolve('end'); });
    assert.equal(ui.root().findAllByType('Confirm').length, 0);
  } finally { await ui.cleanup(); }
});

test("downward session swipe uses the existing animated close and inner sheets take priority",async()=>{
  for (const initial of [{},{hasOpenSession:true,isRunning:true},{hasOpenSession:true,isRunning:false},{isCompleted:true}]) {
    const ui=await screenSetup(initial);
    const safe=ui.root().findByType("SafeArea");
    assert.equal(safe.props.onMoveShouldSetPanResponderCapture({}, {y0:400,dy:40,dx:0}),true);
    await act(async()=>safe.props.onPanResponderRelease({}, {dy:100,vy:0.8}));
    assert.ok(ui.calls.some((call)=>call[0]==="dismiss"));
    await ui.cleanup();
  }
  const ui=await screenSetup();
  await ui.press("Set a custom focus duration");
  const safe=ui.root().findByType("SafeArea");
  assert.equal(safe.props.onMoveShouldSetPanResponderCapture({}, {y0:400,dy:40,dx:0}),false);
  await ui.cleanup();
});

test("timer nodes stay mounted; running and paused share a flexible centred layout",async()=>{
  const ui=await screenSetup();
  const anchor=ui.root().findAllByType("View").find((n)=>n.props.testID==="session-timer-anchor");
  const countdown=ui.root().findAllByType("View").find((n)=>n.props.testID==="session-countdown");
  const layout=JSON.stringify(anchor.props.style);
  await ui.update({hasOpenSession:true,isRunning:true,timeLeft:1800});
  assert.equal(ui.root().findAllByType("View").find((n)=>n.props.testID==="session-timer-anchor"),anchor);
  assert.notEqual(JSON.stringify(anchor.props.style),layout);
  const activeLayout=JSON.stringify(anchor.props.style);
  assert.equal(ui.root().findAllByType("View").find((n)=>n.props.testID==="session-countdown"),countdown);
  await ui.update({isRunning:false,timeLeft:1795});
  assert.equal(JSON.stringify(anchor.props.style),activeLayout);
  assert.ok(ui.button("Resume"));
  assert.equal(ui.button("Choose activity"),undefined);
  await ui.cleanup();
});

test("saved completion displays focused duration while unsaved completion stays at zero",async()=>{
  const ui=await screenSetup({isCompleted:true,timeLeft:0,duration:1800});
  assert.equal(ui.root().findByType("DurationControl").props.seconds,0);
  assert.match(ui.output(),/Saved on this phone.*Waiting to sync/);
  await ui.update({actionError:"Couldn’t save completion"});
  assert.equal(ui.root().findByType("DurationControl").props.seconds,0);
  assert.match(ui.output(),/Saved on this phone.*Waiting to sync/);
  await ui.update({actionError:null,sessionSummary:{durationSeconds:1859,minutesSpent:30,xpEarned:30,goldEarned:5,questTitle:"Read"}});
  assert.equal(ui.root().findByType("DurationControl").props.seconds,1859);
  assert.equal(ui.root().findByType("DurationControl").props.onCommit,undefined);
  assert.equal(ui.root().findAllByType("CompletionPopup").length,0);
  await ui.update({isCompleted:false,hasOpenSession:true,isRunning:false,sessionSummary:null,timeLeft:900});
  assert.equal(ui.root().findByType("DurationControl").props.seconds,900);
  await ui.cleanup();
});

test("unknown timing changes disable new timing controls while retry and End remain available",async()=>{
  const ui=await screenSetup({hasOpenSession:true,isRunning:true,syncStatus:"waiting",actionError:"Waiting to confirm your saved session state."});
  try {
    assert.equal(ui.button("Pause").props.disabled,true);
    assert.equal(ui.button("End session").props.disabled,false);
    assert.equal(ui.button("Retry").props.disabled,false);
    await ui.press("Retry"); assert.deepEqual(ui.calls.filter(call=>call[0]==="retry"),[["retry"]]);
  } finally {await ui.cleanup();}
});

test("uncertain start is planned instead of paused, End is available, and Retry survives automatic checks",async()=>{
  // A saved start being checked (no live start in progress) always says so.
  const ui=await screenSetup({hasOpenSession:true,isRunning:false,awaitingStart:true,startCheckVisible:true,syncStatus:"waiting",actionError:"Waiting to confirm whether your session started."});
  try {
    assert.doesNotMatch(ui.output(),/· Paused/);assert.match(ui.output(),/Checking start/);
    assert.equal(ui.button("Checking start").props.disabled,true);assert.equal(ui.button("End session").props.disabled,false);
    const retry=ui.button("Retry");assert.equal(retry.props.disabled,false);
    await ui.update({actionBusy:true,actionError:null});assert.equal(ui.button("Retry"),retry);assert.equal(retry.props.disabled,true);
    await ui.update({actionBusy:false,actionError:"Waiting to confirm whether your session started."});assert.equal(ui.button("Retry"),retry);
    await ui.press("End session");await act(async()=>ui.root().findByType("Confirm").props.onConfirm());
    assert.equal(ui.calls.filter(call=>call[0]==="reset").length,1);
  } finally {await ui.cleanup();}
});

test("a pending End keeps timing controls disabled while its result is owned by the global presenter",async()=>{
  const ui=await screenSetup({hasOpenSession:false,isRunning:false,endingSession:true,syncStatus:"waiting",actionError:"Waiting to confirm your saved session state.",timeLeft:0});
  try {
    assert.match(ui.output(),/Session ended/);
    assert.equal(ui.button("Start"),undefined);assert.equal(ui.button("Stopped").props.disabled,true);
    assert.equal(ui.button("End session"),undefined);assert.equal(ui.button("Retry ending session"),undefined);
    assert.equal(ui.root().findAllByType("CompletionPopup").length,0);
    assert.doesNotMatch(ui.output(),/New session|Ready when you are|Planned focus|· Paused/);
  } finally {await ui.cleanup();}
});
test("restored End keeps its stopped countdown and suggestion until global Done clears it",async()=>{
  const api=load("src/constants/guidedQuests.ts",{}),focus={...api.suggestedFocus('review-topic'),seconds:60};
  const ui=await screenSetup({duration:60,timeLeft:17,hasOpenSession:false,isRunning:false,endingSession:true,
    syncStatus:'waiting',actionError:'Your stop is saved on this phone.',notes:api.encodeSuggestedFocus(focus)}, {}, true);
  try {
    const control=ui.root().findByType('DurationControl');assert.equal(control.props.seconds,17);
    assert.match(ui.output(),/Review your notes · Ended/);assert.equal(ui.button('Stopped').props.disabled,true);
    await ui.update({endingSession:false,sessionEnded:true,actionError:null,syncStatus:'saved'});
    assert.equal(control.props.seconds,17);assert.equal(ui.calls.filter(c=>c[0]==='dismiss').length,0);
    await ui.update({sessionEnded:false,summaryViewed:true,duration:1800,timeLeft:1800,notes:''});
    assert.equal(control.props.seconds,17,'the outgoing screen keeps the original countdown throughout its exit');
    await ui.finishExit();assert.equal(ui.calls.filter(c=>c[0]==='dismiss').length,1);
    assert.equal(ui.calls.filter(c=>['start','reset','complete'].includes(c[0])).length,0);
  }finally{await ui.cleanup();}
});
test("an End restored after Session mounts preserves the stopped surface and exits after global Done",async()=>{
  const ui=await screenSetup({duration:60,timeLeft:60,isRestoring:true,actionBusy:true}, {}, true);
  try {
    await ui.update({isRestoring:false,actionBusy:false,hasOpenSession:false,isRunning:false,endingSession:true,timeLeft:16,syncStatus:'waiting'});
    assert.doesNotMatch(ui.output(),/New session|Ready when you are|· Paused/);
    assert.equal(ui.root().findByType('DurationControl').props.seconds,16);
    assert.equal(ui.button('Start'),undefined);assert.equal(ui.button('Stopped').props.disabled,true);
    await ui.update({endingSession:false,sessionEnded:false,summaryViewed:true});await ui.finishExit();
    assert.equal(ui.calls.filter(c=>c[0]==='dismiss').length,1);
    assert.equal(ui.calls.filter(c=>['retry','start','reset','complete'].includes(c[0])).length,0);
  }finally{await ui.cleanup();}
});
test("rejected completion never renders duplicate reward controls on the session route",async()=>{
  const ui=await screenSetup({isCompleted:true,timeLeft:0,syncStatus:"rejected"});
  try {
    assert.match(ui.output(),/Your account did not accept it/);assert.doesNotMatch(ui.output(),/Waiting to sync|Character XP/);
    assert.equal(ui.root().findAllByType("CompletionPopup").length,0);assert.equal(ui.button("New session"),undefined);
    await ui.update({isCompleted:false,summaryViewed:true});assert.equal(ui.calls.filter(c=>c[0]==="dismiss").length,1);
    assert.equal(ui.calls.filter(c=>["reset","complete"].includes(c[0])).length,0);
  }finally{await ui.cleanup();}
});
test("quest setup is compact, keeps its association during loading, and never starts automatically",async()=>{
  const ui=await screenSetup({linkedTaskId:7,duration:2700,timeLeft:2700});
  assert.match(ui.output(),/A long quest title/);
  assert.equal(ui.button("Choose category"),undefined,"a routine brings its own category, so there is nothing to change here");
  assert.equal(ui.button("15 minutes"),undefined);
  assert.ok(ui.root().findAll(node=>node.props.testID==="session-routine").length>0,"the routine is shown as a fixed row");
  assert.equal(ui.button("Change routine"),undefined);
  assert.equal(ui.root().findByType("DurationControl").props.caption,"Planned focus");
  assert.equal(ui.root().findByType("DurationControl").props.onCommit,undefined);
  assert.equal(ui.root().findByProps({testID:"session-timer-anchor"}).props.style[1].flex,1);
  assert.equal(ui.calls.length,0);
  await ui.press("Start");
  assert.deepEqual(ui.calls.at(-1),["start",2700,"A long quest title worth finishing"]);
  await ui.cleanup();
  const missing=await screenSetup({linkedTaskId:7},{tasks:[],loading:true});
  assert.match(missing.output(),/Loading routine/);
  assert.equal(missing.button("Start").props.disabled,true);
  assert.equal(missing.calls.length,0);
  await missing.cleanup();
});

test("custom picker changes setup only on confirm; Retry uses exact seconds",async()=>{
  const ui=await screenSetup();
  await ui.press("Set a custom focus duration");
  assert.equal(ui.root().findByType("DurationSheet").props.seconds,1800);
  await ui.back();
  assert.equal(ui.calls.some(([action])=>action==="seconds"),false);
  await ui.press("Set a custom focus duration");
  await act(async()=>ui.root().findByType("DurationSheet").props.onConfirm(930));
  assert.deepEqual(ui.calls.at(-1),["seconds",930]);
  await ui.update({duration:930,timeLeft:930,actionError:"Couldn’t start your session."});
  await ui.press("Retry");
  assert.deepEqual(ui.calls.at(-1),["start",930,undefined]);
  await ui.press("Set a custom focus duration");
  assert.equal(ui.root().findByType("DurationSheet").props.seconds,930);
  await ui.back();
  await ui.update({actionBusy:true});
  assert.equal(ui.button("Start").props.disabled,true);
  assert.equal(ui.root().findAllByType("Input").length,0);
  await ui.cleanup();
});

test("back dismisses keyboard, then picker, then the screen without resetting",async()=>{
  const ui=await screenSetup();
  await ui.press("Choose category");
  await ui.keyboard();
  await ui.back();
  assert.equal(ui.root().findAllByType("Sheet").length,1);
  assert.equal(ui.calls.some(([name])=>name==="dismiss"),false);
  await ui.back();
  assert.equal(ui.root().findAllByType("Sheet").length,0);
  await ui.back(); await ui.back();
  assert.equal(ui.calls.filter(([name])=>name==="dismiss").length,1);
  assert.equal(ui.calls.some(([name])=>name==="reset"),false);
  await ui.cleanup();
});

test("a completed route leaves result presentation to the one global sheet and exits after Done",async()=>{
  const ui=await screenSetup({isCompleted:true,timeLeft:0,sessionSummary:{questTitle:"Read",durationSeconds:1800,xpEarned:30,goldEarned:5}});
  try {
    assert.equal(ui.root().findAllByType("CompletionPopup").length,0);assert.equal(ui.button("New session"),undefined);
    assert.doesNotMatch(ui.output(),/Character XP|Time recorded30 min/);
    await ui.update({isCompleted:false,sessionSummary:null,summaryViewed:true});
    assert.equal(ui.calls.filter(c=>c[0]==="dismiss").length,1);
    assert.equal(ui.calls.filter(c=>c[0]==="reset"||c[0]==="complete").length,0);
  }finally{await ui.cleanup();}
});
test("seconds survive countdown boundaries, pause, minimise and completion once", async()=>{
  const ui=await providerSetup({completeActivitySession:async(id)=>{ui.calls.push(["complete",id]);return {...result,minutes:15,duration_seconds:930,xp_earned:15,gold_earned:75};}});
  await ui.run(s=>s.startTimer(930));
  assert.equal(ui.calls[0][1].targetDurationSeconds,930);
  assert.equal(ui.calls[0][1].activityType,"other");
  await ui.advance(30);
  assert.equal(ui.state().timeLeft,900);
  await ui.advance(1);
  assert.equal(ui.state().timeLeft,899);
  await ui.run(s=>s.pauseTimer());
  await ui.page(false);await ui.page(true);
  assert.equal(ui.state().duration,930);
  assert.equal(ui.state().timeLeft,899);
  await ui.run(s=>s.resumeTimer());
  await ui.advance(899);
  assert.equal(ui.state().sessionSummary.durationSeconds,930);
  await ui.run(s=>s.retryCompletion());
  assert.equal(ui.calls.filter(([name])=>name==="complete").length,1);
  await ui.cleanup();
});

test("restoration retains sub-minute and mixed durations and legacy activity",async()=>{
  for(const [seconds,elapsed,status] of [[30,7,"paused"],[930,61,"paused"],[930,61,"active"]]){
    const ui=await providerSetup({getOpenActivitySession:async()=>({id:"saved",task_id:null,subject_id:1,activity_type:"general",target_duration_seconds:seconds,elapsed_seconds:elapsed,status,notes:"",last_resumed_at:new Date(PROVIDER_NOW).toISOString()})});
    assert.equal(ui.state().duration,seconds);
    assert.equal(ui.state().timeLeft,seconds-elapsed);
    assert.equal(ui.state().activityType,"general");
    await ui.page(false);await ui.page(true);
    assert.equal(ui.state().timeLeft,seconds-elapsed);
    await ui.cleanup();
  }
});

test("bounds and exact duration labels reject zero and 480:59",()=>{
  const {validSessionSeconds,durationLabel,sessionTime}=load("src/utils/sessionSetup.ts",{});
  for(const value of [0,1,30,59,-1,28801,28859,1.5,NaN]) assert.equal(validSessionSeconds(value),false);
  for(const value of [60,61,930,28800]) assert.equal(validSessionSeconds(value),true);
  assert.equal(durationLabel(930),"15 min 30 sec");
  assert.equal(durationLabel(30),"30 sec");
  assert.equal(sessionTime(60),"01:00");
  assert.equal(sessionTime(59),"00:59");
});

test("Life area wins over neutral or historical activity; legacy missing-area labels remain readable",()=>{
  const {sessionCategory}=load("src/utils/sessionReporting.ts",{});
  const areas=[{id:2,title:"Knowledge"}];
  assert.equal(sessionCategory({subject_id:2,activity_type:"other"},areas),"Learning");
  assert.equal(sessionCategory({subject_id:2,activity_type:"code"},areas),"Learning");
  assert.equal(sessionCategory({subject_id:null,activity_type:"code"},areas),"Code");
  assert.equal(sessionCategory({subject_id:null,activity_type:"other"},areas),"Everyday focus");
});

test("dock distinguishes running, paused, saving, failed and completed without completed countdown",()=>{
  const {sessionDockState}=load("src/utils/sessionReporting.ts",{});
  const state={isCompleted:false,isRunning:true,actionError:null,sessionSummary:null,timeLeft:930};
  assert.deepEqual(sessionDockState(state),{label:"Session running",detail:"15:30",icon:"play-outline"});
  assert.equal(sessionDockState({...state,isRunning:false}).icon,"pause-outline");
  assert.deepEqual(sessionDockState({...state,awaitingStart:true,isRunning:false}),{label:"Checking session start",detail:"Review",icon:"sync-outline"});
  assert.equal(sessionDockState({...state,isCompleted:true}).label,"Saving session…");
  assert.equal(sessionDockState({...state,isCompleted:true,actionError:"Offline"}).detail,"Retry");
  const completed=sessionDockState({...state,isCompleted:true,sessionSummary:{},timeLeft:0});
  assert.equal(completed.icon,"checkmark-circle-outline");
  assert.equal(completed.detail,"Review session");
});

test("Just focus is one mode with no switch: what it is for, then category and length, with no routine chooser",async()=>{
  const ui=await screenSetup();
  assert.equal(ui.button("Routine. Any activity in a category, or one of your routines"),undefined,"no Routine/Study switch");
  assert.equal(ui.button("Study. A subject, counted toward its exams"),undefined);
  assert.match(ui.output(),/Quick focus/);
  const context=ui.root().findAll(node=>node.props.testID==="session-context"&&typeof node.type==="string")[0];
  assert.match(JSON.stringify(context.findAllByType("Text").map(node=>node.props.children)),/Everyday focus/,"the screen opens with what this time is for");
  assert.equal(ui.button("Choose category").props.accessibilityValue.text,"Everyday focus");
  assert.equal(ui.button("Choose routine"),undefined,"a routine starts from its own play button, never inside Just focus");
  assert.ok(ui.button("Set a custom focus duration"));
  assert.equal(ui.button("Choose activity"),undefined);
  await ui.cleanup();
});

test("header close/minimise uses stack back once without changing active state",async()=>{
  for(const active of [false,true]){
    const ui=await screenSetup({hasOpenSession:active,isRunning:active,timeLeft:929,duration:930});
    const label=active?"Minimise session":"Close session";
    await ui.press(label);await ui.press(label);
    assert.deepEqual(ui.calls,[["dismiss"]]);
    await ui.cleanup();
  }
});

test("foreground recovery and notifications retain exact remaining seconds",async()=>{
  const scheduled=[];
  const notifications={
    AndroidImportance:{LOW:1,MAX:5},AndroidNotificationPriority:{MAX:5},SchedulableTriggerInputTypes:{TIME_INTERVAL:"timeInterval"},
    getPermissionsAsync:async()=>({status:"granted"}),setNotificationHandler:()=>{},
    setNotificationChannelAsync:async()=>{},addNotificationResponseReceivedListener:()=>({remove(){}}),
    dismissNotificationAsync:async()=>{},cancelScheduledNotificationAsync:async()=>{},
    scheduleNotificationAsync:async(request)=>{scheduled.push(request);return request.identifier;},
    getAllScheduledNotificationsAsync:async()=>scheduled,
  };
  const ui=await providerSetup({},notifications);
  await ui.run(s=>s.startTimer(930));
  assert.equal(scheduled.find(n=>n.trigger?.seconds).trigger.seconds,930);
  ui.backgroundTime(31);await ui.foreground();
  assert.equal(ui.state().timeLeft,899);
  await ui.run(s=>s.pauseTimer());await ui.run(s=>s.resumeTimer());
  assert.equal(scheduled.filter(n=>n.trigger?.seconds).at(-1).trigger.seconds,899);
  await ui.cleanup();
});

test("returning after the deadline settles the durable result before slow capability or completion replies", async () => {
  const capability = deferred(), completion = deferred();
  let completions = 0;
  const ui = await providerSetup({ completeActivitySession: async () => { completions++; return completion.promise; } });
  try {
    await ui.run(s => s.startTimer(60, 'Read'));
    await ui.advance(1);
    await ui.background(); ui.backgroundTime(120);
    ui.refreshCapability(() => capability.promise);
    await ui.foreground();
    assert.equal(ui.state().isCompleted, true, 'local terminal state does not wait for optional network work');
    assert.equal(ui.state().hasOpenSession, false);
    assert.equal(ui.persistedJournal().records[0].state, 'completed', 'completion is durable before it is presented');
    assert.equal(ui.state().sessionSummary, null, 'no reward or receipt is fabricated while the network waits');
    assert.equal(completions, 0);
    capability.resolve(); await ui.run(() => {});
    assert.equal(completions, 1);
    assert.equal(ui.state().sessionSummary, null);
    completion.resolve({ ...result, duration_seconds: 60, minutes: 1 }); await ui.run(() => {});
    assert.equal(ui.state().sessionSummary.durationSeconds, 60);
    assert.equal(ui.state().syncStatus, 'saved');
    await ui.foreground();
    assert.equal(completions, 1, 'another foreground cannot award or submit the completed session twice');
  } finally { capability.resolve(); completion.resolve(result); await ui.cleanup(); }
});

test("an expired foreground stays pending through a failed completion without inventing saved progress", async () => {
  let completions = 0;
  const ui = await providerSetup({ completeActivitySession: async () => { completions++; throw Error('Offline'); } });
  try {
    await ui.run(s => s.startTimer(60));
    await ui.background(); ui.backgroundTime(61); await ui.foreground();
    assert.equal(ui.state().isCompleted, true);
    assert.equal(ui.state().hasOpenSession, false);
    assert.equal(ui.state().syncStatus, 'waiting');
    assert.equal(ui.state().sessionSummary, null);
    assert.equal(ui.persistedJournal().records[0].state, 'completed');
    assert.equal(completions, 1);
    await ui.advance(0.1);
    assert.equal(completions, 1, 'a display tick does not bypass the existing retry backoff');
  } finally { await ui.cleanup(); }
});

test("foreground cannot call a result completed before the local journal write has settled", async () => {
  const disk = deferred(); let completions = 0;
  const ui = await providerSetup({ completeActivitySession: async () => { completions++; return result; } });
  let screen;
  try {
    await ui.run(s => s.startTimer(60));
    await ui.background(); ui.backgroundTime(61);
    ui.beforeWrite(async (key, value) => {
      if (key.startsWith('liferpg:session-journal:v1:') && JSON.parse(value).records.some(record => record.state === 'completed')) await disk.promise;
    });
    await ui.foreground();
    assert.equal(ui.state().isCompleted, false);
    assert.equal(ui.state().sessionSummary, null);
    assert.equal(completions, 0);
    screen = await screenSetup(ui.state());
    const anchor = screen.root().findByProps({ testID: 'session-timer-anchor' });
    assert.equal(anchor.props.importantForAccessibility, 'no-hide-descendants');
    assert.equal([].concat(anchor.props.style).filter(Boolean).at(-1).opacity, 0, 'expired digits are not flashed while persistence waits');
    assert.equal(screen.root().findAllByType('Svg').length, 0);
    assert.equal(screen.root().findByType('Backdrop').props.walking, false);
    disk.resolve(); await ui.run(() => {});
    assert.equal(ui.state().isCompleted, true);
    assert.equal(completions, 1);
  } finally { disk.resolve(); await screen?.cleanup(); await ui.cleanup(); }
});

test("a paused session returning after its old deadline keeps the exact paused time and earns nothing", async () => {
  const ui = await providerSetup();
  try {
    await ui.run(s => s.startTimer(60)); await ui.advance(7);
    await ui.run(s => s.pauseTimer());
    await ui.background(); ui.backgroundTime(3600); await ui.foreground();
    assert.equal(ui.state().isRunning, false);
    assert.equal(ui.state().timeLeft, 53);
    assert.equal(ui.state().hasOpenSession, true);
    assert.equal(ui.state().isCompleted, false);
    assert.equal(ui.state().sessionSummary, null);
    assert.equal(ui.calls.filter(([name]) => name === 'complete').length, 0);
  } finally { await ui.cleanup(); }
});

test("cold recovery of an expired session waits for its real receipt instead of opening a zero countdown", async () => {
  const completion = deferred();
  const ui = await providerSetup({
    getOpenActivitySession: async () => ({ id: 'expired-recovered', status: 'active', target_duration_seconds: 60, elapsed_seconds: 60 }),
    completeActivitySession: () => completion.promise,
  });
  let screen;
  try {
    assert.equal(ui.state().isCompleted, true);
    assert.equal(ui.state().sessionSummary, null);
    screen = await screenSetup(ui.state());
    assert.equal(screen.root().findByProps({ testID: 'session-timer-anchor' }).props.importantForAccessibility, 'no-hide-descendants');
    assert.equal(screen.root().findAllByType('Svg').length, 0);
    completion.resolve(result); await ui.run(() => {});
    assert.equal(ui.state().sessionSummary.sessionId, fixtureServerId('expired-recovered'));
    assert.equal(ui.state().sessionSummary.durationSeconds, 60);
  } finally { completion.resolve(result); await screen?.cleanup(); await ui.cleanup(); }
});

test("a scope change clears the old live countdown immediately, including while its completion reply is delayed", async () => {
  for (const kind of ['owner', 'backend']) {
    const completion = deferred();
    const ui = await providerSetup({ completeActivitySession: () => completion.promise });
    try {
      await ui.run(s => s.startTimer(60)); await ui.advance(10);
      const previousId = ui.state().sessionId;
      await ui.background(); ui.backgroundTime(60); await ui.foreground();
      const before = ui.timerFrames.length;
      await ui.changeScope(kind);
      completion.resolve(result); await ui.run(() => {});
      const incoming = ui.timerFrames.slice(before);
      assert.ok(incoming.length > 0);
      assert.ok(incoming.every(frame => frame.sessionId !== previousId && frame.summary === null), `the outgoing owner or backend has no live presentation in the incoming scope: ${JSON.stringify(incoming)}`);
    } finally { completion.resolve(result); await ui.cleanup(); }
  }
});




test("Session timer is display-only and setup has one shared duration control",async()=>{
  const ui=await screenSetup();
  try {
    const display=ui.root().findByType("DurationControl").props;
    for(const action of ["onCommit","onBusy","onValidity","onEdit"])assert.equal(display[action],undefined);
    assert.equal(ui.calls.length,0);assert.equal(ui.root().findAllByType("DurationSheet").length,0);
    assert.equal(ui.root().findAllByType("View").filter(n=>n.props.testID==="focus-length-control").length,1);
    await ui.press("Use 60 minutes");await ui.update({duration:3600,timeLeft:3600});
    assert.deepEqual(ui.calls.at(-1),["seconds",3600]);await ui.press("Start");assert.deepEqual(ui.calls.at(-1),["start",3600,undefined]);
  }finally{await ui.cleanup();}
});





test("Session surface stays opaque while the reduced-motion preference resolves",async()=>{
  const preference={value:true};
  const ui=await screenSetup({}, {}, false, preference);
  const surface=()=>ui.root().findAllByType("AnimatedView").find(n=>n.props.testID==="session-surface");
  assert.equal(surface().props.style.opacity.value,1);
  assert.match(surface().props.style.backgroundColor,/^#[0-9a-f]{6}$/i);
  preference.value=false;await ui.update({});
  assert.equal(surface().props.style.opacity.value,1);
  preference.value=true;await ui.update({});
  assert.equal(surface().props.style.opacity.value,1);
  await ui.cleanup();
});

test("a close that never pops (a widget launch arriving at that moment) leaves the session visible and usable, never frozen", async () => {
  const ui = await screenSetup({hasOpenSession:true,isRunning:true}, {}, false, {value:false});
  try {
    const surface = () => ui.root().findAllByType("AnimatedView").find(n => n.props.testID === "session-surface");
    await ui.back();
    assert.equal(ui.calls.filter(c => c[0] === "dismiss").length, 1, "it asked to close");
    assert.equal(surface().props.style.opacity.value, 0, "and faded out");
    await act(async () => { await new Promise(done => setTimeout(done, 950)); });
    assert.equal(surface().props.style.opacity.value, 1, "still in front after the pop was lost: visible again");
    await ui.back();
    assert.equal(ui.calls.filter(c => c[0] === "dismiss").length, 2, "and closing works again");
    assert.equal(ui.calls.some(c => c[0] === "reset" || c[0] === "pause"), false, "the session keeps running throughout");
  } finally { await ui.cleanup(); }
});

test("Android keeps Session mounted until exit finishes and rejects repeated close",async()=>{
  const ui=await screenSetup({hasOpenSession:true,isRunning:true},{},true);
  await ui.press("Minimise session");await ui.back();
  assert.equal(ui.calls.some(c=>c[0]==="dismiss"),false);
  assert.ok(ui.root().findByType("DurationControl"));
  await ui.finishExit(false);
  assert.equal(ui.calls.some(c=>c[0]==="dismiss"),false);
  await ui.back();
  await ui.finishExit();
  assert.equal(ui.calls.filter(c=>c[0]==="dismiss").length,1);
  assert.equal(ui.calls.some(c=>c[0]==="reset"||c[0]==="pause"),false);
  await ui.cleanup();
});

test("viewed completion hides its dock without hiding a running session",async()=>{
  let timer={hasOpenSession:false,isCompleted:true,sessionSummary:{},summaryViewed:false};
  const Dock=load("src/components/SessionTabBar.tsx",{
    "react-native":{View:host("View"),Text:host("Text"),TouchableOpacity:host("Button"),StyleSheet:{create:s=>s},useWindowDimensions:()=>({width:390,fontScale:1})},
    "expo-router":{useRouter:()=>({navigate:()=>{}})},"expo-router/js-tabs":{BottomTabBar:host("Tabs")},
    "@expo/vector-icons":{Ionicons:host("Icon")},"react-native-safe-area-context":{useSafeAreaInsets:()=>({bottom:0})},"react-native-svg":{__esModule:true,default:host("Svg"),Defs:host("Defs"),LinearGradient:host("Gradient"),Rect:host("Rect"),Stop:host("Stop")},
    "../context/TimerContext":{useTimer:()=>timer},"./OfflineStatus":host("OfflineStatus"),
  }).default;
  let renderer;await act(async()=>{renderer=create(React.createElement(Dock,{}));});
  assert.equal(renderer.root.findAllByType("Button").length,1);
  assert.equal(renderer.root.findByType("Button").props.style.backgroundColor,"#3B2737","the aubergine main colour");
  assert.equal(renderer.root.findByType("Button").props.activeOpacity,1);
  timer={...timer,summaryViewed:true};await act(async()=>renderer.update(React.createElement(Dock,{})));
  assert.equal(renderer.root.findAllByType("Button").length,0);
  timer={...timer,hasOpenSession:true,isCompleted:false,isRunning:true,timeLeft:30};await act(async()=>renderer.update(React.createElement(Dock,{})));
  assert.equal(renderer.root.findAllByType("Button").length,1);
  await act(async()=>renderer.unmount());
});

test("typed input and presets share applied seconds while linked quests stay read-only",async()=>{
  const ui=await screenSetup();
  await ui.press("Set a custom focus duration");
  await act(async()=>ui.root().findByType("DurationSheet").props.onConfirm(6000));
  await ui.update({duration:6000,timeLeft:6000});
  assert.equal(ui.root().findByType("DurationControl").props.seconds,6000);
  await ui.press("Use 30 minutes");await ui.update({duration:1800,timeLeft:1800});
  assert.equal(ui.root().findByType("DurationControl").props.seconds,1800);
  await ui.update({linkedTaskId:7,duration:930});
  assert.equal(ui.root().findByType("DurationControl").props.onCommit,undefined);
  assert.equal(ui.button("Edit duration"),undefined);
  await ui.cleanup();
});






test("Session drag follows the finger, cancels back in place and retains timer state until exit", async()=>{
  const ui=await screenSetup({hasOpenSession:true,isRunning:true,timeLeft:1259},{},true,{value:false});
  const surface=()=>ui.root().findAllByType("AnimatedView").find(n=>n.props.testID==="session-surface");
  const safe=()=>ui.root().findByType("SafeArea");
  const motion=surface().props.style.transform[0].translateY.source;
  const transform=surface().props.style.transform[0].translateY.config;
  assert.deepEqual(transform.inputRange,[-.12,0,1]);assert.equal(transform.outputRange[1],640);assert.ok(transform.outputRange[0]>640,'exit travels beyond the screen while normal drag uses its original height');
  const originalTimer=ui.root().findByType("DurationControl");
  await act(async()=>{
    safe().props.onPanResponderGrant();
    safe().props.onPanResponderMove({}, {dy:64});
  });
  assert.equal(motion.value,0.9); // 64 px of a 640 px screen.
  assert.equal(surface().props.style.opacity.value,0.982);
  assert.equal(ui.calls.some(c=>c[0]==="dismiss"),false);
  await act(async()=>safe().props.onPanResponderRelease({}, {dy:64,vy:0.1}));
  assert.equal(motion.value,1);
  assert.equal(ui.root().findByType("DurationControl"),originalTimer);
  await act(async()=>{
    safe().props.onPanResponderMove({}, {dy:180});
    safe().props.onPanResponderRelease({}, {dy:180,vy:0.2});
  });
  assert.equal(ui.calls.some(c=>c[0]==="dismiss"),false);
  assert.equal(ui.root().findByType("DurationControl").props.seconds,1259);
  await ui.finishExit();
  assert.equal(ui.calls.filter(c=>c[0]==="dismiss").length,1);
  assert.equal(ui.calls.some(c=>["pause","reset","seconds"].includes(c[0])),false);
  await ui.cleanup();
});

test("an interrupted Session drag settles back without navigation or timer mutation", async()=>{
  const ui=await screenSetup({hasOpenSession:true,isRunning:false,timeLeft:301},{},false,{value:false});
  const safe=ui.root().findByType("SafeArea");
  const surface=ui.root().findAllByType("AnimatedView").find(n=>n.props.testID==="session-surface");
  await act(async()=>safe.props.onPanResponderMove({}, {dy:80}));
  assert.equal(surface.props.style.transform[0].translateY.source.value,0.875);
  await act(async()=>safe.props.onPanResponderTerminate());
  assert.equal(surface.props.style.transform[0].translateY.source.value,1);
  assert.equal(ui.calls.length,0);
  await ui.cleanup();
});


test("iOS Session uses one controlled vertical exit and preserves the running timer",async()=>{
  const ui=await screenSetup({hasOpenSession:true,isRunning:true,timeLeft:77},{},true,{value:false},"ios");
  await ui.press("Minimise session");
  assert.equal(ui.calls.some(c=>c[0]==="dismiss"),false);
  assert.equal(ui.root().findByType("DurationControl").props.seconds,77);
  await ui.finishExit();
  assert.equal(ui.calls.filter(c=>c[0]==="dismiss").length,1);
  assert.equal(ui.calls.some(c=>["pause","reset"].includes(c[0])),false);
  await ui.cleanup();
});
test("mounting the session provider does not prompt for denied notification permission", async () => {
  let prompts = 0;
  const ui = await providerSetup({}, {
    getPermissionsAsync: async () => ({ status: "denied", granted: false }),
    requestPermissionsAsync: async () => { prompts++; return { status: "granted" }; },
    addNotificationResponseReceivedListener: () => ({ remove() {} }),
  });
  try { assert.equal(prompts, 0); }
  finally { await ui.cleanup(); }
});

function notificationMock() {
  const requests = [], cancellations = [], dismissals = [], channels = [];
  return { requests, cancellations, dismissals, channels, api: {
    AndroidImportance: { LOW: 2, MAX: 5 }, AndroidNotificationPriority: { MAX: 5 },
    SchedulableTriggerInputTypes: { TIME_INTERVAL: "timeInterval" },
    getPermissionsAsync: async () => ({ granted: true, status: "granted" }),
    setNotificationHandler() {}, addNotificationResponseReceivedListener: () => ({ remove() {} }),
    setNotificationChannelAsync: async (id, config) => { channels.push([id, config]); },
    cancelScheduledNotificationAsync: async id => { cancellations.push(id); },
    dismissNotificationAsync: async id => { dismissals.push(id); },
    scheduleNotificationAsync: async request => { requests.push(request); return request.identifier; },
  } };
}

test("Android actual scheduling payloads route ongoing and timed alerts through preference channels", async () => {
  const api = load("src/services/sessionNotificationService.ts", {});
  for (const sound of [false, true]) for (const haptics of [false, true]) {
    const mock = notificationMock(), preferences = { sound, haptics };
    const lifecycle = api.createSessionNotificationLifecycle(mock.api, "android", preferences);
    await lifecycle.schedule(930, "Read");
    const [ongoing, completion] = mock.requests;
    assert.deepEqual(ongoing.trigger, { channelId: api.ONGOING_CHANNEL_ID });
    assert.equal(ongoing.content.channelId, undefined);
    assert.equal(ongoing.content.sound, false);
    assert.deepEqual(completion.trigger, { type: "timeInterval", seconds: 930, repeats: false, channelId: api.completionChannelId(preferences) });
    assert.equal(completion.content.channelId, undefined);
    assert.equal(completion.content.title, "Time well spent");
    assert.equal(completion.content.body, "Your session is finished. Open LifeRPG to see your progress.");
    assert.equal(completion.content.sound, sound ? "default" : false);
    assert.deepEqual(completion.content.data, { type: "COMPLETION" });
    const channel = mock.channels.find(([id]) => id === completion.trigger.channelId)[1];
    assert.equal(channel.sound, sound ? "default" : null);
    assert.equal(channel.enableVibrate, haptics);
    assert.equal(mock.channels.find(([id]) => id === api.ONGOING_CHANNEL_ID)[1].sound, null);
    await lifecycle.clear();
    assert.deepEqual(mock.cancellations.slice(-2), [api.ONGOING_NOTIFICATION_ID, api.COMPLETION_NOTIFICATION_ID]);
    assert.deepEqual(mock.dismissals.slice(-2), [api.ONGOING_NOTIFICATION_ID, api.COMPLETION_NOTIFICATION_ID]);
  }
});
test("iOS retains immediate and interval triggers without Android channel fields", async () => {
  const api = load("src/services/sessionNotificationService.ts", {}), mock = notificationMock();
  await api.createSessionNotificationLifecycle(mock.api, "ios", { sound: false, haptics: false }).schedule(30);
  assert.equal(mock.requests[0].trigger, null);
  assert.deepEqual(mock.requests[1].trigger, { type: "timeInterval", seconds: 30, repeats: false });
  assert.equal(mock.requests[1].content.priority, undefined);
  assert.equal(mock.requests[1].content.title, "Time well spent");
  assert.equal(mock.requests[1].content.body, "Your session is finished. Open LifeRPG to see your progress.");
  assert.equal(mock.channels.length, 0);
});

test("native takeover propagates legacy cancellation failure and never creates competing fallback alerts", async () => {
  const service = load("src/services/sessionNotificationService.ts", {}), mock = notificationMock();
  const lifecycle = service.createSessionNotificationLifecycle(mock.api, "android", { sound: true, haptics: true });
  await lifecycle.schedule(60);
  const original = mock.api.cancelScheduledNotificationAsync;
  let fail = true;
  mock.api.cancelScheduledNotificationAsync = async id => {
    if (id === service.COMPLETION_NOTIFICATION_ID && fail) { fail = false; throw Error("cancellation not confirmed"); }
    return original(id);
  };
  await assert.rejects(lifecycle.clearForNative(), /cancellation not confirmed/);
  const posted = mock.requests.length;
  await lifecycle.schedule(60); await lifecycle.refreshOngoing();
  assert.equal(mock.requests.length, posted);
  await lifecycle.clearForNative();
  assert.deepEqual(mock.cancellations.slice(-2), [service.ONGOING_NOTIFICATION_ID, service.COMPLETION_NOTIFICATION_ID]);
  assert.deepEqual(mock.dismissals.slice(-2), [service.ONGOING_NOTIFICATION_ID, service.COMPLETION_NOTIFICATION_ID]);
  await lifecycle.dispose();
});

test("native takeover cannot succeed without the legacy scheduler or after disposal", async () => {
  const service = load("src/services/sessionNotificationService.ts", {}), mock = notificationMock();
  const unavailable = service.createSessionNotificationLifecycle(null, "android", { sound: true, haptics: true });
  await assert.rejects(unavailable.clearForNative());
  const disposed = service.createSessionNotificationLifecycle(mock.api, "android", { sound: true, haptics: true });
  await disposed.dispose(); await assert.rejects(disposed.clearForNative());
});
test("effect reactivation restores scheduling and preference changes apply to the next alert", async () => {
  const api = load("src/services/sessionNotificationService.ts", {}), mock = notificationMock();
  const lifecycle = api.createSessionNotificationLifecycle(mock.api, "android", { sound: true, haptics: true });
  await lifecycle.dispose(); await lifecycle.schedule(30);
  assert.equal(mock.requests.length, 0);
  lifecycle.activate(); lifecycle.setPreferences({ sound: false, haptics: false });
  await lifecycle.schedule(60);
  assert.equal(mock.requests.at(-1).trigger.channelId, api.completionChannelId({ sound: false, haptics: false }));
  assert.equal(mock.requests.at(-1).content.sound, false);
});
test("late native work and background refresh cannot resurrect notifications after teardown/account switch", async () => {
  const api = load("src/services/sessionNotificationService.ts", {}), mock = notificationMock(), pending = deferred();
  const schedule = mock.api.scheduleNotificationAsync;
  mock.api.scheduleNotificationAsync = async request => { await pending.promise; return schedule(request); };
  const oldAccount = api.createSessionNotificationLifecycle(mock.api, "android", { sound: true, haptics: true });
  const starting = oldAccount.schedule(60);
  await new Promise(resolve => setImmediate(resolve));
  const refresh = oldAccount.refreshOngoing();
  const clearing = oldAccount.clear();
  pending.resolve(); await Promise.all([starting, refresh, clearing]);
  assert.equal(mock.requests.some(r => r.identifier === api.COMPLETION_NOTIFICATION_ID), false);
  assert.equal(mock.cancellations.at(-1), api.COMPLETION_NOTIFICATION_ID);
  const nextAccount = api.createSessionNotificationLifecycle(mock.api, "android", { sound: false, haptics: false });
  await Promise.all([oldAccount.clear(), nextAccount.schedule(30)]);
  assert.equal(mock.requests.at(-1).trigger.seconds, 30);
  await oldAccount.dispose();
  await nextAccount.schedule(60);
  const count = mock.requests.length;
  // A late server RPC returning to the unmounted provider cannot replace alerts.
  await oldAccount.schedule(90);
  await oldAccount.refreshOngoing();
  assert.equal(mock.requests.length, count);
  assert.equal(mock.requests.at(-1).trigger.seconds, 60);
});
test("provider start/pause/resume/end and completion replace or clear both real notification identifiers", async () => {
  const mock = notificationMock(), ui = await providerSetup({}, mock.api);
  try {
    await ui.run(s => s.startTimer(930, "Read"));
    assert.equal(mock.requests.at(-1).trigger.seconds, 930);
    await ui.advance(31); await ui.run(s => s.pauseTimer());
    assert.deepEqual(mock.cancellations.slice(-2), ["life-rpg-ongoing-timer", "life-rpg-completion-timer"]);
    await ui.run(s => s.resumeTimer());
    assert.equal(mock.requests.at(-1).trigger.seconds, 899);
    await ui.run(s => s.resetTimer());
    assert.deepEqual(mock.dismissals.slice(-2), ["life-rpg-ongoing-timer", "life-rpg-completion-timer"]);
    await ui.run(s => s.startTimer(60)); await ui.advance(61);
    assert.equal(ui.calls.filter(([name]) => name === "complete").length, 1);
    assert.equal(mock.cancellations.at(-1), "life-rpg-completion-timer");
  } finally { await ui.cleanup(); }
});

test("backgrounding restores a dismissed ongoing banner without replacing the finish alert, and never restores it after Pause or End", async () => {
  const mock = notificationMock(), ui = await providerSetup({}, mock.api);
  const banners = () => mock.requests.filter(r => r.identifier === 'life-rpg-ongoing-timer').length;
  const finish = () => mock.requests.filter(r => r.identifier === 'life-rpg-completion-timer').length;
  try {
    await ui.run(s => s.startTimer(120, 'Read'));
    const initial = banners(), alarms = finish();
    await mock.api.dismissNotificationAsync('life-rpg-ongoing-timer');
    await ui.foreground(); await ui.background();
    assert.equal(banners(), initial + 1); assert.equal(finish(), alarms);
    await ui.foreground(); await ui.background(); assert.equal(banners(), initial + 2);
    await ui.run(s => s.pauseTimer()); const paused = banners();
    await ui.background(); assert.equal(banners(), paused);
    await ui.run(s => s.resumeTimer()); await ui.run(s => s.resetTimer()); const ended = banners();
    await ui.background(); assert.equal(banners(), ended);
  } finally { await ui.cleanup(); }
});

test("Start keeps its Pause label visible while confirmation is in flight", async () => {
  const ui = await screenSetup({ hasOpenSession:true, isRunning:true, awaitingStart:true, interactionKind:'start', actionBusy:true });
  try {
    assert.ok(ui.button('Pause')); assert.equal(ui.button('Pause').props.disabled, true);
    assert.equal(ui.root().findAllByType('Spinner').length, 0);
  } finally { await ui.cleanup(); }
});

test("the session route never inserts a second End sheet while global confirmation is pending",async()=>{
  const ui=await screenSetup({hasOpenSession:false,endingSession:true,actionBusy:true,actionError:'Waiting to confirm your saved session state.'});
  try {
    assert.equal(ui.root().findAllByType('CompletionPopup').length,0);
    assert.equal(ui.root().findAllByType('Sheet').filter(node=>node.props.label==='session ended').length,0);
    assert.equal(ui.button('Retry ending session'),undefined);
    await ui.update({actionBusy:false});assert.equal(ui.button('Retry ending session'),undefined);
  }finally{await ui.cleanup();}
});
test("Done before a completion reply closes pending presentation, then confirms once without replaying rewards", async () => {
  let completions=0;
  const pending = deferred(), ui = await providerSetup({completeActivitySession:()=>{completions++;return pending.promise;}});
  try {
    await ui.run(s=>s.startTimer(60)); await ui.advance(60);
    assert.equal(ui.state().isCompleted,true); assert.equal(ui.state().sessionSummary,null);
    await ui.run(s=>{s.clearCompletionModal();s.acknowledgeSummary();});
    assert.equal(ui.state().isCompleted,false); assert.equal(ui.state().sessionSummary,null);
    await ui.run(()=>pending.resolve(result));
    assert.ok(ui.state().sessionSummary);
    assert.equal(ui.state().summaryViewed,false); assert.equal(ui.state().rewardsVisible,false);
    assert.equal(ui.state().sessionSummary.recovered,true);
    await ui.run(s=>{s.clearCompletionModal();s.acknowledgeSummary();});
    assert.equal(ui.state().sessionSummary,null);
    await ui.run(s=>s.retryCompletion());
    assert.equal(completions,1);
    assert.equal(ui.calls.filter(([name])=>name==='cancel').length,0);
  } finally {await ui.cleanup();}
});
test("saving an End request clears alerts immediately and never completes while cancellation is pending", async () => {
  const mock = notificationMock(), ui = await providerSetup({ cancelActivitySession: async () => { throw Error("Poor signal"); } }, mock.api);
  try {
    await ui.run(s => s.startTimer(60));
    const scheduled = mock.requests.length;
    await ui.run(s => s.resetTimer());
    assert.equal(ui.state().endingSession, true); assert.equal(ui.state().unsyncedSessionCount, 1);
    assert.deepEqual(mock.cancellations.slice(-2), ["life-rpg-ongoing-timer", "life-rpg-completion-timer"]);
    await ui.advance(35);
    assert.equal(ui.state().isCompleted, false); assert.equal(ui.state().endingSession, true);
    assert.equal(mock.requests.length, scheduled);
    assert.equal(ui.calls.filter(([name]) => name === "complete").length, 0);
  } finally { await ui.cleanup(); }
});
test("restore replaces active alerts and clears paused/absent stale alerts", async () => {
  for (const status of ["active", "paused", null]) {
    const mock = notificationMock(), ui = await providerSetup({ getOpenActivitySession: async () => status && ({
      id: "saved", task_id: null, subject_id: null, activity_type: "other", target_duration_seconds: 930,
      elapsed_seconds: 31, status, notes: "", last_resumed_at: new Date(PROVIDER_NOW).toISOString(),
    }) }, mock.api);
    try {
      assert.deepEqual(mock.cancellations.slice(-2), ["life-rpg-ongoing-timer", "life-rpg-completion-timer"]);
      if (status === "active") assert.equal(mock.requests.at(-1).trigger.seconds, 899);
      else assert.equal(mock.requests.length, 0);
    } finally { await ui.cleanup(); }
  }
});
test("native scheduling/channel/cancellation failures never turn successful timer actions into failures", async () => {
  const mock = notificationMock();
  for (const name of ["setNotificationChannelAsync", "cancelScheduledNotificationAsync", "dismissNotificationAsync", "scheduleNotificationAsync"]) {
    mock.api[name] = async () => { throw Error("Native unavailable"); };
  }
  const ui = await providerSetup({}, mock.api);
  try {
    await ui.run(s => s.startTimer(60)); assert.equal(ui.state().isRunning, true);
    await ui.run(s => s.pauseTimer()); assert.equal(ui.state().isRunning, false);
    await ui.run(s => s.resumeTimer()); assert.equal(ui.state().isRunning, true);
    await ui.advance(61);
    assert.equal(ui.state().actionError, null);
    assert.equal(ui.calls.filter(([name]) => name === "complete").length, 1);
    await ui.run(s => s.resetTimer()); assert.equal(ui.state().hasOpenSession, false);
  } finally { await ui.cleanup(); }
});
test("notification listener initialization failure leaves the timer usable", async () => {
  const mock = notificationMock();
  mock.api.addNotificationResponseReceivedListener = () => { throw Error("Unavailable native listener"); };
  const ui = await providerSetup({}, mock.api);
  try {
    await ui.run(s => s.startTimer(60));
    assert.equal(ui.state().isRunning, true);
    await ui.advance(61);
    assert.equal(ui.state().actionError, null);
    assert.equal(ui.calls.filter(([name]) => name === "complete").length, 1);
  } finally { await ui.cleanup(); }
});

 test("Home setup after a saved one-minute completion releases the old ID and starts once", async () => {
  let starts = 0;
  const ui = await providerSetup({
    startActivitySession: async () => `session-${++starts}`,
    completeActivitySession: async () => ({ ...result, duration_seconds: 60, minutes: 1, xp_earned: 0, gold_earned: 0 }),
  });
  try {
    await ui.run(s => s.startTimer(60));
    await ui.advance(60);
    assert.ok(ui.state().sessionSummary);
    await ui.run(s => s.clearCompletionModal());
    await ui.run(s => { s.setLinkedTaskId(null); s.setDurationInMinutes(30); });
    assert.equal(ui.state().isCompleted, false);
    await ui.run(s => s.startTimer(1800));
    assert.equal(starts, 2);
    assert.equal(ui.state().hasOpenSession, true);
    assert.equal(ui.calls.filter(c => c[0] === "cancel").length, 0);
  } finally { await ui.cleanup(); }
});

test("duration changes cannot abandon an in-flight or failed completion", async () => {
  const pending = deferred();
  const ui = await providerSetup({ completeActivitySession: () => pending.promise });
  try {
    await ui.run(s => s.startTimer(60));
    await ui.advance(60);
    await ui.run(s => s.setDurationInMinutes(30));
    assert.equal(ui.state().isCompleted, true);
    assert.equal(ui.state().duration, 60);
    await ui.run(() => pending.reject(Error("Offline")));
    await ui.run(s => s.setDurationInMinutes(30));
    assert.equal(ui.state().isCompleted, true);
    assert.equal(ui.state().duration, 60);
    assert.match(ui.state().actionError, /Waiting to confirm your progress/);
  } finally { await ui.cleanup(); }
});

test("completed setup keeps presets and custom durations editable before the next Start", async () => {
  const ui = await providerSetup({ completeActivitySession: async () => ({ ...result, duration_seconds: 60, minutes: 1 }) });
  try {
    await ui.run(s => s.startTimer(60));
    await ui.advance(60);
    await ui.run(s => s.setDurationInMinutes(60));
    assert.equal(ui.state().duration, 3600);
    await ui.run(s => s.setDurationInSeconds(2700));
    assert.equal(ui.state().duration, 2700);
    await ui.run(s => s.setDurationInSeconds(2715));
    assert.equal(ui.state().duration, 2715);
    await ui.run(s => s.startTimer(ui.state().duration));
    assert.equal(ui.state().hasOpenSession, true);
    assert.equal(ui.calls.filter(c => c[0] === "start").at(-1)[1].targetDurationSeconds, 2715);
  } finally { await ui.cleanup(); }
});

test("saved completion carries independent XP banks and server goal credit without local awards", async () => {
  let completions = 0;
  const ui = await providerSetup({ completeActivitySession: async () => { completions++; return ({ ...result, credit_version: 1, duration_seconds: 60, xp_earned: 1, gold_earned: 0, area_xp_earned: 0, character_remainder_seconds: 15, area_remainder_seconds: 30, daily_completed_seconds: 60, goal_reached_now: true, credited_date: "2026-10-04" }); } });
  try {
    await ui.run(s => s.startTimer(60));
    await ui.advance(60);
    const summary = ui.state().sessionSummary;
    assert.equal(summary.xpEarned, 1);
    assert.equal(summary.areaXpEarned, 0);
    assert.equal(summary.characterRemainderSeconds, 15);
    assert.equal(summary.areaRemainderSeconds, 30);
    assert.equal(summary.dailyCompletedSeconds, 60);
    assert.equal(summary.goalReachedNow, true);
    await ui.run(s => s.clearCompletionModal());
    assert.equal(ui.state().sessionSummary, null);
    await ui.run(s => s.retryCompletion());
    assert.equal(completions, 1);
  } finally { await ui.cleanup(); }
});

test("the focus area row selects the saved Life area without touching quest or duration", async()=>{
  const ui=await screenSetup({}, {subjects:[{id:1,title:"General"},{id:2,title:"Study",color_code:"#25C9B8"}]});
  await ui.press("Choose category");
  await ui.press("Learning");
  assert.deepEqual(ui.calls,[["area",2]]);
  await ui.update({targetAttributeId:2});
  assert.equal(ui.button("Choose category").props.accessibilityValue.text,"Learning");
  await ui.press("Use 60 minutes");
  assert.deepEqual(ui.calls.at(-1),["seconds",3600]);
  await ui.update({duration:3600,timeLeft:3600});
  await ui.press("Start");
  assert.deepEqual(ui.calls.at(-1),["start",3600,undefined]);
  await ui.cleanup();
});

test("Session area choices share canonical labels and preserve a selected legacy ID without duplicates", async()=>{
  const ui=await screenSetup({targetAttributeId:3}, {subjects:[{id:1,title:"General"},{id:2,title:"Fitness & Health"},{id:3,title:"Grooming & Vitality"},{id:4,title:"Work"},{id:5,title:"Creative practice"}]});
  try {
    await ui.press("Choose category");
    const choices=ui.root().findAllByType("Button").filter(node=>/^Wellbeing(\. |$)/.test(node.props.accessibilityLabel??""));
    assert.equal(choices.length,1);assert.equal(choices[0].props.accessibilityState.checked,true);
    await ui.press("Wellbeing");assert.deepEqual(ui.calls,[["area",3]]);
    await ui.press("Choose category");
    assert.ok(ui.button("Work & projects"));assert.ok(ui.button("Creativity"));
  } finally {await ui.cleanup();}
});

test("the completed route does not render an additional area reward below the shared result",async()=>{
  const ui=await screenSetup({isCompleted:true,timeLeft:0,sessionSummary:{durationSeconds:60,xpEarned:1,goldEarned:0,creditVersion:1,areaXpEarned:null}});
  try{assert.doesNotMatch(ui.output(),/Character XP|Focus area XP|Everyday focus\+1 XP/);assert.equal(ui.button("New session"),undefined);}
  finally{await ui.cleanup();}
});
test("every Life area is reachable from one focus area sheet",async()=>{
  const subjects=Array.from({length:5},(_,i)=>({id:i+1,title:i===0?"General":`Area ${i+1}`}));
  const ui=await screenSetup({}, {subjects});
  await ui.press("Choose category");
  for(const area of subjects) assert.ok(ui.button(area.title === "General" ? "Everyday focus" : area.title));
  await ui.press("Area 5");
  assert.deepEqual(ui.calls.at(-1),["area",5]);
  await ui.cleanup();
  const extra=await screenSetup({}, {subjects:[...subjects,{id:6,title:"Six"},{id:7,title:"Seven"}]});
  await extra.press("Choose category");
  await extra.press("Seven");
  assert.deepEqual(extra.calls.at(-1),["area",7]);
  await extra.cleanup();
});

test("completion message shows saved exact duration; Done only closes the message", async () => {
  const calls=[];
  const saveAction=React.createElement('GuidedBoundary',{compact:true});
  const scrollResets=[];
  let fontScale=1;
  const CompletionScroll=React.forwardRef((props,ref)=>{
    React.useImperativeHandle(ref,()=>({scrollTo:position=>scrollResets.push(position)}),[]);
    return React.createElement('Scroll',props,props.children);
  });
  const Modal=load("src/components/SessionResultSheet.tsx",{
    "react-native-svg":{__esModule:true,default:host("Svg"),Defs:host("Defs"),RadialGradient:host("RadialGradient"),Rect:host("Rect"),Stop:host("Stop")},
    "react-native":{View:host("View"),Text:host("Text"),Modal:host("Modal"),ScrollView:host("Scroll"),TouchableOpacity:host("Button"),StyleSheet:{create:s=>s,hairlineWidth:1},useWindowDimensions:()=>({fontScale})},
    "react-native-safe-area-context":{SafeAreaView:host("SafeArea"),useSafeAreaInsets:()=>({bottom:34,top:24})},
    "@gorhom/bottom-sheet":{BottomSheetScrollView:CompletionScroll},
    "./AppSheet":p=>React.createElement("PopupSheet",p,p.header,p.children,p.footer),
    "./ArrivalBanner":require("./helpers/arrival-banner-mock.cjs"),
    "@expo/vector-icons":{Ionicons:host("Icon")},
    "./ProgressRing":host("Ring"),
    "../context/UserContext":{useUser:()=>({hapticsEnabled:false})},
    "../hooks/useReducedMotion":{useReducedMotion:()=>true},
    "expo-haptics":{},
  }).default;
  let renderer;
  await act(async()=>{renderer=create(React.createElement(Modal,{visible:true,sessionId:'result-a',durationSeconds:90,saveAction,goalReachedNow:false,onClose:()=>calls.push("close")}));});
  const text=node=>typeof node==="string"?node:(node.children??[]).map(text).join("");
  try {
    const sheet=renderer.root.findByType("PopupSheet");
    assert.equal(sheet.props.label,"session completion");
    assert.equal(sheet.props.expanded,true);
    assert.ok(sheet.props.heightRatio < 0.85, 'ordinary results open around their content instead of filling most of the screen');
    assert.equal(sheet.props.motionMode,'timed');
    assert.equal(sheet.props.maxHeightRatio,0.85);
    assert.ok(sheet.props.footer, 'actions are anchored by the native footer after the sheet measures and resizes');
    const scroll=renderer.root.findByType('Scroll');
    assert.equal(scroll.props.enableFooterMarginAdjustment,true, 'scrollable details reserve the native footer height');
    const actions=renderer.root.findByProps({testID:'session-result-actions'});
    assert.equal([].concat(actions.props.style)[0].flexShrink,0);
    assert.equal(scroll.props.style.flex,1);
    assert.equal(scroll.findAllByType('Button').length,0,'Done and Save as quest must not require scrolling through result details');
    assert.equal(actions.findByType('Button').props.accessibilityRole,'button');
    assert.equal(text(actions.findByType('Button')),'Back to today');
    assert.equal(actions.findByType('GuidedBoundary').props.compact,true);
    assert.equal(renderer.root.findAll(node=>node.props.testID==='session-result-card'&&typeof node.type==='string').length,1,'the card opens on the warm time card (mockup 07)');
    assert.deepEqual(scrollResets,[{y:0,animated:false}]);
    assert.equal(renderer.root.findByProps({testID:'session-result-card'}).findAll(node=>node.props.accessibilityLabel==='1 min 30 sec focused').length>0,true,'the exact saved duration');
    assert.match(text(renderer.root),/1min 30 sec focused/);
    assert.match(text(renderer.root),/Focus day recorded/);assert.doesNotMatch(text(renderer.root),/XP|Level/);
    assert.doesNotMatch(text(renderer.root),/Daily goal reached|Gold earned|seconds carried/);
    await act(async()=>renderer.update(React.createElement(Modal,{visible:true,sessionId:'result-a',pending:true,recovered:true,durationSeconds:90,saveAction,onClose:()=>calls.push('close')})));
    // Online and still confirming: laid out as finished, numbers filling in, never claimed as recorded yet.
    assert.match(text(renderer.root),/You made room\..*Adding this to your day…/);
    assert.doesNotMatch(text(renderer.root),/Focus day recorded|Progress saved|Recorded ✓|recorded ✓/);
    assert.doesNotMatch(text(renderer.root),/now saved to your account/);
    assert.ok(sheet.props.heightRatio <= 0.85, 'pending results keep actions within the capped sheet');
    await act(async()=>renderer.update(React.createElement(Modal,{visible:true,sessionId:'result-a',recovered:true,completedAtMs:Date.UTC(2026,9,11,1,23),durationSeconds:90,saveAction,onClose:()=>calls.push('close')})));
    assert.match(text(renderer.root),/Earlier session saved.*Finished 11 Oct 2026/);
    assert.match(text(renderer.root),/now saved to your account/);
    assert.equal(scrollResets.length,1, 'receipt arrival must preserve scroll rather than jump to the top');
    await act(async()=>renderer.root.findByType('Scroll').props.onLayout()); assert.equal(scrollResets.length,1);
    await act(async()=>renderer.update(React.createElement(Modal,{visible:true,sessionId:'result-b',durationSeconds:60,saveAction,onClose:()=>calls.push('close')})));
    assert.equal(scrollResets.length,2, 'a new result always begins at the top');
    fontScale=1.6;
    await act(async()=>renderer.update(React.createElement(Modal,{visible:true,sessionId:'result-b',durationSeconds:60,saveAction,onClose:()=>calls.push('close')})));
    assert.equal(renderer.root.findAll(node=>node.props.testID==='session-result-card'&&typeof node.type==='string').length,1,'large text keeps the time card, which grows with its words, and the actions');
    assert.equal(renderer.root.findByProps({testID:'session-result-actions'}).findByType('Button').props.accessibilityRole,'button');
    assert.equal(scrollResets.length,2);
    await act(async()=>renderer.root.findByType("Button").props.onPress());
    assert.deepEqual(calls,["close"]);
  } finally {await act(async()=>renderer.unmount());}
});





test("floating dock reserves the safe area and only visible banners",()=>{
  const {floatingTabInset}=load("src/utils/floatingTabInset.ts",{});
  // Round 86: no tab pill is reserved (there has been none since Round 84).
  assert.equal(floatingTabInset(66,34,{}),44,"an empty dock is the safe area and its padding");
  assert.equal(floatingTabInset(66,0,{hasOpenSession:true}),82);
  assert.equal(floatingTabInset(66,34,{hasOpenSession:true}),104);
  assert.equal(floatingTabInset(66,0,{sessionSummary:{},summaryViewed:false}),82);
  assert.equal(floatingTabInset(66,0,{sessionSummary:{},summaryViewed:true}),10);
});

test('switching offline suppresses online pickers and End confirmation without losing the active session',async()=>{
  const ui=await screenSetup({hasOpenSession:true,isRunning:true});
  try{
    await ui.press('End session');assert.equal(ui.root().findAllByType('Confirm').length,1);
    await ui.update({accessMode:'local-only'});assert.equal(ui.root().findAllByType('Confirm').length,0);
    await ui.update({accessMode:'online'});assert.equal(ui.root().findAllByType('Confirm').length,0);
    assert.ok(ui.button('Pause'));assert.equal(ui.root().findAllByType('CompletionPopup').length,0);
  }finally{await ui.cleanup();}
});
test('the retained online Study subject picker closes on disconnect and stays closed on reconnect',async()=>{
  const ui=await screenSetup();
  try{
    await ui.mode('study');
    await act(async()=>ui.root().findByType('SubjectRow').props.onOpenChange(true));
    assert.equal(ui.root().findByType('SubjectRow').props.open,true);
    await ui.update({accessMode:'local-only'});
    assert.equal(ui.root().findByType('SubjectRow').props.open,false);
    assert.equal(ui.root().findByType('SubjectRow').props.disabled,true);
    await ui.update({accessMode:'online'});
    assert.equal(ui.root().findByType('SubjectRow').props.open,false);
    assert.equal(ui.calls.some(call=>call[0]==='start'),false);
  }finally{await ui.cleanup();}
});
test("free and quest starts reveal visible controls and settle the same mounted timer stage", async () => {
  for (const linkedTaskId of [null, 7]) {
    const ui = await screenSetup({linkedTaskId}, {}, false, {value:false});
    const control = ui.root().findByType("DurationControl");
    const stage = ui.root().findByProps({testID:"session-timer-stage"});
    await act(async () => stage.props.onLayout({nativeEvent:{layout:{y:4}}}));
    // Setup settling into place while the screen opens snaps; nothing bounces in.
    await act(async () => stage.props.onLayout({nativeEvent:{layout:{y:60}}}));
    await act(async () => stage.props.onLayout({nativeEvent:{layout:{y:4}}}));
    assert.equal(ui.animations.some(a => a.duration === 300), false);
    ui.animations.length = 0; // Ignore the route entry animation already verified elsewhere.
    await ui.press("Start");
    await act(async () => ui.root().findByType("Backdrop").props.onIntroEnd()); // The walk ends, then the session starts.
    assert.equal(ui.calls.filter(c => c[0] === "start").length, 1);
    await ui.update({actionBusy:true});
    assert.equal(ui.animations.some(a => a.duration === 280 && a.from === 0), false);
    await ui.update({actionBusy:false,hasOpenSession:true,isRunning:true,timeLeft:1800});
    assert.equal(ui.root().findByType("DurationControl"), control);
    assert.equal(ui.root().findByProps({testID:"session-timer-stage"}), stage);
    assert.ok(ui.animations.some(a => a.duration === 280 && a.from === 0 && a.toValue === 1 && a.useNativeDriver));
    const details = ui.root().findByProps({testID:"session-details-motion"});
    const actions = ui.root().findByProps({testID:"session-actions-motion"});
    assert.equal(details.props.style.opacity, actions.props.style[1].opacity);
    await act(async () => stage.props.onLayout({nativeEvent:{layout:{y:104}}}));
    assert.ok(ui.animations.some(a => a.duration === 300 && a.from === -100 && a.toValue === 0 && a.useNativeDriver));
    const phaseAnimations = () => ui.animations.filter(a => a.duration === 280 || a.duration === 300).length;
    const count = phaseAnimations();
    await ui.update({timeLeft:1799});
    assert.equal(phaseAnimations(), count);
    assert.equal(control.props.seconds, 1799);
    await ui.update({isRunning:false});
    assert.ok(ui.button("Resume"));
    assert.equal(ui.root().findByType("DurationControl"), control);
    await ui.cleanup();
  }
});

test("reduced motion keeps phase controls readable and skips timer relocation animation", async () => {
  const ui = await screenSetup({}, {}, false, {value:true});
  const stage = ui.root().findByProps({testID:"session-timer-stage"});
  await act(async () => stage.props.onLayout({nativeEvent:{layout:{y:4}}}));
  await ui.update({hasOpenSession:true,isRunning:true});
  await act(async () => stage.props.onLayout({nativeEvent:{layout:{y:104}}}));
  assert.equal(ui.animations.some(a => a.duration === 280 || a.duration === 300), false);
  assert.equal(ui.root().findByProps({testID:"session-actions-motion"}).props.style[1].opacity.value, 1);
  assert.ok(ui.button("Pause"));
  await ui.cleanup();
});

test("a newly merged live timer object on every render cannot loop the retained session snapshot", async () => {
  const ui = await screenSetup({sessionId:"fresh-wrapper",hasOpenSession:true,isRunning:true,duration:60,timeLeft:47}, {}, true, {value:false}, "android", true);
  try {
    assert.equal(ui.root().findByType("DurationControl").props.seconds,47);
    await ui.update({timeLeft:46});
    assert.equal(ui.root().findByType("DurationControl").props.seconds,46);
    await ui.press("Pause"); assert.equal(ui.calls.filter(([name])=>name==="pause").length,1);
    await ui.press("End session"); await act(async()=>ui.root().findByType("Confirm").props.onConfirm());
    await ui.update({hasOpenSession:false,sessionEnded:true,isRunning:false,duration:1800,timeLeft:1800});
    assert.equal(ui.root().findByType("DurationControl").props.seconds,46,"End keeps the final actual reading, not the reset draft");
    assert.equal(ui.calls.filter(([name])=>name==="reset").length,1);
  } finally { await ui.cleanup(); }
});

test("Start sets off first: the session starts only once the walk ends or is skipped, so it takes none of your time", async()=>{
  const ui=await screenSetup({},{},false,{value:false});
  try {
    const backdrop=()=>ui.root().findByType("Backdrop").props;
    const starts=()=>ui.calls.filter(c=>c[0]==="start");
    assert.equal(backdrop().phase,"setup");
    await ui.press("Start");
    assert.equal(starts().length,0,"nothing is counting while you walk away");
    assert.deepEqual([backdrop().phase,backdrop().intro,backdrop().walking],["running",true,true],"the walk plays on the trail scene");
    assert.equal(ui.root().findAllByType("IntroWords").length,1);
    await act(async()=>backdrop().onIntroEnd());
    assert.deepEqual(starts(),[["start",1800,undefined]],"the session starts when the walk ends, with the length you chose");
    assert.equal(backdrop().intro,false);
    assert.equal(ui.root().findAllByType("IntroWords").length,0);
    assert.equal(backdrop().phase,"running","the night stays while the start is confirmed: no flash of setup");
    await ui.update({awaitingStart:true});await ui.update({awaitingStart:false,hasOpenSession:true,isRunning:true,timeLeft:1800});
    assert.equal(backdrop().phase,"running");
    await act(async()=>backdrop().onIntroEnd());
    assert.equal(starts().length,1,"a late second end never starts twice");
  } finally {await ui.cleanup();}
});

test("skipping starts the session as soon as the quick fade ends; Back while setting off stays here without starting", async()=>{
  const ui=await screenSetup({},{},false,{value:false});
  try {
    const backdrop=()=>ui.root().findByType("Backdrop").props;
    const starts=()=>ui.calls.filter(c=>c[0]==="start");
    await ui.press("Start");
    const token=backdrop().skipToken;
    await act(async()=>ui.root().findByType("IntroWords").props.onSkip());
    assert.equal(backdrop().skipToken,token+1,"the scene finishes quickly");
    assert.equal(starts().length,0,"and the session waits for it");
    await act(async()=>backdrop().onIntroEnd());
    assert.equal(starts().length,1);
    await ui.cleanup();
    const again=await screenSetup({},{},false,{value:false});
    await again.press("Start");
    await again.back();
    assert.equal(again.root().findByType("Backdrop").props.intro,false,"Back cancels setting off");
    assert.equal(again.calls.filter(c=>c[0]==="dismiss").length,0,"and stays on setup");
    await act(async()=>again.root().findByType("Backdrop").props.onIntroEnd());
    assert.equal(again.calls.filter(c=>c[0]==="start").length,0,"nothing starts after a cancelled walk");
    await again.press("Start");
    await act(async()=>again.root().findByType("Backdrop").props.onIntroEnd());
    assert.equal(again.root().findByType("Backdrop").props.phase,"running");
    await again.update({actionError:"Couldn't start. Check your connection."});
    assert.equal(again.root().findByType("Backdrop").props.phase,"setup","a failed start shows setup again, with its message");
    await again.cleanup();
  } catch (error) { await ui.cleanup().catch(()=>{}); throw error; }
});

test("no walk with Reduce Motion, for a session already running, or after the account changes mid-walk", async()=>{
  const reduced=await screenSetup({},{},false,{value:true});
  try {
    await reduced.press("Start");
    assert.equal(reduced.calls.filter(c=>c[0]==="start").length,1,"less motion starts at once");
    assert.equal(reduced.root().findByType("Backdrop").props.intro,false);
  } finally {await reduced.cleanup();}
  const running=await screenSetup({sessionId:"already",hasOpenSession:true,isRunning:true,duration:60,timeLeft:60},{},false,{value:false});
  try { assert.equal(running.root().findByType("Backdrop").props.intro,false,"a session started elsewhere opens straight on the timer"); } finally {await running.cleanup();}
  const switched=await screenSetup({},{},false,{value:false});
  try {
    await switched.press("Start");
    const end=switched.root().findByType("Backdrop").props.onIntroEnd;
    await switched.update({ownerId:"owner-b"});
    assert.equal(switched.root().findByType("Backdrop").props.intro,false,"another account never sees this walk");
    await act(async()=>end());
    assert.equal(switched.calls.filter(c=>c[0]==="start").length,0,"and nothing starts for them");
  } finally {await switched.cleanup();}
});

test("manual End preserves measured details and action space and never animates the stopped timer behind its result", async () => {
  const ui = await screenSetup({sessionId:"end-layout",hasOpenSession:true,isRunning:true,duration:60,timeLeft:47}, {}, true, {value:false});
  try {
    const stage = ui.root().findByProps({testID:"session-timer-stage"});
    const flatten = value => [].concat(value).filter(Boolean).reduce((all,part)=>({...all,...part}),{});
    await act(async()=>{
      stage.props.onLayout({nativeEvent:{layout:{y:14}}});
      ui.root().findByType("Scroll").props.onLayout({nativeEvent:{layout:{height:68}}});
      ui.root().findByProps({testID:"session-actions-motion"}).props.onLayout({nativeEvent:{layout:{height:116}}});
    });
    ui.animations.length=0;
    await ui.press("End session"); await act(async()=>ui.root().findByType("Confirm").props.onConfirm());
    await ui.update({hasOpenSession:false,sessionEnded:true,isRunning:false});
    assert.equal(flatten(ui.root().findByType("Scroll").props.style).height,68);
    assert.equal(flatten(ui.root().findByProps({testID:"session-actions-motion"}).props.style).height,116);
    await act(async()=>stage.props.onLayout({nativeEvent:{layout:{y:44}}}));
    assert.equal(ui.animations.some(animation=>animation.duration===300),false,"a terminal layout must not bounce back to its old position");
    assert.equal(ui.button("End session"),undefined,"the spacer cannot remain an interactive End button");
    assert.equal(ui.button("Stopped").props.disabled,true);
    assert.equal(ui.root().findByType("DurationControl").props.seconds,47);
  } finally { await ui.cleanup(); }
});

test("reopening running and paused timers uses shared choices without another refresh; setup still refreshes", async () => {
  for (const isRunning of [true,false]) {
    let refreshes=0;
    const ui=await screenSetup({hasOpenSession:true,isRunning,timeLeft:600},{refresh:async()=>{refreshes++;}});
    try {
      assert.equal(refreshes,0);
      await ui.update({timeLeft:599});
      assert.equal(refreshes,0);
    } finally {await ui.cleanup();}
  }
  let refreshes=0;
  const ui=await screenSetup({}, {refresh:async()=>{refreshes++;}});
  try { assert.equal(refreshes,1); } finally {await ui.cleanup();}
});

test("saving a completed session leaves no hidden progress SVG composited over the trail", async () => {
  const ui=await screenSetup({hasOpenSession:true,isRunning:true,duration:60,timeLeft:1});
  try {
    assert.ok(ui.root().findAllByProps({testID:"session-arch"}).length>0,"the live timer sits in the arch (Round 85)");
    const stage=ui.root().findByProps({testID:"session-timer-stage"});
    await ui.update({hasOpenSession:false,isRunning:false,isCompleted:true,timeLeft:0});
    assert.equal(ui.root().findByProps({testID:"session-timer-stage"}),stage,"geometry stays mounted while saving");
    assert.equal(ui.root().findAllByType("Svg").length,0,"the invisible native SVG is no longer drawn under the saving portal");
    assert.ok(ui.root().findByType("Backdrop"),"the expedition scene remains behind the result");
  } finally {await ui.cleanup();}
});

test("Quick Start atomically replaces stale quest draft, blocks rapid starts, and preserves exact settings on retry", async () => {
  const pending=deferred(); let count=0; const drafts=[];
  const ui=await providerSetup({startActivitySession: params => { drafts.push(params); return ++count === 1 ? pending.promise : Promise.resolve("quick-session"); }});
  try {
    await ui.run(s => {s.setLinkedTaskId(99);s.setTargetAttributeId(9);s.setActivityType("read");s.setNotes("quest notes");});
    let start;
    await ui.run(s => {start=s.startFreeTimer(1859,3);void s.startFreeTimer(900,4);});
    assert.equal(count,1);
    assert.deepEqual(drafts[0], {targetDurationSeconds:1859,activityType:"other",taskId:null,subjectId:3,notes:""});
    await ui.run(async () => {pending.reject(definitiveServerRejection()); assert.equal(await start,false);});
    assert.equal(ui.state().duration,1859);
    assert.equal(ui.state().targetAttributeId,3);
    assert.equal(ui.state().linkedTaskId,null);
    await ui.run(s => s.retryAction());
    assert.deepEqual(drafts[1],drafts[0]);
    assert.equal(ui.state().hasOpenSession,true);
    await ui.run(s => s.pauseTimer());
    await ui.run(async s => assert.equal(await s.startFreeTimer(900,null),false));
    assert.equal(count,2);
    assert.equal(ui.state().duration,1859);
  } finally {await ui.cleanup();}
});
test("Quick Start can begin after saved completion without cancelling or awarding again", async () => {
  let count=0; const ui=await providerSetup({startActivitySession:async()=>`id-${++count}`});
  try {
    await ui.run(s=>s.startTimer(60)); await ui.advance(60);
    assert.ok(ui.state().sessionSummary);
    await ui.run(async s=>assert.equal(await s.startFreeTimer(1800,null),true));
    assert.equal(count,2);
    assert.equal(ui.state().sessionSummary,null);
    assert.equal(ui.state().rewardsVisible,false);
    assert.equal(ui.calls.filter(c=>c[0]==="cancel").length,0);
    assert.equal(ui.calls.filter(c=>c[0]==="complete").length,1);
  } finally {await ui.cleanup();}
});
test("Quick Start cannot discard failed completion or restoration and rejects invalid duration", async () => {
  const ui=await providerSetup({completeActivitySession:async()=>{throw Error("Offline");}});
  try {
    await ui.run(async s=>assert.equal(await s.startFreeTimer(0,null),false));
    await ui.run(s=>s.startTimer(60)); await ui.advance(60);
    assert.equal(ui.state().sessionSummary,null);
    await ui.run(async s=>assert.equal(await s.startFreeTimer(1800,null),false));
    assert.equal(ui.state().isCompleted,true);
    assert.equal(ui.calls.filter(c=>c[0]==="start").length,1);
  } finally {await ui.cleanup();}
});

test("Session length row shows the 30-minute default and applies sheet presets", async()=>{
  const ui=await screenSetup();
  try {
    assert.equal(ui.button("Set a custom focus duration").props.accessibilityValue.text,"30 min");
    await ui.press("Use 60 minutes");
    assert.deepEqual(ui.calls.at(-1),["seconds",3600]);
    await ui.update({duration:3600,timeLeft:3600});
    assert.equal(ui.button("Set a custom focus duration").props.accessibilityValue.text,"60 min");
    await ui.press("Use 30 minutes");
    assert.deepEqual(ui.calls.at(-1),["seconds",1800]);
  } finally {await ui.cleanup();}
});

test("global Done closes the session route once with its existing fade while retaining no duplicate summary",async()=>{
  const ui=await screenSetup({isCompleted:true,sessionSummary:{durationSeconds:90,xpEarned:1,goldEarned:0}}, {}, true);
  try{
    assert.equal(ui.root().findAllByType('CompletionPopup').length,0);
    await ui.update({isCompleted:false,sessionSummary:null,summaryViewed:true});
    assert.equal(ui.calls.filter(c=>c[0]==='dismiss').length,0);
    assert.ok(ui.animations.some(animation=>animation.toValue===-0.12));
    await ui.finishExit();assert.equal(ui.calls.filter(c=>c[0]==='dismiss').length,1);
    assert.equal(ui.calls.filter(c=>c[0]==='reset'||c[0]==='complete').length,0);
  }finally{await ui.cleanup();}
});
test("End answers at once while the session is still being confirmed, then ends right after the confirmation",async()=>{
  const ui=await screenSetup({hasOpenSession:true,isRunning:true,actionBusy:true,interactionKind:"start"});
  try{
    assert.equal(ui.button('End session').props.disabled,false,'the ✕ works during the spinner');
    await ui.press('End session');await act(async()=>ui.root().findByType('Confirm').props.onConfirm());
    assert.equal(ui.calls.filter(c=>c[0]==='reset').length,0,'waits for the confirmation');
    assert.match(JSON.stringify(ui.root().findAllByType('Text').map(t=>t.props.children)),/Ending as soon as your session is confirmed/);
    await ui.update({actionBusy:false,interactionKind:null});await act(async()=>{await Promise.resolve();});
    assert.equal(ui.calls.filter(c=>c[0]==='reset').length,1,'then ends, once');
  }finally{await ui.cleanup();}
});
test("End still requires confirmation and a failed local save keeps the active route",async()=>{
  const ui=await screenSetup({hasOpenSession:true,isRunning:true});
  try{
    await ui.press('End session');assert.equal(ui.calls.filter(c=>c[0]==='reset').length,0);
    await act(async()=>ui.root().findByType('Confirm').props.onCancel());assert.ok(ui.button('Pause'));
    await ui.press('End session');await act(async()=>ui.root().findByType('Confirm').props.onConfirm());
    await ui.update({actionBusy:false,actionError:'Could not save on this phone.'});
    assert.equal(ui.calls.filter(c=>c[0]==='reset').length,1);assert.equal(ui.calls.filter(c=>c[0]==='dismiss').length,0);
    await ui.update({hasOpenSession:false,isRunning:false,sessionEnded:true,actionError:null});
    assert.equal(ui.calls.filter(c=>c[0]==='dismiss').length,0);
    await ui.update({sessionEnded:false,summaryViewed:true});assert.equal(ui.calls.filter(c=>c[0]==='dismiss').length,1);
  }finally{await ui.cleanup();}
});
test("repeated terminal-clear publications only dismiss the anchored session route once",async()=>{
  const ui=await screenSetup({isCompleted:true,sessionSummary:{durationSeconds:60,xpEarned:1,goldEarned:0}});
  try{
    await ui.update({isCompleted:false,sessionSummary:null,summaryViewed:true});await ui.update({});await ui.back();
    assert.equal(ui.calls.filter(c=>c[0]==='dismiss').length,1);
  }finally{await ui.cleanup();}
});
test("the 5-minute break asks first; keeping focus changes nothing", async () => {
  const ui = await screenSetup({hasOpenSession:true,isRunning:true,protectedSession:true,breakUsed:false,breakSecondsLeft:0});
  try {
    const confirm = () => ui.root().findAllByType("Confirm").find(node => node.props.title === "Take your 5-minute break?");
    assert.equal(confirm(), undefined);
    await ui.press("Take a break");
    assert.ok(confirm(), "a tap asks before the break starts");
    assert.equal(confirm().props.confirmLabel, "Start break");
    assert.equal(confirm().props.cancelLabel, "Keep focusing");
    assert.equal(ui.calls.filter(c => c[0] === "pause").length, 0, "nothing paused yet");
    await act(async () => confirm().props.onCancel());
    assert.equal(confirm(), undefined);
    assert.equal(ui.calls.filter(c => c[0] === "pause").length, 0, "keeping focus changes nothing");
    await ui.press("Take a break");
    await act(async () => confirm().props.onConfirm());
    assert.equal(ui.calls.filter(c => c[0] === "pause").length, 1, "Start break starts it once");
    assert.equal(confirm(), undefined);
  } finally { await ui.cleanup(); }
});

test("a finished session goes back to the app as soon as Done closes the result", async () => {
  const ui = await screenSetup({isCompleted:true,timeLeft:0,sessionSummary:{questTitle:"Read",durationSeconds:1800,xpEarned:30,goldEarned:5}});
  try {
    await ui.update({isCompleted:false,sessionSummary:null,summaryViewed:true});
    await act(async () => { await new Promise(done => setTimeout(done, 20)); });
    assert.equal(ui.root().findAllByType("SessionReveal").length, 0, "no return screen since Round 83");
    assert.equal(ui.calls.filter(c => c[0] === "dismiss").length, 1, "Done goes back to the app once, straight away");
  } finally { await ui.cleanup(); }
});

test("a pending protected control keeps its label and shows busy feedback after the first tap", async () => {
  const ui = await screenSetup({hasOpenSession:true,isRunning:true,protectedSession:true,breakUsed:false,breakSecondsLeft:0,actionBusy:true});
  try {
    const control = ui.button('Take a break');
    assert.ok(control);
    assert.equal(control.props.disabled,true);
    assert.equal(control.props.accessibilityState.busy,true);
    assert.equal(ui.root().findAllByType('Spinner').length,1);
    await ui.update({actionBusy:false});
    assert.equal(ui.button('Take a break').props.disabled,false);
    assert.equal(ui.root().findAllByType('Spinner').length,0);
  } finally { await ui.cleanup(); }
});

test("slow legacy control confirmation becomes visibly busy and clears on completion", async () => {
  const ui = await screenSetup({hasOpenSession:true,isRunning:false,actionBusy:true,interactionKind:'pause',syncStatus:'waiting'});
  try {
    assert.equal(ui.root().findAllByType('Spinner').length,0);
    await act(async () => { await new Promise(resolve => setTimeout(resolve,450)); });
    assert.equal(ui.root().findAllByType('Spinner').length,1);
    assert.equal(ui.button('Resume').props.disabled,true);
    await ui.update({actionBusy:false,interactionKind:null,syncStatus:'idle'});
    assert.equal(ui.root().findAllByType('Spinner').length,0);
    assert.equal(ui.button('Resume').props.disabled,false);
  } finally { await ui.cleanup(); }
});

test("Pause and Resume feedback keeps controls readable without a spinner, confirmation flash or phase fade",async()=>{
  const ui=await screenSetup({hasOpenSession:true,isRunning:false,actionBusy:true,interactionKind:"pause",syncStatus:"waiting"});
  try {
    assert.ok(ui.button("Resume"));assert.equal(ui.root().findAllByType("Spinner").length,0);
    assert.doesNotMatch(ui.output(),/Waiting to confirm/);
    const fades=ui.animations.filter(animation=>animation.duration===280).length;
    await ui.update({isRunning:true,interactionKind:"resume"});assert.ok(ui.button("Pause"));
    assert.equal(ui.animations.filter(animation=>animation.duration===280).length,fades);
    assert.equal(ui.root().findByProps({testID:"session-actions-motion"}).props.style[1].opacity.value,1);
    await ui.update({actionBusy:false,interactionKind:null,actionError:"Waiting to confirm your saved session state."});
    assert.match(ui.output(),/Waiting to confirm your saved session state/);
  } finally {await ui.cleanup();}
});

test("a durable End retains the route while unconfirmed and fades out when global Done clears the result",async()=>{
  const ui=await screenSetup({hasOpenSession:true,isRunning:true,duration:1800,timeLeft:827},{},true);
  try{
    await ui.press('End session');await act(async()=>ui.root().findByType('Confirm').props.onConfirm());
    await ui.update({hasOpenSession:false,isRunning:false,endingSession:true,actionBusy:true,syncStatus:'waiting'});
    assert.equal(ui.root().findAllByType('CompletionPopup').length,0);assert.equal(ui.calls.filter(c=>c[0]==='dismiss').length,0);
    await ui.update({endingSession:false,sessionEnded:false,actionBusy:false,summaryViewed:true});
    assert.ok(ui.animations.some(animation=>animation.toValue===-0.12));
    await ui.finishExit();assert.equal(ui.calls.filter(c=>c[0]==='dismiss').length,1);
  }finally{await ui.cleanup();}
});

test("a cancellation acknowledgement cannot dismiss the End route, and Done still fades out after its selected row is gone",async()=>{
  const sessionId='ended-session';
  const ui=await screenSetup({sessionId,hasOpenSession:true,isRunning:true,duration:60,timeLeft:27},{},true);
  try {
    await ui.press('End session');await act(async()=>ui.root().findByType('Confirm').props.onConfirm());
    await ui.update({hasOpenSession:false,isRunning:false,endingSession:true,sessionEnded:true,actionBusy:true,syncStatus:'waiting'});
    await ui.update({sessionId:null,endingSession:false,sessionEnded:false,actionBusy:false,syncStatus:'idle',
      summaryViewed:false,duration:1800,timeLeft:1800,notes:''});
    assert.equal(ui.animations.some(animation=>animation.toValue===-0.12),false,'a server reply is not user dismissal');
    assert.equal(ui.calls.filter(c=>c[0]==='dismiss').length,0);
    assert.equal(ui.root().findByType('DurationControl').props.seconds,27);
    assert.match(ui.output(),/Session ended/);
    await ui.dismissResult(sessionId);
    assert.equal(ui.animations.filter(animation=>animation.toValue===-0.12).length,1);
    await ui.finishExit();assert.equal(ui.calls.filter(c=>c[0]==='dismiss').length,1);
    assert.equal(ui.calls.filter(c=>c[0]==='reset').length,1,'Done must not send another End');
  }finally{await ui.cleanup();}
});

test("result dismissal fences a different owner, admission, backend and replacement session",async()=>{
  const sessionId='selected-end';
  const ui=await screenSetup({sessionId,duration:60,timeLeft:21,sessionEnded:true},{},true);
  try {
    for(const wrong of [
      {ownerId:'owner-b'},
      {scope:JSON.stringify(['test-backend','owner-a',0])},
      {scope:JSON.stringify(['another-backend','owner-a',1])},
      {sessionId:'another-session'},
    ]) await ui.dismissResult(sessionId,wrong);
    assert.equal(ui.animations.some(animation=>animation.toValue===-0.12),false);
    await ui.dismissResult(sessionId);await ui.finishExit();
    assert.equal(ui.calls.filter(c=>c[0]==='dismiss').length,1);
  }finally{await ui.cleanup();}
});

test("Done on an exact-zero completed result dismisses its held identity without another End",async()=>{
  const ui=await screenSetup({sessionId:'local-complete',isCompleted:true,timeLeft:0,
    sessionSummary:{sessionId:'saved-complete',durationSeconds:60,xpEarned:1,goldEarned:0}},{},true);
  try {
    await ui.dismissResult('saved-complete');await ui.finishExit();
    assert.equal(ui.calls.filter(c=>c[0]==='dismiss').length,1);
    assert.equal(ui.calls.filter(c=>['reset','complete','start'].includes(c[0])).length,0);
  }finally{await ui.cleanup();}
});

test("global Done closes an unconfirmed legacy End route without waiting for its held server reply",async()=>{
  const ui=await screenSetup({duration:60,timeLeft:16,hasOpenSession:false,endingSession:true,
    actionBusy:true,isRestoring:true,syncStatus:'waiting',summaryViewed:false},{},true);
  try {
    await ui.update({summaryViewed:true});
    assert.ok(ui.animations.some(animation=>animation.toValue===-0.12));
    assert.equal(ui.root().findByType('DurationControl').props.seconds,16);
    assert.equal(ui.calls.filter(c=>c[0]==='dismiss').length,0);
    await ui.finishExit();assert.equal(ui.calls.filter(c=>c[0]==='dismiss').length,1);
    assert.equal(ui.calls.filter(c=>['reset','retry','complete'].includes(c[0])).length,0);
  }finally{await ui.cleanup();}
});

test("reopening an acknowledged unconfirmed End does not immediately bounce out of its review route",async()=>{
  const ui=await screenSetup({sessionId:'same-end',duration:60,timeLeft:16,hasOpenSession:false,endingSession:true,
    actionBusy:false,syncStatus:'waiting',summaryViewed:true},{},true);
  try {
    await ui.update({actionBusy:true});await ui.update({actionBusy:false});
    assert.equal(ui.animations.some(animation=>animation.toValue===-0.12),false);
    assert.equal(ui.calls.filter(c=>c[0]==='dismiss').length,0);
    assert.equal(ui.root().findByType('DurationControl').props.seconds,16);
    await ui.update({summaryViewed:false});
    assert.equal(ui.animations.some(animation=>animation.toValue===-0.12),false);
    await ui.update({summaryViewed:true});
    assert.equal(ui.animations.some(animation=>animation.toValue===-0.12),true);
    await ui.finishExit();assert.equal(ui.calls.filter(c=>c[0]==='dismiss').length,1);
  }finally{await ui.cleanup();}
});
test("global End dismissal retains the running or paused countdown until the route exit finishes",async()=>{
  for(const isRunning of [true,false]){
    const ui=await screenSetup({hasOpenSession:true,isRunning,duration:1800,timeLeft:827},{},true);
    try{
      const stage=ui.root().findByProps({testID:'session-timer-anchor'}).props.style;
      await ui.press('End session');await act(async()=>ui.root().findByType('Confirm').props.onConfirm());
      await ui.update({hasOpenSession:false,isRunning:false,sessionEnded:true,timeLeft:1800,actionBusy:false,actionError:null});
      assert.deepEqual(ui.root().findByProps({testID:'session-timer-anchor'}).props.style,stage);
      assert.equal(ui.root().findByType('DurationControl').props.seconds,827);
      await ui.update({sessionEnded:false,summaryViewed:true});assert.equal(ui.root().findByType('DurationControl').props.seconds,827);
      assert.equal(ui.calls.filter(c=>c[0]==='dismiss').length,0);await ui.finishExit();
      assert.equal(ui.calls.filter(c=>c[0]==='dismiss').length,1);assert.equal(ui.calls.filter(c=>c[0]==='reset').length,1);
    }finally{await ui.cleanup();}
  }
});
test("a routine session keeps its routine fixed: no category or routine chooser, and Start keeps its exact setup and name",async()=>{
  const metadata=load('src/utils/routineSession.ts',{});
  const ui=await screenSetup({notes:metadata.encodeRoutineSession('Review thermodynamics'),targetAttributeId:2,duration:91,timeLeft:91},{subjects:[{id:1,title:'General'},{id:2,title:'Knowledge'}]});
  try {
    assert.match(ui.output(),/Review thermodynamics/);
    assert.ok(ui.root().findAll(node=>node.props.testID==='session-routine').length>0);
    assert.equal(ui.button('Choose category'),undefined);assert.equal(ui.button('Choose routine'),undefined);assert.equal(ui.button('Change routine'),undefined);
    await ui.press('Start');assert.deepEqual(ui.calls.at(-1),['start',91,'Review thermodynamics']);
  }finally{await ui.cleanup();}
});

test("a saved routine with no focus area keeps null instead of silently claiming the general area",async()=>{
  const metadata=load('src/utils/routineSession.ts',{});
  const ui=await screenSetup({notes:metadata.encodeRoutineSession('Quiet reading'),targetAttributeId:null,duration:61});
  try {assert.equal(ui.calls.filter(call=>call[0]==='area').length,0);await ui.press('Start');
    assert.deepEqual(ui.calls.at(-1),['start',61,'Quiet reading']);
  }finally{await ui.cleanup();}
});

test("guided Start owns its exact free draft, blocks duplicates and retains metadata through completion", async () => {
  const ui = await providerSetup();
  const { suggestedFocus, readSuggestedFocus } = load("src/constants/guidedQuests.ts", {});
  const focus = suggestedFocus("assignment-outline", true);
  await ui.run(s => { s.setLinkedTaskId(88); s.setTargetAttributeId(44); s.setNotes("old quest draft"); });
  await ui.run(async s => { assert.equal(await s.startSuggestedTimer(focus, 2), true); assert.equal(await s.startSuggestedTimer(focus, 2), false); });
  const starts = ui.calls.filter(([name]) => name === "start");
  assert.equal(starts.length, 1);
  assert.equal(starts[0][1].targetDurationSeconds, 600);
  assert.equal(starts[0][1].taskId, null);
  assert.equal(starts[0][1].subjectId, 2);
  assert.equal(readSuggestedFocus(starts[0][1].notes).title, focus.title);
  await ui.advance(601);
  assert.equal(ui.state().sessionSummary.suggestion.title, focus.title);
  assert.equal(ui.state().sessionSummary.sessionId, SESSION_ID);
  assert.equal(ui.state().sessionSummary.questTitle, focus.title);
  await ui.run(s => { s.clearCompletionModal(); s.acknowledgeSummary(); });
  assert.equal(ui.calls.filter(([name]) => name === "complete").length, 1);
  await ui.cleanup();
});

test("routine Start carries its durable display name through the real provider without linking or duplicating a quest reward", async () => {
  const ui=await providerSetup();
  const metadata=load("src/utils/routineSession.ts",{});
  try {
    await ui.run(s=>{s.setLinkedTaskId(88);s.setTargetAttributeId(44);s.setNotes("stale quest notes");});
    await ui.run(async s=>{assert.equal(await s.startFreeTimer(91,2,"Review thermodynamics"),true);
      assert.equal(await s.startFreeTimer(91,2,"Review thermodynamics"),false);});
    const starts=ui.calls.filter(([kind])=>kind==="start");
    assert.equal(starts.length,1);assert.equal(starts[0][1].taskId,null);assert.equal(starts[0][1].subjectId,2);
    assert.equal(starts[0][1].targetDurationSeconds,91);
    assert.equal(metadata.readRoutineSession(starts[0][1].notes),"Review thermodynamics");
    assert.equal(ui.state().notes,starts[0][1].notes);assert.equal(ui.state().linkedTaskId,null);
    await ui.foreground();assert.equal(metadata.readRoutineSession(ui.state().notes),"Review thermodynamics");
    await ui.advance(92);
    assert.equal(ui.state().sessionSummary.questTitle,"Review thermodynamics");
    assert.equal(ui.state().sessionSummary.durationSeconds,91);
    assert.equal(ui.state().sessionSummary.suggestion,undefined,'a routine is not a suggested quest');
    await ui.advance(10);await ui.foreground();
    assert.equal(ui.calls.filter(([kind])=>kind==="complete").length,1);
    assert.deepEqual([...new Set(ui.calls.map(([kind])=>kind))],["start","complete"]);
  } finally {await ui.cleanup();}
});

test("restored guided sessions retain their instruction and completion title", async () => {
  const { suggestedFocus, encodeSuggestedFocus } = load("src/constants/guidedQuests.ts", {});
  const focus = suggestedFocus("practice-question");
  const ui = await providerSetup({ getOpenActivitySession: async () => ({ id:"restored-guided", status:"paused", task_id:null, subject_id:2, activity_type:"other", target_duration_seconds:1800, elapsed_seconds:1790, notes:encodeSuggestedFocus(focus) }) });
  assert.equal(ui.state().timeLeft,10);
  assert.equal(ui.state().notes,encodeSuggestedFocus(focus));
  await ui.run(s => s.resumeTimer());
  await ui.advance(11);
  assert.equal(ui.state().sessionSummary.questTitle,focus.title);
  assert.equal(ui.state().sessionSummary.suggestion.instruction,focus.instruction);
  assert.equal(ui.state().sessionSummary.sessionId,fixtureServerId("restored-guided"));
  await ui.cleanup();
});

test("guided failure keeps the draft for exact retry and cannot replace a paused session", async () => {
  let attempts=0;
  const ui=await providerSetup({startActivitySession:async()=>{if(++attempts===1)throw definitiveServerRejection();return "guided-retry";}});
  const {suggestedFocus,readSuggestedFocus}=load("src/constants/guidedQuests.ts",{});
  const focus=suggestedFocus("review-topic",true);
  await ui.run(async s=>assert.equal(await s.startSuggestedTimer(focus,null),false));
  assert.equal(readSuggestedFocus(ui.state().notes).templateId,focus.templateId);
  await ui.run(s=>s.retryAction());
  assert.equal(ui.state().duration,600);
  await ui.run(s=>s.pauseTimer());
  await ui.run(async s=>assert.equal(await s.startSuggestedTimer(suggestedFocus("continue-assignment"),2),false));
  assert.equal(ui.state().duration,600);
  assert.equal(ui.state().isRunning,false);
  assert.equal(attempts,2);
  await ui.cleanup();
});

test("custom suggested durations own exact metadata through start, retry, restoration and completion",async()=>{
 const api=load('src/constants/guidedQuests.ts',{}),focus={...api.suggestedFocus('review-topic'),seconds:2717};let attempts=0;
 const ui=await providerSetup({startActivitySession:async()=>{if(++attempts===1)throw definitiveServerRejection();return 'custom-guided';}});
 try{
  for(const seconds of [0,28801,1.5])await ui.run(async s=>assert.equal(await s.startSuggestedTimer({...focus,seconds},2),false));assert.equal(attempts,0);
  await ui.run(async s=>assert.equal(await s.startSuggestedTimer({...focus,title:'Uncurated title'},2),false));
  assert.equal(ui.state().duration,2717);assert.equal(api.readSuggestedFocus(ui.state().notes).title,focus.title);
  await ui.run(s=>s.retryAction());assert.equal(ui.state().duration,2717);assert.equal(api.readSuggestedFocus(ui.state().notes).seconds,2717);
  await ui.advance(2718);assert.equal(ui.state().sessionSummary.suggestion.seconds,2717);
 }finally{await ui.cleanup();}
 const restored=await providerSetup({getOpenActivitySession:async()=>({id:'custom-restored',status:'paused',task_id:null,subject_id:2,activity_type:'other',notes:api.encodeSuggestedFocus(focus),target_duration_seconds:2717,elapsed_seconds:817})});
 try{assert.equal(api.readSuggestedFocus(restored.state().notes).seconds,2717);assert.equal(restored.state().duration,2717);}finally{await restored.cleanup();}
});

test("editing a suggested setup timer keeps its saved instruction and updates exact seconds",async()=>{
 const ui=await providerSetup(),api=load('src/constants/guidedQuests.ts',{}),focus=api.suggestedFocus('review-topic');
 try{
  await ui.run(s=>s.setNotes(api.encodeSuggestedFocus(focus)));await ui.run(s=>s.setDurationInSeconds(2717));
  const draft=api.readSuggestedFocus(ui.state().notes);assert.equal(draft.seconds,2717);assert.equal(draft.instruction,focus.instruction);
  await ui.run(s=>s.startTimer(2717));const query=ui.calls.find(c=>c[0]==='start')[1];assert.equal(query.targetDurationSeconds,2717);assert.equal(api.readSuggestedFocus(query.notes).seconds,2717);
 }finally{await ui.cleanup();}
});

test("display-only countdown keeps its node and exact digits across minute boundaries",async()=>{
 const Countdown=load("src/components/SessionCountdown.tsx",{
  "react-native":{View:host("View"),Text:host("Text"),StyleSheet:{create:s=>s},useWindowDimensions:()=>({width:320,height:640,fontScale:2})}
 }).default;
 let renderer;await act(async()=>{renderer=create(React.createElement(Countdown,{seconds:61,caption:"of 30:00"}));});
 const display=()=>renderer.root.findAllByType("View").find(node=>node.props.testID==="session-countdown");
 try{const mounted=display(),layout=JSON.stringify(mounted.props.style);
  for(const [seconds,label]of [[61,"01:01"],[60,"01:00"],[59,"00:59"],[0,"00:00"],[28800,"480:00"]]){
   await act(async()=>renderer.update(React.createElement(Countdown,{seconds,caption:"of 30:00"})));
   assert.equal(display(),mounted);assert.equal(display().props.accessibilityLabel,label);assert.equal(JSON.stringify(display().props.style),layout);assert.match(JSON.stringify(renderer.toJSON()),new RegExp(label));
  }
  assert.equal(renderer.root.findAllByType("Button").length,0);assert.equal(renderer.root.findAllByType("Input").length,0);
 }finally{await act(async()=>renderer.unmount());}
});

test("Study mode shows the shared Subject row wired to the session's area; quest setup leaves it out",async()=>{
  const ui=await screenSetup({}, {subjects:[{id:1,title:"General"},{id:2,title:"Learning"}]});
  assert.equal(ui.root().findAllByType("SubjectRow").length,0,"Focus mode shows the focus area row instead");
  await ui.mode("study");
  assert.match(ui.output(),/Study session/);assert.match(ui.output(),/Choose a subject/);
  assert.equal(ui.button("Choose category"),undefined,"study has no category or routine rows");assert.equal(ui.button("Choose routine"),undefined);
  const row=ui.root().findByType("SubjectRow");
  assert.equal(row.props.learningId,2);
  assert.equal(row.props.generalId,1); assert.equal(row.props.disabled,false);
  await act(async()=>row.props.onArea(2));
  assert.deepEqual(ui.calls.at(-1),["area",2]);
  await ui.update({linkedTaskId:7});
  assert.equal(ui.root().findAllByType("SubjectRow").length,0);
  await ui.mode("routine");
  await ui.cleanup();
});
test("only Study starts arm the picked subject, in one place, the timer, before the session exists",()=>{
  const source=fs.readFileSync(path.join(__dirname,"../src/context/JournalTimerProvider.tsx"),"utf8");
  assert.match(source,/if \(setupMode\.get\(\) === "study"\) studySelection\.arm\(record\?\.clientSessionId \?\? null\); else studySelection\.disarm\(\);\s*try \{\s*const protectedSession/,
    "only a Study setup tags the session; Focus and Routine starts clear any armed subject");
  assert.doesNotMatch(fs.readFileSync(path.join(__dirname,"../src/components/SessionScreen.tsx"),"utf8"),/studySelection\.arm/);
});

test("the setup centres once as the screen opens; later loading only makes room and never bounces it back", async () => {
  const ui = await screenSetup({}, {}, false, {value:false});
  try {
    const scroll = () => ui.root().findAll(node => typeof node.props.onContentSizeChange === "function")[0];
    const top = () => [].concat(ui.root().findByProps({testID:"session-timer-anchor"}).props.style).filter(Boolean).reduce((all, part) => ({ ...all, ...part }), {}).paddingTop;
    await act(async () => scroll().props.onLayout({nativeEvent:{layout:{height:500}}}));
    await act(async () => scroll().props.onContentSizeChange(390, 300));
    const centred = top();
    assert.ok(centred > 0, "the setup sits in the middle of the free space");
    // The scroll area below shrinks by the space now above it, as on a phone.
    await act(async () => scroll().props.onLayout({nativeEvent:{layout:{height:500 - centred}}}));
    assert.equal(top(), centred, "re-measuring after centring is stable");
    await act(async () => scroll().props.onContentSizeChange(390, 340));
    const roomy = top();
    assert.ok(roomy < centred, "more content moves it up to make room");
    await act(async () => scroll().props.onContentSizeChange(390, 300));
    assert.equal(top(), roomy, "content shrinking back never pulls it down again");
  } finally { await ui.cleanup(); }
});


test("Round 69: every provider start entry refuses a sub-minute setup before any server mutation", async () => {
  const ui = await providerSetup();
  const suggestion = load("src/constants/guidedQuests.ts", {}).suggestedFocus("review-topic");
  try {
    for (const seconds of [1, 30, 59]) {
      await ui.run(s => s.startTimer(seconds));
      await ui.run(async s => assert.equal(await s.startFreeTimer(seconds, null), false));
      await ui.run(async s => assert.equal(await s.startSuggestedTimer({ ...suggestion, seconds }, 2), false));
      await ui.run(s => s.setDurationInSeconds(seconds));
      await ui.run(s => s.setDurationInMinutes(seconds / 60));
    }
    assert.equal(ui.calls.filter(call => call[0] === "start").length, 0);
    assert.equal(ui.state().hasOpenSession, false);
    assert.equal(ui.state().duration, 1800, "invalid edits cannot replace the applied duration");
    await ui.run(s => s.setDurationInSeconds(28800)); assert.equal(ui.state().duration, 28800);
    await ui.run(async s => assert.equal(await s.startFreeTimer(60, null), true));
    assert.equal(ui.state().duration, 60); assert.equal(ui.calls.filter(call => call[0] === "start").length, 1);
  } finally { await ui.cleanup(); }
});

test("Round 69: recovering an older short session keeps its original duration and completion", async () => {
  const ui = await providerSetup({ getOpenActivitySession: async () => ({ id: "legacy-short", target_duration_seconds: 30,
    elapsed_seconds: 0, status: "active", task_id: null, subject_id: null, activity_type: "other", notes: "" }) });
  try {
    assert.equal(ui.state().duration, 30); assert.equal(ui.state().hasOpenSession, true);
    await ui.advance(31);
    assert.equal(ui.state().isCompleted, true); assert.equal(ui.state().sessionSummary.durationSeconds, 30);
    assert.equal(ui.calls.filter(call => call[0] === "start").length, 0);
  } finally { await ui.cleanup(); }
});
