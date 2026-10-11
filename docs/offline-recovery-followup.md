# Interrupted starts, End and reconnect follow-up

Phone retesting found an unconfirmed start displayed as Paused at its full target, with Retry, Pause/Resume and End unable to resolve it. Offline recovery also repeated account checks, exposed two confusing retries and removed retry controls during automatic checks. The duration editor remained covered by the Samsung keyboard, and completion actions required scrolling.

## Recovery

Open-session recovery can now use a complete, freshly verified owner read to adopt the one matching open timer even when a conservative 15-second timestamp correlation is inconclusive. Exact setup, ownership, uniqueness and journal fences remain required. This restores authoritative account state without claiming proof that a legacy operation ID was acknowledged.

A start whose reply was lost can also have already ended. When no open row exists, the adapter performs a bounded owner/setup/time query for terminal rows. It accepts only one complete matching result within 15 seconds of the original request time. Cancelled rows settle the local timer without another mutation; completed rows require an existing receipt and do not celebrate or award again. Empty, incomplete, ambiguous, unrelated or receipt-less results remain protected. Retry of an expired unknown start confirms that original session and never starts its setup again.

An End request during an unconfirmed start is stored before verification, using a new domain action and the existing v1 `sync.reasonCode` metadata. When the identity becomes known, it atomically becomes a pending Cancel before any expiry path can complete it. The same intention survives a restart or interruption between start reconciliation and cancellation. It never invokes missing-receipt completion repair. A completely empty server read cannot prove that a delayed original Start will never arrive; this case retains the evidence instead of blindly retrying Start or erasing it. Backend operation identities remain the long-term solution.

**Rollback restriction:** while an unknown-start End marker is pending, do not deploy an older client. Older readers accept its v1 shape but do not understand its stop intention. Wait until those stops have confirmed before a rollback. Journal version/schema and existing receipts are otherwise unchanged.

## Verification and UI

Concurrent account checks for the same owner and exact credentials share one fresh result. Auth reads and the whole owner proof have an eight-second bound; stale, timed-out, changed-account and signed-out replies cannot replace current admission. Local credentials remain recovery evidence only. There is no time-based cache granting cloud access.

A controller operation shares its freshly verified owner proof between controller and transport, with the existing owner/backend/admission checks before dispatch and after every response. The proof is discarded when that operation ends, times out or disposes. Known sessions no longer perform redundant reads or unrelated open-session discovery before releasing the UI. A verified reconnect forces pending work past its earlier offline retry delay and queues that refresh if local restore is still busy.

The offline page has one persistent Retry connection action. It retries saved work through its own account verification, or retries connection when no saved work exists. It does not run a second competing account check. Retry controls stay mounted during automatic checks; unknown starts show Checking session start/Planned time rather than a confirmed Pause. End is available once the current check finishes.

The custom-duration sheet opts into Android `adjustPan` through an optional AppSheet property, allowing Gorhom's interactive keyboard offset to lift it in a native Modal. Other sheets keep `adjustResize`. No app manifest/native setting changed.

The result sheet uses a compact hero/metadata. Save for later and Done live below the scrollable details in a measured normal-flow layout area, reserving their own height instead of floating over content. A saved suggestion becomes a polite text status and checkmark, with no disabled button.

## Evidence and limits

The coding agent read the relevant live account's session metadata only. At that check there were no open server rows; the latest one-minute row was cancelled, and the bounded terminal selector returned one matching cancelled row. This supports terminal reconciliation, but cannot identify the phone's private journal record without its request metadata. No database rows, functions or permissions were changed.

Automated regressions cover lost replies, stop persistence, terminal lookup bounds, exactly-once receipts, no retry-created sessions, foreign/ambiguous outcomes, authentication races/timeouts, operation proof lifecycle, read counts, reconnect backoff, stable retry controls and visible result actions. Validation passed: all 579 integrated Node tests, typecheck and lint without cache, with zero failing or skipped tests. The Samsung keyboard, actual rendered geometry and recovery of the installed phone remain device acceptance checks. New fully offline starts, offline confirmed Pause/Resume, native countdowns and widgets remain outside this change.
