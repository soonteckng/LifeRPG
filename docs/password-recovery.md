# Password recovery

Implemented on the working branch; no commit, push, deployment, account deletion, or database/profile changes.

Current priority (user instruction on 2026-10-04): installed Android/iOS recovery is the acceptance target. Expo Go recovery is optional and should not delay installed-app work. Resolved Expo config confirms scheme `liferpg`, Android package and iOS bundle identifier `com.soonteck.liferpg`, and Expo Router. A safe invalid-token redirect probe for `liferpg://auth/recovery` currently still returns the project's localhost fallback: the stable native URI must be saved in the Supabase Redirect URLs list and rechecked before testing an installed build. The custom-scheme callback does not require Metro or an Expo tunnel. No installed build/device end-to-end recovery test has passed yet.

## Flow and safeguards

Login's **Forgot password?** opens a themed email form. The form validates email, shows request progress, disables repeated submissions after confirmation, and displays the same neutral confirmation for existing and unknown addresses. The provider also enforces a 60-second request cooldown across screen re-entry. To request again after confirmation, return to sign in and reopen Forgot password after the cooldown. Network/provider failures allow retry; rate-limit errors explain when to try again.

The existing Supabase client uses the implicit flow with manual link handling (`detectSessionInUrl: false`). Recovery uses `resetPasswordForEmail(email, { redirectTo })`, then `updateUser({ password })`. Cold-start and foreground URLs are handled. Implicit token callbacks require `type=recovery`; native `setSession` emits SIGNED_IN, so the recovery gate is set before that call. Token-hash callbacks use `verifyOtp({ type: "recovery", token_hash })` and its actual PASSWORD_RECOVERY event. PKCE code callbacks are accepted only if Supabase emits PASSWORD_RECOVERY; this app does not issue PKCE recovery requests or promise cross-device code exchange.

Recovery is rendered ahead of UserProvider, profile loading, onboarding, Home, and timer/reward providers. A non-secret device marker is persisted before session installation and tied to the recovered account. Restarts resume verified recovery; incomplete or mismatched markers fail closed. Session/account changes invalidate password editing. Concurrent link delivery, requests, and saves are guarded. Callback credentials are removed from browser history. No passwords, callback URLs, or tokens are logged.

Set new password requires at least 8 characters and matching confirmation. Supabase's dashboard password policy remains authoritative; weak/same-password failures are actionable and retain the draft. Invalid or expired callbacks offer another email request. After successful saving, the screen explicitly confirms the update. **Return to sign in** must successfully sign out locally before clearing the recovery gate. It does not delete the account or alter profiles, progression, onboarding flags, or other devices' client storage. Password changes may have provider-side session effects according to Supabase policy.

Login, Register, and both new-password inputs share accessible Show password / Hide password controls with 50-pixel targets. The controlled input stays mounted with its value; active focus is restored after visibility changes. Forms use keyboard avoidance and scrolling. Actual native focus, cursor behavior, and keyboard reachability still require device testing.

The Supabase client disables persistence/refresh only during server rendering so Expo static web export does not access nonexistent browser storage. Native and browser persistence remain enabled.

## Redirect and build audit

| Runtime | Requested redirect | Required verification |
| --- | --- | --- |
| Installed Android / Android development build | `liferpg://auth/recovery` | Existing `expo.scheme=liferpg`, package `com.soonteck.liferpg`; test a build with that scheme registered. |
| Installed iOS / iOS development build | `liferpg://auth/recovery` | Added bundle identifier `com.soonteck.liferpg` to match Android. Confirm Apple provisioning uses this identifier before building. No signed iOS build was produced. |
| Expo Go | Hostname-based `exp://<Expo-tunnel-host>/--/auth/recovery` from `Linking.createURL` | Start Expo with `--go --tunnel` and allowlist the actual displayed URL. Current Supabase Auth rejects non-loopback IP redirect hosts before the allowlist, so a `192.168…` LAN callback falls back to Site URL. Keep the tunnel running and test phone handoff. Use a development build for a stable callback. |
| Local web | Actual browser origin plus `/auth/recovery` (for example `http://localhost:8081/auth/recovery`) | Allowlist the exact origin/port used by Expo; reload and direct navigation must serve the callback route. |
| Hosted web | Hosted origin plus `/auth/recovery` | No production domain is configured/audited here. Add the exact URL when hosting is chosen, and ensure callback requests serve the app. |

