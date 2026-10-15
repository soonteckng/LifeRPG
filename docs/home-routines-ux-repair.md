# Home, routines and session-result repair

15 October 2026. Client repair for installed APK10, runtime `c8bc46c1f3f7087cfaf6b543fc04c7de95358076`. The owner confirmed the Android protection preview works, requested a visibly simpler Home, and chose to combine quests and routines under **Your routines**.

## Resulting behavior

- Home has one compact session card: today's goal, category and exact selected time, one suggestion, one **Change** entry, duration presets and Start. Category and suggestion text are read-only. The large idle description and separate area editor are removed.
- Home has one **Your routines** section. Existing tasks and saved presets share a manager and session picker. Existing numeric task identities, repeating schedules, completion state and history remain intact; this is not a destructive database conversion. Same-name records remain distinct.
- Saving a completed suggestion uses **Save as routine** and the actual routine editor. Name, exact seconds and category are prefilled and editable. Nothing is created until Save routine; this does not grant extra XP. Saving status is specific to the account, backend and completion. Free sessions keep their existing no-save-action behavior.
- Server confirmation of End no longer navigates away underneath the held result card. Explicit Done or dismissal owns the exit, including after the selected journal record has cleared. Presentation events are fenced by account, backend, admission and result identity.
- Online/offline layouts share the compact hierarchy. Incoming controls become interactive when the fade finishes, and account verification alone does not restart the same outgoing fade. Navigation stays mounted.
- Routine reminder permission is explained where reminders are chosen. Opening an editor or saving a reminder does not force a permission request. An explicit Allow notifications action uses the ordinary notification prompt. Granting it immediately refreshes opted-in reminders without requiring another app foreground.
- Delayed routine reads, manager dismissals and old Start completions are fenced against account, admission, eligibility and surface changes. An older operation cannot unlock a newer operation.

## Permission distinction

The normal timer and routines work without Usage Access or Display over other apps. Those optional accesses belong to app protection. Routine reminders use notification permission; the installed Expo scheduler falls back to inexact alarms when exact-alarm access is unavailable. Phone battery policy can delay delivery.

Forest's Play listing explicitly discloses Accessibility for its **Time Guard** feature. Its Deep Focus FAQ describes required permissions but does not enumerate that same implementation. LifeRPG's current prototype uses usage events and a cover, without Accessibility. Store distribution may reduce some sideload friction; it does not remove Android's permission decisions or justify bypassing unrelated warnings.

Sources: [Forest's Play disclosure](https://play.google.com/store/apps/details?id=cc.forestapp&hl=en-US), [Android restricted settings](https://support.google.com/android/answer/12623953?hl=en), [Android UsageStatsManager](https://developer.android.com/reference/android/app/usage/UsageStatsManager).

## Checks and boundaries

The final verification record is saved alongside the project workspace as `home-routines-repair-delivery.json`. Automated coverage includes the combined real timer route/result presenter, delayed server cancellation, exact-zero completion, merged legacy/saved selections, editable exact-second suggestions, account/admission changes, stale callbacks, notification opt-in and duplicate-safe reminder refresh. The full suite includes isolated local PGlite database checks.

No native module, permissions declaration, reward calculation, journal format, database schema, live account, SMTP provider or authentication setting changes are part of this repair. No production emails are sent for tests. Existing production sender-deliverability work remains separate; UI validation cannot guarantee email delivery.

## One short phone check

After receiving the APK10-compatible update, keep app data and use the existing account:

1. Home should visibly show the compact goal/session card and one Your routines section. Only Change opens focus categories. Open Manage and confirm both earlier quests and saved presets remain, including their names and times.
2. End a running session online. Wait several seconds on the result card: Done must remain. Tap Done and confirm a smooth exit to Home. Repeat once offline and reconnect; the result must not dismiss itself or reopen.
3. Complete a short suggested session. Save as routine must open the editor with that session's exact time and name. Edit the name, save, and confirm the routine appears once in Your routines. Cancelling the editor must create nothing.
4. In a saved routine, enable a daily reminder. Confirm the normal notification permission is sufficient; declining must still allow saving and using the routine. If notifications are already allowed, no prompt is expected. App-protection accesses can remain off for this check.

Only failed steps need reporting. Physical Android motion, keyboard and notification timing still require this phone check; automated tests do not establish zero bugs or OEM reliability.
