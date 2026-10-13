# Offline session sync proposal

This is **unapplied SQL**, prepared against the reviewed Start/Stop v2 and exact-second completion plus the approved daily-goal scheduler. It does not enable production offline sessions. A fresh definition/grant inspection, separate staging Supabase project, backup, agreed write pause, concurrent PostgreSQL rehearsal and explicit approval are required before live installation. A hash/schema mismatch aborts the whole transaction.

The client remains the sole JavaScript journal writer. No native module, dependency, permission or APK change is needed for this client slice. The existing native countdown remains a projection, with safe foreground actions when JavaScript is absent.

## Public contract

All three functions require a freshly verified owner and authenticated execution. PUBLIC/anon cannot execute them. Private tables/helpers have RLS, no client grants and an empty search path. No mobile service-role credential exists.

`session_sync_capabilities_v1()` returns `policy_version: 1`, `offline_enabled`, `owner_id`, `server_time` and these limits:

| Field | Value |
| --- | ---: |
| `max_cached_grant_age_seconds` | 604800 |
| `max_age_seconds` | 604800 |
| `max_span_seconds` | 86400 |
| `max_target_seconds` | 28800 |
| `max_segments` | 256 |
| `max_future_skew_seconds` | 120 |
| `clock_tolerance_seconds` | 15 |
| `max_client_reported_daily_seconds` | 57600 |

A verified, owner-scoped grant may be cached for seven days. Missing/expired capability stays online-only. Connectivity is a hint, not identity verification. First installation cannot start offline without an established verified account.

`session_sync_snapshot_v1(server_session_id uuid, client_session_id uuid default null)` returns the owned normal activity row, additive `sync_revision`, `client_session_id`, `verification_class`, `server_time` and optional `sync_handoff: {revision, observed_at_ms, confirmed_ms}`. Missing/foreign rows return null. An optional alias may bind an owned legacy row once; it does not change its primary key or replace an existing mapping. The RPC stores a private immutable, server-authenticated timing handoff. Repeated reads at the same revision may create separate timestamps, all retained for queued-record reconciliation. The client must persist the supplied server-clock anchor. A local reply time or old journal anchor is not a trusted handoff.

`submit_client_session_v1(client_session_id uuid, submission jsonb)` accepts this immutable shape:

```json
{
  "policyVersion": 1,
  "clientSessionId": "uuid",
  "serverSessionId": null,
  "expectedRevision": null,
  "setup": {
    "targetSeconds": 60,
    "activityType": "learning",
    "taskId": null,
    "subjectId": 1,
    "notes": null,
    "title": "Review notes"
  },
  "startedAtMs": 1791849600000,
  "endedAtMs": 1791849660000,
  "serverConfirmedMs": 0,
  "serverObservedAtMs": null,
  "segments": [{"startedAtMs":1791849600000,"endedAtMs":1791849660000}],
  "clockWarning": false,
  "ending": "completed"
}
```

The RPC parameter and payload identity must match. Whole payloads are bounded to 64KiB. Root/setup/segment fields are strict; numbers are finite nonnegative safe integers and link IDs retain the original request. JSONB canonical equality ignores only object-key ordering, not altered fields, requested deleted links or timestamps.

Responses contain `outcome: accepted | already_saved | rejected`, `client_session_id`, `session_id` when known, and for accepted results `sync_revision`, `verification_class`, `ending`, `receipt`. Completed receipts retain the existing completion JSON schema. Mixed cancellation has `ending: cancelled`, `receipt: null` and no credit. Pure offline cancellation is settled locally and is not imported. `policy_disabled` preserves queued work for a later retry; it is not persisted as an immutable terminal rejection.

Terminal reasons include `invalid_submission`, `identity_conflict`, `changed_submission`, `clock_skew`, `expired`, `span_too_large`, `segments_invalid`, `target_not_reached`, `target_reached_needs_completion`, `revision_conflict`, `session_cancelled`, `mapping_mismatch`, `setup_mismatch`, `handoff_not_found`, `overlap` and `daily_cap`. Rejected work remains on the phone until explicitly acknowledged; correcting an identity's frozen payload cannot silently replace its original claim. Auth/transport/lock failures remain retryable rather than being recorded as rejected effort.

## Timing, overlap and authority

Pure offline records supply the full active segments. Mixed records preserve the server/client mapping, target, activity and original requested links; their confirmed prefix must match a retained server handoff exactly. Subsequent active segments start at or after the handoff's server observation and derive their duration from ordered intervals. There is no guessed prefix and no 15-second shortcut to early completion: exact accumulated milliseconds must reach the target. The 15-second tolerance binds the original start clock only.

Full completion awards exactly the target, 1–28800 seconds. Partial credit stays out of scope. End at an already elapsed target must become completion client-side. Mixed cancellation records the actual local end, awards nothing and cannot later resurrect. Trusted old state mutations increment the revision; an in-flight old Pause/Resume with an unknown result must still reconcile and cannot be blindly retried. Revision-aware Pause/Resume operation receipts are deliberately not added by this proposal. The client may change local state only after obtaining the handoff and before sending an unsafe old command.

