# Character, Profile, Settings and Rewards redesign

Branch: `character-profile-redesign`, based on `progress-redesign` commit
`61ad03736805f37196bb46a6d43932d0f7370ae8`. Merge Progress first; this branch
includes that work until its parent lands on main.

## Product decisions

LifeRPG's character represents recorded effort. Life areas themselves are the
character’s stats: Profile displays each cloud-saved area name, level and current
XP against the existing 50 * level threshold. The confusing second Strength /
Knowledge / Creativity / Balance mapping system and Connect areas editor have
been removed. No earned area XP or cloud data is altered. Old device mapping
entries are no longer read or required; there is no database migration.

The code-native character is a visual foundation with a personal badge, subtle
build changes from overall saved level, and an accent for developed Life areas.
Tap it for a short wave; it never grants XP or changes sessions. Reduced motion
keeps the character still and retains press feedback. Detailed area-specific
physiques, outfits and a full animation system remain future character work.

Profile contains the character, overall level, Life-area growth, recorded effort
and Rewards. Progress remains the dedicated tab; the redundant Explore your
progress shortcut was removed. Feedback preferences remain per-account device
storage. Identity, Life-area XP, account levels, Gold and sessions remain cloud-backed.

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
- Rewards/Settings use matching right-to-left entrance and left-to-right exit.
  Android uses a retained opaque moving surface and removes the route only after
  its exit callback; iOS retains native horizontal navigation. No competing native
  animation runs over Android’s controlled motion. Reduced motion skips translation.
- Session, Rewards and Settings share the same compact navigation header, 44px
  controls and centred title. Tab headings align to 20px content gutters.
- Personalise has one content-sized snap point, a pinned safe-area Save footer,
  scrollable large-text/keyboard content and interactive keyboard handling. It
  keeps its editor through dismissal instead of switching layouts mid-animation.
  Clean drafts use native sheet dismissal; dirty drafts still require confirmation.
- Reward sheets keep their contents until native modal dismissal. Re-entry waits
  for dismissal, avoiding a new sheet being cleared by an older close callback.
- Session drag follows the finger outside the timer wheels; a short/interrupted
  swipe settles back. A sufficient distance or downward fling finishes minimising
  from the current position. One stable animated opacity value adds a mild exit
  fade without a preference-resolution flash. Timer and nested-layer state remain.
- Profile saves await a returned persisted row; failed saves keep the editor.
- Profile reads share in-flight work; stale reads cannot undo an identity save.
- Reward mutations share a synchronous lock and preserve drafts on failure.
  Redeem/remove require themed confirmation. Costs reject partial/decimal input.
- Daily reward reads use the account timezone instead of a fixed timezone.
- Feedback preferences restore across restarts and serialise rapid writes.
  Completion notifications use sound/vibration-specific Android channels. Sound
  changes apply when the next alert is scheduled; existing phone settings may
  override channel sound. Active-session timer logic is preserved.
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

94 tests pass, including the existing Home/quest/Session/Progress suite.
Coverage includes saved Life-area levels and thresholds, seconds/deduplication,
retained consistency milestones, reward cost validation, email confirmation,
failed/repeated sign-in, onboarding/tutorial failure and replay, profile persistence,
preference restoration/rapid writes, reward draft/redeem/claim guards, logout
protection and auth-restoration races. Added polish coverage includes a pinned
profile Save action, retained editor/discard contents, compact sheet snap points
and stable handles, Android horizontal exit ordering, finger-following and
cancelled/interrupted Session drags, iOS exit ordering, repeated-close guards,
opacity stability and reduced-motion character interaction. Service/native
boundaries are mocked; no measured frame-rate claim is made.

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
   user's name, sessions, preferences, Life-area growth or rewards appear.
4. Create/edit/complete/reopen quests. Start linked and free sessions; wheels,
   typed duration/presets, validation, keyboard, pause/resume, minimise/reopen,
   swipe/header/Android back, and active-session dock placement.
5. Installed EAS app: allow/deny notifications, lock screen/background countdown,
   completion notification tap, foreground recovery, saved progress and rewards
   before summary Done. Test sound/haptic settings with a newly scheduled session.
   Repeat after pause/resume; inspect duplicate or missing alerts.
6. Complete sub-minute and mixed-second sessions. Verify exact focus time and
   milestones, while goal/XP/Gold retain the documented whole-minute rules.
7. Verify each Life area's saved name, level and XP matches Progress. Tap the
   character; test reduced motion. Personalise: Save is initially reachable,
   keyboard leaves fields and Save reachable, extra upward drag creates no blank
   expansion, and dirty close requires confirmation. Reload/restart after saving.
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
Settings fallback. This fix added three regression tests; the current full suite
has 94 passing tests. No package versions were changed.
