#!/usr/bin/env bash
set -euo pipefail
# Only the disposable CI fixture database, after progression concurrency checks.
if [[ "${LIFERPG_DISPOSABLE_SQL:-}" != YES || -z "${LIFERPG_TEST_DATABASE_URL:-}" ]]; then
  echo 'Disposable database acknowledgement and URL required.' >&2; exit 1
fi
task_sql() { psql "$LIFERPG_TEST_DATABASE_URL" -X -qAt -v ON_ERROR_STOP=1 "$@"; }
task_lock_log=$(mktemp)
task_denial_log=$(mktemp)
trap 'rm -f "$task_lock_log" "$task_denial_log"' EXIT
task_sql <<'SQL'
update public.profiles set onboarding_completed=true where id='22222222-2222-4222-8222-222222222222';
insert into public.activity_sessions(id,user_id,target_duration_seconds,status,elapsed_seconds) values
 ('66666666-6666-4666-8666-666666666666','22222222-2222-4222-8222-222222222222',60,'paused',60);
SQL
task_sql > "$task_lock_log" <<'SQL' &
begin;
set local statement_timeout='10s';
set local role authenticated;
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
select public.schedule_daily_goal(75);
select 'GOAL_LOCK_READY';
select pg_sleep(2);
commit;
SQL
task_goal_pid=$!
task_ready=false
for task_attempt in {1..50}; do
  if grep -q GOAL_LOCK_READY "$task_lock_log"; then task_ready=true; break; fi
  sleep 0.1
done
if [[ "$task_ready" != true ]]; then echo 'Goal lock was not acquired.' >&2; exit 1; fi
task_sql <<'SQL' &
begin;
set local statement_timeout='10s';
set local role authenticated;
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
select public.complete_activity_session('66666666-6666-4666-8666-666666666666');
commit;
SQL
task_completion_pid=$!
task_sql > "$task_denial_log" 2>&1 <<'SQL' &
begin;
set local statement_timeout='10s';
set local role authenticated;
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
select public.schedule_daily_goal(90);
commit;
SQL
task_second_goal_pid=$!
wait "$task_goal_pid"; wait "$task_completion_pid"
if wait "$task_second_goal_pid"; then echo 'Concurrent goal bypassed the weekly lock.' >&2; exit 1; fi
grep -q 'Change your goal once every seven days' "$task_denial_log"
task_sql <<'SQL'
do $$ begin
 if (select count(*) from public.daily_goal_changes where user_id='22222222-2222-4222-8222-222222222222') <> 1
 or (select goal_minutes from public.daily_goal_changes where user_id='22222222-2222-4222-8222-222222222222') <> 75
 or (select effective_date from public.daily_goal_changes where user_id='22222222-2222-4222-8222-222222222222') <> (now() at time zone 'UTC')::date+1
 or (select daily_goal_minutes from public.profiles where id='22222222-2222-4222-8222-222222222222') <> 30
 or (select gold from public.profiles where id='22222222-2222-4222-8222-222222222222') <> 200
 or (select goal_minutes from public.daily_progress where user_id='22222222-2222-4222-8222-222222222222' and progress_date=(now() at time zone 'UTC')::date) <> 30
 or (select completed_seconds from public.daily_progress where user_id='22222222-2222-4222-8222-222222222222' and progress_date=(now() at time zone 'UTC')::date) <> 120
 or (select xp_earned from public.activity_sessions where id='66666666-6666-4666-8666-666666666666') <> 1 then
   raise exception 'Concurrent goal/completion changed history or accounting';
 end if;
end $$;
SQL
echo 'Concurrent weekly goal and completion checks passed.'
