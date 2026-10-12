# Android live countdown: next implementation slice

Baseline inspected: `feature/session-reliability` at `138b6ae`, Expo SDK 57 / React Native 0.86. The user accepted the latest account-screen correction, asked to move to the next stage, and directly approved “Approve native countdown and new APK.” The local module and its provider integration implement the scope below. No live database change is part of this slice.

## Deliverable

A native Android notification shows a system-drawn countdown while LifeRPG is backgrounded or the phone is locked. It names the session, displays fixed remaining time and a progress bar when paused, and offers controls that open the existing timer safely. Running progress is represented by the live countdown, without a frozen progress bar. The finish alert comes from the stored deadline. Rewards remain confirmed by the existing server completion receipt.

The implementation uses a small local Expo Kotlin module, existing AndroidX notification/alarm APIs and the existing notification/exact-alarm permissions. No always-running foreground service, full-screen alert, battery-exemption request or promoted-notification permission is proposed. A new installed development/preview APK is necessary; Expo Go cannot run the module.

## Change from the earlier storage plan

The original design assumed the AsyncStorage foundation and native store would ship together. AsyncStorage is now installed and has been tested by the user, including pending completions and early Ends. Replacing it now requires a real crash-safe migration of every journal record and command. A native `getItem`/`setItem` shim is insufficient because the store's callback read/modify/write is only serialized inside JavaScript.

For this smaller next slice, keep the shipped journal as the sole session authority. Native code persists only a derived notification projection: owner/backend, admission generation, client/session IDs, journal/record revisions, confirmed state, target, remaining time/deadline, display title and notification preferences. This is a display/alarm cache, not a second journal. Native receivers cannot modify session state, mark a session complete, send a reward request or grant XP. Alarm expiry changes only notification presentation. JavaScript recovers the existing deadline and performs the existing completion path when available.

The full native AtomicFile journal authority stays a separate integration step with an explicit adoption marker, retained legacy backup, authoritative native load/dispatch, receiver fences and JVM migration tests. Offline Start and local offline Pause/Resume still require the later client-reported backend contract; this slice does not activate them.

## Notification and action rules

- Running: `setWhen(deadlineMs)`, `setUsesChronometer(true)` and `setChronometerCountDown(true)` draw the number without per-second JavaScript posts. On Android 8+, use `setTimeoutAfter(remainingMs)` so Android removes the ongoing countdown at its deadline even when the expiry alarm is delayed. Android 7, old binaries and Expo Go retain the static fallback. The native progress bar is shown only while paused, when its snapshot stays accurate.
- Paused: disable the chronometer and show the persisted remaining time. Uncertain transitions show a calm checking state instead of inventing confirmed timing.
- Expired: remove the ongoing countdown and show a single “Session finished” / “Open LifeRPG to save or view your progress” alert. Notification delivery is not evidence that rewards were saved. A JS completion racing the alarm preserves or delivers this alert only when the stored native deadline has elapsed. An early End clears alerts without creating a finish alert.
- Pause/Resume: immutable owner/session/generation/revision tokens open the foreground app, which reloads and validates the current journal before using its existing server-confirmed control path. They do not execute an unverified background transition.
- End: open the existing End confirmation. A stale action cannot end a newer session. Proven full expiry follows the existing completion-at-zero behavior; a zero estimate with an unresolved Pause/Resume is not proof that the server reached the target. An earlier durable End continues through its stop-confirmation path and never becomes a completion.
- Use an explicit app activity PendingIntent and opaque action identity; externally supplied deep links alone must not authorize a session command. Consume a validated action once, and never blindly repeat an unknown Pause/Resume.
- Respect lock-screen privacy, notification permission denial, sound/haptics preferences and the user's channel settings.
- Activate exactly one notification implementation. Confirm cancellation of old Expo ongoing/finish requests before native publication; a failed cancellation is retried and cannot enable a second renderer. Native selection remains sticky during failures. Old binaries, Expo Go, iOS and web retain the current supported fallback.
- Same-revision refreshes reread the native cache; they cannot replace its timing or reissue action nonces. A failed publication removes obsolete presentation without changing the session journal. Clearing a lease is idempotent; an uncertain reply can safely be checked again.

## Alerts and lifecycle

The installed Expo notification scheduler already uses `setExactAndAllowWhileIdle` when exact-alarm access is available and `setAndAllowWhileIdle` otherwise. The native module must preserve that capability-aware behavior and expose the actual access state to Settings. Existing manifest declarations do not prove that access is granted.

Persist the derived projection atomically and serialize renderer/alarm changes. Scope each alarm to the renderer lease, account, session and revision. Pause, End, account revocation and replacement cancel stale alarms. A stale receiver must reread and reject an obsolete projection. Reconcile on launch, foreground, grant changes, time changes and boot/first unlock where credential-protected storage is available.

