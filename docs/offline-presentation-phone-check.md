# Short phone check after the offline presentation repair

Use the existing installed Android app and an existing account. This is an EAS Update, so no new APK is needed. Open online for about 30 seconds to download it, then remove LifeRPG from Recents and reopen online. Let Home load once. Keep saved app data intact while anything awaits sync.

Your previous passing sync tests still count. These four checks cover the behaviour changed by this update; you do not need to repeat the full offline test list now.

1. **Offline choices and End confirmation.** Turn off Wi-Fi and mobile data, remove from Recents and reopen. Change direction between Learning and another category; verify its starting point changes. Start one minute. Tap End: Cancel should keep the timer running, then confirm End and tap Done. Reconnect. There should be no time/XP earned for this stopped session and no stuck timer.
2. **Finish offline, then Done.** Start one minute online, disconnect and let it finish. Tap Done while offline. Turn the network back on and wait without pressing Retry. Expect Home rather than the unfamiliar New session setup, one modern saved-result card once confirmation arrives, and exactly one minute/reward. Tap Done and reopen twice; no repeated result or extra credit.
3. **Reconnect with the result still open.** Start and finish one minute offline. Leave its pending card open and reconnect. It should update in place to the same modern confirmed card. Done should stay visible; Save as quest, if this is a suggestion, should open an editable draft. It must not use the old full-page summary or overlap either action.
4. **Restart a waiting finish.** Start one minute offline, remove from Recents while running, wait past its deadline and reopen offline. Tap Done, then reconnect. Expect one recovered result with the original duration, working Done and one eventual cloud reward. An earlier saved confirmation may wait if a different timer is active.

During these checks, also note whether online/offline transitions fade without a brief empty setup or a duplicate result card. If one fails, send the check number and screenshot; keep the local data so the actual pending record remains available.

Reboot and two-device conflict acceptance remain separate release checks. They are not required to repeat these four presentation checks.
