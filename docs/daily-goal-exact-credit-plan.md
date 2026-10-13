# Weekly daily-goal changes

The user approved installation, and the exact tested proposal was applied to project `msuelivxpsfizkddjjfg` as migration `20261011183822_daily_goal_exact_credit_weekly_schedule` on 12 October 2026 in Malaysia. The separate rollback remains an unapplied proposal and requires explicit approval before use.

`daily-goal-exact-credit.sql` creates an owner-scoped goal ledger and three authenticated RPCs. A completed-onboarding account may choose 30 through 480 minutes once every 168 elapsed hours. The change starts at the next local calendar day in the profile's time zone. Today and existing daily records keep their stored targets. A settings response includes today's target, tomorrow's target, the effective date, pending status and the next eligible change time.

The ledger has RLS and authenticated SELECT only. Client INSERT, UPDATE and DELETE are denied. The scheduler identifies the account through `auth.uid()`, requires completed onboarding, validates bounds and locks its profile before rereading the cooldown. Read-committed isolation is required so a retained transaction snapshot cannot bypass the newly saved ledger row. A trigger prevents direct changes to an onboarded account's baseline goal, including under legacy grants. Initial onboarding can still select an in-range baseline.

Installation guards the exact inspected completion definition with MD5 `f1610035d1eaeddcd2a9108eadcd8e33`. Its only completion edits replace the two baseline goal assignments with the saved-date resolver. Server duration checks, planned-duration caps, ownership checks, row locks, exact second credit, character and area XP banks, linked-quest completion and immutable duplicate receipts remain byte-for-byte identical. The transaction aborts on definition drift. No saved profile balances, daily rows, quests or sessions are rewritten by installation.

The rollback proposal pauses new scheduling and advertises it as unavailable. It retains accepted ledger entries, pending effective dates, the resolver, profile guard and patched completion function. Returning to the original baseline resolver would incorrectly discard already accepted future goals, so the rollback intentionally preserves those dates and all history.

Disposable PGlite tests reproduce the inspected completion hash from the normalized-LF snapshot and execute the actual proposal and rollback. Coverage includes the exact two-assignment patch, inclusive bounds and null rejection, 168-hour boundary, account isolation, onboarding, anonymous access, RLS/write grants, direct baseline edits, time-zone tomorrow boundaries, saved historical targets, active server-timed duration caps, exact XP remainders, duplicate completion receipts and transactional drift abort.

PGlite uses one connection. It does not prove simultaneous PostgreSQL transaction scheduling. Before public release, use two real connections to the disposable fixture: begin a scheduling call on account A and hold its transaction; start a second scheduling call for the same account; commit the first; the second must reject the 168-hour cooldown after acquiring the profile lock. Verify exactly one accepted ledger row. Repeat with different accounts and confirm their changes remain independent.

Independent live postflight used read-only metadata and aggregate fingerprints. Completion now has MD5 `a815c30a20323367da56df967740fe86`; reversing exactly its two goal assignments reproduces baseline MD5 `f1610035d1eaeddcd2a9108eadcd8e33`. All 22 profile baseline goals and all 11 saved daily targets matched the preflight fingerprints. The new ledger contained zero rows, so installation did not schedule a goal for any account. The live scheduler contains the 168-hour cooldown, read-committed requirement and profile lock. No account mutation or live scheduling test was performed for verification.

These read-only verification queries do not change any account. Compare the fingerprint queries immediately before and after installation; legitimate later user changes naturally change those fingerprints.

```sql
with definition as (
  select pg_get_functiondef('public.complete_activity_session(uuid)'::regprocedure) as source
)
select md5(source) as completion_hash,
  md5(replace(source,
    'v_goal_minutes := public.daily_goal_for_date(v_local_date);',
    'v_goal_minutes := v_profile.daily_goal_minutes;')) as reverse_patch_hash,
  (length(source)-length(replace(source,
    'v_goal_minutes := public.daily_goal_for_date(v_local_date);','')))
    /length('v_goal_minutes := public.daily_goal_for_date(v_local_date);') as new_goal_assignments
from definition;
-- Expected: a815c30a20323367da56df967740fe86, f1610035d1eaeddcd2a9108eadcd8e33, 2.

select count(*) as profiles,
  md5(coalesce(string_agg(id::text||':'||daily_goal_minutes::text,'|' order by id),'')) as baseline_goals
from public.profiles;
select count(*) as daily_rows,
  md5(coalesce(string_agg(user_id::text||':'||progress_date::text||':'||goal_minutes::text,
    '|' order by user_id,progress_date),'')) as saved_targets
from public.daily_progress;

select c.relrowsecurity as ledger_rls,
  has_table_privilege('authenticated',c.oid,'SELECT') as authenticated_read,
  has_table_privilege('authenticated',c.oid,'INSERT,UPDATE,DELETE') as authenticated_any_write,
  has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE') as anonymous_any_access
from pg_class c where c.oid='public.daily_goal_changes'::regclass;
-- Expected: true, true, false, false.

select policyname,roles,cmd,qual from pg_policies
where schemaname='public' and tablename='daily_goal_changes';
select p.proname,p.prosecdef,p.provolatile,p.proconfig,
  has_function_privilege('anon',p.oid,'EXECUTE') as anonymous_execute,
  has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in
  ('daily_goal_for_date','get_daily_goal_settings','schedule_daily_goal','guard_onboarded_daily_goal');
-- All search paths are empty. Anonymous EXECUTE is false for all four.
-- Only schedule_daily_goal is SECURITY DEFINER. The trigger function has no client EXECUTE grant.

select tgname,tgenabled,pg_get_triggerdef(oid) from pg_trigger
where tgrelid='public.profiles'::regclass and tgname='guard_onboarded_daily_goal';
```
