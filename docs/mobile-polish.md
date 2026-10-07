# Mobile polish pass

## Client changes

1. Focus suggestion sheets now use the same bounded 220 ms timing transition from Settings and Home. Footer reservation and safe-area clearance stay intact.
2. Home no longer imposes a viewport-sized minimum-height container beneath short content. Free focus gets a useful instruction and the same permanent suggestion shortcut; measured dock clearance remains.
3. Entrance animations begin in layout effects, use native-driver ease-out timing, and defer Settings/Session/Profile/Progress reads until interactions settle. Inactive tabs freeze. Cosmetic press/reveal animations do not postpone reads. Date formatting is cached by time zone. These changes do not prove 120 Hz performance; release-build device profiling is still required.
4. Progress reads all qualifying completed-session days to display longest Focus streak separately from the current streak and selected period. The existing positive-duration, future-time and time-zone rules are shared.
5. The read-only progress-time-zone row is removed from Settings. Stored time zones and date attribution are unchanged.
6. Find your next step is permanently available on Home, including after selecting free focus or a study default.
7. The daily-goal heading on Home opens a goal sheet directly. It follows the existing capability contract: 30–480 minutes, one change per 168 hours, effective next local day. The live project is missing the APIs; activation requires the separate SQL approval below. A missing API is never displayed as a successful edit.
8. Completion sound is removed from Settings. Existing sound preferences are retained so saved opt-outs are not silently reversed; device notification settings remain authoritative.
9. Notifications offers permission enable/app settings, plus Android 12+ Alarms & reminders special access with an app-settings fallback. No unverified alarm switch is labelled enabled. Expo Go permissions belong to Expo Go; installed builds need their own permission/device checks. Expo's native scheduling delegate falls back to an inexact alarm when exact-alarm permission is missing, so precise completion timing is the reason to enable that switch. The ongoing banner is a separate immediate notification.
10. Settings links to How LifeRPG works, a plain guide with a quick-tour entry. Existing introduction URLs redirect there for returning users; new-user introduction remains a seven-page journey.
11. The completion sequence finishes before Home's fade and the first welcome tip. Failed confirmation remains retryable and cannot repeat a successful finish write.
12. A six-tip contextual tour highlights the actual measured component and dims the rest: Home identity, focus, Find your next step, quests, Progress and Profile. It navigates tabs, reveals off-screen targets, waits for the correct destination before measurement, and records completion per account/install. It does not start sessions or create quests. Active/restoring sessions and reward popups postpone automatic tours.

## Daily-goal database activation

`daily-goal-exact-credit.sql` is a new proposal replacing the obsolete whole-minute scheduling proposal for this deployment. `goal-completion-base.sql` is a read-only function snapshot from the live project; it contains no account rows. The migration aborts if its completion-definition hash changed. It creates an owner-readable ledger and an authenticated, tightly scoped scheduler; direct client ledger writes and anonymous RPC execution are denied. Only the two goal-selection expressions in completion change. XP banks, receipts, Gold, duration, retries, historical daily rows and account rows are not rewritten.

Validation ran in isolated PGlite 0.5.8: bootstrap, old contract, synthetic fixtures, exact-credit migration/assertions, live completion snapshot, the new proposal, goal assertions, then the original exact-credit assertions again. They passed. PGlite is a disposable test tool, not an app dependency and not proof of multi-connection concurrency. The PostgreSQL CI script includes the same goal sequence and a three-connection case covering a goal save, competing weekly edit and simultaneous completion. Live application remains unauthorised until the user's approval and fresh drift checks.

Apply under an agreed write pause with the proposal's 5-second lock/60-second statement timeouts. Before any goal schedule exists, an operator can restore the saved completion definition and remove the new empty objects in one reviewed transaction. After schedules exist, retain the ledger and use a reviewed forward migration; do not drop schedules or reset past goals/XP as rollback.

## Device acceptance still required

- Settings/session entrances, tab changes and all suggestion-sheet exits on a physical high-refresh-rate phone, in a release/development build as well as Expo Go.
- Home free/study modes, zero/one/two quests, large text, three-button navigation and an open session dock.
- All six tour highlights, target scrolling, voice-over announcements, reduced motion, interrupted navigation and account switching.
- Installed Android notification permission and Alarms & reminders switches, app minimisation/force stop, timer completion and system battery restrictions. Permission links do not guarantee delivery or change switches automatically.
- Goal edits after approved activation: minimum/maximum, tomorrow's target, weekly lock, historical targets and once-only completion accounting.

References: Apple onboarding https://developer.apple.com/design/human-interface-guidelines/onboarding ; Expo SDK 57 notifications https://docs.expo.dev/versions/v57.0.0/sdk/notifications/ ; Android alarms https://developer.android.com/develop/background-work/services/alarms .

Follow-up screenshot corrections: see [onboarding-layout-refinement.md](onboarding-layout-refinement.md) for the unified seven-page state, footer, Home fit, overlay coordinates and tour fade fixes.
