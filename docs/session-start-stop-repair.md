# Resolve the saved End recovery loop

## What failed

The installed app can retain an unknown legacy Start whose server reply never supplied a session ID. End is saved locally, but neither an empty server read nor an unmatched historical cancellation proves that a delayed original Start cannot arrive later. The previous update correctly retained that uncertainty but supplied no finite recovery path. Repeatedly pressing Retry therefore could never release Home.

The screenshots also exposed a presentation bug: an End restored at or after route mounting used the setup layout behind its popup. The timer screen now captures that stopped presentation and exposes its retry action consistently.

## Concrete repair

New journal Starts send their existing persistent client session UUID to `start_activity_session_v2`. The server uses that UUID as the row ID, checks the original payload, and returns the same row on a duplicate request. It never resumes or awards a row when Start is repeated. The legacy five-argument RPC remains installed.

New Starts use one UUID for both the Start operation and the client session identity in the existing v1 journal fields. The legacy controller generated two distinct UUIDs. This durable convention confines heuristic matching to old journal commands. New Starts recover only their exact UUID; a matching title, payload or timestamp from another device is never accepted in its place. The journal version, key and request shape remain unchanged.

When an unknown Start already has a durable End, `confirm_activity_session_stop_v2` can record a permanent stop even if no session row exists. It locks the caller's profile, refuses to cancel an unrelated open session, and stores the original identity and payload. A table INSERT trigger fences legacy Starts for this repaired account. A delayed copy of the old Start is therefore rejected even if it began executing an old function body before the repair. A delayed v2 Start cannot pass its stopped registration either.

The controller accepts only freshly verified owner/backend evidence. It validates a real terminal row before remembering a returned UUID; a completion requires its existing receipt. A cancelled/no-row acknowledgement settles and dismisses the original Start in one durable v1-compatible journal write. The immutable request remains retained for review. No session duration, timestamp or reward is fabricated, and no completion RPC is submitted by this ending path.

If the Stop reply is lost, repeating it accepts its permanent stop evidence, including when another device has since started a new session. That newer row remains unchanged. Missing endpoints, mismatched payloads, foreign identities and unavailable receipts keep the original record protected with an explicit status.

## Compatibility and deployment

SQL: `docs/session-start-stop-repair.sql`. Rollback: `docs/session-start-stop-repair-rollback.sql`.

**This proposal is not applied to the live database.** It adds two RPCs, a private request table, a profile protocol column, a nullable session identity column and an INSERT guard. Existing XP, remainder banks, levels, goals, quests, sessions and receipts are preserved. Existing Pause, Resume, Cancel and Complete functions are not replaced.

There is one necessary compatibility exception to the milestone brief's old-client rule: after an account is repaired, every device using that account must use the updated Start API. Other accounts retain legacy compatibility. Allowing unidentified legacy Starts for a repaired account would permit the exact delayed-request bug the stop acknowledgement is meant to prevent.

The fail-closed rollback revokes the new RPCs but retains request evidence and fences. Removing those guards, downgrading a repaired account, or deploying an older client with pending stop intentions or unresolved v2 Starts is unsafe without an independently established request-quiescence boundary. A waiting period is not that proof.

The milestone brief, section 3 rule 1, requires explicit approval before live changes: “Applying anything live needs my explicit approval in a later message.” Prior approval for the focus-category function does not approve these new session functions. Prepare and test this proposal first, then obtain direct approval to install it. Install the SQL before publishing the app update. Do not publish this client against a database missing the new APIs; it intentionally refuses a legacy fallback.

No native dependency, app manifest or runtime version changes. The client portion can be delivered as a JavaScript update to a compatible installed build. A phone update is still required; installing SQL alone cannot make an old client call the repair endpoint.

## Verification

Validation passed: **616/616 integrated tests, zero skipped**, with local SQL execution enabled, plus typecheck and lint without cache. This includes 13 database proposal checks (11 execute SQL in disposable PGlite databases and two inspect the API/security contract). No dependency or lockfile change is included. Independent source review found and verified the exact-UUID recovery correction for identical other-device sessions.

To execute the database cases using an independently installed PGlite test runtime, set `SESSION_SQL_PGLITE_ROOT` to its package or parent `node_modules` directory and run `npm test`. The ordinary suite needs no new dependency; without that variable, only the two structural SQL checks run. A separate SQL-only run passed 13/13 with zero skipped.

Local SQL tests use disposable synthetic accounts only. PGlite exercises PostgreSQL SQL semantics and serialized request orderings, but does not verify two concurrent row-locking connections. The SQL uses the existing profile-first Start lock order and NOWAIT for terminal session locks to avoid waiting in reverse order against completion. Both new RPCs require read committed isolation, matching normal PostgREST requests, so they cannot acknowledge against a stale repeatable-read snapshot.

Before broad rollout, verify the two-connection PostgreSQL interleavings in `tests/sql/session-start-stop-concurrency.sql`, including both commit orders of same-UUID Start versus Stop. Those parallel checks remain unexecuted because no local PostgreSQL server or client is installed. Phone acceptance has not been performed by the coding agent. A successful automated run does not prove that the user's installed update has loaded.

## First phone check after installation and update

Keep the existing app data. Reconnect, reopen the current saved End and tap its one retry action if automatic reconciliation has not already run. Its stop should confirm, Home should allow a new Start, and earned progress should stay unchanged. Start one short session, End it, and reopen the app. Neither of those ended sessions should block a new Start or reappear as an active timer.

Only after that escape succeeds, repeat the offline completion and reconnect checks. Starting a brand-new session without a connection is still outside this repair; this update preserves an already-started session and its pending ending or completion across network loss.
