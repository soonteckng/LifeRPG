# Offline result and navigation repair

This follow-up repairs the presentation of the offline milestone on `feature/offline-sessions`. It does not change the installed SQL, rewards, import limits, authentication rules, native countdown or Android runtime.

## Why the screens differed

The online navigator used to unmount when the account entered local-only mode. Its old `/session` path could return after reconnection with no active timer, revealing the general setup page. Three different owners could present results: the timer screen, the offline workspace and the global reward listener. Recovery and imported results could therefore choose a different layout from an ordinary completion.

Done also depended on whether the finished record had entered client timing. A server-timed finish with an unresolved completion command could remain selected after Done. Hiding that record without independently finding its queued command would strand the upload. A delayed End reply could separately reset the user's Done acknowledgement.

## Resulting behaviour

- The navigator and quest cache stay mounted across connection changes. Offline controls cover the online surface; inactive controls and accessibility elements are disabled. Reconnection uses a short fade, with reduced-motion support. An obsolete timer route returns to Home behind the outgoing surface.
- One global result sheet handles ordinary, pending, imported, recovered, ended and rejected sessions. The timer and offline workspace no longer provide competing full-page summaries or duplicate result portals.
- The sheet keeps the same session, duration, title and Save as quest draft while it closes. Done and eligible Save as quest actions remain outside the scrollable details, with their actual space reserved.
- Done dismisses locally finished work while its immutable upload remains queued. Reconnection can show one calm confirmation for a newly saved result. It does not interrupt another active timer or replay an old receipt on every restart.
- A saved pending End can be dismissed while confirmation waits. A late confirmation does not reopen it. Explicit Review opens the same shared result and keeps the queued stop available; it does not start another session.
- Offline direction selection uses Home's six choices, starting points and saved per-account preferences. It uses cached real area IDs. End asks for confirmation before saving the stop.
- Fast ordinary online completion uses a short grace period instead of flashing a saving card. A genuinely pending offline result is immediately usable.

Presentation dismissal does not drop commands, rewrite timing, invent credit, complete a quest or bypass an uncertain Start/Pause/Resume. Pending completed records remain non-prunable. The journal's existing v2 format supports this dismissal; promotion preserves its original v1 backup.

## Validation and remaining phone checks

The integrated local run passed **999 tests, with zero failures or skips**, including isolated SQL execution. TypeScript and Expo lint pass. Automated regressions cover stable navigation, rapid connection changes, inactive controls, reduced motion, held replies, pending Done followed by restart/reconnect, delayed End replies, manual Review, queue preservation, retained reward identity, stale quest reads and result actions. Exact-head GitHub checks and delivery are recorded in the delivery checkpoint.

The user already reported successful cloud syncing in the primary offline cases. Only the changed presentation needs the short flow in `offline-presentation-phone-check.md`. Reboot and the two-device conflict check remain untested on the phone; this update does not claim they have passed.

Tests use local mocks and isolated databases. No fabricated-address signup, transactional email sending or live database mutation is part of this repair.

## Next agreed work

The next feature milestone is remembered routines and Android widget starting, extending the existing Quick Start. The first complete path is one Learning routine started from a widget, surviving lock and poor connectivity, then producing exactly one saved result and reward. The widget needs the next necessary native build; batch the deferred finish-notification wording with it.

Then optional protection, continuity and a separate partial-session path, followed by monetisation interest tests. Basic protection, allowlists, widgets, countdowns and history stay free. Account deletion, privacy/support disclosures and transactional email delivery are launch work alongside these milestones.
