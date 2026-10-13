/* global __dirname */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const React = require("react");
const { act, create } = require("react-test-renderer");
global.IS_REACT_ACT_ENVIRONMENT = true;

function loadUserProvider(mocks) {
  const filename = path.resolve(__dirname, "..", "src/context/UserContext.tsx");
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  new Function("require", "module", "exports", code)(name => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    return require(name);
  }, module, module.exports);
  return module.exports;
}

function profile(id) {
  return { id, username: id === "owner-a" ? "Soon Teck" : "Other", avatar: "hero", class_title: "Scholar",
    level: 3, current_xp: 22, gold: 5, streak_count: 2, last_active_date: "2026-10-11", daily_goal_minutes: 60,
    last_goal_completed_date: null, onboarding_completed: true, timezone: "Asia/Kuala_Lumpur" };
}

async function mount() {
  let auth = { user: { id: "owner-a" }, accessMode: "online" };
  let value, renderer;
  const requests = [], refreshResults = [], cacheWrites = [];
  const cacheVerifiedProfile = async saved => { cacheWrites.push(saved); };
  const module = loadUserProvider({
    "./AuthContext": { useAuth: () => ({ ...auth, cacheVerifiedProfile }) },
    "../constants/profile": { profileNameError: () => null },
    "@react-native-async-storage/async-storage": { getItem: async () => null },
    "../../lib/supabase": { supabase: { from: () => {
      let id;
      const query = { select: () => query, eq: (_, nextId) => { id = nextId; return query; }, single: () => {
        return new Promise(resolve => { requests.push({ id, resolve, settled: false }); });
      } };
      return query;
    } } },
  });
  function HomeRefreshConsumer() {
    value = module.useUser();
    const owner = auth.user.id;
    React.useEffect(() => {
      // Home's focus effect calls the real provider immediately after mount.
      void value.reloadProfile().then(ok => refreshResults.push({ owner, ok }));
    }, [value.reloadProfile]);
    return null;
  }
  const element = () => React.createElement(module.UserProvider, null, React.createElement(HomeRefreshConsumer));
  await act(async () => { renderer = create(element()); });
  return {
    requests, refreshResults, cacheWrites, value: () => value,
    settle: (owner, result) => act(async () => {
      for (const request of requests.filter(item => item.id === owner && !item.settled)) {
        request.settled = true; request.resolve(result);
      }
    }),
    switchOwner: owner => act(async () => { auth = { user: { id: owner }, accessMode: "online" }; renderer.update(element()); }),
    run: fn => act(async () => fn(value)),
    cleanup: () => act(async () => renderer.unmount()),
  };
}

test("Home's mount refresh shares the provider read and reports success instead of a false refresh error", async () => {
  const ui = await mount();
  try {
    assert.equal(ui.requests.length, 1, "mount and Home must share one current profile read");
    await ui.settle("owner-a", { data: profile("owner-a"), error: null });
    assert.deepEqual(ui.refreshResults, [{ owner: "owner-a", ok: true }]);
    assert.equal(ui.value().profile.username, "Soon Teck");
    assert.equal(ui.value().profileError, false);
    assert.equal(ui.value().profileLoading, false);
    assert.equal(ui.cacheWrites.length, 1);
  } finally { await ui.cleanup(); }
});

test("a late profile response from the previous owner cannot overwrite the current profile or cache", async () => {
  const ui = await mount();
  try {
    await ui.switchOwner("owner-b");
    await ui.settle("owner-b", { data: profile("owner-b"), error: null });
    assert.equal(ui.value().profile.id, "owner-b");
    assert.equal(ui.value().profileError, false);
    await ui.settle("owner-a", { data: profile("owner-a"), error: null });
    assert.equal(ui.value().profile.id, "owner-b");
    assert.equal(ui.value().profileLoading, false);
    assert.deepEqual(ui.cacheWrites.map(saved => saved.id), ["owner-b"]);
    assert.deepEqual(ui.refreshResults.find(item => item.owner === "owner-b"), { owner: "owner-b", ok: true });
    assert.deepEqual(ui.refreshResults.find(item => item.owner === "owner-a"), { owner: "owner-a", ok: false });
  } finally { await ui.cleanup(); }
});

test("a real connection failure remains visible and a later successful retry clears it", async () => {
  const ui = await mount();
  try {
    await ui.settle("owner-a", { data: null, error: Error("Network unavailable") });
    assert.deepEqual(ui.refreshResults, [{ owner: "owner-a", ok: false }]);
    assert.equal(ui.value().profileError, true);
    assert.equal(ui.value().profileLoading, false);
    let retry;
    await ui.run(current => { retry = current.reloadProfile(); });
    assert.equal(ui.value().profileLoading, true);
    await ui.settle("owner-a", { data: profile("owner-a"), error: null });
    assert.equal(await retry, true);
    assert.equal(ui.value().profile.id, "owner-a");
    assert.equal(ui.value().profileError, false);
    assert.equal(ui.value().profileLoading, false);
  } finally { await ui.cleanup(); }
});
