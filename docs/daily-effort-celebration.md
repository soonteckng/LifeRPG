# Daily achievements

The confirmed completion sheet shows a clear animated “Nice work!” card for the
first recorded session of the account's current local day, and another
achievement when a session crosses that day's goal. When one session proves
both, the card presents both achievements together. It appears before result
details, inside the existing sheet, with the same always-visible Done action.
The wording covers quests, suggested sessions and free sessions without claiming
that every session was a completed task. No additional reward is awarded.

Eligibility requires the server receipt's credited date, credit version 1,
positive exact duration, and a daily recorded total equal to that duration.
Pending saves, later sessions that day, old credited dates and missing receipt
metadata do not qualify for first-session encouragement. Confirming an offline
result or recovering it on the same local day can qualify if its celebration has
not already been shown. Earlier days never appear as today's achievement.
Missing legacy profile timezones use the same Asia/Kuala_Lumpur default as the
database profile schema; invalid explicitly supplied timezones suppress claims.
The card does not infer a numbered streak from the daily-goal streak field.

Daily-goal eligibility uses the receipt's stored `daily_goal_minutes` and
`daily_completed_seconds`: the total after credit must reach the goal, while
the total minus this receipt's accepted duration must be below it. These values
are saved in `activity_sessions.credit_result`. Completion retries return the
same snapshot with `goal_reached_now=false`, so a lost original reply can still
prove the crossing. Without a valid stored target, only an explicit confirmed
`goal_reached_now=true` qualifies; the live profile's goal is never guessed.

Each achievement has a separate local claim ledger per account and backend.
The previous first-session ledger key is retained across app updates. Claims are saved
before displaying the card and serialized across both result surfaces. The
ledger keeps the most recent 35 claimed dates. Reopening a result or restarting
the app does not replay the claim. Account changes and result dismissal cancel
outstanding display work. Storage errors suppress the optional encouragement
and leave the ordinary completion result available.

The card has one brief entrance. Reduce Motion renders it statically, and
backgrounding stops the animation. Returning to the foreground does not replay
it. Existing reward confirmation, XP, quest completion and syncing are unchanged.

Device checks should use an existing account with no recorded session on the
current local day: complete one session, see “Your first session today”, then
complete another and confirm it does not repeat. Reach the day's goal and see
“Daily goal complete”, then confirm it does not repeat after reopening the
result or completing more sessions. Check a first session that reaches the
whole goal, same-day offline confirmation, an older recovered result, account
switching, large text and Reduce Motion. Done remains available without
scrolling through rewards. The ledger suppresses repeats on this installation;
it does not sync celebration acknowledgements to other devices. No new native
module or database change is required.
