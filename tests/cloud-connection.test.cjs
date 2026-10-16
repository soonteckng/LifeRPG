/* global __dirname */
const test = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), ts = require("typescript");
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { resolve, promise }; };
const owner = { ownerId: "account-a", backendId: "fixture-project.supabase.co", admissionEpoch: 3 };
function fixture(fetcher) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, "../src/services/cloudConnection.ts"), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  new Function("exports", "module", code)(module.exports, module);
  const api = module.exports, failures = [];
  api.setCloudConnectionScope(owner); api.subscribeCloudConnectionFailure(scope => failures.push(scope));
  return { ...api, failures, request: api.connectivityAwareFetch(owner.backendId, fetcher) };
}

test("transport observation sends no extra requests and exposes only the admission scope on failure", async () => {
  let calls = 0;
  const f = fixture(async () => { calls++; throw new TypeError("Network request failed"); });
  assert.equal(calls, 0);
  await assert.rejects(f.request("https://fixture-project.supabase.co/rest/v1/private-table", { headers: { Authorization: "secret" }, body: "private" }), TypeError);
  assert.equal(calls, 1); assert.deepEqual(f.failures, [owner]);
});

test("a cancelled HTTP read does not switch the account offline", async () => {
  const controller = new AbortController();
  const f = fixture(async () => { controller.abort(); throw new TypeError("fetch aborted"); });
  await assert.rejects(f.request("https://fixture-project.supabase.co", { signal: controller.signal }), TypeError);
  assert.deepEqual(f.failures, []);
});

test("HTTP permission, expired-token and validation replies remain SDK results, while unavailable backend responses suggest local mode", async () => {
  for (const status of [200, 400, 401, 403, 409, 429, 502, 503, 504]) {
    const response = { status };
    const f = fixture(async () => response);
    assert.equal(await f.request("https://fixture-project.supabase.co"), response);
    assert.equal(f.failures.length, [502, 503, 504].includes(status) ? 1 : 0);
  }
});

test("late failures from a previous admission or backend cannot affect the current owner", async () => {
  for (const replacement of [null, owner, { ...owner, ownerId: "account-b" }, { ...owner, admissionEpoch: 4 }]) {
    const wait = deferred();
    const f = fixture(async () => { await wait.promise; throw new TypeError("Network request failed"); });
    const pending = f.request("https://fixture-project.supabase.co");
    f.setCloudConnectionScope(replacement); wait.resolve();
    await assert.rejects(pending, TypeError); assert.deepEqual(f.failures, []);
  }
  const foreign = fixture(async () => { throw new TypeError("Network request failed"); });
  const request = foreign.connectivityAwareFetch("other-backend", async () => { throw new TypeError("Network request failed"); });
  await assert.rejects(request("https://other-backend"), TypeError); assert.deepEqual(foreign.failures, []);
});

test("an older delayed failure cannot hide a more recent successful connection", async () => {
  const wait = deferred(); let calls = 0;
  const f = fixture(async () => {
    if (++calls === 1) { await wait.promise; throw new TypeError("Network request failed"); }
    return { status: 200 };
  });
  const old = f.request("https://fixture-project.supabase.co");
  await f.request("https://fixture-project.supabase.co"); wait.resolve();
  await assert.rejects(old, TypeError); assert.deepEqual(f.failures, []);
});

test("a faulty observer cannot consume or replace a request error", async () => {
  const error = new TypeError("Network request failed"), f = fixture(async () => { throw error; });
  f.subscribeCloudConnectionFailure(() => { throw Error("observer failed"); });
  await assert.rejects(f.request("https://fixture-project.supabase.co"), actual => actual === error);
  assert.equal(f.failures.length, 1);
});
