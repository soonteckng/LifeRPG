/* global __dirname */
const test = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), ts = require("typescript");
const React = require("react"), { act, create } = require("react-test-renderer");
const { Buffer } = require("node:buffer");
global.IS_REACT_ACT_ENVIRONMENT = true;
const backendUrl = "https://fixture-project.supabase.co";
process.env.EXPO_PUBLIC_SUPABASE_URL = backendUrl;
function load(file, mocks = {}, modules = new Map()) {
  const filename = path.resolve(__dirname, "..", file);
  if (modules.has(filename)) return modules.get(filename).exports;
  const mod = { exports: {} }; modules.set(filename, mod);
  const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  new Function("require", "module", "exports", code)(name => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (!name.startsWith(".")) return require(name);
    const target = path.resolve(path.dirname(filename), name);
    const ext = ["", ".ts", ".tsx"].find(ext => fs.existsSync(target + ext));
    return load(path.relative(path.resolve(__dirname, ".."), target + ext), mocks, modules);
  }, mod, mod.exports);
  return mod.exports;
}
const utils = load("src/services/localAccountCache.ts"), { sessionBackendIdentity } = load("src/utils/sessionBackend.ts");
const backend = sessionBackendIdentity(backendUrl);
const A = "10000000-0000-4000-8000-000000000001", B = "10000000-0000-4000-8000-000000000002";
const offline = { name: "AuthRetryableFetchError", status: 503 };
const profile = id => ({ id, username: id === A ? "Soon Teck" : "Other", avatar: "hero", class_title: "Scholar", level: 3, current_xp: 22, gold: 5,
  streak_count: 2, last_active_date: "2026-10-09", daily_goal_minutes: 60, last_goal_completed_date: null, onboarding_completed: true, timezone: "Asia/Kuala_Lumpur" });
const session = (id = A, expired = false, issuer = backendUrl + "/auth/v1") => ({ user: { id }, access_token: `fixture.${Buffer.from(JSON.stringify({ sub: id, iss: issuer, exp: expired ? 1 : 4_000_000_000 })).toString("base64url")}.signature`, refresh_token: "local-fixture", expires_at: expired ? 1 : 4_000_000_000 });
const marker = (id = A, data = profile(id)) => ({ version: 1, backendId: backend.backendId, ownerId: id, verifiedAtMs: 1_000, profile: data });
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const memory = () => { const values = new Map(); return { values, getItem: async key => values.get(key) ?? null, setItem: async (key, value) => { values.set(key, value); }, removeItem: async key => { values.delete(key); } }; };
function existing(store, current = session(A, true), cache = marker()) {
  store.values.set(backend.authStorageKey, JSON.stringify(current));
  if (cache) store.values.set(utils.localAccountCacheKey(backend.backendId), JSON.stringify(cache));
}
async function mount(options = {}) {
  const store = options.store ?? memory(); let value, authListener, renderer, fetches = 0, userValue;
  const auth = {
    onAuthStateChange: fn => { authListener = fn; if (options.initialNullEvent) fn("INITIAL_SESSION", null); return { data: { subscription: { unsubscribe() {} } } }; },
    getSession: async () => ({ data: { session: options.current ?? null }, error: options.restoreError ?? null }),
    getUser: async token => { fetches++; return { data: { user: options.userError ? null : options.current?.user ?? session().user }, error: options.userError ?? null }; },
    signOut: async () => { if (options.signOutError) return { error: options.signOutError }; store.values.delete(backend.authStorageKey); authListener("SIGNED_OUT", null); return { error: null }; },
    ...options.auth,
  };
  const modules = new Map();
  const mocks = {
    "../../lib/supabase": { supabase: { auth, from: options.from ?? (() => { throw Error("Unexpected cloud profile read"); }) } }, "react-native": { Platform: { OS: "android" } }, "@react-native-async-storage/async-storage": store,
    "expo-linking": { createURL: () => "liferpg://auth/recovery", getInitialURL: async () => options.url ?? null, addEventListener: () => ({ remove() {} }) },
  };
  const module = load("src/context/AuthContext.tsx", mocks, modules);
  const userModule = options.withProfile ? load("src/context/UserContext.tsx", mocks, modules) : null;
  function Consumer() { value = module.useAuth(); if (userModule) userValue = userModule.useUser(); return null; }
  const child = () => userModule ? React.createElement(userModule.UserProvider, null, React.createElement(Consumer)) : React.createElement(Consumer);
  await act(async () => { renderer = create(React.createElement(module.AuthProvider, null, child())); });
  return { store, value: () => value, user: () => userValue, fetches: () => fetches,
    event: (event, current) => act(async () => { if (current?.access_token) store.values.set(backend.authStorageKey, JSON.stringify(current)); authListener(event, current); }),
    run: fn => act(async () => fn(value)), cleanup: () => act(async () => renderer.unmount()) };
}

