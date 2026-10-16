# Session protection and UI repair

16 October 2026. Target: the current offline/routines branch and installed APK10 successor. This batch implements Android session protection using the existing native module and requires a new installed Android build.

## Visible changes

- Home follows the supplied layout hierarchy: compact identity, one navy session card with today's goal, a category selector, one suggestion, an exact-duration chip, Start and protection mode. The three large preset segments move into the duration editor. The editor still offers quick presets and custom minutes/seconds; its chip edits the time actually displayed.
- Routines use a simple list with category dots and a small empty-state prompt. Existing task IDs, schedules, history and saved presets remain intact.
- The offline workspace shares the same focus-card component. Profile uses a compact companion/identity header, a lighter milestone row and a simpler area list. The Progress page is preserved.
- The End result's Done action is anchored by the native bottom-sheet footer. Pending content can shrink after server acknowledgment without moving the button outside the clipped sheet. Body measurements exclude the library's footer padding; component identity remains stable during measurement updates.
- Guide alignment is deliberately deferred at the user's request. Only the focus-step wording changes to match the new category and duration controls.

## Actual-session protection

- Choose Normal, Allow list, or Block apps from the session card or Settings → Session protection. Choosing a mode does not launch a separate protection test.
- The saved choice is account/backend scoped and stored on the phone. App inventory and selections are not uploaded. Usage Access, Display over other apps and the ordinary notification permission are requested only through explicit actions.
- A running session receives one immutable app-choice snapshot bound to its stable client journal ID, including while its public ID changes during offline synchronization. Pause releases apps; resume reinstalls the same choice for the remaining time. End and completion release protection without changing rewards or adding a database mutation path.
- The native service covers non-system launcher apps, except the user's allow list. System/updated-system apps are conservatively exempt. “Block apps” therefore does not claim to prevent every system application from opening.
- Calls, emergency access, Settings, system UI, launcher and LifeRPG remain reachable. The cover has Back to my session, End session, Stop protection and a dialler control. End opens the normal confirmation above both online and offline surfaces; it does not bypass journal authority or directly cancel a database session.
- Removing LifeRPG from Recents keeps the foreground service alive until its monotonic deadline. Force-stop, reboot or OS eviction may stop protection; the next launch reports interruption and requires explicit restoration. Permission revocation releases apps and leaves the normal timer usable. This is not a promise of unkillable service behavior or Play approval.
- No break or leaderboard is added in this batch. Personal XP is unchanged and early End earns nothing. The five-minute break is the following protection milestone; iOS Screen Time entitlement and implementation remain separate.

## Foreground connectivity repair

The prior app only retried connectivity after it was already in local mode. Turning off the network on an open Home page could therefore leave it showing a failed refresh and disabled Start.

Native default-network events now feed the existing guarded account admission. Sequenced events reject stale startup snapshots; an outgoing network's Lost callback cannot override a new default network. Brief Wi-Fi/cellular validation gaps are debounced. Observed failures of existing account requests provide a fallback without sending extra probe or email requests. Reconnection requires a fresh proof for the same account; cached data can remove cloud access but cannot grant it.

## Validation and release limits

The delivery record in the project workspace records the final automated totals, source hashes, branch/commit and Android build. Tests include the installed Gorhom footer geometry, complete route/result lifecycle, permission opt-in, protection's real provider/controller, account/admission changes, delayed native Start/Stop and offline End links. Database tests run only against local PGlite. No live SQL, SMTP or Auth setting is changed and no test emails are sent.

A local fixture HTML was generated from the actual Home components. The in-app browser could not reach its localhost server and blocks file URLs, so there is no claimed browser or Android screenshot verification. One installed-phone acceptance round remains necessary for native app covering, OEM process behavior and visual motion.

## One combined phone check

1. Verify the smaller Home/card/routines layout; tap category and duration, and confirm choices survive reopening. Progress should behave as before. Guide alignment is not part of this round.
2. End online, leave the result open for several seconds and confirm Done remains visible and dismisses smoothly. Repeat offline, then reconnect; no duplicate result or lost stop.
3. Turn off all networks while Home remains open. It should enter the usable offline workspace without a manual refresh. Restore a network and confirm automatic return to the same account.
4. Choose Allow list and enable its explicitly explained accesses. Start a short session, open an allowed app and a blocked app, then test Pause/Resume and End from the cover. Calls, Settings, LifeRPG and Stop protection must remain reachable. Repeat with Block apps.
5. Remove the app from Recents during a protected session and reopen. Revoke one protection permission once: apps must release and the timer remain usable, with an honest interrupted state. Force-stop/reboot recovery is interruption recovery rather than automatic reactivation.

Only failed steps need reporting. Native acceptance and store approval must not be described as already proven.
