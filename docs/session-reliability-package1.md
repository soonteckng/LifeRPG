# Package 1 revision 2: pure journal foundation for review

Prepared 10 October 2026 against `main` at `22dc846a981953ca8e3c227ef50a8aa7ba7b0f00`.

**Foundation delivery: applied to the LifeRPG working tree and verified there on 10 October 2026.** This revision addresses Claude's blocking capacity review and smaller notes. All 13 foundation files were saved and their hashes verified. This report records that earlier, unwired delivery. The user subsequently authorized provider/auth integration, documented in [session-reliability-integration.md](session-reliability-integration.md). All work remains uncommitted.

## Scope and changed files

This report covers the first subpackage: pure journal logic, a storage interface, the foreground AsyncStorage adapter and tests. That delivery did not activate a journal or offline account admission. The later integration is recorded separately. Packages 1 and 2 remain one planned release.

| Saved file | Purpose |
| --- | --- |
| `src/types/sessionJournal.ts` | Version-1 wire contract, identities, states, dismissal metadata, retention ceiling, clock and size limits. |
| `src/utils/sessionJournalSchema.ts` | Strict parsing, explicit receipt validation, scoped identity checks, exact command payloads, rejection evidence and timestamp/UTF-8 bounds. |
| `src/utils/sessionJournal.ts` | Pure transitions, deadline/clock derivation, admission epochs, dismissal, safe compaction and selection of ordinary pending server completions. |
| `src/utils/sessionJournalRecovery.ts` | Conservative unknown legacy start matching against one complete, verified server read; not wired into the app. |
| `src/services/sessionJournalStore.ts` | One foreground writer per backend object/key; defensive copies, revisions, immutable work, durable-before-return saves and safe quarantine/recovery. |
| `src/services/sessionJournalAsyncStorage.ts` | Adapter using the already-installed AsyncStorage dependency; not imported by providers. |
| `tests/session-journal.test.cjs` | Domain, retry, clock, account, wire integrity and portable-vector regressions. |
| `tests/session-journal-storage.test.cjs` | Persistence ordering, concurrent stores, failures, corruption, recovery and retention regressions. |
| `tests/session-journal-retention.test.cjs` | More than 100 synced sessions, record/command bounds, dismissal, protected work and receipt byte pressure. |
| `tests/session-journal-recovery.test.cjs` | Real store/reducer/helper integration for lost starts and conservative rejection of ambiguous or mismatched evidence. |
| `tests/fixtures/session-journal-v1.json` | 16 clock vectors, six action sequences and four parser vectors for later Kotlin/JVM parity, including dismissal and compaction. |
| `docs/session-reliability-design.md` | Incorporates the relayed review: slices A/B, adapter order, differential SQL gate, deferred rate table, unchanged imported legacy streak/recurring quests, 15s warning and staging/backup gate. |
| `docs/session-reliability-package1.md` | This delivery report and integration boundary. |

No package manifest, lockfile, dependency, app screen/provider, auth service, existing server service, SQL, native module or permission is changed by these saved files.

## Implemented behavior

A start first becomes a durable `not_started` intent. Only a server snapshot makes it running. Prepared Pause/Resume/End retain confirmed timing until their reply is reconciled. A lost reply becomes `unknown`, blocks a guessed second control/start, and retains the original command identity.

Full-target expiry creates one pending completion containing the original end time and a separate observation time. Early cancellation never creates a completion receipt. Saving confirmed completion requires matching server identity and full duration. Legitimate retries may change `already_completed` and `goal_reached_now`; economic/date fields must still match, and the original receipt remains unchanged. The foundation never awards XP or calls a reward API.

Returning to the same owner under a new admission epoch preserves pending work; stale actions and replies are rejected. `admit` is only a domain event, not authentication proof. The integration layer must supply verified ownership and preserve the separately reviewed local-only admission rules. It must not manufacture verifiedUser from a stored session.

The clock uses same-boot monotonic time where supplied, with saved wall deadlines for foreground adapters or reboot fallback. Discrepancies greater than 15 seconds warn; warnings are not proof of cheating. No native clock or reboot receiver exists in this subpackage.

The store resolves `update` only after persistence succeeds. Independent stores sharing the same backend object and key share a queue. A failed write does not publish the next state and does not poison later operations. Saved scope/setup/known server IDs, command payloads, terminal timing and attached receipts cannot be changed accidentally by a generic transform. Pending records/commands cannot be silently removed.

Malformed, foreign-owner or unknown-version bytes are archived before any reset is offered. A failed quarantine leaves the original source intact. Explicit recovery compares the durable archive and unchanged source before replacing it with an empty journal; nothing is auto-erased. Exceptions contain reason codes rather than raw records or underlying storage messages.

The fixed version-1 schema has no prior production journal to migrate. This revised unpublished shape includes mandatory nullable `dismissedAtMs`. Unsupported or incompatible bytes are preserved, not guessed into the current shape. Limits remain 512KiB, 100 records and 1,000 retained commands.