Ordinary process death is different from Settings → Force stop. Android can prevent delivery and cancel PendingIntents while the package is stopped; recovery is repaired on explicit reopening. Exact alarms also have Doze throttling. Denied/revoked access can delay an inexact alert; the ongoing notification's system timeout keeps it from intentionally running into an overtime display while that alert waits. Do not promise timely finish alerts under every OS restriction.

Android 16 promoted Live Updates are an optional later presentation experiment. They depend on platform/device/user eligibility and a separate `POST_PROMOTED_NOTIFICATIONS` declaration. This baseline does not add that permission or promise a status-bar chip on every Samsung phone. iOS Live Activities remain separate work.

## Verification before delivery

1. Pure projection/action tests: wrong owner/backend, old generation/session/revision, duplicate action, pending End, unknown Pause/Resume, expired End and preferences.
2. Adapter tests: one active renderer, missing native module fallback, no duplicate Expo/native finish alerts and old teardown cannot clear a new owner's projection.
3. Native JVM tests: actual Kotlin projection parsing, cache serialization, stale alarm/action rejection, deadline/clock conversion, clear/expiry races and lease tombstones. The existing 16 shared journal timer vectors are consumed by TypeScript; the native renderer operates on the derived projection, not the journal. Android AtomicFile crash windows and concurrent receiver/bridge execution still require device/instrumentation checks; pure JVM tests do not verify Android storage.
4. Android compilation in a fresh preview build, after module/build approval. Keep backend, XP, existing journals and saved session history unchanged.
5. Installed Samsung plus another Android device: locked countdown; pause/resume action opens the correct session; End confirmation; background process death; restart; permission denial/revocation; sound/haptics; reconnect and exactly one receipt; reboot/first unlock; Force Stop then explicit reopen. Record actual results without assuming they pass.

## Approval and implementation

The milestone brief says: “No new native dependency or custom native module without asking first. State the trade-offs, the Expo Go impact and the rebuild impact.” The user subsequently gave direct approval for this local Kotlin renderer and a new preview APK. The module uses existing AndroidX APIs through Expo Modules Core and the existing permissions; it adds no new permission or JavaScript dependency.

The initial pure helpers were followed by the native lifecycle, provider coordinator, foreground action handling, Kotlin renderer/cache/alarm receiver, strict legacy notification takeover and actual precise-alert access in Settings. Native-issued opaque nonces are consumed before the current journal validates the action. Cold launches retire old action leases and open the timer for the user to control; notification buttons are labelled “Pause in app”, “Resume in app” and “End in app”.

The build 6 device review found a constant one-second lead in notification digits and warm actions that only opened the timer. The follow-up corrects the chronometer's display base to align whole-second rounding with the app; stored timing, expiry alarm and timeout remain unchanged. [Android's Chronometer source](https://android.googlesource.com/platform/frameworks/base/+/refs/heads/main/core/java/android/widget/Chronometer.java) establishes its countdown numeral rounding. Independent OS/app redraws can still briefly straddle a second boundary.

For warm notification actions, synchronous native `OnNewIntent` capture verifies an issued nonce and stores one process-local launch notice. JS drains it before its usual foreground refresh, skipping that one incidental refresh so it cannot invalidate the requested action. Notice proof survives route-first or foreground-first event ordering and retires with lease/account/session/epoch replacement. The actual command still uses exact journal revision checks and the existing controller; a launch notice cannot authorize a command. Ordinary manual foregrounding still refreshes. Cold recovery remains timer-only because its old lease is retired. See the updated device flow for the user's build 6 results and focused retest.

Expo autolinking independently resolved `session-countdown` and `expo.modules.sessioncountdown.SessionCountdownModule`. The Kotlin policy and parser run as real JUnit tests; Android-bound renderer/repository/receiver compile against the available local SDK. The complete Expo bridge/release compilation belongs to the fresh EAS preview build. Installed-device results remain unverified until the user runs [the device checks](android-countdown-device-checks.md).

Primary sources rechecked for this slice:

- [Expo SDK 57 notifications](https://docs.expo.dev/versions/v57.0.0/sdk/notifications/)
- [Expo local modules](https://docs.expo.dev/modules/get-started/)
- [Android notification chronometer](https://developer.android.com/reference/android/app/Notification.Builder#setChronometerCountDown(boolean))
- [Android alarm scheduling](https://developer.android.com/develop/background-work/services/alarms/schedule)
- [Android stopped-package behavior](https://developer.android.com/about/versions/15/behavior-changes-all#stopped-state)
- [Android Live Updates](https://developer.android.com/develop/ui/views/notifications/live-update)
