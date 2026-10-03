# One-time local administrator email recovery

Authorized scope: project `msuelivxpsfizkddjjfg`, user `e7147605-e165-48bf-acf2-bcfdd095b6a5`, `test@email.com` → `zzz685913@gmail.com`, profile **Soon Teck**. This authorization replaces the earlier no-admin-recovery instruction for this specific email change only. No password change, account recreation, other-account mutation, commit, deployment or migration is authorized here.

## Status on 2026-10-03

Read-only database checks verified the original ID/email and Soon Teck profile. The target email is absent from account emails, pending email changes and identity emails. There are currently zero Auth session records for this user. No UPDATE triggers were found on `auth.users`. These checks must be repeated immediately before the update; they do not themselves change the account.

**Email change completed on 2026-10-03** using the local Node helper and the supported `auth.admin.updateUserById` API with only the email attribute. The private credential was configured locally; its value was never printed. The original email, target email availability and Soon Teck profile were verified again immediately before the mutation. Post-update API and separate read-only database checks confirm `zzz685913@gmail.com`, the same user ID and Soon Teck identity. Application rows are identical before/after: 1 profile, 5 subjects, 2 tasks, 0 rewards, 6 daily-progress records, 27 activity sessions and 0 reward chests. Auth session count remained zero. No password attribute, confirmation flag, metadata update or sign-out was submitted. No recovery email has been requested and no live redirect has been verified yet. Testing runtime: Expo Go; installed Android build remains untested. The existing app implementation and previous local work are preserved.

Local checks passed: 138/138 repository tests (including six administrator-helper safeguard tests), TypeScript checking and ESLint for the helper/tests. These are mock/local checks, not a live Auth admin update or recovery-email test.

The one-time credential was cleared from `.env.admin.local` after successful verification (the project key itself was not revoked). The existing Metro server returns the LifeRPG Expo Go SDK 57 manifest at `http://192.168.0.96:8081`; callback for this Wi-Fi session: `exp://192.168.0.96:8081/--/auth/recovery`. Computer-side serving is verified; phone handoff, dashboard allowlist/template and the real email flow await user verification. No extra Metro server was started.

User subsequently reported receiving a reset email, but opening its link produced “site can't be reached”. Delivery is user-reported; the full recovery flow has not passed. Metro remained reachable from the computer at the same Wi-Fi address. Diagnosis awaits only the failed page's protocol/host/port (never its token-bearing full URL) and confirmation of the exact dashboard allowlist entry and phone connectivity. A localhost fallback, unreachable development host and mail-client handoff failure require different remedies; no cause is confirmed yet. After correcting configuration, request a fresh email instead of reusing the failed message.

On 2026-10-04, the user confirmed the failed destination is `http://localhost:3000`, the message was freshly requested through LifeRPG in Expo Go, and the displayed actual development callback is `exp://192.168.0.96:8081/--/auth/recovery`. A direct verification-endpoint probe using an intentionally invalid, synthetic token (no real recovery credentials, no email request, no account update) and that exact `redirect_to` returned HTTP 303 to `http://localhost:3000/` with `otp_expired`. This verifies the project currently falls back for that requested callback, independently of the phone/mail client. It does not prove a real recovery token works. Inspect the persisted Redirect URLs in the specified project for an exact match, save the correct entry, then repeat this credential-free probe before requesting a fresh email. Dashboard edit access is unavailable in this agent session.

The user then supplied a screenshot showing the saved LAN callback. Repeated safe probes still fell back. Typographic-dash comparisons did not identify a valid alternative; the dash suspicion was unconfirmed. Inspection of current Supabase Auth source identified rejection of non-loopback IP redirect hosts before allowlist matching. A hostname-based Expo tunnel is being prepared. The app now blocks those Expo Go LAN requests before sending email and shows the remedy; native custom-scheme callbacks remain supported. No further administrator credential or account changes are needed.

Temporary Expo Go tunnel started on port 8082 using local `@expo/ngrok@4.1.3` (installed with `--no-save --package-lock=false`, no manifest/lockfile dependency change). Launch URL: `exp://bu-gyi8-soonteck-8082.exp.direct`; callback: `exp://bu-gyi8-soonteck-8082.exp.direct/--/auth/recovery`. The manifest supplies that hostname and public HTTPS `/status` returned HTTP 200 with Metro running. This is a temporary development server, not a deployment. The existing 8081 LAN server was not stopped. The tunnel must remain running through recovery and its hostname can change later. Awaiting the user to save the exact hostname callback in Supabase and open this tunnel session on the phone; then repeat the safe redirect probe before another real email request. No phone handoff or real password update has passed yet. Current checks: 139/139 repository tests, TypeScript and changed-file lint passed.

