# Installed Android testing handover

Working branch: `character-profile-redesign`. These are local preparations, not a production-readiness claim. No commit, push, merge, EAS build/update, remote migration or account change was performed in this task. The administrator recovery command was not launched.

## Changes

- Session notifications use real SDK types. Android ongoing alerts use the immediate `{ channelId }` trigger; completion alerts use a time-interval trigger with `channelId`. iOS keeps `null` immediate triggers and interval triggers without Android fields. New v18 channels separate sound/haptic preferences and avoid inheriting earlier channel sound defaults. Phone channel settings remain authoritative.
- Serialized native requests replace/cancel both identifiers on timer transitions and provider teardown. Restoring an active session schedules its remaining seconds; paused/absent restoration clears stale alerts. Native failures are best-effort and do not convert successful session RPCs into timer failures. Permission prompts stay in Settings.
- Daily goal editing stays read-only unless the getter explicitly returns `scheduling_available: true`. Missing RPCs never open a broken editor. Today's saved daily target takes precedence over the profile baseline. Shared onboarding/goal validation now uses the existing backend's **15–480** whole-minute range; session/quest duration retains its separate **1 second–480 minutes** / **1–480 minutes** range.
- Duration editor state no longer synchronizes mounting in an effect. Its draft stays mounted until sheet dismissal, resets on reopening, and ignores a dismissal callback while visible. Wheel/keyboard/safe-area behavior is retained. Full lint is included in the existing CI checks for PRs to `main`.
- `preview` is an internal standalone Android APK, on update channel `preview`, using EAS environment `preview`. Package/bundle identity remains `com.soonteck.liferpg`. App version is now `1.1.0`; runtime policy is `fingerprint`, replacing the reused `1.0.0` app-version runtime.

## Configuration and fresh binary

Local Expo config introspection resolves Android's VIEW/DEFAULT/BROWSABLE intent filter for `liferpg` and iOS `CFBundleURLSchemes` containing `liferpg`. Both use `liferpg://auth/recovery`. Cold/warm recovery handling and recovery-before-protected-provider priority are covered by mocked regression tests, not installed-device evidence.

