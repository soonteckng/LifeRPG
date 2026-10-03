# Authentication and account audit

## Registration finding and limitation

The current Register action calls only Supabase `signUp({ email, password })`. It never calls `updateUser`, an admin API, profile upsert, account deletion, or a password-reset API. A returned signup `data.user` is not used to authenticate the UI. Supabase's installed auth-js documentation states that duplicate signup can return an obfuscated user with no session when confirmation settings protect account enumeration, or a duplicate-registration error under other confirmation configurations.

The previous copy said to confirm the account, which could be read as proof that registration succeeded. It now says: "If registration can be completed for this email, check your inbox for next steps. If you already have an account, sign in or use Forgot password." Both confirmation-only and duplicate responses stay unauthenticated. Recognised duplicate-registration error codes receive the same neutral confirmation. No lookup of account existence is added.

**The reported old-email incident cannot be classified as real authenticated access from the information available.** The source and mocked tests show that confirmation alone does not unlock routes. Historical auth events, an independently verified session, and the dashboard confirmation settings were not inspected. A pre-existing session or a genuinely issued provider session is a different case from a confirmation-only signup result; do not infer one from the returned user object.

AuthProvider now verifies restored/new session tokens with Supabase `getUser(access_token)` and requires the verified identity to match the session identity before exposing `user` to protected routes. It validates that both access and refresh credentials are present, rejects unrelated identities, and prevents late restoration/verification from overwriting newer auth events. Verification failures offer retry or local sign-out. A new app launch requires connectivity to verify its stored session. Already-verified same-account refreshes keep the account/timer providers mounted.

Root AuthGate stays ahead of profile/onboarding providers, including the preserved password-recovery gate. Completed accounts cannot directly re-enter editable onboarding; Replay the introduction remains available and skips all onboarding writes when setup is already completed. Registration never resets an existing account's password or progress. Server-side RLS and auth configuration remain essential and are not replaced by the client gate.

Provider references: [signUp](https://supabase.com/docs/reference/javascript/auth-signup), [getUser](https://supabase.com/docs/reference/javascript/auth-getuser), [password auth](https://supabase.com/docs/guides/auth/passwords). Local provider behaviour is also documented in `node_modules/@supabase/auth-js/src/GoTrueClient.ts` near the signUp method.

## Old-email recovery limitation and live testing

The old test email has no inbox the user controls. An email-reset flow cannot prove ownership or recover that account without access to its recovery mailbox. Registering again is not a recovery method. A later, separately authorized one-time email recovery is documented in [administrator recovery](administrator-recovery.md); this installed-app readiness task did not run that helper or modify accounts.

Use an accessible inbox for the complete signup/confirmation/login/reset/link/new-password/login cycle. The user reported successful Expo Go recovery earlier; installed Android/iOS testing remains pending. This task prohibits remote account changes, so no live signup, password change or administrative action was performed. Do not attempt recovery through the inaccessible mailbox, delete/recreate an account, or use duplicate registration to bypass ownership.

## Existing Settings improvements

- Account is first and compact: saved name/email, Edit profile, and progress time zone. Existing Settings, Sign out and Replay the introduction are reused.
- Sign out has its own SESSION ACCESS card and confirmation. Active/paused sessions, restoration, restoration failure, and busy session actions still block logout. Failures can be retried.
- Onboarding and Profile use the same ten existing emoji values in `src/constants/characterBadges.ts`. Stored selections are not normalised or replaced, including any value outside the catalogue.
- Daily focus goal uses shared 15-480 whole-minute validation matching the live onboarding RPC and profile/daily constraints. With the live scheduling API absent, Settings shows the current goal read-only without a broken editor. Editing requires explicit backend capability; tutorial copy qualifies its availability. See [migration readiness](daily-goal-migration.md).
- Notifications show permission status, with explicit Enable notifications, Open phone settings, or Retry permission check as appropriate. Foreground return refreshes status. Provisional and temporary iOS permissions are labelled accurately. Permission is not a delivery test.
- Normal Settings contains no Expo Go/EAS/widget/lock-screen developer copy. Unsupported runtimes say notifications are unavailable and offer no misleading enable action. Permission prompts are initiated by Settings rather than automatically by TimerProvider.
- The noninteractive Motion row is removed. Existing platform reduced-motion hooks and animation behaviour remain unchanged.

## Manual checks after authentication succeeds

1. With an accessible inbox, follow the full email recovery checklist in [password-recovery.md](password-recovery.md). Confirm duplicate registration does not replace the original password, user ID, profile or progress. Confirmation without a session must not open Home, Profile, Settings or onboarding; direct links must stay guarded.
2. Repeat startup with an invalid session and offline. No account routes appear before verification; verify retry and local sign-out. Check sign-in/out and recovery while another account was previously signed in.
3. Replay the introduction for a completed account. Exit/finish it and compare XP, gold, goals, milestones, tasks, badges and onboarding state. Nothing should reset.
4. Open Onboarding and Profile with each of the ten badges; make a name-only change with a saved badge and confirm it is retained.
5. After local SQL validation and a separately authorised backend rollout, edit the goal before/after local midnight and across a DST boundary. Compare today's stored target/history/rewards before and after scheduling. Verify tomorrow's target even before its first session, repeated saves, offline failure and multi-device reads.
6. On installed Android/iOS, test never-requested, denied, cannot-ask-again, granted, quiet and temporary permissions. Change permission in phone settings and return. Verify small-screen keyboard reachability and VoiceOver/TalkBack controls.
7. Verify notification delivery separately using a real completed/background session. Do not label permissions, mocked tests or a web build as proof of delivery.
8. Try Sign out during active, paused, busy, restoring and restoration-failed sessions. Finish/end/retry the session and verify normal logout. Test logout failure/retry.

Dashboard-only checks are in [authentication-dashboard.md](authentication-dashboard.md). Unapplied database steps are in [daily-goal-migration.md](daily-goal-migration.md). Developer notification diagnostics are in [notification-diagnostics.md](notification-diagnostics.md).

## Verification on 2026-10-03

- TypeScript: passed.
- Full regression suite: 132/132 passed. This includes the preserved recovery, progression, milestone, quest, session and tutorial checks.
- Changed source/new account-auth test lint: passed.
- Expo static web export: passed (19 routes, including /settings, /onboarding and /auth/recovery). Generated export files were removed after checking.
- Full repository lint: the existing unrelated react-hooks/set-state-in-effect error at src/components/DurationPicker.tsx:158 remains; that file was not modified.
- SQL proposal/transaction RLS tests: not executed; disposable local Postgres validation is required.
- Accessible-inbox signup/recovery, dashboard configuration, installed Android/iOS redirects, actual notification delivery and device accessibility/keyboard behaviour: not verified.
- No commit, push, deployment, migration application, or remote account mutation was performed.