The user subsequently reported “everything works now” in the Expo Go tunnel flow. This is user-reported success; passwords and recovery links were never requested or inspected. Installed Android/iOS behavior remains untested. At their request, the temporary development callback/instructions were removed from the recovery form and the unused context field was removed; the callback still comes from Linking at runtime. The actionable LAN-connection guard remains. Post-cleanup authentication checks: 23/23 tests, TypeScript and changed-file lint passed. See [password-recovery.md](password-recovery.md#restarting-development-versus-installed-builds) for restarting Expo Go and the stable installed-app callback.

## Private credential setup

1. Open [this project's Dashboard API Keys](https://supabase.com/dashboard/project/msuelivxpsfizkddjjfg/settings/api-keys). Privately copy a secret key, or the legacy service_role key.
2. Open `.env.admin.local` in your local editor. Set `SUPABASE_SECRET_KEY=` to that value. Save privately; do not paste it into chat or terminal commands. This file is covered by the existing `.gitignore` rules. Do not use an `EXPO_PUBLIC_` name or change the application's public client configuration.
3. Tell the coding agent only that configuration is ready. The key is read exclusively by the local Node helper. The helper never prints credentials or raw provider error responses. Remove the local credential after completion; do not revoke a shared service_role key as part of this task.

## Guarded operation

Run from the repository root using Node, never inside Expo:

```powershell
node scripts/recover-test-account.cjs
node scripts/recover-test-account.cjs --apply
```

The first command is read-only. The second repeats `auth.admin.getUserById`, paginated `auth.admin.listUsers` checks (including pending/identity emails), and the exact profile check. It snapshots all of this user's rows in profiles, subjects, tasks, rewards, daily_progress, activity_sessions and reward_chests. It then calls **only**:

```js
supabase.auth.admin.updateUserById(
  'e7147605-e165-48bf-acf2-bcfdd095b6a5',
  { email: 'zzz685913@gmail.com' }
)
```

Supabase applies administrator updates directly without the normal email-confirmation flow. No password, metadata, confirmation flag or sign-out operation is submitted. Afterward the helper fetches the account again, verifies ID/email/creation time and compares a stable digest of all captured application rows. It prints only identity, row counts and verification status, never saved row contents or digests. Failures stop without automatic rollback or repeated mutation. If the API call times out, first inspect the account email; do not assume it failed or retry blindly. An already-changed original email is rejected on rerun.

Record separate read-only post-update checks of the profile, target email ownership and Auth session count. This helper does not read password hashes or log in with a password; preservation relies on submitting only the supported email attribute. Avoid using the app during the before/after snapshots, since ordinary app activity can change saved rows and cause verification to fail.

## Redirect verification before requesting email

Determine the actual runtime first. In [Authentication → URL Configuration](https://supabase.com/dashboard/project/msuelivxpsfizkddjjfg/auth/url-configuration), verify that its exact callback is allowlisted. Review the Reset Password template: the standard flow needs `{{ .ConfirmationURL }}`. See [password-recovery.md](password-recovery.md) for runtime URLs and dashboard requirements.

- Installed/development native build: verify `liferpg://auth/recovery` opens that installed LifeRPG build. A credential-free test link must open recovery and display the invalid-link/request-another-email state, never Home/onboarding. This checks app handoff without creating or consuming a real recovery token.
- Expo Go: obtain the current host-specific `exp://…/--/auth/recovery` callback from the running Metro runtime; verify the phone can reach Metro and the callback opens recovery. Do not substitute the installed-build scheme.
- Local web: run Expo web, verify direct navigation to its actual origin plus `/auth/recovery`, and verify the invalid-link recovery state. Allowlist the exact origin/port.

Only after these checks, open Login → **Forgot password?** in that runtime and submit the new accessible email. Open the newest message privately, confirm **Set new password** appears before protected screens, choose matching passwords privately, save, return to sign in and log in with the new email/password. Verify the same Soon Teck profile and saved progress/history. Do not share the email's recovery URL, tokens or password. See the complete [manual checklist](password-recovery.md#manual-end-to-end-checklist).

Callback handoff and dashboard inspection alone do not prove email delivery or a real recovery redirect. Record those outcomes only after the actual email flow succeeds. No dashboard settings or remote schema changes are included in the email-only administrator operation.

References: [supported updateUserById API](https://supabase.com/docs/reference/javascript/auth-admin-updateuserbyid), [server-only API keys](https://supabase.com/docs/guides/getting-started/api-keys), [paginated listUsers](https://supabase.com/docs/reference/javascript/auth-admin-listusers).
