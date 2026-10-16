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
2. Allow list and Block apps: chosen tools, phone/emergency, Settings and the launcher stay reachable; other launchable apps are covered, including preinstalled browsers and video apps.
3. Take the break, remove LifeRPG from Recents, and wait: apps unlock, then protection returns after five minutes. Recorded effort excludes the break.
4. End the break early; attempt another break. No second break is available, including after restarting the app.
5. End during the break: confirmation and Done stay reachable, no XP or recorded time awarded.
6. Finish offline after a break, reconnect and retry sync: one saved completion and one reward.
7. Revoke overlay/usage access, force-stop, and reboot separately: interruption is honest and Restore/End remain available.
8. Compare notification and app deadlines before, during and after a break; the finish alert must not fire at break end.

Automated results and the build identifier are recorded in the delivery note for the specific commit. Phone checks remain required before release.

## APK12 regression repair

The repair removes duplicate per-second bridge updates and repeated End break commands. Permission refresh no longer scans app labels on every foreground. The native service builds its package-only catalog on its worker thread. Preinstalled apps are no longer all exempt: safety is decided by explicit essential packages and resolved phone/launcher handlers.

A native Start that finishes during a same-session break is adopted into that break rather than stopped and suppressed. Brief window-focus or previous-service shutdown delays can retry; explicit Stop, permission loss and force-stop interruption still require an explicit Restore. Native break commands are projected once per lease, including recovery after JavaScript reload.

Active controls show busy feedback while a durable change is pending; slow legacy network confirmations show a spinner after 400 ms while keeping their label. The protection chooser no longer offers Normal for a new session. Turning protection off remains available during a running session. Settings shows the installed runtime release and currently running update locally, without sending diagnostic or account data.

Regression coverage now runs production readiness through the real timer provider, journal persistence, server reconciliation and rendered session control. A fresh ready Android Start must show 5-min break; missing permissions must create no session. A fresh session showing Pause/Resume on the phone still requires checking its installed build/update identity; automated source tests cannot establish which bundle a phone executed.

This repair changes no live schema, auth workflow or personal reward rules. It requires one native Android build for worker-thread startup and preinstalled-app coverage. Claude's Home/guide layout and the routines-widget branch stay unchanged.
