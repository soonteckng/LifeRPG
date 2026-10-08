# Superseded proposal

The 2026-10-07 mobile polish pass replaces this older proposal with [daily-goal-exact-credit.sql](daily-goal-exact-credit.sql). Do not apply daily-goal-scheduling.sql: its completion replacement predates the active exact-credit contract. Current rules, tests and activation approval are documented in [mobile-polish.md](mobile-polish.md). The notes below describe the earlier unactivated design.

# Daily focus goal migration proposal (unapplied)

## Status

[SQL proposal](daily-goal-scheduling.sql) and [transaction-only verification](../tests/daily-goal-scheduling.sql) are local files. Neither was executed. No local Postgres/Supabase CLI/container runtime was available, and remote database/account mutations are prohibited by the user. JavaScript tests use mocked RPC responses and do not validate Postgres execution or RLS.

Read-only live metadata inspection on 2026-10-04 confirmed that both RPCs are absent. Settings shows the current goal without an editor or endless Retry. Editing requires the getter's explicit `scheduling_available: true` marker, created together with the scheduler in one transaction. Older getters without the marker stay read-only. Missing APIs during a save also disable further edits. Today's saved daily target remains authoritative; existing Home/milestone fallback stays available.

The actual `profiles` and `daily_progress` constraints and `complete_onboarding` RPC use 15–480 minutes. Client onboarding, Settings and proposed scheduling now match those bounds. The inspected `daily_progress` primary key is `(user_id, progress_date)`, not an `id` column. Its writes and session completion remain server controlled.

After removing comments/whitespace and substituting the goal-resolver assignment, the proposal's complete-session function body matched the inspected live definition exactly. Ownership, locking, elapsed-second caps, whole-minute XP/gold (1 XP and 5 gold per minute), level thresholds, quest completion, idempotency and earned goal/streak logic are preserved. The proposal also retains the empty search_path with explicitly qualified objects. This static comparison is **not** SQL execution, RLS validation or a concurrency test.

## Model and invariants

- Keep `profiles.daily_goal_minutes` as the onboarding baseline. Do not backfill or overwrite existing account targets or achievements.
- Add owned `daily_goal_changes(user_id, effective_date, goal_minutes)` records, indexed by the composite primary key. The latest save replaces the caller's entry for the next local day; past entries cannot be modified or deleted by authenticated clients.
- The server computes the effective date as the next calendar day in `profiles.timezone` using a consistent statement timestamp. The browser/phone does not send an effective date. This handles calendar/DST boundaries without assuming a day lasts 24 hours.
- Use a stored `daily_progress.goal_minutes` first. Otherwise use the latest due schedule, then the onboarding baseline. History wins over later preferences.
- Scheduling locks the caller's profile, serialising with session completion. It writes only the schedule table, never achievements, daily progress, XP, gold, streaks or session history.
- Reject null, fractional/client-invalid and out-of-range values. Shared onboarding/Settings client validation is 15-480 whole minutes; live onboarding and the proposed scheduling RPC accept that range. Session/quest duration bounds are separate and unchanged.
- RLS requires the caller's user ID, completed onboarding, and a next-local-day date on insert/update. Read is limited to own rows. No DELETE permission. RPCs are SECURITY INVOKER with an empty search_path and explicit auth.uid() checks.
- Guard baseline changes after completed onboarding so older clients cannot bypass next-day scheduling with an immediate profile edit.
- Keep the existing completion RPC's ownership checks, row locks, idempotency, exact seconds and whole-minute economy. The proposed replacement only resolves the goal through `daily_goal_for_date` rather than the baseline. Saved daily targets therefore remain authoritative.
- Home uses the resolved read-only target before a daily record exists. That snapshot is explicitly marked and cannot invent a goal achievement. Milestones/streaks remain driven by completed sessions and stored daily achievements. No cron or midnight reward mutation is required.

## Separate operator steps

1. Do not run this against the inaccessible test account or against production as an unreviewed patch. Use a disposable local database with the project's actual schema, RLS, signup profile trigger and latest session RPCs.
2. Inspect the actual `complete_activity_session(uuid)`, `complete_onboarding` and `finish_onboarding` definitions. Compare them with the branch's `docs/session-seconds.sql`. The proposal contains a full completion replacement based on that file; reconcile any newer server logic before applying it. Confirm baseline values/time zones are valid and onboarding RPCs reject unauthenticated or cross-user access.
3. Discover installed Supabase CLI commands through `--help`. For a managed migration, use `supabase migration new daily_goal_scheduling` to generate its filename, then place the reviewed proposal into that generated file. This repository currently has a standalone proposal rather than an invented migration-history filename.
4. Apply in the disposable local environment only. Verify the prior exact-second session schema/RPC changes are present. Run `tests/session-seconds.sql` and `tests/daily-goal-scheduling.sql`; both use synthetic fixtures and rollback. The latter tests scheduling without progress writes, history/target preservation, repeat saves, completion economy, authentication and authenticated-role RLS failures.
5. Run simultaneous completion/scheduling using the two-connection procedure below, plus repeated edits across midnight and account time zones/DST. The transaction test includes own/cross/anonymous access, preserved history/economy, due next-day targets without a daily row, repeated edits, 15/480 bounds and old-client baseline-write rejection. None has been executed yet. Inspect advisors/policies and Data API exposure. Grants are explicit; remote exposure configuration may also be required.
6. Only after that review/testing, obtain separate authorisation for any remote migration. Nothing in this task authorises its application. Roll out compatible client and backend changes deliberately; older clients read only the baseline and may show an outdated target after due schedules.
7. If rollout needs to be paused, disable the editor while retaining schedule history and the target resolver. Do not delete scheduled history or recompute achievements as a rollback shortcut.

No migration, dashboard change, cron, deployment or administrative account mutation was performed.

## Disposable local concurrency procedure (not executed)

Use a throwaway Supabase database with synthetic users only. The transaction-only test rolls back its fixtures, so create a separate committed synthetic fixture in that disposable database for two connections. Do not reuse a real account ID. Finish its onboarding with baseline 60; create a paused 60-second session with server elapsed 60 and a stored target of 90 for today. Record profile/session/daily snapshots.

1. Connection A: `BEGIN; SET LOCAL ROLE authenticated;` set `request.jwt.claim.sub` to the synthetic user's UUID. Lock that user's profile row `FOR UPDATE`, call `schedule_daily_goal(30)`, and keep the transaction open.
2. Connection B: use the same authenticated identity in a separate transaction and call `complete_activity_session` for that synthetic session. Confirm it waits at the profile lock; use a bounded statement timeout to avoid an unattended hang.
3. Commit A, then B. Expect one next-local-day schedule of 30, today's stored target still 90, one completed session, exactly 1 XP and 5 gold credited, no history rewritten, no deadlock. Retry completion: rewards/history do not change.
4. Recreate a fresh synthetic session and reverse the lock/order: hold B's completion transaction open, schedule in A, then commit B and A. Expect the same target/reward invariants. Repeat with two simultaneous scheduling calls: they serialize on the profile and leave one next-day row containing the last successful save.
5. Repeat across local midnight using controlled fixture time zones/dates; verify calendar next-day effective dates and stored targets win. Scheduling and completion use server time, never a phone-supplied date. Report any stale timestamp after lock waits before approving rollout.

After all local cases pass, generate a timestamped migration using the installed CLI, include the reconciled SQL and record validation evidence. A managed migration has deliberately not been created or declared ready while database execution is unavailable. Production application requires the operator's separate rollout decision, a recheck of current function definitions, and an appropriate backup. Keep historical schedules/resolver on rollback; disabling editing is safer than deleting history.
