# Session reliability: client integration

Prepared 10 October 2026 against `main` at `22dc846a981953ca8e3c227ef50a8aa7ba7b0f00`, following the reviewed journal foundation and the user's direct instruction to proceed.

**Status: saved in the LifeRPG working tree and verified there.** The guarded save preserved the existing foundation and checked all 26 integration files against their prepared hashes. The changes remain uncommitted.

The subsequent review follow-up is recorded in `session-reliability-review-followup.md`. It adds durable End intent, terminal cancellation retries, explicit supersession of uncertain Pause/Resume, a longer mutation timeout and the sign-out warning. The 490-test results below are the original integration handoff, not the newer follow-up count.

## Outcome and scope

The running timer now uses the durable journal. A previously verified, onboarded account can reopen its saved timer without waiting for a network response. The limited Offline screen shows saved account details and the last confirmed countdown. Editable tabs return after fresh online account verification. New sessions still need the existing server start function.

Full-target expiry is kept on the phone while ordinary server completion is queued. XP, goal progress and linked quest completion are confirmed only after the unchanged server completion function returns a valid receipt and that receipt is durably stored. No provisional reward is granted. Early End remains cancellation with no credit. There is no offline start, partial credit, new backend path or database migration in this integration.

This is the foreground/client part of Slice A. It is development work, not a production-ready release on its own. The native journal authority, live Android countdown, alarm/reboot integration and installed-device acceptance remain Package 2; Packages 1 and 2 ship together.

## Implementation

| Area | Files and behavior |
| --- | --- |
| Timer | `src/context/TimerContext.tsx` preserves its public import; `JournalTimerProvider.tsx` connects the real controller, store, existing notification lifecycle and confirmed reward UI. Duplicate starts lock synchronously before changing the draft. Exact custom durations and curated shorter suggestions survive starts and recovery. |
| Durable orchestration | `src/services/sessionTimerController.ts` saves intents before mutations, publishes the saved countdown before network verification, reconciles uncertain results, and stores completion receipts before celebration. Network/auth calls have bounded waits; storage saves do not pretend to finish on timeout. |
| Legacy server transport | `src/services/sessionService.ts` retains existing public RPC wrappers/signatures and adds an owned, freshly verified adapter. Known IDs read all states. Lost start replies use a complete owned-open-session read rather than the older one-row query. A changed account fences late responses. |
| Domain additions | `src/utils/sessionJournal.ts`, `src/utils/sessionJournalSchema.ts` and `src/types/sessionJournal.ts` support preserving a returned server UUID before its timing read, adopting an existing server timer, and reconciling terminal receipts without changing immutable completed timing or rewarding again. The existing retention policy continues to protect unsynced work. |
| Auth/profile | `AuthContext.tsx`, `UserContext.tsx`, `localAccountCache.ts` and `sessionBackend.ts` separate fresh verified identity from local recovery admission. Only whitelisted profile fields are cached; the journal/cache add no credential copy. The existing Supabase credential store is read only to associate local recovery with its owner and backend. |
| Recovery UI | `src/components/OfflineSessionRecovery.tsx` and `src/app/_layout.tsx` keep the timer mounted through same-owner offline/online changes. Password recovery takes priority. Signout/account switch revoke admission without deleting another owner's journal. Connection retries release their button after a stalled request. |
| Session UI | `src/components/SessionScreen.tsx` distinguishes an uncertain start, waiting-for-sync completion and a rejected kept record. Home offers a review route even when ordinary starting is blocked. Explicit acknowledgement allows continuing without rewarding the rejected record. Pending progress does not display confirmed rewards. Existing motion, dismissal and safe-area tests remain in the suite. |

## Safety and reconciliation rules

