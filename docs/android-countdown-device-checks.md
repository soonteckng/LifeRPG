# Android countdown installed-device checks

Install the new preview APK over your existing LifeRPG installation. Keep app data; do not uninstall or clear storage. This module requires the new APK. Expo Go and updates delivered to the previous APK use the static fallback.

Use your existing test account. Start with Wi-Fi/mobile data on, no unfinished session, and permission for LifeRPG notifications. For short tests, choose a custom duration of two minutes. If a test fails, note the time, what you tapped, whether the app was foreground/background/removed from recents, and whether notifications/Alarms & reminders were allowed.

1. **Live countdown:** start two minutes, press Home, open the notification shade. The LifeRPG notification should count down without reopening the app. Lock the phone and check again. Lock-screen visibility also follows your phone's privacy settings.
2. **Pause/resume:** tap “Pause in app”. It should open the correct timer; if recovery is still checking, use its normal Pause control. After confirmation, background the app: the notification should say Paused with a fixed time. Tap “Resume in app” or resume on the timer; background it and confirm counting resumes.
3. **Early End:** start another two minutes. Tap “End in app”: the app should show its normal End confirmation. Cancel the dialog once, then confirm End. Wait beyond the old finish time: no finish alert or XP should appear for that ended session.
4. **One finish alert:** start one minute, background and lock the phone until it ends. Expect one “Session finished” alert. Open it, dismiss the result and check Progress. Reopen twice: exactly one session/reward should be saved.
5. **Offline finish:** start two minutes online, disable both networks, background/lock the phone and wait for zero. The finish alert should still work. Reopen offline: saved work must remain recoverable. Re-enable internet; the result should sync once. Verify one history entry and one reward after another reopen.
6. **Dismissed notification:** during a running session, dismiss its notification if Android allows this. Reopen the app and background it again. The live notification should return with the remaining time; the finish alert must still appear only once.
7. **Process restart:** start two minutes, remove the app from recents, then reopen before zero. The remaining time should be consistent. Repeat and reopen after zero; the saved session should recover and be credited once. Some device launchers treat removal from recents more aggressively than ordinary process death.
8. **Permissions:** in Profile → Settings, inspect notifications and Alarms & reminders. Disable notifications and run a short session: the in-app timer/recovery should still work. Grant them again and check a new session. Disable precise alarms: Settings should report this, the countdown should still work, and the finish alert may arrive later. Re-enable precise alarms and test again.
9. **Sound/haptics:** test one finish with both on, then both off. Check Android's channel settings if the result differs; the user's system channel choices take priority.
10. **Account separation:** end/sync the current session, sign out, sign into your second test account and start a new session. An old notification/action must not change the new account's session or reveal its previous session title.
11. **Expiry boundary:** if practical, tap End as a one-minute timer reaches zero. A fully elapsed session should complete through the normal saving path and be credited once. An earlier End remains an early End.
12. **Reboot recovery (optional for this test round):** start a longer session, reboot and unlock the phone. Reopen LifeRPG. The session should recover; alert delivery before first unlock is outside this build's scope. Record this as not tested if you skip it.
13. **Settings → Force stop:** Android deliberately stops notification/alarm delivery for a force-stopped package. Reopen LifeRPG explicitly. Its saved session must recover safely; do not judge the missing alert while force-stopped as an app crash.

This round tests native notifications and recovery of sessions started online. Offline Start, offline local Pause/Resume, widgets, iOS Live Activities and Android promoted status chips are later work. Automated checks cannot guarantee zero device bugs; keep this as a preview until these installed tests pass.

## User's build 6 results

Reported passes: 1, 4, 5, 6, 7, 8 and 10. Haptics were confirmed in 9; sound was not explicitly reported. Cases 2/3 opened the timer but did not perform the requested action, so warm-action behavior needs correction and retesting. Case 11 (expiry boundary) and 12 (reboot) were not tested. Case 13 was reported as “should be pass”, so it remains tentative. Additional defects: the running notification showed one second less than the in-app timer, and a remembered eight-minute duration replaced the Custom label.

## Follow-up retest

1. Start a two-minute session and check the app and notification during the same second. The constant one-second lead should be gone; independent screen redraws may briefly straddle a second boundary. Lock the phone and let a one-minute session finish: its real deadline and single alert must remain correct.
2. Keep the app running in the background (do not force-stop/remove it). Tap Pause in app: it should open the timer and pause through the normal verified control. Then background it and tap Resume in app: counting should resume. End in app should open the usual confirmation; cancel once, then confirm. Cold recovery still opens the timer for user control.
3. Verify the duration option says Custom. Open it, choose 2 minutes 15 seconds, save, then reopen it: the editor should show 2 and 15. The label should stay Custom. Selecting 30 or 60 minutes should still select the corresponding preset.
