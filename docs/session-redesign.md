# Session redesign

## Current experience

Home, quest Start and the dock enter one singular root /session route.
Setup, running, paused, saving and completed remain states of that screen.
Start, Pause and Resume do not navigate. The timer and progress track stay
mounted above the scrolling details, with status space reserved across states.
Start stays in the bottom action area; only surrounding details fade.

Life area is the only setup category. Free sessions default to General and are
titled "Free session". A prominent optional Quest row opens a list with each
quest's title, duration and Life area. A linked quest inherits its whole-minute
duration and area, with explicit Change and Switch to free session actions.
Loading/unresolved quests stay linked and cannot start until resolved or unlinked.
QuestSheet and quest creation/editing interactions were not changed.

The dock remains in reserved tab-bar layout space, with safe-area padding.
Its accent-tinted surface, border, countdown and upward chevron distinguish it
from Home. Running, paused, saving, failed and completed states use distinct
labels/icons. Completed sessions show View summary instead of 00:00.
Home uses "Welcome back, {name}" from 00:00 through 04:59, preserving local-time
updates and the existing morning/afternoon/evening boundaries.

## Duration picker and keyboard

Presets remain 15, 30, 45 and 60 minutes. Custom opens a compact bottom sheet
with Minutes (0–480) and Seconds (00–59) wheels, a selected row, adjacent values,
Cancel and Set duration. The picker edits a local draft. Cancel, backdrop, back
and downward sheet dismissal preserve setup; only Set duration applies changes.
Reopening starts from the applied duration. Zero and anything above 480:00 are
rejected, including 480:59.

No new dependency was added. The picker uses the installed Gorhom 5.2.14 sheet,
Gesture Handler 2.32 FlatList/native gesture wrapper and React Native snapping.
These primitives support Android and iOS; native interaction still needs testing.
The gesture wrapper isolates wheel scrolling from sheet dragging. Adjustable
screen-reader actions and visible plus/minus buttons provide alternatives to
precise wheel gestures. Settled selections respect the app's haptic preference;
programmatic scrolling respects reduced motion.

The inline custom TextInput was the remaining Session text input. It is removed,
so neither duration selection nor any remaining Session control needs a keyboard.
Android resize is now explicit in app.json (a native rebuild is needed for a
configuration change to an existing binary). iOS retains KeyboardAvoidingView.
No keyboard-height constants were added. The sheet measures its action footer
and reserves that space in its scroll content, with bottom safe-area padding.
Back priority remains keyboard, then picker/confirmation, then Session.
This removes the occluded input; it is not evidence of tested native IME behaviour.

