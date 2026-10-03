# Character, Profile, Settings and Rewards redesign

Branch: `character-profile-redesign`, based on `progress-redesign` commit
`61ad03736805f37196bb46a6d43932d0f7370ae8`. Merge Progress first; this branch
includes that work until its parent lands on main.

## Product decisions

LifeRPG's character represents the user's recorded effort. It is not an extra
creature to keep alive, and attributes are not measurements of health, strength
or intelligence. The first character artwork is a neutral code-native silhouette
with a personal badge. Earned Strength changes its build subtly; developed
attributes add an accent. This is the visual foundation, not an extensive avatar
wardrobe or a complete character animation system.

Profile now contains the character, overall level, four attributes, the recorded
effort behind them, and a Rewards entry. Explicitly connect Life areas to Strength,
Knowledge, Creativity or Balance; do not guess from names and do not add another
category selector to quests or sessions. Unassigned areas retain all XP. Multiple
areas may share an attribute. Attribute XP is a display projection of saved area
levels/current XP, using the existing server threshold of 50 * area level.
Reassignment changes that projection only. It grants no XP, Gold or new rewards.

These connections and feedback preferences are per-account **device storage**.
They are not yet synced between devices. Identity, Life-area XP, account levels,
Gold and sessions remain cloud-backed. Reinstalling or clearing application data
can clear connections; reconnecting the areas recovers their projected attribute
levels from cloud XP. Cross-device connections need an independently tested
backend migration; no new database schema is assumed here.

Rewards prioritises milestones over currency. First session, accumulated focus
hours, completed-session counts and best consecutive active-day runs are derived
from all saved completed sessions, with pagination and account-timezone day keys.
Seconds count for focus-hour milestones. Completed sessions are deduplicated.
Consistency milestones remain earned after a current streak breaks because they
use the best historical run. They grant no additional XP or Gold. The historical
rows are the source of truth; these are not a separate persisted badge ledger.

Gold remains available as a secondary balance for existing optional personal
rewards. The server still owns redemption and the separate daily-goal bonus.
Existing reward calculations, cancellation/completion rules, RPCs and schema are
unchanged. **The existing per-session whole-minute XP, Gold and daily-goal credit
rules remain in force.** This redesign does not implement second carry-over or
new bonus rates. Ads, purchases, widgets and live session displays are follow-up
work, not partially enabled controls.

## Interactions and reliability

- Shared dark/lavender tokens, readable typography, rounded surfaces and icons.
- Profile/reward editors use AppSheet with its existing handle, downward exit,
  backdrop/back dismissal, keyboard handling and dirty-draft confirmations.
- Secondary pages use the root native right-to-left entrance and inverse back
  exit. Page and tutorial content fades respect system reduced motion.
- Profile saves await a returned persisted row; failed saves keep the editor.
- Profile reads share in-flight work; stale reads cannot undo an identity save.
- Reward mutations share a synchronous lock and preserve drafts on failure.
  Redeem/remove require themed confirmation. Costs reject partial/decimal input.
- Daily reward reads use the account timezone instead of a fixed timezone.
- Feedback preferences restore across restarts and serialise rapid writes.
  Completion notifications use sound/vibration-specific Android channels. Sound
  changes apply when the next alert is scheduled; existing phone settings may
  override channel sound. Active-session timer logic and close transitions remain.
- Settings includes account, notification permission/status, system motion,
  introduction replay, and device-local sign-out. Sign-out is blocked during open,
  restoring or unresolved sessions; finish/end or resolve the session first.
- Login/register and onboarding use the same theme, keyboard-safe scrolling,
  synchronous submit locks, visible errors and preserved inputs.
- Email confirmation does not falsely claim sign-in. Delayed initial auth
  restoration cannot overwrite a later auth event. Account providers are keyed
  by user ID. A missing cloud profile offers Retry and return to sign-in.
- Home/core routes are protected until onboarding is complete. The first-login
  tutorial remains required; replaying it does not call the completion RPC again.
- Progress links to the same Rewards milestones rather than exposing conflicting
  current-streak-only achievement definitions.

## Automated verification

84 tests: the 64 existing Home/quest/Session/Progress tests plus 20 new tests.
New coverage includes attribute thresholds and reassignment, seconds/deduplication,
retained consistency milestones, reward cost validation, email confirmation,
failed/repeated sign-in, onboarding/tutorial failure and replay, profile persistence,
preference restoration/rapid writes, reward draft/redeem/claim guards, logout
protection and auth-restoration races. Service/native boundaries are mocked.

TypeScript and scoped lint pass. Android and iOS JavaScript exports pass using
`--no-bytecode`; placeholder configuration was used only for the compilation check.
No real authentication, production reward RPCs, native animations, notifications,
Hermes bytecode or physical-device layout were verified in this environment.
No production database changes, EAS build, EAS update or main merge were performed.

## Full installed-app acceptance checklist

Use a test account; do not delete a real account or erase earned progress.

1. Fresh account: register; handle confirmation if enabled; sign in; setup name,
   badge and daily goal; read all tutorial pages; finish; only then reach Home.
   Verify keyboard visibility, error messages, repeated taps and interrupted setup.
2. Restart during setup/tutorial; confirm onboarding is still required. Restart
   after finishing; confirm onboarding is remembered. Existing accounts go Home.
3. Wrong password, offline login/registration, profile-fetch failure, logout,
   email-confirmation return and signing into another account. Check that no prior
   user's name, sessions, preferences, character connections or rewards appear.
4. Create/edit/complete/reopen quests. Start linked and free sessions; wheels,
   typed duration/presets, validation, keyboard, pause/resume, minimise/reopen,
   swipe/header/Android back, and active-session dock placement.
5. Installed EAS app: allow/deny notifications, lock screen/background countdown,
   completion notification tap, foreground recovery, saved progress and rewards
   before summary Done. Test sound/haptic settings with a newly scheduled session.
   Repeat after pause/resume; inspect duplicate or missing alerts.
6. Complete sub-minute and mixed-second sessions. Verify exact focus time and
   milestones, while goal/XP/Gold retain the documented whole-minute rules.
7. Connect/reassign/unassign Life areas, verify projected attributes and portrait,
   save identity, reload/restart. Note device-only connection persistence.
8. Claim daily bonus once, retry failures, add personal reward, keyboard/backdrop/
   swipe dirty dismissal, insufficient balance, redeem/remove confirmations and
   refresh failures. Verify existing Gold and personal rewards are retained.
9. Settings: restart feedback preferences, open phone notification settings,
   replay tutorial without changing setup, block sign-out for running/paused or
   unresolved sessions, sign out after finishing, then sign back in.
10. Check small phones, large text, long names/titles, safe areas and reachable
    controls on both Android and iOS. Check matching entry/exit transitions,
    reduced motion, nested-sheet keyboard/back priority and interrupted gestures.

Widgets and iOS Live Activities / Android live session notifications need a
separate native implementation and new EAS builds. Standard completion alerts
are retained and must continue alongside those features when they are added.

## Expo Go notification import fix

Android Expo Go skips the notification package entry in the shared runtime loader.
Settings loads without evaluating that entry, and explains that notification checks
require an installed/development build. This preview deliberately does not schedule
session alerts. The Expo Go detector distinguishes actual development builds, which
still load notification APIs. iOS and release builds keep the supported API path.
Three regression tests cover skipping the package, caching its API in builds and
Settings fallback. Total suite: 87 passing tests. No package versions were changed.
