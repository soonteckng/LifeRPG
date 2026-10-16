# Protected session milestone

Based on UI v3 (55f8fe5). Home and guide layout are deliberately unchanged while the UI refresh continues separately.

## Behaviour

Android Start checks the installed native protocol, Usage Access, overlay access and notifications before creating a session. Missing access opens protection setup. A new session defaults to Block apps unless the owner saved an Allow list. No new special permission or module is introduced.

Protected sessions replace ordinary Pause/Resume with one break of at most five minutes. End break early returns immediately; further breaks are refused by the controller and native policy. End always remains available and earns no credit before true expiry. Existing legacy sessions retain their old controls.

The journal stores the break as a gap between active segments. A future resume anchor freezes recorded time until its deadline; after expiry it advances without requiring a screen callback. A server session uses its existing verified offline handoff, retaining conflict and replay protection. These results are client_reported, not proof of server-enforced protection. Personal XP and goal credit use the existing completion path unchanged. No live SQL or auth/email changes are needed.

The Android service removes covers during the break and restores them using elapsed time even with JavaScript stopped or the app removed from Recents. Countdown notifications retain the final deadline including the break and switch back after the break. Force-stop, reboot or service eviction can interrupt protection; the app reports interruption and requires Restore. It does not pretend Android services can bypass a force-stop. Settings, phone, emergency apps and End remain accessible.

## Storage and compatibility

Protected records use journal v3. Readers accept v1/v2/v3, and each upgrade archives the exact previous bytes before replacing the source. Never downgrade with pending protected sessions. An older reader quarantines the unfamiliar journal; returning to the updated reader can read the intact source. Do not reset or clear quarantined data to downgrade.

## Guide follow-up

After Home is final: remeasure guide anchors, update the permission and break explanations, and test the mandatory first-run guide on small screens and large text. No guide positioning is changed in this milestone.

## Combined installed-phone checks

1. Fresh protection setup: deny an access, try Start, then grant all required access and start once.
2. Allow list and Block apps: chosen tools and system/emergency apps stay reachable; other launchable user apps are covered.
3. Take the break, remove LifeRPG from Recents, and wait: apps unlock, then protection returns after five minutes. Recorded effort excludes the break.
4. End the break early; attempt another break. No second break is available, including after restarting the app.
5. End during the break: confirmation and Done stay reachable, no XP or recorded time awarded.
6. Finish offline after a break, reconnect and retry sync: one saved completion and one reward.
7. Revoke overlay/usage access, force-stop, and reboot separately: interruption is honest and Restore/End remain available.
8. Compare notification and app deadlines before, during and after a break; the finish alert must not fire at break end.

Automated results and the build identifier are recorded in the delivery note for the specific commit. Phone checks remain required before release.