- Each journal is scoped to backend and owner. Local admission is not authenticated access. Before any server request, the adapter verifies the current owner online and checks its admission generation; responses are checked against that generation again.
- A null SDK session or retryable token refresh failure alone does not erase independently retained credentials or saved work. Missing/malformed credentials, a known invalid identity, explicit signout, a mismatched owner and password recovery prevent local admission.
- A returned start UUID is saved before reading its timing. A lost legacy start reply can be adopted only from exactly one matching owned open row with complete read evidence and the existing conservative clock/setup checks. An empty or ambiguous result leaves the start unresolved; it never guesses by sending another start.
- Unknown Pause/Resume commands preserve the last confirmed timing. Reading an unchanged state cannot prove that a delayed request will never arrive, so it cannot enable timing mutation replay. End persists before network verification, can replace an uncertain timing intention while preserving its command evidence, and retries only the same terminal cancellation after an owned open-row read. While End is pending this client submits no completion. Definitive rejection or explicit pre-dispatch failure permits a new Pause/Resume attempt, but does not erase an End intent.
- Local expiry preserves its original deadline and observation time across restart. Ordinary completion uses the same server ID and unchanged server elapsed-time gate. An early server rejection remains pending. Retrying after a lost reply or failed receipt write reconciles one saved result rather than creating another reward.
- Receipt-bearing history is read without reward celebration. Freshly returned results celebrate only after persistence; already-completed replays do not celebrate. Authoritative profile reload follows confirmed receipts. Quests keep existing full-completion semantics.
- Retry deadlines for pending completion persist across restart. Uncertain reads use bounded foreground backoff. Manual retry is explicit. A stopped app cannot promise automatic JS upload simply because connectivity returns.
- Corrupt/incompatible journal bytes are preserved by the existing quarantine mechanism. This screen permits re-reading, not automatic clearing. Protected work filling the journal stays protected; no reset is used to make room.

## Verification

The integrated test run uses the real reducer, store, controller and timer provider with synthetic storage/server/auth boundaries. Tests cover write failures, lost replies, late replies after timeout, restart, ambiguous starts, unknown controls, exact custom and suggested durations, account changes, offline expiry, receipt persistence, duplicate rewards, backoff, cached profile isolation, password-recovery priority and root-provider continuity. Existing UI tests remain active; no tests are skipped.

| Check | Separate validation workspace | Actual LifeRPG working tree after save |
| --- | --- | --- |
| Integrated Node suite | 490 passed, 0 failed, 0 skipped | 490 passed, 0 failed, 0 skipped |
| `npm run typecheck` | Passed | Passed |
| `npm run lint -- --no-cache` | Passed | Passed |

Existing react-test-renderer deprecation warnings are expected. No dependency installation was needed. A combined review ZIP, diff and manifest include the foundation and this integration against the stated main commit; the prior foundation-only review remains a historical snapshot.

No live Supabase project, real account, SQL test database or phone was used. No manifest/lockfile/dependency/permission changed. No SQL, native module, build, commit, push or deployment ran.

## Remaining validation and limits

1. Replace the foreground AsyncStorage writer with the single native authority before enabling native receivers. Do not run native and JS writers concurrently. Run the shared JSON vectors through real JVM tests.
2. Implement Android native live countdown and alert/reboot behavior under the brief's native/dependency/permission approval boundary. The existing notification is still static; this change does not claim Dynamic Island, widget or live-notification support.
3. The client adapter currently supplies wall time, not a native boot ID/monotonic clock. It cannot guarantee resistance to manual clock changes or authoritative server-now display. Server credit still uses the unchanged server elapsed gate. Native clocks and installed clock/reboot tests are outstanding.
4. Local recovery requires a successful earlier online profile cache and completed onboarding. Offline first use and signup are unsupported. Local-only views cannot start, pause, resume or end a server timer until verification succeeds.
5. Run the design note's installed-device matrix, including ordinary OS process death, Force Stop, airplane-mode reopening, poor-signal expiry/reconnect, Samsung battery behavior, permission denial and account switching. Every device scenario remains **not run**. Expo Go/Node mocks do not establish native background reliability.
6. Unknown legacy starts may remain blocked when their outcome cannot be proved. Uncertain Pause/Resume can be ended through durable cancellation, but cannot safely be resent after an arbitrary time window. A later command-identity backend contract is needed for safe timing-control replay through later state cycles. This client does not fabricate certainty or discard that work.
