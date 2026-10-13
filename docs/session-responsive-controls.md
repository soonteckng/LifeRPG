# Responsive session controls

Prepared 11 October 2026 for the session-reliability feature branch.

## User-visible behavior

Home Start opens Session immediately after invoking the provider, for both free focus and suggestions. Navigation happens once for the tap, not after the server response. The exact draft is already prepared in the provider; an unknown or failed start remains recoverable on the timer screen. Its presentation countdown starts at the tap, with a readable Pause label while confirmation is pending.

Pause freezes the displayed numeral at the tap. Resume continues from that numeral, including while confirmation is pending. A session-scoped presentation clock survives successful matching replies, so a later server value cannot drop a paused numeral or rewind Resume. It is discarded on failed/uncertain controls, a contradictory remote state, terminal state, owner change, clock warning or restart. Foreground display ticks every 200 ms; whole seconds still change once per second. Normal confirmation keeps the control label visible without a spinner, dimming, waiting-message flash or running/paused phase fade. Overlapping timing commands remain protected until confirmation; uncertain legacy mutations are never blindly resent.

End shows its notice after the stop has been saved durably on the phone, without waiting for server cancellation. The visible active timer and its banner stop immediately, while a pending End still blocks starting a replacement session. A failure to save the stop never produces the ended notice. Failed confirmation offers retry for the same saved cancellation. End at expiry still goes through full completion, and an earlier saved End still prevents a later completion submission.

The notice and Session start dismissing together when Done, backdrop or swipe dismissal is requested. The notice uses timed sheet motion; the controlled Session exit preserves the outgoing timer layout and pops the route once. A late sheet-dismiss callback cannot trigger another exit.

Normal End confirmation does not insert an offline/retry block into the opening notice. That block is shown only after an unsuccessful request settles. The outgoing timer layout is held during the local stop write as well as server confirmation.

Completion opens the same result sheet at zero, with a saving state until a durable receipt arrives. No XP, Focus day, goal credit or Save for later action is presented as confirmed during that state. The sheet uses one fixed snap point and timed motion across pending/confirmed states. The Done footer includes safe-area padding, and the scroll view reserves its measured height so it cannot cover the final rows or Save for later.

On background entry, a still-confirmed running session refreshes only its ongoing banner. This restores a banner the user dismissed without cancelling or rescheduling the existing finish alert. Paused, ending, expired and uncertain sessions cannot refresh the banner; the lifecycle queue still fences late work after End or account teardown.

## Boundaries

Interaction feedback and the display clock are presentation state only. They are not serialized into the journal, change no RPC or server timestamp, and cannot award XP or complete a quest. A display reaching zero early waits for authoritative expiry and a receipt. Start remains an online operation. Owner fences clear transient feedback; restart recovery uses the durable journal rather than a remembered visual preview. Old completion summaries are hidden during a new start. Alerts use the canonical deadline, are held while timing is unconfirmed, and clear as soon as End is durable.

No database, native module, dependency or device permission changes are part of this update. The approved category repair remains installed separately.

## Validation

The integrated Node suite passed in the validation workspace: 528 tests, 0 failures, 0 skipped. Typecheck and lint without cache passed. Additional regressions cover delayed Start/Pause/Resume replies with continuous display timing, an early display-zero unable to expire or award a session, readable Start controls, normal End without a transient retry block, a single pending-to-confirmed completion sheet, footer space, and background banner restoration without replacing the finish alert. Existing storage, expiry, duplicate-credit, account-switch and unknown-control safety checks still pass.

The user tested installed Android Start, Pause/Resume, End and full completion and reported the handoff jumps, missing labels/banner, transient retry block and overlapping result footer fixed here. Those fixes need device retesting. Offline/restart/account/reboot cases 4–10 of the supplied phone flow are still untested. First recheck a one-minute free and suggested session, Pause at 00:16, Resume with no backward numeral, swipe away the running banner and background again, and both result sheets. Then continue the existing reliability flow.
