# Daily effort and account experience: device review

This follow-up builds on the session recovery branch. It does not add new offline Starts, partial rewards, native countdowns, widgets or protection.

## Delivery status

The app changes are JavaScript only and keep the existing dependency lockfile, app manifest and native runtime. An installed preview with the same runtime can receive an OTA update. Pulling GitHub code alone does not update a phone; load it with Metro or publish a compatible preview update separately.

Daily goal editing is prepared and tested but needs explicit approval to install `docs/daily-goal-exact-credit.sql` in Supabase. Until it is installed, the app reports temporarily unavailable goal settings and preserves the existing target. The direct Android alarm-toggle route needs approval for Expo IntentLauncher and a rebuilt native app. Without that module, Alarms & reminders opens the current application's settings instead of an unscoped list. Notifications already opens LifeRPG's specific notification settings, with a fallback if the phone does not support the intent. System highlighting cannot be controlled by the app.

## Checks with an existing account

1. Reopen while signed in. Home should remain available, with the previous offline recovery behavior if the connection is unavailable. Finish or confirm any pending sessions before sign-out tests.
2. Home's goal uses matching minute units. For example 3,660 recorded seconds against a 60-minute goal reads `61 / 60 min`. Extra seconds remain visible; progress is never capped at the goal.
3. Open Progress. The main amount is today's effort. Weekly or monthly totals have a separate place. Select a chart day, close its details and verify the main amount belongs to that day. On the first day of a week there is no negative comparison to a whole earlier day.
4. Enter Profile from its tab, then from Home's character. Expect one entrance wave per visit, with quiet blinking, breathing and glances. Tap the character for a greeting. Closing an editor should not replay the entrance; leaving the app should stop motion. Check the phone's Reduce Motion setting as well.
5. Open Find your next step and select Free focus. Everyday focus is explained there; Home starts with that area and still permits another area choice.
6. Open Notifications in Settings. Its settings action should land on LifeRPG's notification page, or the application's own settings on unsupported phones. Alarms & reminders currently opens that application's settings. Return and verify permission status refreshes.
7. After the goal SQL is approved and installed, open Daily goal from Home or Settings. Save a different target in the 30–480 minute range. Today stays unchanged; the new goal is scheduled for tomorrow. Reopen the editor and verify the next allowed change time, seven days later, and that a second change cannot be submitted. If a connection fails while saving, check the current schedule before attempting another change. Dismissal must become available after the bounded attempt.

## First-day celebration

Use an account with no recorded session on its current local day. Complete a one-minute session online. The confirmed result includes a small animated First step today message. A second completion, reopening the result, or a recovered older result must not replay it. No extra XP or quest is created by the animation. An account that already completed a session today correctly waits for the next local day. The once-per-day presentation marker is local to the device, scoped to account and backend.

## Account forms and new-user setup

1. After explicit sign-out, the next launch defaults to Sign in. Switching to Create account remains possible. Test every field with the keyboard open, password visibility, one missing-field error and one failed sign-in. Fields, errors and controls should remain reachable without the earlier large keyboard gap.
2. Open Forgot password. Verify its centered layout without the keyboard, smooth transition and readable validation. Use a test account's real recovery link to check new-password confirmation and return to Sign in. The existing generic email response and recovery ownership checks remain intact.
3. On a genuinely clean install, the launch animation leads to Create account. Do not clear storage or uninstall an account with unconfirmed sessions to simulate this check; use a separate test installation/device after all pending work has synced.
4. Create a new test account. Initial goal selection and the introduction explain that later changes are limited to once every seven days and start the following day. Finish the complete guide. Home then offers optional notifications if supported and currently disabled.
5. Choose Not now. Relaunch and manually replay the guide; the invitation should not repeat. Use a different new test account to check Enable notifications. The OS prompt appears only after this choice. Existing accounts are not treated as new accounts merely by opening the guide.

## Validation limits

Automated UI, auth, recovery, analytics and disposable PostgreSQL checks are recorded with the delivery. Actual Samsung keyboard geometry, notification settings routes and rendered animations require the phone review above. PGlite's single connection does not establish real two-connection PostgreSQL lock behavior; the goal plan documents that separate pre-release check. This update does not claim that all device or publishing checks have passed.
