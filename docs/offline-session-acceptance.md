# Offline session acceptance

Main checkpoint: `03cbcb1`. Offline work is a separate branch, `feature/offline-sessions`.

This feature stays disabled until its SQL proposal is approved and installed, the compatible preview update is published, and this account has opened the updated app online to cache its capability. Use the existing installed APK7. No new native module or Android build is required. Expo Go does not validate the native notification behaviour.

Use an existing valid account. Do not create accounts with fabricated email addresses. Record the update ID, test time, session title/duration, expected result and observed result. Keep each test's sessions distinct so history can be checked for duplicates.

## Test sequence after activation

1. **Online baseline:** Open Home online. Start a one-minute Learning session, pause/resume, finish, dismiss. Expect normal controls, one saved result and exactly the established rewards.
2. **Offline Start:** Disable Wi-Fi and mobile data, close and reopen the app. Choose Learning, Custom, one minute, Start. Expect a round timer immediately, working Pause/Resume/End, and no network requirement for starting.
3. **Paused recovery:** Pause with roughly 40 seconds left. Remove from Recents, reopen offline and wait ten seconds. Expect unchanged remaining time. Resume and finish. Expect a saved-on-phone message and working Done, with no confirmed XP claim.
4. **Several queued results:** Dismiss the first pending result and complete another one-minute offline session. Expect two waiting records and the ability to start again. Reconnect without pressing Retry. Expect automatic verification/upload and two history entries, each credited once. Reopen online twice; expect no duplicate credit or replayed celebration.
5. **Running process death:** Start offline, remove from Recents, wait past the deadline, reopen offline. Expect a recovered completion with its original end time. Reconnect; expect one saved session. Repeat with Android Force Stop, which is a separate test from removing from Recents.
6. **Mixed session:** Start online, disconnect, pause/resume locally and finish. Reconnect. Expect the original server session to finish once, rather than a cancellation plus a new imported session. Check the saved duration and goal progress.
7. **End offline:** End an offline-started session early. Reopen and reconnect. Expect no reward and no later completion. Repeat with an online-started session ended while disconnected; expect its original row to become cancelled, with no reward, and a new Start to work.
8. **Exact expiry:** Tap End at the displayed zero, before the next visual tick if possible. Expect completion and one reward. A stop genuinely saved before canonical expiry remains an early End. The automated tests cover the exact boundary even if tapping it is difficult.
9. **Reconnect fluctuations:** While a result waits, toggle the network a few times and press the single Retry connection action. Expect stable status, no disappearing controls, the same saved record and one eventual cloud result. Home/quest/progress refresh after confirmed upload.
10. **Account isolation:** With a pending result, follow the sign-out warning, sign into a second existing account, and inspect its history. Expect none of the first account's work. Return to the first account online; expect its pending work to upload once.
11. **Newer cloud state:** With two updated devices, change a session's state on one while the other records local timing. Reconnect the second. Expect a clear rejected/conflict result, no duplicate reward and the original local claim retained. Dismiss that review; expect the newer cloud session's controls to return. Do not silently cancel the other device's work.
12. **Notification/reboot:** Check countdown, background expiry, warm controls and cold notification opening. Reboot once with a running session and reopen after its deadline. Expect a restored result and one alert/result, not a restarted full duration. Reboot acceptance remains outstanding until actually run on a phone.
13. **Slow upload with current work:** Queue a completed result, press Done and start another session offline. Reconnect on weak signal. While the earlier result saves, Pause/Resume/End the current session and try another Start. Expect responsive controls and exactly one reward for each fully completed session. Reopen online while a dismissed result still waits; expect local Start to remain available after the saved account has been admitted.

Also verify font scaling, keyboard accessibility and that Done is reachable without scrolling on the result. Device tests are still pending; automated success is not a substitute for recording these results.

## Implementation boundaries

The account must already have been verified on this installation. Initial sign-up and account edits still require a connection. New offline work requires a fresh scoped cached capability; existing local work remains on the phone if that grant expires. Finished work is provisional until a server receipt is durably saved. Partial credit and offline quest creation are outside this slice.

Completed imports have an eight-hour target limit, 24-hour wall span, 256 intervals, seven-day end-age limit, bounded clock skew and a sixteen-hour client-reported daily cap. Same-row End earns nothing and remains available after a long pause. Conflicts and rejected claims are retained for review; they never overwrite newer cloud state. Temporary disabled sync retains pending work for retry. Native receivers remain display/launch adapters and never write the journal.

Operational rollback pauses new reward admission and retains receipts/history. It does not downgrade a v2 journal to the old app format. Keep a compatible client installed; the original v1 bytes are retained as a read-only backup before promotion.