`Linking.createURL("auth/recovery")` chooses the runtime callback. Only a URL matching its protocol, host, and path is consumed. The configured custom scheme covers native builds; no HTTPS universal links, iOS associated domains, Android verified app links, or association files are configured. Those require a controlled domain and separate native configuration. A native scheme/config change requires a new binary; an OTA update cannot register a missing scheme.

### Supabase dashboard configuration (not changed or verified)

The temporary **DEVELOPMENT CALLBACK** display was removed from Forgot password at the user's request after their successful recovery report. Diagnostics belong here rather than in the form. The provider still uses the runtime's `Linking.createURL("auth/recovery")`, not a hardcoded tunnel host. If a freshly requested email reaches `http://localhost:3000`, verify the allowlist in project `msuelivxpsfizkddjjfg` matches the actual hostname callback and inspect the Reset Password template's anchor. The standard template should use `<a href="{{ .ConfirmationURL }}">Reset password</a>`; a SiteURL-based custom anchor can send users to the fallback despite a correct allowlist. Do not substitute a bare RedirectTo anchor, which would omit authentication verification. Ask only for a credential-free development URL or template placeholder, never a real email URL/token.

### Restarting development versus installed builds

For this Expo Go recovery setup, start `npx expo start --go --tunnel --port 8082` and scan that server's QR code. Plain `npx expo start` normally returns to a LAN IP connection: ordinary app use/sign-in remains available, but this project's recovery callback is rejected by Supabase. The guard prevents sending another misleading reset email in that case. The temporary tunnel host can change after restart. If it changes, add the new exact `exp://<hostname>/--/auth/recovery` in Supabase before requesting a fresh email, and keep the tunnel running until recovery is complete. Do not assume an old email can reach a stopped or changed development server.

The current server's credential-free launch URL can be read from the terminal QR text or `http://localhost:8082/_expo/open?platform=android&runtime=expo` (GET only; use the actual Metro port). For Expo Go append `/--/auth/recovery` to the launch URL to form the callback. Do not obtain a callback by copying a token-bearing email URL.

An installed Android/iOS build uses the configured stable scheme `liferpg://auth/recovery`. Add that exact URI to Supabase and verify a build containing the scheme registers it with the OS. The same reset-email/session/new-password provider flow applies without Metro, QR scanning or a tunnel. Installed/native flow remains untested; the user's successful report applies to their Expo Go tunnel test only. A custom scheme requires the app to be installed; there is no automatic installation fallback. See [Expo 57 Linking](https://docs.expo.dev/versions/v57.0.0/sdk/linking/) and [Supabase native deep linking](https://supabase.com/docs/guides/auth/native-mobile-deep-linking).

Follow-up on 2026-10-04: the saved LAN entry was visible in the user's screenshot but direct invalid-token probes still fell back to localhost. Current [Supabase Auth redirect validation](https://github.com/supabase/auth/blob/master/internal/utilities/request.go) rejects non-loopback IP hosts before matching the allowlist. The source permits same-Site-URL-origin redirects separately; this project's Site URL is localhost, so that exception does not cover its LAN Expo Go URL. The app now stops Expo Go non-loopback IPv4 reset requests before sending email, with instructions to use `--tunnel` or a development build. Tests verify hostname tunnel and installed-build requests still submit their exact callback. The synthetic invalid-token probe tests redirect routing only; it never sends email or modifies an account, and does not prove a real recovery flow succeeds.

1. Authentication -> URL Configuration -> Redirect URLs: add `liferpg://auth/recovery`, the actual development/Expo Go callback(s) in use, and exact web callbacks. Prefer exact production entries; avoid broad wildcards. Site URL should point to the intended web fallback, not an accidental localhost/default page. A disallowed redirect may fall back to Site URL.
2. Authentication -> Email Templates -> Reset Password: keep the link based on `{{ .ConfirmationURL }}` for the standard flow. Linking directly to `{{ .RedirectTo }}` without recovery credentials cannot establish a recovery session. A custom token-hash template must explicitly include the callback, `token_hash={{ .TokenHash }}`, and `type=recovery`; validate that separately before using it.
3. Verify email/password auth is enabled, SMTP/sender delivery configuration, reset email rate limits, OTP expiry, password policy, and any secure-password-change/reauthentication requirements. Disable email-provider link rewriting/tracking if it breaks auth links. A scanner may consume a single-use verification link; request a fresh email.
4. Test mail-client handoff to the installed application. A custom-scheme destination requires that app to be installed; there is no automatic store/install fallback in this change.

