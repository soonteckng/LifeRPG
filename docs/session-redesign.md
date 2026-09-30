# Session redesign

## Resulting flow

Home, quest Start and the session dock enter the singular root /session route.
The legacy timer URL redirects there. Setup, running, paused, saving completion
and completed are content states, not separate routes. Start never navigates.

The countdown and progress track remain mounted above the scrolling detail area;
their style and position do not depend on setup/running/paused state. The primary
action remains below the scroll area. Only surrounding controls fade between states.
Reduced motion disables that fade and uses the root modal's fade transition.

Quest setup retains its title, duration and life area, with Activity as a compact
independent choice. Activity is recorded by the existing session RPC and read by
Progress; it is not inferred from the quest. Free setup retains a valid Other
default, duration presets/custom validation, General fallback and optional quest.
Unresolved quest IDs remain linked and prevent starting until resolved or explicitly
switched to free setup.

## State and rewards

- A synchronous context lock prevents repeated in-flight Start requests.
- Existing session IDs prevent new starts from replacing paused/running sessions.
- Failed starts keep the draft and expose Retry. Failed cancellation preserves the
  current timer and Retry repeats cancellation rather than pausing it.
- Minimise only dismisses navigation. It does not reset, pause, or cancel the timer.
- Reward-popup visibility is independent from the saved completion summary.
- Closing rewards keeps the summary, Done and New session visible in Session.
- Completion uses the existing RPC and the same session ID. The local completion
  guard prevents repeat calls after success; an already_completed response does not
  present rewards again. No reward calculation or backend schema was changed.
- Failed completion stays at zero with Retry rather than returning to setup.

## Navigation investigation

The prior screen already switched setup/active content conditionally. Replacing
two different layouts caused the timer's visual jump.

The global banner was outside the stack with a high z-index and pathname-based
visibility. It could render above an outgoing Session. It now occupies measured
layout space in the tab bar, beneath the root modal, with safe-area bottom padding.
Home's old overlay reservation was removed because the dock reserves actual space.

The legacy All Quests route used replace to enter Session; it now uses navigate.
The global Android back handler now defers Session back handling to Session itself.
Normal exits use dismiss, retain the outgoing component, and do not use timers or
custom screen-exit animations. Root history is anchored to tabs for direct links.
The root Session screen is singular to prevent duplicated routes from rapid entry.

The native stack remains fullScreenModal with slide_from_bottom, and vertical
gesture direction where supported. No drag handle is shown. A picker, confirmation,
or keyboard blocks route removal until that layer is dismissed.

These are code-level fixes to identified risks, not proof of the reported missing
exit animation's device-specific root cause. Both animation directions still need
on-device observation. In particular, fullscreen modal gesture support must not be
inferred from card-stack gesture options.

## Verification

TypeScript and scoped lint passed. All 32 automated tests passed, including the
20 existing Home/quest tests and 12 new Session tests. Tests use mocked native
primitives and service boundaries; they do not render native animations.

Covered: timer node/layout continuity, compact quest setup and loading, custom
validation, failed/repeated starts, running/paused preservation, cancellation
failure/retry, completion/reward dismissal, duplicate completion protection,
restored sessions, keyboard/picker/back priority, and Done/New session controls.

Android and iOS JavaScript exports passed using --no-bytecode. The standard export
reached Hermes compilation but Windows denied executing hermesc.exe, so Hermes
bytecode generation remains unverified. No physical device or emulator was available.

## Phone checklist

- Home, quest Start and repeated dock taps open only one Session upward.
- Header close, Android back and supported iOS gestures dismiss downward.
- The outgoing screen remains visible throughout dismissal; the dock appears
  underneath without flashing above it.
- Minimise at the start of a session and while paused, then reopen: same quest,
  activity, life area, duration and remaining time (running time continues).
- Timer position does not jump after Start, Pause or Resume.
- Keyboard and pickers close before Session; inner-sheet scrolling does not
  accidentally dismiss the whole Session.
- Small/large phones, large text and long titles leave primary controls reachable.
- Dock does not overlap Home content, tab buttons or the system navigation area.
- Complete while foregrounded and minimised; close rewards, view summary, then
  use Done or New session without a second reward.
- Verify reduced motion, interrupted gestures and foreground recovery.

QuestSheet and the quest-management UI were not edited. The legacy tasks route
changed only its Session navigation callback. No commits or pushes were made.