The first revision kept all synced records forever, so session 101 failed with `too_large`. That consequence is now fixed. `compact` keeps up to the most recent 20 eligible settled records and removes older records with all their commands in one revision. New command preparation and terminal acknowledgement apply the same rule automatically. If record, command or byte capacity still needs space, older eligible groups can be pruned below 20. The newest acknowledged receipt is protected during its own save. Retained receipts remain immutable; server history and server completion idempotency remain authoritative after local pruning.

Eligible records are synced completed/cancelled records with no unresolved command, or rejected terminal records explicitly acknowledged through `dismiss`. Dismissal preserves their terminal state/timing and original rejection evidence, never awards a reward and never hides an unknown result. Prepared, unknown, active, pending, waiting-auth and rejected-undismissed work cannot be pruned. The store independently checks eligibility against the previously persisted state and refuses orphan command removal. Its generic trusted transform does not enforce the reducer's newest-20 ordering policy; callers must use the domain actions.

A 30-day age floor is deliberately omitted because 101 sessions within a month would otherwise still fail. Normal fully synced use remains bounded and continues past 100 sessions. If protected work alone occupies a capacity bound, the new action fails without changing the saved journal. Later UI integration must offer recovery/dismissal of that work and must not reset the journal or repeatedly retry an impossible write.

`reconcileLegacyUnknownStart` returns only an acknowledgement action or an explicit unreconciled reason. It requires fresh matching owner/backend verification, captured epoch/revision, a complete read of all open rows, exactly one candidate, matching target/activity/task/area/notes, and a start within 15 seconds of the original intent. Clock changes, stale admissions, already-known server IDs, incomplete reads and mismatches leave the unknown operation unchanged. This is conservative adoption of an existing owned session, not proof that the original RPC created it. Today's one-row-limited `getOpenActivitySession` cannot supply uniqueness evidence. The actual query/provider integration remains deferred.

## Storage/native handoff

`createSessionJournalStore(storage, scope)` exposes `load`, `update` and explicit `resetQuarantined`. The AsyncStorage implementation coordinates one JavaScript runtime; it is not a native/cross-runtime transaction.

The future native authority must implement serialized native dispatch or a compare-and-swap transaction against the saved revision. It must not wrap raw get/set calls with another JS queue and claim that synchronizes native receivers. Replace the authority for that scope, never run both writers. Keep native commands limited and run the same JSON vectors in JVM tests before the combined release.

The next integration must also classify transient network failure as unknown/pending, not definitive rejection; account-verify before sending any queued RPC; read/reconcile unknown legacy starts and controls before retry; honor persisted retry deadlines; and persist server receipts before refreshing confirmed rewards. The current code supplies no network executor or new backend API.

## Actual verification

| Check | Result |
| --- | --- |
| Integrated Node suite in the actual LifeRPG repository after saving these files | **404 passed, 0 failed**: 301 existing and 103 journal/storage/retention/recovery tests, in one run. |
| Actual repository `npm run typecheck` | Passed. |
| Actual repository `npm run lint -- --no-cache` | Passed. |
| Earlier independent validation copy at `22dc846` plus these files | The same 404 tests, typecheck and lint passed before application. |
| Revision-2 diff and ZIP | Prepared against tracked `22dc846`, including the design note as a new file. ZIP hashes and clean-copy patch checks are verified during bundling. |
| SQL/differential SQL/JVM/native/device tests | Not run; their implementations belong to later packages. |

The earlier validation copy is separate from the actual LifeRPG working tree. Both locations now have integrated 404-test passes. The first review's 376 tests came from two locations; the revised and applied package was checked in one integrated run per location. Existing react-test-renderer deprecation warnings remain. No dependency install was needed.

No live database/project/account or native device was queried. No SQL was generated/applied. No app build, dependency install, commit, push or deployment ran. Ordinary completion/reward semantics remain unchanged because the existing code has not been modified and the new modules are not wired in.

## Integration handoff

The foundation was saved with passing actual-repository checks. The next client integration was authorized directly and is documented in `session-reliability-integration.md`. Native implementation and installed-device acceptance remain outstanding; the database, build, commit and deployment boundaries still apply.

The previous diff treated the untracked Package 0 note as an existing tracked file, so it was unsuitable for a clean main checkout. Revision 2 treats every delivery file as new against the stated commit. Use `package1-review-v2.zip`, `package1-review-v2.diff` and optional `manifest-v2.json`; the ZIP contains only the 13 delivery files.

Later Slice A work connects the journal to TimerContext, supplies legacy server snapshots safely, implements visible limited offline admission with recovery guards, and builds the approved native adapter/countdown/receivers with JVM and installed-device tests. Slice B is a separate backend proposal with differential accounting tests, isolated PostgreSQL concurrency tests, a separate staging Supabase project and backup before any production consideration.
