# Phone retest: completion recovery and offline saving

Use your installed LifeRPG preview app after publishing and loading this branch's update. An existing account is fine. Allow Home/profile to finish loading online before each case. Keep automatic date/time enabled. Do not clear app data or uninstall while a result is waiting to save.

This version supports recovery and saving when a session **starts online and then loses connection**. Starting a new session completely offline remains unavailable. After an offline cold launch, changing a recovered timer's state requires reconnecting. The native live countdown, widgets and boot notification restoration are later work.

Allow about 25 minutes. For each case, record Pass, Fail or Not tested. Note the session title, finish time, message and number of matching entries in Progress. Use different titles if you create test quests; otherwise write down the finish times to distinguish repeated free sessions. Check the currently selected week/month in Progress.

## 1. Quick visual checks

1. Open Home's Custom focus length and tap Minutes, then Seconds. The short sheet should sit above the keyboard with its contents together, without the large blank gap. Dismiss the keyboard and save a one-minute duration.
2. Open Today's quests. With no quests, the sheet should fit the empty message instead of occupying most of the screen. With a few quests, it should fit the rows; a long list should scroll within a capped sheet.
3. Finish the one-minute session online. The result must begin at the top with its full icon, title and finish time. Scroll to the bottom. Save for later, when available for a suggestion, must sit above Done without being covered.
4. Press Done. Close/reopen the app twice. That already-saved completion must not reopen or reappear as the active session. Its Progress entry and reward remain exactly once. If an earlier pending session finishes syncing, it should identify itself as Earlier session saved, with its own title and finish time.

## 2. Finish offline with the app open

1. Note today's focus total and character XP. Start two minutes online and wait five seconds.
2. Turn off both Wi-Fi and mobile data. Let the countdown reach zero with the app open.
3. The finished session must be kept on this phone. It must not claim confirmed cloud rewards while offline. You may close the result message.
4. Restore the connection and keep the app open for 90 seconds. Do not press Retry during this acceptance window.
5. Check Progress: one new matching session, two minutes of focus credit and one reward. Close/reopen twice and confirm there is no second entry, reward or repeated saved-result popup.

If saving requires Retry, record this case as **automatic sync failed**, then use Retry to recover the record. Successful manual recovery does not make automatic sync pass.

## 3. Force Stop before expiry

1. Start five minutes online, wait five seconds and disconnect both connections.
2. In Android Settings > Apps > LifeRPG, press Force stop. Wait about 30 seconds, then reopen while still offline.
3. The same saved session should return with elapsed time accounted for, not restart at five minutes.
4. Reconnect and bring the app back to the foreground. If this running-session recovery screen still asks for connection, use Retry connection. End online before the target to clean up.

This connection retry is separate from the automatic confirmation of a finished result in cases 2 and 4.

## 4. Expiry while Force Stopped

1. Start two minutes online, wait five seconds, disconnect, then Force stop.
2. Wait three minutes and reopen offline.
3. The finished session should be retained locally at zero, waiting for confirmation. It must not start a new timer or invent confirmed rewards.
4. Reconnect and leave the app open for 90 seconds without Retry. Verify exactly one matching Progress entry and one reward. Reopen twice to check it does not replay.

## 5. Reboot offline

1. Start three minutes online, wait five seconds, disconnect and reboot the phone.
2. Reopen LifeRPG while still offline. Before expiry, the saved countdown should account for elapsed time. If reboot takes longer than the target, it should show the pending finished result instead.
3. Let it expire offline if needed. Reconnect and leave the app open for 90 seconds. Verify one saved result and one reward.

A notification can be absent after Force Stop/reboot in this version. These cases test session recovery after reopening; native notification restoration is a later milestone.

## 6. Early End must stay ended

1. Start two minutes online, wait five seconds and disconnect.
2. While the session screen is still open, press End well before zero. Close the ended notice.
3. Force stop, wait beyond the original two-minute deadline and reopen offline.
4. The saved stop must never become a completed session or earn XP/minutes. Reconnect and leave the app open for 90 seconds so cancellation can confirm.
5. Verify no completed-session reward was added. Only use Retry afterwards to diagnose an automatic confirmation failure.

Press End before Force Stop. The cold-launch offline recovery screen intentionally does not offer new timing controls.

## 7. A confirmed Pause survives restart

1. Start three minutes online. After ten seconds, Pause and wait five seconds for server confirmation.
2. Disconnect and Force stop. Reopen offline and wait 30 seconds.
3. The saved paused remaining time should stay fixed. Reconnect, foreground or Retry connection if necessary, Resume, then End online to clean up.

## 8. Account separation

After all pending results are confirmed, sign out of account A and into another test account B. B must not show A's session or result. Return to A and verify its original history and totals remain. Skip this case if you only have one test account.

## Reporting

For a failure, send the case number, session title/finish time, what you saw, connection state, and whether Progress or XP changed twice. A screenshot is useful if the layout is wrong. Device results remain unverified until these checks are run.
