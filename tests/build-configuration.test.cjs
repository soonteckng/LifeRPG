const test = require("node:test"), assert = require("node:assert/strict");
const { Buffer } = require("node:buffer");
const { validatePublicEnv } = require("../scripts/validate-public-env.cjs");
const valid = { EXPO_PUBLIC_SUPABASE_URL: "https://msuelivxpsfizkddjjfg.supabase.co", EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fixture" };
test("build preflight accepts public keys and rejects missing, private or wrong-project configuration without exposing values", () => {
  validatePublicEnv(valid);
  const jwt = role => `fixture.${Buffer.from(JSON.stringify({ role })).toString("base64url")}.fixture`;
  validatePublicEnv({ ...valid, EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: jwt("anon") });
  for (const env of [{}, { ...valid, EXPO_PUBLIC_SUPABASE_URL: "https://another.supabase.co" },
    { ...valid, EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_secret_private-fixture" },
    { ...valid, EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: jwt("service_role") },
    { ...valid, EXPO_PUBLIC_SERVICE_ROLE_KEY: "private-fixture" }]) {
    assert.throws(() => validatePublicEnv(env), error => !error.message.includes("private-fixture"));
  }
});
test("installed preview selects APK, preview environment/channel and a runtime distinct from old appVersion builds", () => {
  const app = require("../app.json").expo, eas = require("../eas.json");
  assert.equal(app.scheme, "liferpg");
  assert.equal(app.android.package, "com.soonteck.liferpg");
  assert.equal(app.ios.bundleIdentifier, "com.soonteck.liferpg");
  assert.equal(app.runtimeVersion.policy, "fingerprint");
  assert.notEqual(app.version, "1.0.0");
  assert.equal(eas.build.preview.android.buildType, "apk");
  assert.equal(eas.build.preview.environment, "preview");
  assert.equal(eas.build.preview.channel, "preview");
  assert.equal(eas.build.preview.developmentClient, undefined);
});
