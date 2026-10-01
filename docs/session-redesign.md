# Session redesign

## Latest phone-feedback refinement

The phone still showed no native dismissal after both card and retained-modal
attempts. Android now uses a contained Animated translation for entrance (280ms)
and exit (260ms), with native stack animation disabled. The route stays mounted
until the finished exit callback releases removal; there is no timeout. Repeated
close/back is guarded and inner keyboard/pickers still dismiss first. Reduced
motion skips the Android translation. iOS retains native stack motion. Android does not expose
a fake drag handle or a competing native swipe gesture. The diagnostic route still
uses native animation so it can compare the platform behaviour separately.

Viewing a saved summary acknowledges that specific summary and hides its completed
dock. The summary itself, Done/New session and reward duplicate protection remain.
An active/paused session always keeps its dock; a later completion is independently
unread. Closing rewards while Session is focused also counts as viewing the summary.

Both duration wheels now have repeated cycles with invisible recentering after
settling. Seconds cross 59/00 in either direction without carrying into minutes.
Minutes similarly wrap 480/0; total validation still rejects zero and above 480:00.
Selection haptics follow changed user-selected rows, not just the final stop, and
respect the app preference. Programmatic repositioning is silent. The timer is
more compact with a subtle selection band, stronger digits and muted neighbours.

The next phone run showed a translucent Session surface. The likely stale-native
opacity path switched from an Animated value to a scalar when reduced motion
resolved. Session now keeps an opaque background and constant opacity; only its
translation animates. The resolved reduced-motion preference is reused across
mounts. Supplied logs confirm the close callback finished before route removal,
but do not prove rendered opacity or frame rate.

Wheel digits now scroll through the selection row themselves, using native-driven
Animated.FlatList events for continuous opacity, scale and cylindrical rotation.
The fixed countdown digits remain mounted but hidden during setup. Scroll callbacks
only update a selection ref/haptic; React state and applied duration update on
settling. Normal flings are allowed instead of limiting momentum to one interval.
Recentring occurs only near the repeated list's outer cycles, not every stop.
No dependency upgrades were needed. Actual high-refresh smoothness and haptic
latency must be judged on the phone; no 120fps measurement has been made.

Automated checks cover exit-callback ordering, repeat-close protection, summary
acknowledgement/dock visibility, bidirectional wrap and haptic deduplication.
These do not prove rendered motion or tactile synchronisation: the new Android
transition, wheel appearance and haptic feel still need a phone run. Historical
native investigation below describes the preceding attempts, not the new fallback.

## Current experience

One singular /session route serves Home, quest Start and the session dock.
Setup, running, paused, saving and completed remain content states. Start,
Pause and Resume do not navigate. Minimise preserves the running/paused session.

Free setup now uses the main timer as a Minutes/Seconds wheel control. Selected
digits are prominent; adjacent rows indicate scrolling. Presets remain 15, 30,
45 and 60 minutes. Edit duration opens a focused numeric editor. The redundant
Custom sheet, repeated duration label and Free session heading are removed.
Quest selection, shortcuts and Life area form one compact group. Start remains
near the bottom, with scrolling details for small screens and large text.

DurationPicker is the single shared implementation for wheels and countdown.
Selected digits stay mounted in the same columns and row coordinates through
Start/Pause/Resume, including three-digit minutes. Linked quests inherit their
whole-minute duration and Life area and cannot be edited here. Running, paused,
saving and completed states have normal non-interactive digits.

## Synchronisation and keyboard

A drag changes local visible values; native settling commits one valid total of
seconds. Start is disabled while either wheel is dragging/snapping or the visible
selection is invalid. Synchronous guards also reject a tap before React paints
the disabled state. 00:00 and anything above 480:00 cannot start or overwrite the
applied duration.

Presets and typed confirmation increment a generation and reposition fresh wheel
viewports at exact indices. Callbacks from older generations are ignored. Initial
and programmatic scroll events are ignored unless a real user drag began, so
intermediate offsets cannot overwrite a preset or typed value. Momentum-end
commits a fling. A zero-velocity release at an exact snap point commits without
waiting for a momentum event that will not occur. Screen-reader adjustment
actions provide an alternative to swiping. Selection haptics respect the preference.

The numeric editor has labelled Minutes and Seconds, Cancel and Set duration.
Empty/non-integer/out-of-range input is invalid; there is no fallback substitution
or maxLength truncation of pasted numbers. Bounds are 00:01–480:00, with seconds
00–59. Cancel preserves the applied value, and reopening starts from that value.

