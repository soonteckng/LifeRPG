# Follow-up to the 11 October phone tests

These fixes build on `bd9ed2e` on `feature/session-reliability`. They change JavaScript only. The deployed session Start/Stop repair remains unchanged, and this follow-up makes no live database changes.

## Findings and changes

- An offline account verification failure with an empty, successfully read journal incorrectly set `restoreError`. The offline page then claimed the local session was unreadable, and Retry rebuilt the controller and briefly showed the no-session card. Only actual local read/quarantine failures now set that flag. During a genuine journal reload, the offline view retains its resolved presentation for the same account/backend/admission scope.
- Local-only admission now checks for restored connectivity every four seconds while the app is active and immediately when it returns to the foreground. Manual retry and automatic retry share an in-flight fresh account verification. A late bootstrap response cannot overwrite a newer verification. Four seconds is the check interval, not a guaranteed save latency: credential refresh and authenticated server responses can take longer.
- The responsive presentation clock began at the Start/Resume tap, while the authoritative timer began when the server processed it. Displaying zero during that gap made an End tap look like completion even though server timing still classified it as early cancellation. The visible running countdown now stays at least one second until the authoritative deadline. End after that deadline completes the session, including before the next timer tick.
- A known completion now uses its existing idempotent, elapsed-time-gated server function directly after fresh owner verification. A redundant preflight row read is removed. A lost reply or transient receipt-write failure can recover from fresh terminal-row proof; unavailable proof retains the original pending intent. Receipt storage still precedes reward presentation.
- Dismissing a pending result suppresses its later celebration without discarding the pending save. Summary content is available in the same render as a durable receipt. Fast confirmation opens the final sheet once; slow or failed confirmation still shows an honest pending state. Rewards never appear before confirmation.
- The completion sheet fits its measured content, keeps actions in normal flow below scrollable details, and caps its height for short screens and enlarged text. The save action is named **Save as quest**. Successful saving becomes status text instead of a disabled choice.
- The session quest picker now uses the same eligibility rules as Home and the quest sheet. Completed one-off quests from earlier days no longer appear as remaining choices. It refreshes when opened; stale pre-save/delete responses cannot overwrite the current list. Account-scoped task reads are verified before and after fetching. Existing quests and history are preserved.
- The quest sheet reserves only its measured Done-today footer height at the scroll tail. The extra blank tail padding is removed.
- Guide step 4 was checked: its sentence already ends with a full stop, `Tap a quest to set up its focus session.`

## Phone findings versus automated checks

The user reports most of the previous 15 cases and account isolation passed. Case 14 was an End tap exactly at the displayed `00:00`, followed by Done while saving was pending. The exact session could not be identified from the reported time. Read-only database inspection found recent completed one-minute sessions with receipts, but this cannot establish which was case 14. The display/server timing mismatch was independently reproduced and covered with a regression; it is fixed whether or not that particular result saved later.

Automated checks cover delayed Start verification at the zero boundary, End before the expiry tick, pending-result dismissal followed by confirmation and restart, lost completion replies with failed proof reads, one reward across retries, fast/slow completion presentation, empty offline journals, stable reload presentation, fresh reconnect verification and quest-list consistency.

Final validation passed: **645/645 integrated tests, zero failures or skips**, with disposable PGlite SQL execution enabled. Typecheck and lint without cache also passed. Independent review found no completion or reconnect safety blocker; its stable-summary identity correction and account/backend/admission isolation regression were incorporated before this run. Dependencies, lockfile, native manifests and runtime configuration are unchanged.

Installed-phone retesting remains necessary. Reboot recovery was not tested by the user. The two-connection PostgreSQL Start/Stop interleavings documented in `tests/sql/session-start-stop-concurrency.sql` also remain unexecuted; disposable PGlite checks are not parallel connection tests. This is a test-branch update, not a claim of zero bugs or production readiness.

## Focused retest

Keep existing app data and the same account. Update the installed preview app before testing.

1. With no running session, disconnect and open/retry the offline page. It should show the account/no-session card consistently, without a saved-session read error or brief card swap. Reconnect with the app open and do not press Retry. It should return online automatically. Also check returning from the background after connectivity comes back.
2. Finish a one-minute suggestion online. The final result should normally open without a brief pending popup; actions should be visible without a large blank area. Save as quest once, check the success status, and confirm the same new quest appears in Home, All quests and the session picker. A completed one-off test quest should not appear as remaining work in the picker; future quests remain in All until due.
3. Start a one-minute session and tap End exactly when the displayed countdown first reaches zero. If a confirmation appears, confirm it. The outcome must be completion with one saved session and one reward. If confirmation is slow, Done must preserve its pending save. Reconnect/reopen and confirm history and daily progress increase exactly once.
4. Complete or end an already-started session without signal, restore signal, and let automatic confirmation run. Pressing Done while confirmation is pending must not lose work or reopen the reward sheet later. An early End must earn no XP.
5. Scroll the quest list to its last remaining row while Done today is present. There should be no added blank tail gap. Check guide step 4's final full stop.

Starting a new session offline and changing an already-paused session offline remain outside this layer. Recovery preserves already-started work and queued ending/completion operations until fresh account verification succeeds.
