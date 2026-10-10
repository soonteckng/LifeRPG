# Responsive session controls

Prepared 11 October 2026 for the session-reliability feature branch.

## User-visible behavior

Home Start opens Session immediately after invoking the provider, for both free focus and suggestions. Navigation happens once for the tap, not after the server response. The exact draft is already prepared in the provider; an unknown or failed start remains recoverable on the timer screen. The initial duration stays still until the server establishes the session's real timing.

Pause and Resume publish a transient interaction snapshot before waiting for account verification. Pause freezes the displayed remaining time; Resume displays a running preview. The journal and completion logic still use confirmed server timing. Normal confirmation shows the new control icon without a spinner, dimming, a waiting-message flash or a running/paused phase fade. A failed or uncertain request clears the preview and exposes the existing recovery state. Overlapping timing commands remain protected until confirmation; uncertain legacy mutations are never blindly resent.

End shows its notice after the stop has been saved durably on the phone, without waiting for server cancellation. The visible active timer and its banner stop immediately, while a pending End still blocks starting a replacement session. A failure to save the stop never produces the ended notice. Failed confirmation offers retry for the same saved cancellation. End at expiry still goes through full completion, and an earlier saved End still prevents a later completion submission.

The notice and Session start dismissing together when Done, backdrop or swipe dismissal is requested. The notice uses timed sheet motion; the controlled Session exit preserves the outgoing timer layout and pops the route once. A late sheet-dismiss callback cannot trigger another exit.

## Boundaries

Interaction feedback is presentation state only. It is not serialized into the journal, changes no RPC or server timestamp, and cannot award XP or complete a quest. Start remains an online operation. Owner fences clear transient feedback; restart recovery uses the durable journal rather than a remembered visual preview. Old completion summaries are hidden during a new start. Alerts are held while timing is unconfirmed and cleared as soon as End is durable.

No database, native module, dependency or device permission changes are part of this update. The approved category repair remains installed separately.

## Validation

The integrated Node suite passed in the validation workspace: 522 tests, 0 failures, 0 skipped. Typecheck and lint without cache passed. Regression coverage includes immediate navigation before a delayed start response, one start/navigation after rapid taps, exact retry setup, Pause/Resume feedback while verification is delayed, unchanged journal timing during previews, preview rollback after unsent/unknown failures, durable End before its network reply, parallel dismissal with one route pop, and existing expiry/duplicate-credit/account-switch recovery.

Installed Android testing remains required. Check free/suggested Start, Pause and Resume on a healthy connection, End before zero and its joint dismissal, then airplane-mode End/reopen/reconnect. Confirm one receipt for full completion and no completion reward for a saved early End.
