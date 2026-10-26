# Round 69: session entry, result handoff and duration rules

Based on `feature/next` at `9bec9b685548386f4180dc0dca734366bc6c4b30`
(Round 68). One patch and a local Android bundle backup; the user applies,
pushes and publishes. No EAS upload or APK build was run.

## Important for Claude: native work is deferred

On 26 Oct Soon Teck explicitly deferred **all native changes until November
2026, after his Expo build quota resets**. Combining the two notifications is
therefore **not fixed in this round**. Keep this outstanding in every handoff.

The existing Android services own separate notification IDs: protection
`84103`, countdown `81741`. Sharing an ID without coordinating their updates,
break/expiry/recovery and removal would be unsafe. The next approved native
round should design one notification lifecycle with the current name,
countdown and Break/End actions, then verify it on a real installed build.
See `HANDOFF.md` section 10. No Android, SQL, schema, dependency, build-config,
runtime or `.gitignore` inputs were changed here. No live auth, test emails or
live database calls were made; automated tests block external networking.

## 1. Purple bar entrance after widget interaction

The widget can reuse a mounted session route. Its old entrance effect ran only
on mount, so reuse did not replay the slide. `sessionEntry` now carries one
explicit presentation request from the widget or dock. A focused timer consumes
it once, targeted to the stable client session ID, or to the exact account
admission while a validated widget start awaits that ID. A later server ID does
not replay it. Outfits returns do not request this entrance.

Two related races were reproduced and fixed:

- A delayed old native close callback could pop the newly reopened route, or
  its cancellation branch could snap the entrance to its end. A generation
  guard invalidates both branches on new entry, recovery and unmount.
- The focus effect used changing action dependencies. Clearing an End result
  changed the timer ID and re-ran recovery during the outgoing exit, producing
  two route closes. The focus subscription now reads the latest actions from a
  ref and runs recovery only for an actual focus event.

`global-session-result.test.cjs` renders the actual production-compiled
SessionScreen for retained-route cycles, pending starts, ID changes, Outfits
return, Reduce Motion and queued old callbacks. The old-close regression failed
before its guard (`1` unexpected route pop); it passes after. The existing
offline End regression also caught the duplicate close and now passes.

## 2. Result Done fades before finds or trail

Previously Done immediately emitted result dismissal. The session return screen
mounted and consumed its entrance while the result's native modal was still
sliding over it. That accounts for the abrupt visible handoff.

The shared sheet has an opt-in `closeMotion="fade"`, used by the result sheet.
Its whole modal surface and dim fade over 220 ms. Only actual dismissal emits
the existing lifecycle event and acknowledges the journal presentation. Then
SessionScreen starts its existing finds/trail flow. The 900 ms lost-callback
fallback remains; Reduce Motion swaps instantly. Ordinary editors and other
sheets retain their existing close motion.

The outgoing receipt is held during the fade. Repeated Done/dismiss callbacks,
reopening, backend/admission changes and a new running session cannot make an
old callback clear or hide the replacement. Latest timer state is read when the
fade finishes. No completion, XP, reward claim or sync timing was changed.

`round69-result-transition.test.cjs` exercises the actual AppSheet fade with
controlled native boundaries, including Reduce Motion, stale callbacks and
fallback. `round67-after-session.test.cjs` now asserts no reveal before actual
result dismissal, for both finds and no finds. Running these tests against the
pre-round AppSheet/listener reproduced five failures. The Round 68 real
provider/controller/backdrop compiler regression remains passing.

## 3. Different-running-session widget notice

The notice now uses existing app colours, borders and buttons, with a current
activity card and a pinned Return to session action. The content scrolls while
Return remains reachable. The existing widget proof, current-session check,
nonce fencing and safe navigation are retained. No second session starts.

The actual component was rendered on web at 360x640 and 390x844, with font scales
1, 1.3 and 1.8. All six layouts kept the Return control visible, at least 56 px
high, and without horizontal overflow. This checks layout, not Android frame
pacing. Haptic behaviour, role, label and `widget-return-session` test ID remain.

## 4. Dawn only in the final 10 focus seconds

