/* global __dirname */
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), ts = require("typescript");

const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const state = (stardust, revision = 1) => ({ stardust, nextFindSeconds: 600, owned: [], earned: [],
  avatar: { look: {}, equipped: {}, frame: null, background: "bg_dusk", title: null, revision },
  pack: { date: "2026-10-24", claimed: false, goalReached: false, tier: 0, daysInARow: 0 }, today: { seconds: 0, finds: 0 } });

function setup() {
  const saved = new Map(), module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, "../src/services/rewardsStore.ts"), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  new Function("require", "module", "exports", code)(name => {
    if (name === "./rewardsService") return { parseRewardsState: value => value };
    if (name === "./rewardCatalog") return { STREAK_FRAMES: [] };
    return require(name);
  }, module, module.exports);
  const store = module.exports.createRewardsStore({ getItem: async key => saved.get(key) ?? null,
    setItem: async (key, value) => { saved.set(key, value); } });
  return { store, saved, cacheKey: module.exports.rewardsCacheKey };
}

test("a late rewards read cannot roll back a newer claim or its offline cache", async () => {
  const { store, saved, cacheKey } = setup();
  await store.load("owner", { load: async () => state(10) });
  const reply = deferred(), started = deferred();
  const reading = store.load("owner", { load: () => { started.resolve(); return reply.promise; } });
  await started.promise;
  const result = await store.act("owner", async () => ({ state: state(44, 2), sessions: [] }));
  assert.equal(result.ok, true);
  reply.resolve(state(10)); await reading;
  assert.equal(store.snapshot("owner").state.stardust, 44);
  assert.equal(store.snapshot("owner").state.avatar.revision, 2);
  assert.equal(JSON.parse(saved.get(cacheKey("owner"))).stardust, 44);
  assert.equal(store.snapshot("owner").loading, false);
});

test("a stale failed refresh cannot replace successful claim feedback with a connection error", async () => {
  const { store } = setup();
  await store.load("owner", { load: async () => state(10) });
  const reply = deferred(), started = deferred();
  const reading = store.load("owner", { load: () => { started.resolve(); return reply.promise; } });
  await started.promise;
  await store.act("owner", async () => state(30, 3));
  reply.reject(new Error("old refresh failed")); await reading;
  assert.equal(store.snapshot("owner").state.stardust, 30);
  assert.equal(store.snapshot("owner").error, null);
  assert.equal(store.snapshot("owner").loading, false);
});

test("opening another rewards consumer during a mutation does not start a redundant read", async () => {
  const { store } = setup();
  await store.load("owner", { load: async () => state(10) });
  const reply = deferred();
  const saving = store.act("owner", () => reply.promise);
  let reads = 0;
  await store.load("owner", { load: async () => { reads++; return state(10); } });
  assert.equal(reads, 0);
  assert.equal(store.snapshot("owner").busy, true);
  await store.load("other-owner", { load: async () => state(90) });
  assert.equal(store.snapshot("other-owner").state.stardust, 90, "other accounts retain independent requests");
  reply.resolve(state(25, 2)); await saving;
  assert.equal(store.snapshot("owner").state.stardust, 25);
});

test("a failed mutation does not discard a valid pending initial rewards read", async () => {
  const { store, saved, cacheKey } = setup();
  const reply = deferred(), started = deferred();
  const reading = store.load("owner", { load: () => { started.resolve(); return reply.promise; } });
  await started.promise;
  const result = await store.act("owner", async () => { throw Error("Not enough Stardust"); });
  assert.equal(result.ok, false);
  assert.match(result.message, /Not enough Stardust/);
  reply.resolve(state(40)); await reading;
  assert.equal(store.snapshot("owner").state.stardust, 40);
  assert.equal(store.snapshot("owner").error, null);
  assert.equal(store.snapshot("owner").busy, false);
  assert.equal(store.snapshot("owner").loading, false);
  assert.equal(JSON.parse(saved.get(cacheKey("owner"))).stardust, 40);
});