test("backend identity is journal-safe, path/protocol/port distinct, and retains exact issuer base", () => {
  assert.equal(backend.backendId, "fixture-project.supabase.co");
  const urls = [backendUrl, backendUrl + "/other", "http://fixture-project.supabase.co", backendUrl + ":8443", "http://[::1]:54321"];
  const ids = urls.map(url => sessionBackendIdentity(url)?.backendId);
  assert.equal(new Set(ids).size, urls.length);
  for (const id of ids) assert.match(id, /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/);
  assert.equal(sessionBackendIdentity("https://user:password@fixture.test"), null);
  assert.deepEqual(sessionBackendIdentity(backendUrl + "/"), backend);
});
test("credential adapter reads expired owner without refreshing, rejects mismatch/foreign issuer/malformed bytes", async () => {
  const store = memory(); existing(store);
  assert.deepEqual(await utils.readPersistedCredentialOwner(store, backend), { kind: "present", owner: { id: A, backendId: backend.backendId }, expired: true });
  for (const data of [{ ...session(), user: { id: B } }, session(A, false, "https://foreign.test/auth/v1"), {}, null]) {
    store.values.set(backend.authStorageKey, JSON.stringify(data));
    assert.equal((await utils.readPersistedCredentialOwner(store, backend)).kind, "invalid");
  }
  store.values.set(backend.authStorageKey, "bad-json"); assert.equal((await utils.readPersistedCredentialOwner(store, backend)).kind, "invalid");
  store.values.delete(backend.authStorageKey); assert.equal((await utils.readPersistedCredentialOwner(store, backend)).kind, "missing");
});
test("cold expired-token refresh failure restores only matching previously verified local profile", async () => {
  const store = memory(); existing(store); const original = store.values.get(utils.localAccountCacheKey(backend.backendId));
  const ui = await mount({ store, restoreError: offline });
  try {
    assert.equal(ui.value().user, null); assert.equal(ui.value().session, null); assert.equal(ui.value().accessMode, "local-only");
    assert.deepEqual(ui.value().localOwner, { id: A, backendId: backend.backendId });
    assert.equal(ui.value().cachedProfile.username, "Soon Teck"); assert.equal(ui.value().loading, false); assert.equal(ui.value().sessionError, false);
    assert.equal(store.values.get(utils.localAccountCacheKey(backend.backendId)), original);
  } finally { await ui.cleanup(); }
});
test("INITIAL_SESSION null does not lose persisted expired credentials after retryable refresh failure", async () => {
  const store = memory(); existing(store); const ui = await mount({ store, restoreError: offline, initialNullEvent: true });
  try { assert.equal(ui.value().accessMode, "local-only"); assert.equal(ui.value().localOwner.id, A); }
  finally { await ui.cleanup(); }
});
test("established local owner is admitted promptly while SDK refresh remains pending, then upgrades on verified success", async () => {
  const wait = deferred(), store = memory(); existing(store);
  const ui = await mount({ store, auth: { getSession: () => wait.promise } });
  try {
    assert.equal(ui.value().loading, false); assert.equal(ui.value().accessMode, "local-only"); assert.equal(ui.value().user, null);
    const epoch = ui.value().admissionEpoch;
    await act(async () => wait.resolve({ data: { session: session() }, error: null }));
    assert.equal(ui.value().accessMode, "online"); assert.equal(ui.value().user.id, A); assert.equal(ui.value().admissionEpoch, epoch);
  } finally { await ui.cleanup(); }
});
test("hanging getUser leaves only cached local admission; a definitive invalid reply revokes it", async () => {
  const wait = deferred(), store = memory(); existing(store, session());
  const ui = await mount({ store, current: session(), auth: { getUser: () => wait.promise } });
  try {
    assert.equal(ui.value().loading, false); assert.equal(ui.value().accessMode, "local-only"); assert.equal(ui.value().user, null);
    await act(async () => wait.resolve({ data: { user: null }, error: { code: "session_not_found", status: 401 } }));
    assert.equal(ui.value().accessMode, "signed-out"); assert.equal(ui.value().localOwner, null);
    assert.equal(store.values.has(utils.localAccountCacheKey(backend.backendId)), false);
  } finally { await ui.cleanup(); }
});
test("null SDK session without error preserves an independently matching established owner", async () => {
  const store = memory(); existing(store); const ui = await mount({ store });
  try { assert.equal(ui.value().accessMode, "local-only"); assert.equal(ui.value().localOwner.id, A); assert.equal(ui.value().user, null); }
  finally { await ui.cleanup(); }
});
test("first use offline and incomplete onboarding never grant local admission", async () => {
  for (const cache of [null, marker(A, null), marker(A, { ...profile(A), onboarding_completed: false })]) {
    const store = memory(); existing(store, session(A, true), cache);
    const ui = await mount({ store, restoreError: offline });
    try { assert.equal(ui.value().localOwner, null); assert.equal(ui.value().user, null); assert.equal(ui.value().sessionError, true); }
    finally { await ui.cleanup(); }
  }
});
test("missing credentials, malformed ownership, account mismatch and known invalid auth revoke and clear marker", async () => {
  for (const kind of ["missing", "malformed", "other-owner", "known-invalid"]) {
    const store = memory(); existing(store);
    if (kind === "missing") store.values.delete(backend.authStorageKey);
    if (kind === "malformed") store.values.set(backend.authStorageKey, "bad-json");
    if (kind === "other-owner") store.values.set(backend.authStorageKey, JSON.stringify(session(B, true)));
    const ui = await mount({ store, restoreError: kind === "known-invalid" ? { status: 400, code: "refresh_token_not_found" } : offline });
    try { assert.equal(ui.value().localOwner, null); assert.equal(store.values.has(utils.localAccountCacheKey(backend.backendId)), false); }
    finally { await ui.cleanup(); }
  }
});
test("expired JWT permits local recovery but does not become online proof", async () => {
  const store = memory(); existing(store);
  const ui = await mount({ store, current: session(A, true), userError: { status: 401, code: "jwt_expired" } });
  try { assert.equal(ui.value().accessMode, "local-only"); assert.equal(ui.value().user, null); }
  finally { await ui.cleanup(); }
});
test("only successful getUser plus matching cloud profile stores usable snapshot without secret extras", async () => {
  const store = memory(); existing(store, session(), null); const ui = await mount({ store, current: session() });
  try {
    assert.equal(ui.value().accessMode, "online"); assert.equal(ui.value().user.id, A);
    await ui.run(value => value.cacheVerifiedProfile({ ...profile(A), email: "private@example.test", access_token: "secret" }));
    const saved = JSON.parse(store.values.get(utils.localAccountCacheKey(backend.backendId)));
    assert.deepEqual(saved.profile, profile(A)); assert.equal(saved.ownerId, A);
    await ui.run(value => value.cacheVerifiedProfile(profile(B)));
    assert.equal(JSON.parse(store.values.get(utils.localAccountCacheKey(backend.backendId))).ownerId, A);
  } finally { await ui.cleanup(); }
});
test("explicit sign out revokes local mode even if auth logout fails; preserved journal is not touched", async () => {
  const store = memory(); existing(store); store.values.set("journal-fixture", "pending-work");
  const ui = await mount({ store, restoreError: offline, signOutError: offline });
  try {
    const epoch = ui.value().admissionEpoch;
    await ui.run(value => value.signOut());
    assert.equal(ui.value().accessMode, "signed-out"); assert.equal(ui.value().localOwner, null); assert.ok(ui.value().admissionEpoch > epoch);
    assert.equal(store.values.has(utils.localAccountCacheKey(backend.backendId)), false); assert.equal(store.values.get("journal-fixture"), "pending-work");
  } finally { await ui.cleanup(); }
});
test("late getUser cannot admit or cache a previous account after account switch", async () => {
  const old = deferred(), store = memory(); existing(store, session(), null);
  const ui = await mount({ store, current: session(), auth: { getUser: token => token === session().access_token ? old.promise : Promise.resolve({ data: { user: { id: B } }, error: null }) } });
  try {
    await ui.event("SIGNED_IN", session(B)); await ui.run(value => value.cacheVerifiedProfile(profile(B)));
    await act(async () => old.resolve({ data: { user: { id: A } }, error: null }));
    assert.equal(ui.value().user.id, B); assert.equal(ui.value().cachedProfile.id, B);
    assert.equal(JSON.parse(store.values.get(utils.localAccountCacheKey(backend.backendId))).ownerId, B);
  } finally { await ui.cleanup(); }
});
test("password-recovery guard takes priority over a usable offline cache", async () => {
  const store = memory(); existing(store); store.values.set("liferpg:password-recovery", A);
  const recovery = load("src/utils/passwordRecovery.ts"); store.values.set(recovery.recoveryStorageKey, A);
  const ui = await mount({ store, restoreError: offline });
  try { assert.notEqual(ui.value().recovery, "none"); assert.equal(ui.value().localOwner, null); assert.equal(ui.value().accessMode, "signed-out"); }
  finally { await ui.cleanup(); }
});
test("fresh owner verification calls getUser again; temporary failure switches to cached local mode", async () => {
  const store = memory(); existing(store, session()); let offlineNow = false, calls = 0;
  const ui = await mount({ store, current: session(), auth: { getUser: async () => { calls++; return { data: { user: offlineNow ? null : { id: A } }, error: offlineNow ? offline : null }; } } });
  try {
    await ui.run(value => value.cacheVerifiedProfile(profile(A)));
    const epoch = ui.value().admissionEpoch;
    await ui.run(async value => assert.deepEqual(await value.verifyCurrentOwner(), { id: A, backendId: backend.backendId }));
    assert.equal(calls, 2); offlineNow = true;
    await ui.run(async value => assert.equal(await value.verifyCurrentOwner(), null));
    assert.equal(calls, 3); assert.equal(ui.value().accessMode, "local-only"); assert.equal(ui.value().user, null);
    assert.equal(ui.value().admissionEpoch, epoch);
  } finally { await ui.cleanup(); }
});
test("an in-flight owner proof cannot revive admission after explicit signout fails", async () => {
  const wait = deferred(), store = memory(); existing(store, session()); let waitForSession = false;
  const ui = await mount({ store, current: session(), signOutError: offline, auth: { getSession: () => waitForSession ? wait.promise : Promise.resolve({ data: { session: session() }, error: null }) } });
  try {
    waitForSession = true; let proof;
    await act(async () => { proof = ui.value().verifyCurrentOwner(); });
    await ui.run(value => value.signOut());
    await act(async () => wait.resolve({ data: { session: session() }, error: null }));
    assert.equal(await proof, null); assert.equal(ui.value().user, null); assert.equal(ui.value().accessMode, "signed-out");
    await ui.event("TOKEN_REFRESHED", session()); assert.equal(ui.value().user, null);
  } finally { await ui.cleanup(); }
});
test("local profile loads only cached snapshot, scopes preferences to owner and blocks edits without any cloud access", async () => {
  const store = memory(); existing(store); store.values.set(`liferpg:preferences:${A}`, JSON.stringify({ sound: false, haptics: false }));
  const ui = await mount({ store, restoreError: offline, withProfile: true });
  try {
    assert.equal(ui.user().profile.id, A); assert.equal(ui.user().username, "Soon Teck"); assert.equal(ui.user().profile.level, 3);
    assert.equal(ui.user().soundEnabled, false); assert.equal(ui.user().hapticsEnabled, false);
    await assert.rejects(() => ui.user().updateProfile("Changed", "hero", "Scholar"), /Connect and verify/);
    await ui.run(() => ui.user().reloadProfile()); assert.equal(ui.user().profile.id, A);
  } finally { await ui.cleanup(); }
});
test("online profile read populates minimal snapshot; stale previous account result cannot overwrite current profile or cache", async () => {
  const old = deferred(), store = memory(); existing(store, session(), null);
  const from = () => {
    let id;
    const q = { select: () => q, eq: (_, owner) => { id = owner; return q; }, single: () => id === A ? old.promise : Promise.resolve({ data: profile(B), error: null }) };
    return q;
  };
  const ui = await mount({ store, current: session(), withProfile: true, from, auth: { getUser: async token => ({ data: { user: { id: token === session().access_token ? A : B } }, error: null }) } });
  try {
    await ui.event("SIGNED_IN", session(B));
    assert.equal(ui.user().profile.id, B);
    await act(async () => old.resolve({ data: profile(A), error: null }));
    assert.equal(ui.user().profile.id, B); assert.equal(ui.value().cachedProfile.id, B);
    assert.equal(JSON.parse(store.values.get(utils.localAccountCacheKey(backend.backendId))).profile.id, B);
  } finally { await ui.cleanup(); }
});
test("same-owner fresh verification during delayed marker save cannot discard the first verified profile cache", async () => {
  const wait = deferred(), store = memory(); existing(store, session(), null);
  const write = store.setItem; let first = true;
  store.setItem = async (key, value) => {
    if (key === utils.localAccountCacheKey(backend.backendId) && first) { first = false; await wait.promise; }
    await write(key, value);
  };
  const ui = await mount({ store, current: session() });
  try {
    let save, proof;
    await act(async () => { save = ui.value().cacheVerifiedProfile(profile(A)); proof = ui.value().verifyCurrentOwner(); });
    await act(async () => wait.resolve());
    await Promise.all([save, proof]);
    assert.equal(JSON.parse(store.values.get(utils.localAccountCacheKey(backend.backendId))).profile.id, A);
    assert.equal(ui.value().cachedProfile.id, A);
  } finally { await ui.cleanup(); }
});
