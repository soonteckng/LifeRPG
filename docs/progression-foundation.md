# Progression foundation — backend activated

Based on main `f4946cdd5e61e284f297497c20979e214783e5f7`, 2026-10-04. This phase prepares accounting and compatible data reads. It does not implement Claude's screen redesign, accessories or goal scheduling.

## Verified contract

Read-only live catalog inspection verified completion, start, pause, resume and cancellation definitions, columns, constraints, policies and authenticated write grants. `progression-live-contract.sql` contains function definitions only, no account rows. Completion caps elapsed seconds at the target, rejects premature completion, locks session then profile, and awards `floor(seconds/60)` XP and five times that Gold. Cancellation marks owned active/paused sessions cancelled with no rewards; it does not save partial focused duration. All four progression tables have RLS. Inspected authenticated UPDATE privileges allow only username/avatar/class_title on profiles. No triggers were returned for these four tables. These are point-in-time findings, not permission guarantees for a future rollout.

General is an existing subject when present; choosing it stores its ID. Without that subject the client can store null. Null receives character XP only. Historical subjects are never reassigned.

## Approved accounting

Any completed session with positive duration makes a Focus day, including one second. Home's current streak and the milestones' best streak share qualifying-record validation. Best and current streak are different metrics. Backend `streak_count` retains its legacy goal-based meaning for compatibility; do not display it as the Focus streak.

Daily goal credit uses seconds after rollout. Character and each owned area bank 0–59 remainder seconds independently at one integer XP per minute. Existing level curves stay unchanged. Missing/deleted/null area receives no area award. Completion reports separate awards, remainders, credited local date, saved daily seconds and the goal-crossing outcome. Retry replays a stored result and reports no new goal crossing. Gold balances/history stay; new completions award zero Gold only after the proposal is deployed.

| Completion | Character bank before | Character award/bank after | Daily seconds added |
| --- | --- | --- | --- |
| 30 seconds | 0 | 0 XP / 30 | 30 |
| Another 30 seconds | 30 | 1 XP / 0 | 30 |
| 15m59s | 0 | 15 XP / 59 | 959 |
| Five 4m50s | 0 | 24 XP total / 10 | 1450 |

Area banks use the same calculation independently: 30 seconds with character bank 45 and area bank 0 earns 1 character XP and 0 area XP. Clients must not label character XP as the area's award.

## Historical transition

The migration transaction takes write-blocking table locks before capturing baselines and replacing completion. Rehearse an operator-controlled write pause: legacy completion and migration acquire locks in different orders, so a concurrent rollout can deadlock and abort. Never retry a deployment blindly. Establish a fresh reviewed schema snapshot first.

All existing daily rows receive `completed_seconds = completed_minutes * 60`, `credit_version = 0`. Their totals, goals and earned outcomes are unchanged. The first new completion on a local day adds exact seconds to that baseline and marks only that day version 1. New days start at zero. Existing completed sessions have no version/result and return their legacy awards on retry; they never re-enter the new accounting. Active/paused sessions completed after rollout use new accounting. Existing XP banks start at zero: earlier discarded seconds are not retroactively rewarded.

This is **credited time**, which can differ from exact historical focus duration shown in analytics. Do not reconstruct past credit from session duration or claim historical seconds were recovered. Goal flags are not recomputed. A stored daily target takes precedence over the current profile target. Already-earned goal flags remain true.

Completion day remains authoritative for midnight-crossing sessions, in the server's profile time zone, including foreground recovery after expiry. This phase does not split sessions across days or credit partial cancellation.

## Client compatibility

Daily and period reads select owned rows with `*` to obtain additive fields without requesting nonexistent columns from older servers. The client uses exact seconds only with `credit_version = 1` and valid nonnegative integer seconds; zero is valid. Historical version 0 and absent/malformed fields fall back to saved minutes. Completion views now consume these fields and use legacy displays for older results. Home’s Gold balance remains visible until the planned visual redesign; it is a historical balance, not a new award.

## Tests and remaining gates

Client verification: TypeScript, full lint and 166 tests passed. Coverage includes XP banks, capability/zero fallback, daily reads after reopening, Home exact-second display, saved completion receipts, next-session setup and Focus-day qualification. Existing authentication, recovery, quest, session and character tests pass.

`scripts/test-progression-pglite.cjs` executed the SQL bootstrap, live function snapshot, pre-rollout synthetic fixtures, migration proposal and transactional assertions in an isolated in-memory PGlite 0.5.8 PostgreSQL WASM engine. It passed sub-minute/mixed credit, independent awards, original daily target, goal crossing, exact accumulation, legacy/new retries, Gold preservation, ownership denial, actual authenticated-role RLS reads/write rejection, anonymous RPC denial, cancellation, multiple level-ups, duration caps and timezone/DST date checks. PGlite is NOT an app dependency or native module. Its synthetic schema is not a complete Supabase clone and cannot validate real extensions/auth triggers or two-connection concurrency.