**A fresh Android APK is required.** The new runtime policy/version, native SDK/dependencies, notification permissions/plugin and registered URI scheme cannot be assumed to exist in the old APK. OTA JavaScript cannot register a scheme or add a missing native module. Fingerprint runtime separates native compatibility automatically; do not send this branch to old `1.0.0` binaries. Native changes need another build. [Expo runtime compatibility](https://docs.expo.dev/eas-update/runtime-versions/).

Keep the existing Android keystore and use a versionCode higher than the installed APK. Preview now requests auto-increment with remote version management; the existing counter and signing certificate were not inspected. Confirm those before building. Same package and signing certificate permit replacement installation with data retained; do not uninstall the old app as a workaround. The old APK's SDK, runtime, channel, manifest and certificate have not been examined. iOS scheme/bundle configuration is preserved, but provisioning and an installed iOS build remain untested.

## Operator steps, not performed here

1. In EAS project's **preview** environment, privately configure `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Use the LifeRPG project URL and a publishable key (or legacy anon key), never a service-role/admin key. Use plaintext or sensitive visibility so the same values are readable for Update. `.env` is ignored and is not a cloud environment configuration. Do not create admin variables for this app. Local values passed the credential-free preflight; the EAS environment itself has **not** been inspected.
2. The build's `eas-build-post-install` hook validates these public values without printing them. It rejects missing values, a wrong project URL, private keys and administrator-named `EXPO_PUBLIC_` variables. This is a configuration check, not a connection/authentication test. Build and update must select the same EAS environment. [Expo environment usage](https://docs.expo.dev/eas/environment-variables/usage/).
3. Supabase Authentication → URL Configuration: save the exact `liferpg://auth/recovery` Redirect URL. Reset Password email template must link to `{{ .ConfirmationURL }}`. Confirm email confirmation, password policy, expiry/rate limits and sender configuration using a controlled inbox. A previous invalid-token routing probe fell back to localhost; current dashboard configuration/native mail handoff have not been rechecked. See [password recovery](password-recovery.md).
4. Goal APIs remain absent on the inspected backend. Leave goal editing read-only. SQL/RLS/concurrency execution and a managed migration are unfinished until disposable local PostgreSQL testing is available. See [daily-goal migration readiness](daily-goal-migration.md). Never apply the proposal to production merely to unlock the editor.

After the operator completes environment/signing/dashboard checks, these are the commands to run manually, not commands executed by this task:

```sh
# Standalone internal APK; environment "preview" is selected by eas.json.
npx eas-cli@latest build --platform android --profile preview

# Only after the fresh APK passes acceptance and the fingerprint is compatible.
# This publishes remotely; it is not a dry run.
npx eas-cli@latest update --platform android --channel preview --environment preview --message "LifeRPG preview fixes"
```

EAS CLI minimum remains 23.2.0. Authenticate privately; preserve the project's existing signing credentials. Commands follow [Expo APK configuration](https://docs.expo.dev/build-reference/apk/). No login, credentials operation, cloud build or update was launched here.

## Installed Android acceptance

Record APK version, native runtime/channel and pass/fail. Keep password and email-link credentials private. Stop Metro for this test.

- [ ] Install as an update without clearing data. Confirm the same account/profile, badge, quests, XP/gold and saved history.
- [ ] Register with an accessible inbox, confirm email and sign in. Duplicate registration stays neutral and does not change the existing password/account. Protected routes require a verified session; new accounts still complete onboarding.
- [ ] Request Forgot password; open a fresh real email with the app closed, then repeat warm/backgrounded. Reach Set new password before Home/onboarding. Invalid/expired links offer another email. Save privately, Return to sign in and log in with the new password; old password fails. Verify account data remains intact.
- [ ] Enable notifications explicitly in Settings; deny/re-enable in phone settings and verify refreshed status. Start a session, background it and verify real ongoing/completion alerts. Check sound/haptics combinations and phone overrides. Permission or a scheduled request is not delivery proof.
- [ ] Restart while running and while paused. Verify exact remaining time, no duplicated completion alert, and that paused/end states clear stale alerts. Resume/end, and check network/notification failure paths keep session safeguards.
- [ ] Complete a session and retry/reopen its summary. Credit occurs once, using the existing whole-minute XP/gold calculation. A goal change/read does not award rewards or alter streaks/history. The absent goal API shows a read-only goal.
- [ ] Replay introduction for a completed account; profile/onboarding/progress stay unchanged. Verify sign-out protection during an open/unresolved session and account switching without cached data leakage. Check password visibility, keyboard, sheet dismissal, TalkBack and reduced motion.

## Verification record

On 2026-10-04:

- Working tree: `npm run typecheck`, `npm run lint`, `npm test`: passed; **151/151** tests.
- Isolated copy using the exact lockfile dependencies: TypeScript, full lint and **151/151** tests passed. Installed direct versions match the lockfile and satisfy the locked Expo SDK's bundled version ranges. The user's main node_modules and running servers were not replaced. Local npm's install-script policy produced a warning on the initial installation; the isolated reinstall used `npm ci --offline --ignore-scripts` and the checks ran after dependency installation completed. This verifies source/SDK typing and tests, not native install scripts or a release build. Dependency advisory notices were not investigated in this task; no automatic dependency/economy redesign was applied.
- Resolved Expo native config: Android scheme intent filter, iOS URL types, package/bundle IDs, notification permissions, updates URL and fingerprint policy inspected. Public Supabase local environment preflight passed without printing values. Cloud EAS values/signing were not inspected.
- Normal `--go --lan` server startup passed on test port 8083; `/status` returned running and Expo's launch endpoint returned an `exp://192.168.0.96:8083` QR URL. No tunnel was required. React Native DevTools fell back after a local cache-access error; Metro started. Phone scanning/login/UI were not exercised.
- Android fingerprint calculation completed locally. Its hash is not a release-runtime guarantee: actual dependencies/configuration and selected environment must match at build and update time.
- Android JavaScript/Hermes export using locked dependencies: **passed**, producing one Android `.hbc` bundle and metadata. The first sandboxed attempt failed because Windows denied executing Hermes; rerunning the same local export with the compiler permitted and two workers succeeded. This is a local bundle check, not an APK, EAS publication or device test.
- Read-only Supabase schema/function/constraint inspection completed. Completion SQL body comparison preserves the existing economy except for the goal resolver. **SQL/RLS/concurrency execution and managed migration validation remain unfinished:** no disposable local PostgreSQL, Docker or Supabase CLI was available.

Real email delivery, installed Android/iOS recovery, notification delivery, native accessibility, EAS environment/signing and SQL execution are not validated by these local automated checks. Administrative helper unit tests use fake clients; its CLI/private credential loader was not executed.