Dashboard settings, live delivery, SMTP, real recovery tokens, and native handoff were **not tested**. No real reset email was requested and no real account password was changed during implementation.

References: [Expo 57 Linking](https://docs.expo.dev/versions/v57.0.0/sdk/linking/), [Supabase resetPasswordForEmail](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail), [native deep linking](https://supabase.com/docs/guides/auth/native-mobile-deep-linking), [redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls), [updateUser](https://supabase.com/docs/reference/javascript/auth-updateuser).

## Manual end-to-end checklist

Use an existing test account with known saved data; never delete/recreate an account to recover it. Repeat on Android and iOS installed/development builds and, if supported, web. Record build/runtime, callback URL without credentials, and pass/fail. Do not paste or log email tokens or passwords.

- [ ] On Login, find Forgot password immediately. Submit empty/malformed email: validation appears and no request is made. Valid email shows loading; rapid taps/keyboard submit send once.
- [ ] Request for an existing address and an address without an account: both show the same neutral confirmation. Verify actual inbox/spam delivery for the existing test account. Confirm screen re-entry cannot bypass the 60-second cooldown.
- [ ] Open the newest email with the app closed: verify email -> Supabase verification -> configured callback -> Set new password. Home/onboarding must not appear first, including for an account that has not completed onboarding.
- [ ] Repeat with the app foregrounded and backgrounded, and while another account is signed in. Verify the recovery form targets the account from the link and does not change the other account's password/data.
- [ ] During recovery, use Back/Home deep links, background/foreground, force-close/reopen, and refresh web. The gate must remain; a bare callback without a verified stored recovery session must offer another email.
- [ ] Test an expired, consumed, malformed, and denied link; request a new email from the error screen and successfully open its newest link. Check failure never drops into Home using an unrelated existing session.
- [ ] Type in every Login/Register/new-password/confirmation field. Toggle Show/Hide multiple times with the keyboard open: value, focus, and cursor remain usable. Verify VoiceOver/TalkBack labels and reachability on small screens/large text.
- [ ] Test short/mismatched passwords, dashboard-policy rejection, current-password reuse, and offline saving. No success appears on failure; drafts remain and retry/request-another-email actions work.
- [ ] Save a valid matching password; rapid taps save once. Confirm Password updated. Return to sign in, then sign in using the new password. Verify the old password is rejected.
- [ ] Verify the same user ID, profile, Life areas, XP/gold, tasks, session history, preferences, and onboarding completion. New accounts still follow registration email confirmation and onboarding. Existing active/paused session and logout protections still behave normally.
- [ ] Verify logout failure retains the recovery gate and allows retry. No browser address/history or app console contains recovery credentials.

## Automated verification

Tests cover callback target/type validation, real provider method wiring through mocks, cold/warm callbacks, actual PASSWORD_RECOVERY handling, PKCE event gating, invalid/expired links, persistence failures/restarts, account changes, duplicate requests/saves, save/logout failures, neutral confirmation, validation/draft retention, visibility/focus behavior, and root-gate priority. These tests are not live Supabase/email/device tests.

Full-repository lint has an existing `react-hooks/set-state-in-effect` error at `src/components/DurationPicker.tsx:158`; authentication changes do not modify that file.

Validation on 2026-10-03:

- npm run typecheck: passed.
- npm test: 112/112 passed, including 17 new authentication/recovery tests.
- ESLint on changed authentication source files and the new recovery tests: passed.
- Expo static web export: passed, including /auth/recovery (19 routes). Temporary export files were removed after verification.
- Full-repository npm run lint: blocked by the pre-existing DurationPicker.tsx:158 error above.
- Real email delivery, dashboard allowlist/template settings, native builds, and device accessibility/keyboard behavior: not verified.

## Account audit follow-up

The inaccessible old test mailbox cannot be recovered with reset email. It was not deleted, recreated or administratively reset. Live testing requires a controlled inbox and remains pending; no remote account was changed. Signup confirmations are neutral and never establish authenticated access by themselves. Restored/new sessions now require server-verified identity before protected/onboarding providers mount. See [account-authentication-audit.md](account-authentication-audit.md) for the findings and current checks.