The editor uses a native Modal with iOS KeyboardAvoidingView, a scrollable field
area and an action row outside that scroll area. Android uses native resize
without extra keyboard-height padding: installed RN Modal explicitly sets
SOFT_INPUT_ADJUST_RESIZE; app.json also declares resize. Focus is requested from
Modal.onShow. Safe-area padding is applied once to the editor card. Back dismisses
the keyboard before the editor; another back closes the editor before Session.
Reduced motion removes the editor fade. Native IME behaviour is still unverified.

Session's iOS swipe recognition is restricted to its measured header bounds so
wheel drags cannot become route-dismiss gestures. No Session drag handle is shown.
No dependency was added.

References: [Expo 57](https://docs.expo.dev/versions/v57.0.0/),
[Expo stack](https://docs.expo.dev/versions/v57.0.0/sdk/router/stack/),
[FlatList](https://reactnative.dev/docs/flatlist).

## Preserved persistence and rewards

Timer state, Start, countdown, notifications, restoration and summaries use integer
total seconds. Whole-minute quest configuration converts at setDurationInMinutes.
Foreground recovery uses the end timestamp; paused state is restored in seconds.

The PREVIOUS refinement applied session_duration_seconds_precision to Supabase;
its definitions remain in [session-seconds.sql](session-seconds.sql). This revision
does not change backend functions, schema or reward policy. Exact duration remains
recorded while each session credits floor(duration_seconds / 60) whole minutes:

| Duration | Saved seconds | Credited minutes | XP | Gold |
| --- | ---: | ---: | ---: | ---: |
| 00:30 | 30 | 0 | 0 | 0 |
| 01:00 | 60 | 1 | 1 | 5 |
| 15:30 | 930 | 15 | 15 | 75 |
| 480:00 | 28800 | 480 | 480 | 2400 |

Partial minutes are neither rounded up nor carried between sessions. History and
summaries retain seconds. Historical records and whole-minute quest rewards remain
unchanged. Completion retains its local/server duplicate protection. Closing the
reward popup keeps the summary, Done and New session. Failed Start/completion/end
remain retryable; an existing active session cannot be replaced by a new Start.

Life area remains the only setup category. New sessions use neutral activity_type
"other" for compatibility. Progress prefers a surviving Life area; non-neutral
legacy activity labels remain readable when no area survives. No historical
activity-to-area mapping was introduced.

The dock stays in reserved tab-bar layout space beneath the root screen. Its
running, paused, saving, failed and completed labels/icons remain distinct.
Home's overnight greeting remains "Welcome back, {name}".

## Dismissal investigation: unresolved native evidence

The next Android Expo Go run reported a missing GestureHandlerRootView while
rendering the duration wheels. RootLayout now wraps the provider/navigation tree
in GestureHandlerRootView with flex: 1. TypeScript and root-layout lint pass;
wheel interaction still needs a fresh phone run. The crash-triggered unmount in
that log does not establish whether normal dismissal animates.

After a further report of this error on closing, the wheels now use React Native's
FlatList directly. They require only native scrolling and snapping, not Gesture
Handler composition. This removes NativeViewGestureHandler and its root-context
requirement from the wheel lifecycle, including dismissal. The app-level gesture
root remains. Native closing and wheel behaviour still require phone verification.

The preceding card + slide_from_bottom + navigation.goBack implementation STILL
closes instantly on the user's phone. This revision has not been observed on a
device or emulator and is not marked visually fixed.

Inspected installed Expo Router 57.0.18, RN 0.86.3 and screens 4.26 sources:

- Header and Android back reach the same Session close handler, now tagged with
  different sources. It records the owning navigator, active route, history and
  reduced-motion state. Inner layers return before navigation; there is no replace
  fallback, timer reset or manual React unmount on close.
- GO_BACK becomes one POP. dangerouslySingular becomes getId for route identity,
  not a separate close animation. Singleton protection and tab anchoring remain.
- usePreventRemove is active only for keyboard/picker/confirmation. Blocked
  removals are logged; closing a layer does not replay the removal action.
- NativeStackView removes the React scene from its list on POP. Android
  Screen.startRemovalTransition recursively retains native descendants for exit.
  React unmount before native completion is therefore not itself evidence of a bug.
- The native slide-out resource translates 0% to 100% Y. The new path uses
  transparentModal to keep Home's native surface attached, freezeOnBlur false,
  an opaque non-collapsible Session root and a transparent native container.
  This targets view retention, rather than repeating the previous direction/back
  configuration change. This native-only attempt still failed on the user's phone;
  Android now uses the callback-owned fallback described above.
- Installed core useNavigationBuilder stops resolving screenListeners after the
  target route leaves state. Local logs can disappear before native completion.
  Development-only listeners are retained by the root during removal to record
  native start/end without keeping the React screen mounted.

Runtime diagnostics include platform, native RN version, Expo execution environment
and resolved reduced-motion state. A fade is intentional when reduced motion is
enabled. OS animation settings are not overridden. No runtime limitation has yet
been isolated to a native source-code cause. The repeated phone failure now motivates
the Android fallback; custom and native screen animations never run together.

## Minimal reproduction for the next phone run

In a development build or Expo Go, long-press Home's Start session (or Continue
session). Choose Card baseline or Retained Home. The normal short press is unchanged.

This opens /session-transition-test in the same root stack with a large coloured
marker. It has no timer consumer, sheets, removal guard, local back handler,
singleton option, conditional content or JS screen animation. In production the
route redirects Home. It has not been run natively here.

For EACH mode, test Close test, reopen, and test Android system back. Then compare
actual Session from Home, quest Start and the dock, using header and back separately.
Watch the entire surface slide and Home underneath; logs alone are not proof.

Capture [Session transition] runtime/motion, close request, root beforeRemove,
retained native start/end and React unmount timestamps. History should show one
Session/repro above the existing tabs, and no replacement action. Inner-layer back
should report layerDismissed/blocked removal and keep the route.

If both minimal modes fail, Session logic is not required to reproduce the issue.
If only card fails, view retention is implicated. If both minimal modes work but
Session fails, compare its guard/history/singleton path. A short recording together
with these logs is the next useful evidence. Callback absence alone does not prove
which pixels were rendered.

## Verification

TypeScript and scoped lint passed. All 48 tests pass, including the latest tests
for looping, completion acknowledgement and exit ordering/interruption.
Tests mock native primitives and service boundaries, not rendered native animation.

New coverage: ignored programmatic scroll events; native settling and Start guards;
stale events after presets; typed/preset/wheel synchronisation; Cancel/reopen; empty
and oversized pasted input; 00:01, 00:30, 15:30, 100:00, 480:00; quest locking; stable
selected-digit coordinates. Existing tests retain seconds through pause/resume,
restoration, foreground recovery, notifications and minimise/reopen, and cover
completion safeguards and header/back priority.

The prior refinement passed the transactional database regression script and
Android/iOS JavaScript exports. No database checks were rerun for this UI-only
revision. Native rendering/gestures and the minimal reproduction remain untested
because no device/emulator was available.

## Remaining phone checks

1. Both minimal transition modes and actual Session: upward entry, visible downward
   exit, Home underneath and no dock flash. Test header, Android back and supported
   iOS header-origin gestures separately.
2. Preset → wheel → typed input → preset, rapid changes and Start during momentum.
   No stale value should replace the most recently applied duration.
3. Both wheels, endpoints, zero/max rejection and stationary release without a
   fling. Invalid local wheel selections must keep Start disabled until corrected.
4. Android/iOS keyboard visibility for both fields and Cancel/Set, pasting oversized
   values, and back priority. Fields and actions must remain above the keyboard.
5. Small screens, large text, VoiceOver/TalkBack and reduced motion. Timer position
   must stay stable through Start/Pause/Resume, and wheel drags must not dismiss.
6. Minimise/reopen running and paused, complete, close rewards, Done/New session:
   preserve the session and never award completion twice.

Quest editor, persistence and backend reward rules were not modified in this
refinement. No commits or pushes were made.


## Home and completion visual refinement

Home retains its local-time greeting and pairs it with the actual streak, or
“A fresh start” for zero days. Contextual encouragement follows without claiming
that a streak has been extended. Level/XP and gold remain secondary; the duplicate
streak label is removed. Goal padding is slightly reduced.

Completion uses the shared dark/lavender palette, a restrained outline symbol,
exact duration and actual XP/gold from the completion summary. Its content can
scroll on small screens. Existing dismissal, acknowledgement and timer motion
are unchanged.

Quest planning intentionally keeps minute presets and custom numeric input.
Session uses the scrolling minutes/seconds control for precise execution. A large
wheel in the multi-field quest editor would add gesture competition and height.

Deferred: rewards AND daily-goal credit still floor each completed session to
whole minutes. 30 seconds is recorded but credits zero; 15:59 credits 15 minutes.
The popup explains this when partial minutes exist. Redesign accumulation and
reward rules together later; this visual change does not alter them.

Validation: source review and TypeScript syntax transpilation only for this
refinement; full app type checking and native layout checks remain required.
