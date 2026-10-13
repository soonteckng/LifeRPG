# Completion recovery and sheet follow-up

On a cold launch, the controller previously selected the newest synced completion receipt whose `dismissedAtMs` was null. Successful receipts always retain that value; closing their message only clears in-memory presentation state. This made an older result eligible for the active Home surface again. An already-synced restore did not itself trigger a new reward celebration. A pending completion confirmed after reconnecting could legitimately open a result, but its origin was unclear.

The controller now restores active sessions and unfinished confirmation work, without selecting historical synced receipts. Newly finished sessions still show their result during the current run. Pending completions restored from storage carry a presentation-only recovery flag. Confirmed recovered results say **Earlier session saved**, retain the session title, and show the stored finish date/time in the account timezone when available. Historical receipts, server progress and reward authority are unchanged. A result saved just before process death remains in history rather than forcing an old popup on the next launch.

This does not repurpose `dismissedAtMs` or alter journal schema v1. Earlier readers reject dismissed synced receipts, so using that field for this fix would create a rollback compatibility risk.

The result sheet places Done after all content in normal scroll flow. Opening a new result resets its scroll once; receipt arrival and later layout events preserve the user's scroll. The custom-duration keyboard uses interactive movement instead of filling the whole parent. The quest list fits short/empty content and caps long lists at 60% of the viewport; its separate editor remains unchanged.

Regression tests cover historical restore without completion RPC or celebration, pending recovery beside history, cancellation without old-result fallback, current-run completion, recovered result context, one-time scroll reset and sheet sizing. Validation passed: typecheck, lint without cache, and all 538 integrated Node tests with zero failures or skipped tests. Native visual and offline acceptance checks are in `session-reliability-retest.md`; those are device tests, not claims established by host mocks.

No dependency, native configuration, database schema or live session data changed. New offline starts and confirmed offline Pause/Resume remain outside this milestone.
