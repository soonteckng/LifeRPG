# Daily achievements

After Done closes a confirmed completion result, a separate full-screen moment
celebrates the account's first recorded session of the current local day or
crossing that day's goal. If one session proves both, one moment prioritizes
the goal and acknowledges the first session too. It has a large animated emblem,
concise copy and one Continue outside the scrollable artwork. The ordinary
completion result retains its always-visible Done action.
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
The moment does not infer a numbered streak from the daily-goal streak field.

Daily-goal eligibility uses the receipt's stored `daily_goal_minutes` and
`daily_completed_seconds`: the total after credit must reach the goal, while
the total minus this receipt's accepted duration must be below it. These values
are saved in `activity_sessions.credit_result`. Completion retries return the
same snapshot with `goal_reached_now=false`, so a lost original reply can still
prove the crossing. Without a valid stored target, only an explicit confirmed
`goal_reached_now=true` qualifies; the live profile's goal is never guessed.

Each achievement has a separate local claim ledger per account and backend.
The previous first-session ledger key is retained across app updates. Claims are saved
before displaying the moment and serialized across both result surfaces. The
ledger keeps the most recent 35 claimed dates. Reopening a result or restarting
the app does not replay the claim. Account changes and result dismissal cancel
outstanding display work. Storage errors suppress the optional encouragement
and leave the ordinary completion result available.

Done captures immutable receipt evidence without waiting for storage. The
queue receives it only after the result physically dismisses. A global host
survives SessionScreen's route removal and waits for that route and other
editors to close. It reserves presentation while the ledger claim is pending
so optional permission invitations cannot race it. The native modal keeps the
reservation until dismissal, including on iOS. Repeated Done/dismiss callbacks
cannot queue twice. Gesture dismissal does not start a celebration. Pending
saves never queue an achievement, while Done still closes them. Account and
local date are checked again before display.

The moment has one 720 ms entrance. Reduce Motion renders it statically, and
backgrounding stops the animation. Returning to the foreground does not replay
it or claim again. A displayed moment stays available until Continue. Existing
reward confirmation, XP, quest completion and syncing are unchanged.

Device checks should use an existing account with no recorded session on the
current local day: complete one session, press Done and see the first-session
moment, then Continue. Complete another and confirm it does not repeat. Reach
the day's goal, press Done and see the goal moment, then confirm it does not
repeat after reopening the result or completing more sessions. Check a first session that reaches the
whole goal, same-day offline confirmation, an older recovered result, account
switching, large text and Reduce Motion. Done remains available without
scrolling through rewards. The ledger suppresses repeats on this installation;
it does not sync celebration acknowledgements to other devices. No new native
module or database change is required.
