# Round 79: one offline sync summary and return

Base: d412bb56f1f8b76458e18df60d896ddf2d549fa1 (pushed Round78).

## Behavior

Three offline one-minute completions still receive their local pending cards. Reconnection uploads each durable record normally, then shows one Sessions synced receipt: 3 sessions, 3 minutes and the sum of their confirmed receipt XP. A single combined finds/trail return follows Done. The underlying completed timer exits behind that opaque return, so Continue fades directly to the app.

The old controller selected each saved receipt individually, while automatic reward claims could interleave uploads and enqueue distinct maps. A presentation observer now captures receipt copies across each import pass before journal compaction. A separate private backend/owner AsyncStorage cache retains unacknowledged batches; it changes no history, XP, journal schema, native input or database rule. Only the exact outgoing members are acknowledged after the map fade. Partial network failures show only confirmed sessions, with pending work remaining safe for normal retry. If a retry finishes after an earlier summary was acknowledged, those newly confirmed sessions form a later catch-up.

Automatic claims pause during pending imports/restoration and the batch return. The host reuses the existing claim endpoint, including its single bounded 50-row backlog follow-up, without polling after failures. Claim chunks merge by session ID, preserving legitimate duplicate finds. Late finds keep their animated item card but skip an already-covered map. A failed/slow claim uses confirmed daily counters and cached matching-day awards; it never invents XP, finds or a trail bonus. Earlier-day minutes appear in summary totals but never advance today's path.

The sheet remains Done-only, with the existing fade, haptics and accessibility. Preparing a slow return says Opening…, with a bounded fallback. Reduce Motion swaps instantly. Developer > reward tests includes Offline sync summary and uses the actual receipt/return components without changing real progress.

Map numbers remain fixed milestone positions: 30,60,90,120 min total. At 7 minutes walked, Next find in23min is the remaining-time statistic. Turning every route label into a countdown would obscure the route's scale; the total suffix makes their meaning explicit.

## Verification and limits

The new controller regression fails against the R78 controller, which has no batch and selects individual saved notices. It passes with three independently credited records and one180-second presentation. Actual host ordering tests verify one claim, one receipt, retained map readiness, physical receipt dismissal, a single480ms final fade and exact-member acknowledgement. Additional store, summary, sheet and map tests cover hydration/restart races, overlapping observers, >20 journal-compaction entries, >50 claim chunks, mixed dates, duplicate gifts, storage failures, small screens/large text and ordinary receipts. Existing offline-protection behavior is unchanged.

Final full-suite results, native fingerprint, one-commit patch-apply proof, export manifest and ZIP hashes are recorded with the delivery. Test external networking is blocked and SQL runs only in isolated PGlite. No live Supabase/Auth/email requests, SQL, dependencies, native/config changes, APK, EAS publication or push. Android device smoothness remains a phone check. Native notifications and other native work remain deferred to November2026.

Phone check: finish three1-minute sessions offline, Done on their pending cards, reconnect. Expect one3-session summary, then one map moving3minutes. Repeat with the final pending card left open. Check a normal online completion still uses its usual flow, and 7minutes walked shows23remaining plus fixed milestone totals. Close/reopen twice after publishing to load the update.