First acceptance must be within seven days of canonical end and have a span of at most 24 hours with at most 256 ordered segments. End may be at most two minutes ahead. A small future skew shifts the entire span backward by the same amount; the exact original payload remains for audit and replay. Clock-warning metadata does not prove genuine work.

The 24-hour span and overlap admission limits apply to rewarded completion. An owner-bound mixed cancellation can close a session paused longer than 24 hours or historically overlapping another row: it touches only its exact mapped row and earns nothing. Its canonical End must still be fresh, clock-bounded and tied to a trusted unchanged timing handoff. This exception keeps End usable without relaxing any reward limit. Open-row handoffs remain available for a later End; terminal-row handoffs retain eight days plus clock skew (24-hour completed span plus seven-day queue age). Submissions and saved reward receipts are retained.

Half-open wall envelopes `[start,end)` include pauses. Other open or missing-terminal-time rows reserve their span indefinitely. Adjacent records are permitted. A mixed row is excluded only after proving its exact mapping and original setup; its retained server start and client span form the future overlap envelope. Distinct remote work is never cancelled, overwritten or completed by an import. This conservative rule can reject harmless paused-gap records; they remain recoverable local records.

Identity advisory locking precedes the existing activity row, then profile, accounting rows and new insertion. Pure imports lock the profile before inserting only their new row. No import locks another existing session while holding profile. Existing Start/Stop v2 uses profile then row NOWAIT; completion uses row then profile. PostgreSQL multi-connection tests must verify this ordering, not just serialize calls in PGlite.

## Accounting and compatibility

The proposal extracts a private shared kernel from the guarded, approved normal completion definition. Normal completion retains its public signature, server elapsed gate, duration cap, handling-day attribution, legacy replay, exact-second banks, current level curves, zero new Gold, daily target snapshots, goal/streak rules and quest behavior. Differential tests compare its result and every pre-existing profile/area/daily/quest/session field against the original on identical fixed-transaction-time fixtures.

Imports use canonical end in the server profile time zone at acceptance. Existing daily target snapshots win; otherwise the approved goal scheduler resolves its effective-date target. Backdated credit never moves `last_active_date` backward or modifies legacy `streak_count` / `last_goal_completed_date`. Earned flags and previous goal completion dates remain earned. Imported one-off owned quests may complete; recurring quests stay untouched. Deleted/foreign area links receive character-only credit. Original requested links remain immutable even when no longer creditable. Mixed handoffs retain original setup; harmless deleted-link nulling can be accepted only when the entire timing/state fingerprint still matches.

Client-reported credit is capped at sixteen hours per attributed day, using saved receipt dates, without restricting old online completion. An already saved server receipt wins over a phone's queued import; identical accepted submissions replay before policy, age, overlap and cap checks. Each accepted submission, terminal session and accounting receipt commit together. Old IDs, historical rows and balances are retained.

## Verification and rollout

`tests/session-offline-sync-sql.test.cjs` runs structural checks ordinarily and isolated PGlite execution only with `SESSION_SQL_PGLITE_ROOT`. It uses synthetic accounts and sends no mail. PGlite does **not** prove concurrent lock behavior. `tests/sql/session-offline-sync-concurrency.cjs` is a guarded localhost-only PostgreSQL rehearsal for a fresh disposable database; no live/staging run has occurred here.

Before any approval: inspect actual functions, grants, schema/FKs, RLS and backend version; compare hashes; run this proposal against a backup in separate staging; run concurrent imports, completion/cancel/import races, old Start/Stop, overlap and cap serialization; run security advisors; rehearse disabling admissions; then generate a migration using `supabase migration new` rather than inventing its filename. No migration or production capability is assumed from these docs.

Operational rollback (`session-offline-sync-rollback.sql`) disables new reward admissions while preserving identical replay, owned snapshot reads, same-row cancellation and ordinary online completion. A policy-disabled result is not permanently registered: the client retains it pending for retry after admissions resume. It never removes imported records or subtracts credit, and it does not downgrade a v2 client journal. Keep a compatible app installed. Device tests remain pending: offline start/control/finish, process death, force-stop, owner isolation, reconnect, duplicate submission, clock changes and reboot recovery. Removing from Recents and Android Force Stop are separate cases. See `offline-session-acceptance.md` for the device sequence.

Official references checked: [Supabase database functions](https://supabase.com/docs/guides/database/functions), [PostgreSQL explicit locking](https://www.postgresql.org/docs/current/explicit-locking.html), [PostgreSQL range types](https://www.postgresql.org/docs/current/rangetypes.html). The current changelog's TLS cipher retirement affects old HTTP clients, not this SQL contract; no library or TLS assumption was changed.
