# Protection functional repair — 17 October 2026

Branch: `feature/protected-breaks`, following `7089f38`. Claude’s Home UI baseline remains on `feature/routines-widget`; this repair does not merge or redesign it.

## Behaviour

- Before Start, Allow list and Block apps disclose the actual launchable, nonessential app inventory. Each row says Allowed or Blocked and includes its package name to distinguish apps with the same name. Calls/emergency dialler, Home/launcher, Settings, system controls, permission/installation screens and LifeRPG are explicitly described as exempt. The existing native package/role policy enforces those exceptions.
- During a session, Details reads the saved account/session binding, including after recovery. It has no mode picker, editable checkboxes or Turn off protection action. Restoring genuinely interrupted protection uses exactly the original selection. Done stays reachable during restoration. The provider also refuses mid-session changes, rather than relying only on disabled UI.
- Permission Review opens Android settings from the host Activity even when a modal owns window focus. Starting protection retains its stricter window-focus check. Notification Review opens settings when already granted.
- The native cover has Back to my session, End session and Phone & emergency dialler. The separate Stop protection action is removed from both cover and notification; the notification instead opens the existing session-bound End confirmation. Dismissing the notification does not stop protection.
- The emergency action previously called `finish(..., "stopped")` in `finally`. It now only launches the exempt dialler. App detection removes the cover for that destination while the same lease keeps running. Opening any other blocked app still covers it. There is no blanket navigation grace period. A failed destination launch keeps protection and explains the failure.
- The foreground tracker retains the last resumed app across its PAUSED event, sparse event streams and lock/unlock. A launcher/System UI pause falls back to the underlying app, covering cancelled Recents/Home gestures even when the device omits a second app RESUMED event. Confirmed Home, Settings, allowed apps and emergency destinations remain exempt. Break and expiry checks still run independently on the monotonic clock.
- A normally pending online End shows no reconnect/error control. Retry is offered for an actual idle failure, an offline stop or confirmation taking more than three seconds. Done is always available; the durable cancellation and reward rules are unchanged.

## Email and database boundary

No production Auth/email requests or database changes are needed for this repair. Unit auth clients remain mocked. `npm test` and the app CI job now preload `tests/helpers/no-external-network.cjs`, which rejects external fetch/socket connections before test fixtures can contact a hosted service, including production Supabase. Loopback remains available for local capture. Dependencies are installed separately from the guarded test process.

This does not establish the cause of Supabase’s bounce warning or configure custom SMTP. Real user registration/recovery continues to use the existing Auth flow. Do not create fabricated production accounts, resend confirmation emails or run recovery-email delivery tests as part of acceptance. Use an existing account. SMTP and delivery metrics still need a separate production setup/review before release.

## Verification and release

- 1,153 app tests passed with external network blocked; none skipped. Typecheck and full lint passed.
- 28 JVM protection tests passed, including cancelled gestures, stale lifecycle events, emergency return, fixed allowed apps and break/expiry gating.
- The policy, runtime and service compiled against the installed Android API 33 framework. This is not a full release build or a physical-device test of the Expo bridge.
- No EAS build or EAS Update is submitted by this task. The native service/module changes require a fresh Android build. An OTA update alone cannot install these repairs. The user will run the build command.

## One focused installed-phone check

Use an existing account, then check these together after installing the new build:

1. Before Start, inspect both modes and their app lists. Review Usage Access and Display over other apps, returning from Settings each time.
2. Start with one tool allowed. Details must be read-only. The allowed tool, calls, Settings and Home work; a different app is covered. Open the emergency dialler from the cover, return to a blocked app, and verify protection remains active without Restore.
3. On a blocked app, try a partial upward gesture and cancel it; complete Recents and return to that app; lock/unlock. The blocked app must not become usable. Repeat once while LifeRPG has been cleared from Recents. Manufacturer-specific gesture/window behaviour remains a device acceptance gate.
4. End online: no brief Retry connection and Done remains visible. End offline: stop stays saved, Done works and the existing cancellation syncs after reconnecting. End still earns no time/XP. The existing one-break rule is unchanged.

Force-stop, revoked permissions and OS eviction remain honest interruptions; this repair does not claim an ordinary Android app can override Android’s system controls. End and emergency access remain reachable.

## Handoff to Claude

Review the latest `feature/protected-breaks` branch for these functional changes before applying UI work to it. Preserve the native lifecycle tracker, lease-preserving emergency navigation, fixed session binding, guarded Review handlers, stable result footer and offline journal paths. The source app inventory should remain lazy: opening Details/choices may load labels, while countdown updates and returning to the timer must not repeatedly enumerate apps. Home/guide layout redesign is still separate.