The old percentage threshold started morning at 90% of any duration. The scene
now uses remaining focus seconds: night above 10, one linear dawn to zero. A
pause or the protected break cancels and holds the current light; Resume uses
the remaining focus window. Reopening during the final seconds joins the
current light, and a recovered completion is already in morning. Early End
returns to night. Reduce Motion changes the scene instantly.

The memo boundary still skips ordinary timer ticks: only a threshold, phase,
walking state or callback change redraws the scene. The fade is not restarted
each second. Boundary, late-entry, pause/break/resume, completed reopen and
Reduce Motion are covered in `round60-session-scene.test.cjs`.

## 5. One-minute minimum without losing old records

New starts and editable durations accept 60 seconds to 8 hours. Shared parsing
and the provider cover Just focus and Study; routine create/edit, routine Play
and widget launches enforce the same rule. Validation messages state it.

Old sub-minute routines remain visible, editable and removable, but need a
duration of at least one minute before starting again. Existing routine queue
operations, session journals, short historical results and Study history still
parse and recover with their recorded values. No migration or history rewrite
is needed. A legacy Custom preference only supplies a 60-second new editor
default; saving a routine from an old short completion creates a new
60-second draft for review without altering that completion.

Tests cover 0/1/30/59/60/61 seconds, fractions, invalid fields and the eight-hour
cap; refused edits leave the saved routine and queue untouched. Before the fix,
the new boundary tests reproduced three failures, with legacy controls passing.

## Verification and device limits

The lock-matched installed dependencies were reused. Typecheck, full Expo lint
and new-file lint pass. **1,638 distinct automated tests are verified passing,
with no unresolved failures or skips**, with this exact accounting:

- Full serial run with isolated PGlite and external-network blocking reported
  1,624 tests: 1,618 passed, 6 failed, 0 skipped. Two failures were whole files
  aborted by local V8/WASM memory pressure while the export was also running.
  Four were the existing real-library footer harness missing the new fade
  wrapper's animation primitives. No test assertions were weakened.
- The two aborted files (`daily-goal-scheduling-sql.test.cjs` and
  `delete-account.test.cjs`) passed all 24 tests in isolation, with
  `--wasm-num-compilation-tasks=1 --v8-pool-size=1`. Eight of these had already
  passed before the aborts. Their 16 remaining tests replace the two file-level
  failure placeholders.
- All four `session-result-native-footer.test.cjs` tests pass after extending
  its boundary mocks. Its actual installed-library geometry and all assertions
  are unchanged. The wrapper is distinguished from the footer in that fixture.
- Therefore: 1,618 initial passes - 8 repeated passes + 24 isolated passes + 4
  footer passes = **1,638 distinct passing tests**, including all SQL-backed
  cases. The initial run is not claimed to have exited cleanly; targeted reruns
  resolved every failure. All tests block external networking.
- Local Android Hermes export succeeds with one Metro worker. The ZIP has
  `metadata.json` at its root and all 49 referenced export files.
- Same-checkout Android fingerprint is unchanged:
  `49308616e025891eba4e874277a734a7281f16bb`. The user's original publishing
  repo keeps installed runtime `4f07392040ace293bbe1cdb4176b5b7840d9e9b3`.

Compare fingerprints in this
same checkout, then publish from the user's original Windows repo with its
existing native files and local `.gitignore` preserved. Never force the runtime.

No Android phone was connected. Native widget intents, actual slide/fade frame
pacing and the last-ten-seconds pause/break transition remain phone checks.
Native notification consolidation is deliberately deferred, not device-verified.

Focused acceptance after publishing this update:

1. Widget → running session → dismiss → purple bar, several times without
   killing the app; also a widget for a different routine and an Outfits return.
2. Finish → walk back → result → Done → fade → finds if any → trail. Also early
   End/offline Done, and Reduce Motion.
3. One-minute and longer sessions: dawn starts at 10 seconds; hold it with a
   break in that window and resume. Reject 59 seconds in duration/routine/Study
   setup, accept 60, and edit an existing short routine before starting it.

The two ongoing native notifications remain until the next approved Android
build in November. Do not ask the user to rebuild for this JS-only round.
