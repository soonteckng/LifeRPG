// Build preflight only. Never reads administrator files or prints key values.
function validatePublicEnv(env) {
  const names = ["EXPO_PUBLIC_SUPABASE_URL", "EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY"];
  for (const name of names) if (!env[name]?.trim()) throw Error(`Missing ${name} in the selected EAS environment.`);
  let url;
  try { url = new URL(env.EXPO_PUBLIC_SUPABASE_URL); } catch { throw Error("EXPO_PUBLIC_SUPABASE_URL must be a valid URL."); }
  if (url.protocol !== "https:" || url.hostname !== "msuelivxpsfizkddjjfg.supabase.co" || url.username || url.password || url.search || url.hash) {
    throw Error("Public Supabase URL must target the expected LifeRPG project over HTTPS.");
  }
  const key = env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  let publicKey = key.startsWith("sb_publishable_");
  if (!publicKey) {
    try {
      const { Buffer } = require("node:buffer");
      publicKey = JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString()).role === "anon";
    } catch { /* Report a credential-free error below. */ }
  }
  if (!publicKey) throw Error("Only a publishable/anon key may be used in EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY.");
  if (Object.keys(env).some(name => name.startsWith("EXPO_PUBLIC_") && /ADMIN|SERVICE_ROLE|SECRET/i.test(name))) {
    throw Error("Administrator secrets must never use an EXPO_PUBLIC_ variable.");
  }
}
if (require.main === module) {
  try { validatePublicEnv(process.env); console.log("Public Supabase build configuration passed (values hidden)."); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { validatePublicEnv };
