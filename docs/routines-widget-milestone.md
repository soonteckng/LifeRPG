# Saved routines and Android widgets

This milestone extends the existing Quick Start: a user can save, edit, remove and start a named routine with a focus area, duration and optional daily local-time reminder. A compact Home card exposes the first two routines; Manage lists all routines. The broader Home redesign is reserved for the user's later Claude UI review.

Routine settings use durable account/backend-scoped local storage and a revisioned, duplicate-safe cloud queue. Concurrent edits produce an explicit choice; deletion uses a tombstone. The cloud functions require the expected account ID as well as the current authenticated identity, so an account switch between verification and sending cannot write under the new account. Limits are 32 active routines, 64 queued operations and eight retained conflicts. Notification permission stays on each device.

The proposal `docs/saved-routines.sql` changes only routine storage and RPCs. It does not replace session, reward, quest, profile or daily-goal functions. It remains unapplied until the user explicitly approves live installation. Final reviewed SHA256: `147BB660F5034ED5BEA730497F92AC262F8F0C1466C866D80DB03B429B49E4BF`.

The Android widget extends the already approved `session-countdown` module. It adds no dependency, permission or second writer for session storage. Native code retains only a presentation catalogue and one-use launch proofs; the app resolves the current routine and starts through the existing journal controller. Account/backend switches, deleted routines and stale launch proofs cannot start another account's routine. An older APK safely omits widget controls while retaining the JS routines feature.

The required new native build also includes the approved finish-alert wording: "Time well spent" and "Your session is finished. Open LifeRPG to see your progress."

## Requested smaller changes

- Fade through the background between online and offline surfaces; keep navigation mounted.
- Handle notification End confirmation above both connection surfaces. Cold End carries prompt intent only; Pause/Resume and all actual mutations retain the exact current-state checks.
- Keep an ended result and its Done action visible until dismissed, even after reconciliation clears the selected record.
- Add preference-controlled haptics for offline category and starting-point selections.
- First tap selects another Progress day; another tap on the selected day opens details. Inline sessions default to that day with a whole-week/month option.

## Release boundaries

Draft offline PR16 remains frozen for Claude's independent review. This milestone is based on that branch, with a separate PR. The ZIP/diff handoff answers the 840/863 test-count discrepancy and proves newer journals survive quarantine by the exact older main reader. No fake-address signup, recovery-email or transactional-email tests are used.

After installed acceptance, continue with the planned distraction-protection milestone and store readiness: account deletion, privacy/support/deletion pages, accurate store disclosures and production package checks. Ads and paid packs are later decisions.
