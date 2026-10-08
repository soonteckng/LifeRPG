#!/usr/bin/env bash
set -euo pipefail
# Run only after test-progression-postgres.sh against the same disposable fixture DB.
if [[ "${LIFERPG_DISPOSABLE_SQL:-}" != YES || -z "${LIFERPG_TEST_DATABASE_URL:-}" ]]; then
  echo 'Disposable database acknowledgement and URL required.' >&2; exit 1
fi
task_sql() { psql "$LIFERPG_TEST_DATABASE_URL" -X -q -v ON_ERROR_STOP=1 "$@"; }
task_sql <<'SQL'
-- Two synthetic paused sessions exercise completion serialization. Production
-- start still allows only one open session; fixture writes intentionally bypass it.
update public.profiles set xp_bank_seconds=0 where id='22222222-2222-4222-8222-222222222222';
insert into public.activity_sessions(id,user_id,target_duration_seconds,status,elapsed_seconds) values
 ('44444444-4444-4444-8444-444444444444','22222222-2222-4222-8222-222222222222',30,'paused',30),
 ('55555555-5555-4555-8555-555555555555','22222222-2222-4222-8222-222222222222',30,'paused',30);
SQL
task_sql <<'SQL' &
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
select public.complete_activity_session('44444444-4444-4444-8444-444444444444');
select pg_sleep(2);
commit;
SQL
task_first_pid=$!
task_sql <<'SQL' &
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
select public.complete_activity_session('55555555-5555-4555-8555-555555555555');
commit;
SQL
task_second_pid=$!
wait "$task_first_pid"; wait "$task_second_pid"
task_sql <<'SQL'
do $$ begin
 if (select sum(xp_earned) from public.activity_sessions where id in ('44444444-4444-4444-8444-444444444444','55555555-5555-4555-8555-555555555555')) <> 1
 or (select xp_bank_seconds from public.profiles where id='22222222-2222-4222-8222-222222222222') <> 0 then
   raise exception 'Concurrent completions lost or doubled bank credit';
 end if;
end $$;
SQL
# Retry the same completed session concurrently; its saved award must not reapply.
for task_index in 1 2; do
 task_sql <<'SQL' &
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
select public.complete_activity_session('55555555-5555-4555-8555-555555555555');
commit;
SQL
 if [[ "$task_index" == 1 ]]; then task_first_pid=$!; else task_second_pid=$!; fi
done
wait "$task_first_pid"; wait "$task_second_pid"
task_sql <<'SQL'
do $$ begin
 if (select completed_seconds from public.daily_progress where user_id='22222222-2222-4222-8222-222222222222' and progress_date=(now() at time zone 'UTC')::date) <> 60 then
   raise exception 'Concurrent retry credited again';
 end if;
end $$;
SQL
echo 'Concurrent completion/retry checks passed.'
bash "$(dirname "$0")/test-goal-concurrency.sh"