References consulted: [Expo 57](https://docs.expo.dev/versions/v57.0.0/),
[Expo native stack](https://docs.expo.dev/versions/v57.0.0/sdk/router/stack/),
[Gorhom gesture coordination](https://gorhom.dev/react-native-bottom-sheet/troubleshooting),
[FlatList](https://reactnative.dev/docs/flatlist).

## Exact seconds and backend dependency

The timer, Start, countdown, scheduled notifications, restoration and summary use
integer total seconds. Quest configuration deliberately converts whole minutes
at setDurationInMinutes; free setup uses setDurationInSeconds. startTimer accepts
seconds. Restoration no longer clamps sub-minute sessions to 60 seconds.
Foreground recovery computes remaining seconds from the end timestamp. Minimise
does not pause, reset or replace the session; paused/running state stays in context.

The existing database already stores target_duration_seconds, elapsed_seconds and
duration_seconds. Its Start RPC previously rejected values below 60; completion
also forced a minimum one-minute reward. Both blocked correct 00:30 support.

Applied Supabase migration: session_duration_seconds_precision, on the LifeRPG
project. The exact function definitions are retained in [session-seconds.sql](session-seconds.sql).
Start now accepts 1–28800 seconds. Completion retains exact duration and credits
floor(duration_seconds / 60) whole minutes. Rates remain 1 XP and 5 gold per
credited minute, with the same Life area XP and daily-goal policy:

| Session | Saved seconds | Credited minutes | XP | Gold |
| --- | ---: | ---: | ---: | ---: |
| 00:30 | 30 | 0 | 0 | 0 |
| 01:00 | 60 | 1 | 1 | 5 |
| 15:30 | 930 | 15 | 15 | 75 |
| 480:00 | 28800 | 480 | 480 | 2400 |

Partial minutes remain in session history and duration labels. They are not
rounded up and do not carry between sessions for minute-based rewards or daily
goals. Progress minute charts use the same per-session whole-minute credit;
individual history rows, summaries and reward popups show the exact duration.
Existing records, schema columns, ownership checks, row locks and completion
idempotency remain intact. Already-completed responses now also include minutes.
Whole-minute quest sessions retain their prior behaviour and rewards.

New sessions send neutral activity_type "other" for compatibility. Restoration
preserves historical activity values. Progress prefers the surviving Life area
title; where no area survives, it retains readable non-neutral legacy activity
labels and uses General for neutral values. No activity-to-area mapping or
historical rewrite was introduced.

## State safeguards

- A synchronous lock prevents repeated Start requests. Start errors retain setup
  and expose Retry. Running/paused sessions cannot be replaced by a new Start.
- End remains separate, confirmed, and retryable on failure.
- Closing rewards retains the completed summary, Done and New session.
- Completion uses the same ID, local duplicate guard and server idempotency.
  An already_completed response does not present rewards again.
- Failed completion stays at zero with Retry. Saved durations and reward credit
  are separate fields, so a 30-second completion is not displayed as zero time.
- Notification scheduling uses exact seconds; scheduled requests are checked
  using their actual identifier field.

## Dismissal investigation and remaining evidence gap

Installed: Expo Router 57.0.18, RN 0.86.3, react-native-screens 4.26.
The installed Expo Router dismiss() queues an untargeted POP. The old close
callback also had a replace("/") fallback when canDismiss() was false.
The global Android back handler already deferred Session to its local handler.
There was no evidence from a device that established whether that fallback ran.

Header close and local Android back now call the Session screen's own navigation
goBack(), without route replacement, manual unmounting, exit timers or custom exit
animations. Root history remains anchored to tabs. Missing history logs a warning
rather than silently replacing the route. Repeated close taps are guarded.

Presentation changes from fullScreenModal to a full-screen native-stack card with
slide_from_bottom, vertical gesture direction and animationMatchesGesture.
The installed Android ScreenStack selects the outgoing screen's animation on pop;
FragmentTransactionKt maps SLIDE_FROM_BOTTOM close to rns_slide_out_to_bottom,
whose XML translates from 0% to 100% Y. This verifies the available native reverse
path, not that a particular phone rendered it. The iOS card also allows supported
vertical gesture handling; no Session drag handle is shown.

usePreventRemove remains active only for a picker, keyboard or confirmation.
Closing an inner layer does not redispatch its removal action. Reduced motion
uses fade and disables detail fades. The dock stays under the root stack.
Development logs record [Session] close, transitionStart and transitionEnd with
closing direction, so the actual phone path can be distinguished from config.

The reported instant disappearance is NOT marked visually fixed. No device or
emulator was available. Native opening, downward exit and gesture cancellation
remain unverified.

## Verification

- TypeScript passes.
- Scoped lint passes.
- All 41 tests pass (20 Home/quest and 21 Session tests), using mocked native
  primitives and service boundaries.
- Tests cover draft/cancel/confirm/reopen, zero/max bounds, adjustable controls,
  disabled haptics, Life area compatibility, title/quest inheritance, minute
  boundaries, sub-minute and mixed-duration restoration, pause/resume/minimise,
  repeated/failed Start, completion/reward dismissal, header close, Android back
  priority, dock states, foreground recovery and exact notification seconds.
- The actual Supabase RPC regression script in
  [session-seconds.sql](../tests/session-seconds.sql) passed for 1, 30, 60, 930 and
  28800 seconds, invalid bounds, pause/resume, duplicate completion, cancellation,
  exact rewards and daily progress. A synthetic user was created inside a
  transaction that was rolled back; no fixture sessions were retained.
- Android and iOS JavaScript exports passed with --no-bytecode. This does not
  verify Hermes bytecode generation or native runtime animations.
- Supabase advisors were checked. Existing authenticated SECURITY DEFINER RPC
  notices retain intentional authenticated access and ownership checks. Unrelated
  existing anonymous-RPC/password-protection notices were not changed in this
  Session task: [RPC notice](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable),
  [password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

## Phone checklist

1. Open from Home, quest Start and repeated dock taps: one route, upward entrance.
   Test header Close/Minimise and Android system back separately for visible
   downward exit. Development logs should show canGoBack true and closing
   transitionStart/transitionEnd; verify visually, not from logs alone.
2. Try interrupted iOS vertical gestures and reduced motion. The outgoing Session
   must remain visible until exit, with no dock flashing over it.
3. Scroll both wheels independently, including endpoints and 480:59. Test 00:30,
   01:00, 15:30 and 480:00; Cancel/back/swipe must discard the draft, while Set
   applies it. Reopen and confirm the wheel selection matches.
4. Test VoiceOver/TalkBack adjustment actions and plus/minus controls, haptics
   enabled/disabled, small screens and large text. Start and picker actions must
   remain reachable without clipping; the timer must not jump between phases.
5. Open after a keyboard was visible elsewhere. Back should dismiss it before
   the picker/Session. Duration selection itself must not open a keyboard.
6. Minimise/reopen while running and paused, then background/relaunch: same
   duration, quest and area; running time continues, paused time remains paused.
7. Complete in foreground and minimised; close rewards, inspect exact duration
   and credited rewards, use Done/New session without duplicate credit.
8. Check dock spacing above tab buttons and the system navigation area.

No commits or pushes were made.
