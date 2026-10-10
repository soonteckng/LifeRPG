# Session reliability: End at expiry

Prepared 10 October 2026 following Claude's independent v2 review: typecheck, lint and all 508 tests reproduced on clean main at `22dc846`.

**Status: saved and hash-verified in the LifeRPG working tree.** The work remains uncommitted.

## Correction

An End tap at or after the full target now checks expiry before creating cancellation, provided there is no earlier unresolved intention. It saves full-target completion through the existing path. If offline, that completion remains pending and reconnects to one receipt and reward; it is not cancelled merely because the next foreground tick has not run.

A durable End saved before zero still blocks expiry and completion submission. Unknown Pause/Resume retain the earlier safety rule: their old confirmed countdown alone cannot establish full elapsed time, so End can still supersede them. This change does not erase an existing stop or guess the outcome of a delayed timing request.

When a pending End reads a server-completed session without a readable receipt, the controller now explains that the account reports completion but its saved result is not yet available. The local record stays kept while reads retry. It does not invoke completion repair, show an estimated reward or claim successful cancellation. Waiting messages use calm, accessible styling in offline recovery.

## Verification

The controller suite now includes exact-zero End before the next tick, online and offline/restart/reconnect, with zero cancellation requests and exactly one completion. Existing before-expiry stop, uncertain timing, owner-fence and late-request regressions remain active. The missing-receipt test verifies the specific message, retained record and absence of completion requests or celebration.

| Check | Separate validation workspace | Actual LifeRPG repository after save |
| --- | --- | --- |
| Integrated Node tests | 510 passed, 0 failed, 0 skipped | 510 passed, 0 failed, 0 skipped |
| Typecheck | Passed | Passed |
| Lint without cache | Passed | Passed |

The combined v3 review ZIP/diff/manifest includes 39 delivery files against main at `22dc846`, and ZIP hashes match the saved repository. Existing react-test-renderer warnings remain. Device scenarios remain untested; see `session-reliability-phone-checks.md` for the next acceptance step.

No backend, SQL, dependency, permission or native module changed. No build, commit, push or deployment was performed. This correction completes the requested JavaScript review fixes; installed-phone evidence is still required before native countdown implementation.
