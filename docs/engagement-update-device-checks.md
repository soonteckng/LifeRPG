# Daily effort and account experience: device review

This follow-up builds on the session recovery branch. It does not add new offline Starts, partial rewards, native countdowns, widgets or protection.

## Delivery status

The first daily-effort/account update at commit 837de21 was JavaScript only. The approved follow-up adds Expo IntentLauncher and its lockfile, so it needs a fresh installed Android preview build. The manifest keeps the existing notification and alarm permissions; there is no new permission. Pulling GitHub code or publishing an OTA update alone cannot add the native module to an older installed app.

The subsequent account-form correction changes only JavaScript and docs/tests: it explicitly handles Android keyboards that overlay an unchanged window, and refines the sign-in/create-account appearance. It can be delivered through EAS Update to the matching version 1.1.0/build 5 runtime; it does not add another native module or require another rebuild of that installed version.

Daily goal editing was explicitly approved and installed as migration `20261011183822_daily_goal_exact_credit_weekly_schedule`. Live read-only checks verified the exact two goal-selection edits and preservation of existing baseline and historical targets. No account goal was changed during installation. The approved Android alarm route opens LifeRPG's own toggle with a package data URI and falls back to current app settings if unavailable. Notifications opens LifeRPG's specific notification settings with the same fallback. System highlighting cannot be controlled by the app.

## Checks with an existing account

1. Reopen while signed in. Home should remain available, with the previous offline recovery behavior if the connection is unavailable. Finish or confirm any pending sessions before sign-out tests.
2. Home's goal uses matching minute units. For example 3,660 recorded seconds against a 60-minute goal reads `61 / 60 min`. Extra seconds remain visible; progress is never capped at the goal.
3. Open Progress. The main amount is today's effort. Weekly or monthly totals have a separate place. Select a chart day, close its details and verify the main amount belongs to that day. On the first day of a week there is no negative comparison to a whole earlier day.
4. Enter Profile from its tab, then from Home's character. Expect one entrance wave per visit, with quiet blinking, breathing and glances. Tap the character for a greeting. Closing an editor should not replay the entrance; leaving the app should stop motion. Check the phone's Reduce Motion setting as well.
5. Open Find your next step and select Free focus. Everyday focus is explained there; Home starts with that area and still permits another area choice.
6. In the freshly installed Android build, open Notifications in Settings. Its settings action should land on LifeRPG's notification page, or the application's own settings on unsupported phones. On Android 12 or later, Alarms & reminders should open LifeRPG's own toggle directly. Enable it, return and verify notification status refreshes. Repeat after revoking it in system Settings. Expo Go and unsupported devices use app settings instead.
7. Open Daily goal from Home or Settings. Save a different target in the 30–480 minute range. Today stays unchanged; the new goal is scheduled for tomorrow. Reopen the editor and verify the next allowed change time, seven days later, and that a second change cannot be submitted. If a connection fails while saving, check the current schedule before attempting another change. Dismissal must become available after the bounded attempt.

## First-day celebration

Use an account with no recorded session on its current local day. Complete a one-minute session online. The confirmed result includes a small animated First step today message. A second completion, reopening the result, or a recovered older result must not replay it. No extra XP or quest is created by the animation. An account that already completed a session today correctly waits for the next local day. The once-per-day presentation marker is local to the device, scoped to account and backend.

## Account forms and new-user setup

1. After explicit sign-out, the next launch defaults to Sign in. Switching to Create account remains possible. Test email and password with the keyboard open on both forms. The companion/header becomes compact while typing. Each focused textbox and its validation error must stay above the keyboard; longer messages and buttons remain scrollable. Show/hide the password and reopen the keyboard twice. Change the keyboard height using its autofill/suggestion panel if available. Trigger one missing-field error and one failed sign-in. There should be neither a blocked textbox nor the earlier large keyboard gap.
2. Open Forgot password. Verify its centered layout without the keyboard, smooth transition and readable validation. Use a test account's real recovery link to check new-password confirmation and return to Sign in. The existing generic email response and recovery ownership checks remain intact.
3. On a genuinely clean install, the launch animation leads to Create account. Do not clear storage or uninstall an account with unconfirmed sessions to simulate this check; use a separate test installation/device after all pending work has synced.
4. Create a new test account. Initial goal selection and the introduction explain that later changes are limited to once every seven days and start the following day. Finish the complete guide. Home then offers optional notifications if supported and currently disabled.
5. Choose Not now. Relaunch and manually replay the guide; the invitation should not repeat. Use a different new test account to check Enable notifications. The OS prompt appears only after this choice. Existing accounts are not treated as new accounts merely by opening the guide.

## Validation limits

Automated UI, auth, recovery, analytics and disposable PostgreSQL checks are recorded with the delivery. Actual Samsung keyboard geometry, notification settings routes and rendered animations require the phone review above. PGlite's single connection does not establish real two-connection PostgreSQL lock behavior; the goal plan documents that separate pre-release check. This update does not claim that all device or publishing checks have passed.
