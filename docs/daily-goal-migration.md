# Daily focus goal migration proposal (unapplied)

## Status

[SQL proposal](daily-goal-scheduling.sql) and [transaction-only verification](../tests/daily-goal-scheduling.sql) are local files. Neither was executed. No local Postgres/Supabase CLI/container runtime was available, and remote database/account mutations are prohibited by the user. JavaScript tests use mocked RPC responses and do not validate Postgres execution or RLS.

The Settings editor is implemented against `get_daily_goal_settings` and `schedule_daily_goal`. Until the proposal has been validated and independently applied, missing RPCs show an honest loading/save error and no successful outcome. Existing Home/milestone target fallback remains available on projects without the optional API.

## Model and invariants

- Keep `profiles.daily_goal_minutes` as the onboarding baseline. Do not backfill or overwrite existing account targets or achievements.
- Add owned `daily_goal_changes(user_id, effective_date, goal_minutes)` records, indexed by the composite primary key. The latest save replaces the caller's entry for the next local day; past entries cannot be modified or deleted by authenticated clients.
- The server computes the effective date as the next calendar day in `profiles.timezone` using a consistent statement timestamp. The browser/phone does not send an effective date. This handles calendar/DST boundaries without assuming a day lasts 24 hours.
- Use a stored `daily_progress.goal_minutes` first. Otherwise use the latest due schedule, then the onboarding baseline. History wins over later preferences.
- Scheduling locks the caller's profile, serialising with session completion. It writes only the schedule table, never achievements, daily progress, XP, gold, streaks or session history.
- Reject 0, fractional/client-invalid and out-of-range values. Shared onboarding/Settings client validation is 1-480 whole minutes; the RPC accepts an integer in that range.
- RLS requires the caller's user ID, completed onboarding, and a next-local-day date on insert/update. Read is limited to own rows. No DELETE permission. RPCs are SECURITY INVOKER with an empty search_path and explicit auth.uid() checks.
- Guard baseline changes after completed onboarding so older clients cannot bypass next-day scheduling with an immediate profile edit.
- Keep the existing completion RPC's ownership checks, row locks, idempotency, exact seconds and whole-minute economy. The proposed replacement only resolves the goal through `daily_goal_for_date` rather than the baseline. Saved daily targets therefore remain authoritative.
- Home uses the resolved read-only target before a daily record exists. That snapshot is explicitly marked and cannot invent a goal achievement. Milestones/streaks remain driven by completed sessions and stored daily achievements. No cron or midnight reward mutation is required.

## Separate operator steps

1. Do not run this against the inaccessible test account or against production as an unreviewed patch. Use a disposable local database with the project's actual schema, RLS, signup profile trigger and latest session RPCs.
2. Inspect the actual `complete_activity_session(uuid)`, `complete_onboarding` and `finish_onboarding` definitions. Compare them with the branch's `docs/session-seconds.sql`. The proposal contains a full completion replacement based on that file; reconcile any newer server logic before applying it. Confirm baseline values/time zones are valid and onboarding RPCs reject unauthenticated or cross-user access.
3. Discover installed Supabase CLI commands through `--help`. For a managed migration, use `supabase migration new daily_goal_scheduling` to generate its filename, then place the reviewed proposal into that generated file. This repository currently has a standalone proposal rather than an invented migration-history filename.
4. Apply in the disposable local environment only. Verify the prior exact-second session schema/RPC changes are present. Run `tests/session-seconds.sql` and `tests/daily-goal-scheduling.sql`; both use synthetic fixtures and rollback. The latter tests scheduling without progress writes, history/target preservation, repeat saves, completion economy, authentication and authenticated-role RLS failures.
5. Expand local coverage to simultaneous completion/scheduling, a next-day schedule with no daily record, repeated edits across midnight, account time zones/DST, and old-client baseline-write rejection. Inspect advisors/policies and Data API function/table exposure. Grants are explicit; remote Data API exposure configuration may also be required.
6. Only after that review/testing, obtain separate authorisation for any remote migration. Nothing in this task authorises its application. Roll out compatible client and backend changes deliberately; older clients read only the baseline and may show an outdated target after due schedules.
7. If rollout needs to be paused, disable the editor while retaining schedule history and the target resolver. Do not delete scheduled history or recompute achievements as a rollback shortcut.

No migration, dashboard change, cron, deployment or administrative account mutation was performed.
