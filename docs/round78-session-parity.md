# Round 78: offline entry and acknowledged End

Base: pushed Round 77, `2d2809f975b2b29faf3dda8ab67c8cea48515c1e`.
JS/TS only. No SQL, database/Auth/email calls, new dependency, native/config
change, push, EAS publication or APK build. The approved chosen-reward spec
remains pending for a separate round. Its historical filename is retained.

## Reports and reproductions

The phone still showed an End notice after Done. Offline saved routines also
opened an older confirmation, started behind Routines, and skipped the shared
departure. Pending offline completion followed by one confirmed receipt/map on
reconnection was reported working and must remain so.

1. `SavedRoutinesCard` explicitly branched offline in two places: `ask` opened
   that old confirmation and `start` called the timer directly without opening
   `/session`. Updating the behavior test first failed on R77: no draft/route
   was prepared offline, and short-duration validation still required the old
   extra confirmation. Removing those shortcuts uses the existing shared setup.
2. A real provider/controller/journal plus the actual result, AppSheet and fade
   reproduces an End replay: press Done while cancel HTTP waits, allow the late
   cancel to settle, then prepare another routine or start with a delayed
   protection check. The acknowledged cancelled record can remain selected
   because Done originally occurred while its record was still running. Start
   cleared the acknowledgement before protection preflight; routine setup
   explicitly reviewed the old terminal record. Four tests fail with the R77
   provider, in uncompiled and production React-compiled forms, and pass with
   the fix. There is no fabricated stale snapshot in these tests.

The ordinary End -> Done -> app sequence already passes on R77 in the actual
sheet harness, including deferred HTTP and synchronous route/dismissal
callbacks. The precise phone timing with no later action has not been
reproduced on a device. Do not claim this test proves every possible native
replay has been eliminated. If it recurs, use the existing visible Developer
Share session log control; do not guess another cause.

## Changes

- Offline and online saved-routine buttons prepare the same exact stored name,
  category and duration and open the same setup. The shared Start owns dusk,
  departure, night and then the real timer. No timer runs behind Routines.
- Keep Done scoped to its client record and pending/confirmed receipt through
  the next protection check. A new UUID cannot inherit the old acknowledgement.
  An acknowledged End cannot be reopened by routine setup; preparing the next
  draft releases a settled acknowledged cancellation from selection.
  Intentional Review remains supported, including the existing pending-End
  provider test; there is no blanket ban on reviewing an old result.
- No global dismissed-ID list, timeout hiding, new transport, retry loop,
  protection bypass, replacement offline scene or style/layout change.
- Widget one-tap entry and the recovery fallback retain their existing
  semantics. Normal offline Routines/Home use the shared session screen.

## Verification

- 1,804 app and isolated PGlite tests pass, zero failures or skips. Typecheck
  and full Expo lint pass. The same-environment native fingerprint and all 75
  native source entries match the R77 base. The delivery records patch-apply
  proof, export manifest validation and ZIP SHA-256 checks.
- New actual-screen/provider/protection regressions prove no durable record or
  native coverage starts during departure, all 60 focus seconds remain at
  admission, Skip starts once, Reduce Motion starts without departure, missing
  permissions still refuse a protected start, and completion remains pending
  without a fabricated receipt. External networking is blocked.
- Actual result/fade coverage preserves one pending completion, then one
  confirmed receipt after reconnect, and no repeat after its Done. Existing
  offline-protection tests are unchanged; existing return/map tests also run.
- Saved-routine parity covers Home chips, Routines grid and list; Home See all
  navigates once after dismissal. Existing account/surface and rapid-tap guards
  remain covered. No new UI controls or test IDs are needed.
- Full Expo lint passes. Explicit lint of the two new regression files is
  clean. The edited older saved-routines test file retains exactly its baseline
  four errors and one warning; there are no added lint findings.
- Phone rendering, gesture callbacks and frame pacing remain unverified.

## Short phone check

1. Online: start a one-minute routine, End early, Done. Wait on the app and
   open another routine. The old End must stay closed. Repeat offline, then
   reconnect. A stop earns no time or XP.
2. Offline: start the saved routine from Routines and Home. It should open the
   same setup as online. Start should show dusk -> night, then begin the full
   minute. Skip and Reduce Motion keep their existing behavior.
3. Finish one minute offline. Done closes the waiting-for-sync receipt. On
   reconnect, show the confirmed completion and return/map once. Check that
   progress is counted once.

Native notification consolidation and every other native task remain deferred
to November 2026. No message or document was sent to Claude.
