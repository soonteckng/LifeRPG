# First step today

The confirmed completion sheet can show a small animated encouragement card for
the first recorded session of the account's current local day. It uses the
existing result sheet and Done action; it does not add a second modal.

Eligibility requires the server receipt's credited date, credit version 1,
positive exact duration, and a daily recorded total equal to that duration.
Pending saves, recovered earlier results, later sessions that day, old dates,
and missing metadata do not qualify. The wording works for quests, suggested
sessions and free sessions without claiming they were all completed tasks.
It does not infer a numbered streak from the daily-goal streak field.

The account and backend have a separate local claim ledger. Claims are saved
before displaying the card and serialized across both result surfaces. The
ledger keeps the most recent 35 claimed dates. Reopening a result or restarting
the app does not replay the claim. Account changes and result dismissal cancel
outstanding display work. Storage errors suppress the optional encouragement
and leave the ordinary completion result available.

The card has one brief entrance. Reduce Motion renders it statically, and
backgrounding stops the animation. Returning to the foreground does not replay
it. Existing reward confirmation, XP, quest completion and syncing are unchanged.

Device checks should use an account with no recorded session on the current
local day: complete one session, check the single inline card, then complete
another and confirm it does not appear. Also check large text, Reduce Motion,
and that recovered earlier results show no new-day encouragement. No new native
module or database change is required.
