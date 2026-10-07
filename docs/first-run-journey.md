# First-run journey

New accounts see a short welcome with sequential word fades, then the seven required setup pages. Back works across every page, including the preferences/introduction boundary. Choices remain in memory until the final save. Name errors appear beside the input; the 24-character maximum protects the Home heading. The goal page explains that later changes are limited to once every seven days.

After the confirmed save, a brief finishing sequence fades away. Home stays visible for 750 ms before the required six-message tour begins. The first highlight spans identity, streak, level and the daily goal. The second measures the entire focus card, including free focus and future suggestion variants. Next-step access and personal quests each have their own lesson. Progress and Profile use short page overviews rather than misleading highlights around a toolbar or heading. Every message has Back and Next; the final action fades back to Home before saving the account's tour completion receipt. Settings offers the static guide, with no tour replay button.

The tour uses native-driven opacity/scale transitions. Dialogs finish their reverse transition before targets change; route changes are covered by a fade. Messages sit below upper targets or above lower targets, with the measured dock kept clear. Scrolling uses existing content and padding; it does not manufacture extra blank space. Measurement, storage and navigation failures have bounded recovery paths. A pending receipt resumes the unfinished tour for that account. No tour is automatically added to existing accounts without a pending first-run receipt.

Home now stacks its sections with a fixed 12-point gap. Settings expands from its measured gear icon and retracts to the same origin. Session exits travel beyond the visible viewport and fade fully before route removal. Notification explanations use the same body typography, and the sheet has one content-sized snap position; it scrolls only when the content exceeds the available screen space.

## Verification

- Automated checks cover the real onboarding/tour transition lifecycles, Back/Next, stale callbacks, missing measurements, account switches, failed route changes, welcome receipts, adaptive placement, Settings origins and existing session/quest/progression behavior.
- On a phone, create one account with free focus and one with a study suggestion. Check the welcome, all seven pages in both directions, blank-name validation, the finishing fade, brief Home preview, every tour highlight and Back/Next, and return to Home.
- Check Home with zero, one and two quests; the section gaps stay fixed and the dock stays clear. Open and minimise a running or paused session; it must keep its timer state and finish one continuous dismissal. Open and close Settings from Profile, then check the notification sheet at normal and large text sizes.
- Expo Go phone frame pacing and installed-build background notifications still require device verification; automated component tests do not establish 60/120 Hz performance.

Daily-goal editing remains dependent on the separately reviewed, unapplied backend proposal documented in `daily-goal-migration.md`. This UI change does not install it or alter saved progress.