Full PostgreSQL 17 and multi-connection tests **passed in GitHub Actions run 37207805702** on 2026-10-04 for code commit c8f2815. The isolated service executed `test-progression-postgres.sh` and `test-progression-concurrency.sh`, including simultaneous completions and duplicate retries. This tests a synthetic schema based on the inspected live contract, not a full Supabase environment. Live schema/grant drift, backup readiness and installed-device behavior remain deployment gates. Goal-edit races belong to the separately reviewed future scheduling migration; this proposal does not add that API.

To run the optional WASM test independently: install `@electric-sql/pglite@0.5.8` in a temporary directory, set NODE_PATH to its node_modules, then run `node scripts/test-progression-pglite.cjs`. Do not add it to app dependencies.

To run server tests, create an EMPTY disposable local Postgres database, set `LIFERPG_DISPOSABLE_SQL=YES` and `LIFERPG_TEST_DATABASE_URL` to its local URL, then run `bash scripts/test-progression-postgres.sh` followed by `bash scripts/test-progression-concurrency.sh`. Bootstrap intentionally fails if roles/tables already exist; discard the whole database after testing. Never supply a real account/project database URL.

## Deployment order and rollback

1. Review/reconcile live schema, defaults, grants, RLS and functions again. Rehearse real PostgreSQL/concurrency and failure rollback; no remote application is authorized by this document.
2. Release the compatible accounting displays (seconds and actual award labels) behind capability fallback. The broader visual redesign is separate.
3. Under an agreed write pause, deploy the reviewed proposal as one managed migration. Verify snapshot/backup and record the timestamp and schema revision. New progression columns must remain unwritable by anon/authenticated clients; the proposal aborts on conflicting write grants for either role. Review custom roles separately.
4. Verify installed Android/iOS reads/restart, restored sessions and once-only rewards using dedicated synthetic test accounts in staging first.

Before commit the transaction can roll back completely. After new credits exist, do not delete columns, subtract XP, recalculate history or reset banks. A client rollback retains additive data. Backend rollback needs a separately reviewed forward migration that preserves banks/results and defines how later completions are credited; blindly restoring the old function loses new remainder credit and must not be used as the rollback plan.

This statement describes the initial foundation phase only: no live changes occurred at that point. The later approved activation is recorded below. Claude's Home/Progress/Profile visuals, existing bottom navigation and session dock are the next phase.

## Accounting display integration

Home now uses the saved exact daily seconds only for valid version-1 records, including zero and sub-minute values. Legacy/version-0 records keep their minute-credit display. Completion popup and summary distinguish character and Life-area XP, show independent carried seconds, and omit new Gold awards only when the server advertises version 1. Progress history reads additive receipt fields and preserves historical Gold awards. No display calculates or grants XP locally.

CI now includes an isolated PostgreSQL 17 service job for the SQL assertions and simultaneous completion/retry scripts. Its disposable credentials are only for the ephemeral CI database, not Supabase. A green JavaScript job alone is insufficient: the SQL job must pass before considering live rollout. Client/device layout and live schema/grant drift still need review.

The SQL was subsequently applied with explicit approval; see Live activation below. Downloading client changes alone does not change a different backend project. Deploy the reviewed client to all supported builds before changing backend reward rules; old builds still label Gold and whole-minute credit. Existing accounts, historical rows and balances must be retained. After backend approval, verify new completions through real accounts without re-crediting historical sessions.

## Live activation — 2026-10-04

User explicitly approved the live migration. Supabase applied `20261004141444 exact_seconds_progression_credit` to project `msuelivxpsfizkddjjfg`. Immediately before application, all five session functions matched the reviewed snapshot and no credit columns existed. The migration used 5-second lock/60-second statement limits and in-transaction hashes to abort if existing account/progression row contents changed (excluding added columns). Those preservation checks passed before commit.

Post-application catalog checks confirmed all six credit columns, valid profile banks, preserved historical minute baselines, authenticated receipt/daily-second reads, blocked anonymous completion, authenticated completion access and blocked direct client bank writes. No sessions were created or completed on behalf of real accounts. End-to-end real-account/device completion still requires the user to complete NEW sessions after activation. Historical discarded seconds are not reconstructed. Older installed clients retain compatibility fields but should be updated for accurate second/XP explanations.

Security advisors before and after application returned the same legacy anonymous SECURITY DEFINER exposure warnings (onboarding, trigger function, reward chest/redemption), intended authenticated RPC exposure warnings, and disabled leaked-password protection. No unrelated permissions or authentication settings were modified. Separate follow-up review: https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable and https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection.
