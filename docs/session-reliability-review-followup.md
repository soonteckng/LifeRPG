# Session reliability: review follow-up

Prepared 10 October 2026 after Claude independently reproduced the original client integration's 490 passing tests, typecheck and lint on clean main at `22dc846`.

**Status: saved and hash-verified in the LifeRPG working tree, with passing actual-repository checks.** The 17 follow-up files were guarded against unrelated edits. The work remains uncommitted.

## Changes

- End is a durable local intention saved before verification or network work. Offline verification failure, a timeout, an unsent request or a rejected cancellation does not remove it. Until the owned server row proves its terminal result, local expiry and completion submission remain blocked.
- Cancel retries first freshly verify the owner and read the same server session ID. If still active or paused, the same cancellation can be sent again. Its terminal SQL predicate prevents a delayed duplicate from reopening the session or touching a later session ID. Existing stored completion receipts can be accepted without a fresh reward celebration if another client completed first; a pending End never calls completion to manufacture a missing receipt.
- End remains available after an uncertain Pause/Resume. One atomic journal action retains that immutable timing command as `superseded` and appends the cancel intention. The parser permits supersession only for timing commands followed by cancellation on the same record. Supersession describes an abandoned intention, not proof that the earlier RPC failed.
- Pause/Resume retries do not use a 60-second settle window. Their SQL predicates protect only the current state. A delayed original Pause can run after its retry succeeded and the user resumed; it pauses again. Resume has the symmetrical problem after a later Pause. A time window cannot prove that a request has disappeared. Explicit command identities on the backend are required before permitting that retry pattern.
- Mutation waits default to 20 seconds; reads and owner verification keep the shorter 8-second bound so cached recovery remains responsive. A timeout never claims that the underlying request was cancelled.
- The timer exposes all unconfirmed journal records to Settings. The existing sign-out confirmation visibly warns that they stay on this phone for this account and need reconnection or signing back into the same account. Active/restoring/busy sessions still block signout. A finished, pending completion can be signed out explicitly after seeing the warning.
- Signing out always clears the local account admission/profile cache. Keeping that cache when work is pending could re-admit a signed-out owner on cold offline boot after failed credential removal. The owner-scoped journal stays intact, including unsynced work; normal safe retention handles older settled records. No journal deletion is added to signout.
- Scheduled completion/ongoing alerts are cleared as soon as End is durable, before server confirmation. The offline view describes the saved stop rather than showing an apparently running countdown or confirmed reward.

## Verification and boundaries

New regressions cover offline End/restart, unsent/definitive cancellation failures, late duplicate cancellation, unknown Pause/Resume supersession, forbidden timed timing replays, cancellation versus existing completion, missing receipts, storage failures, owner fences, split timeouts, notification clearing, signout warnings and parser/store evidence preservation. A seventh portable action vector covers stop supersession and blocked expiry for later JVM parity.

| Check | Separate validation workspace | Actual LifeRPG repository after save |
| --- | --- | --- |
| Integrated Node tests | 508 passed, 0 failed, 0 skipped | 508 passed, 0 failed, 0 skipped |
| Typecheck | Passed | Passed |
| Lint without cache | Passed | Passed |

The updated combined ZIP/diff/manifest includes all 37 delivery files against main at `22dc846`, including the journal foundation, original client integration and this follow-up. ZIP hashes are checked against the saved repository. The original 490-test review remains valid for the earlier snapshot. Existing react-test-renderer deprecation warnings are unchanged.

This follow-up changes client code, tests and documentation only. No SQL, live database/account, native module, dependency, manifest, build, commit, push or deployment is involved. Android native countdown and installed-phone acceptance remain outstanding. The unsigned credential decode remains strictly local recovery evidence; it grants no server authority. Installed testing must still verify the real Supabase storage key/adapter and native timing behavior.
