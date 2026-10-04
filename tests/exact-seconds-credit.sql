-- DISPOSABLE DATABASE ONLY. Bootstrap + live snapshot + fixtures + proposal first.
begin;
create function public.test_assert(ok boolean, message text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'Assertion failed: %',message; end if; end $$;
create function public.test_complete(seconds integer, area bigint default null) returns jsonb language plpgsql as $$
declare sid uuid;
begin
 sid := public.start_activity_session(seconds,'other',null,area);
 update public.activity_sessions set elapsed_seconds=seconds,status='paused',last_resumed_at=null where id=sid;
 return public.complete_activity_session(sid);
end $$;
do $test$
declare
 uid uuid := '11111111-1111-4111-8111-111111111111';
 other_uid uuid := '22222222-2222-4222-8222-222222222222';
 today date := (now() at time zone 'Asia/Kuala_Lumpur')::date;
 r jsonb; retry jsonb; before_bank integer; sid uuid; i integer; sum_xp integer := 0;
begin
 perform set_config('request.jwt.claim.sub',uid::text,true);
 perform public.test_assert((select completed_seconds=120 and credit_version=0 and not goal_completed from public.daily_progress where user_id=uid and progress_date=today),'rollout baseline');
 perform public.test_assert((select completed_minutes=14 and completed_seconds=840 and not goal_completed from public.daily_progress where user_id=uid and progress_date=today-1),'historical flags preserved');
 r := public.complete_activity_session('33333333-3333-4333-8333-333333333333');
 perform public.test_assert((r->>'xp_earned')::integer=15 and (r->>'gold_earned')::integer=75 and not (r ? 'credit_version'),'legacy retry unchanged');
 r := public.test_complete(30,1);
 perform public.test_assert((r->>'daily_completed_seconds')::integer=150 and (r->>'xp_earned')::integer=0 and (r->>'area_xp_earned')::integer=0,'sub-minute credit');
 sid := (r->>'session_id')::uuid;
 retry := public.complete_activity_session(sid);
 perform public.test_assert(retry=r || jsonb_build_object('already_completed',true,'goal_reached_now',false),'saved result replay');
 perform public.test_assert((select xp_bank_seconds=30 from public.profiles where id=uid),'retry did not consume bank');
 r := public.test_complete(30,null);
 perform public.test_assert((r->>'xp_earned')::integer=1 and r->'area_xp_earned'='null'::jsonb,'independent bank / unassigned');
 r := public.test_complete(30,1);
 perform public.test_assert((r->>'xp_earned')::integer=0 and (r->>'area_xp_earned')::integer=1,'independent area award');
 update public.profiles set xp_bank_seconds=0,current_xp=0,level=1 where id=uid;
 update public.subjects set xp_bank_seconds=0,current_xp=0,level=1 where id=1;
 r := public.test_complete(959,1);
 perform public.test_assert((r->>'xp_earned')::integer=15 and (r->>'character_remainder_seconds')::integer=59 and (r->>'daily_completed_seconds')::integer=1169,'15m59s exact');
 perform public.test_assert((r->>'daily_goal_minutes')::integer=15 and (r->>'goal_reached_now')::boolean,'stored daily target wins over profile');
 retry := public.complete_activity_session((r->>'session_id')::uuid);
 perform public.test_assert(not (retry->>'goal_reached_now')::boolean,'goal celebration once');
 update public.profiles set xp_bank_seconds=0,current_xp=0,level=1 where id=uid;
 update public.daily_progress set completed_seconds=0,completed_minutes=0,goal_minutes=30,goal_completed=false where user_id=uid and progress_date=today;
 for i in 1..5 loop r := public.test_complete(290); sum_xp := sum_xp+(r->>'xp_earned')::integer; end loop;
 perform public.test_assert(sum_xp=24 and (r->>'character_remainder_seconds')::integer=10 and (r->>'daily_completed_seconds')::integer=1450,'five 4m50s');
 r := public.test_complete(350);
 perform public.test_assert((r->>'daily_completed_seconds')::integer=1800 and (r->>'goal_reached_now')::boolean,'exact goal crossing');
 r := public.test_complete(1);
 perform public.test_assert(not (r->>'goal_reached_now')::boolean,'subsequent completion not another goal');
 perform public.test_assert((select gold=100 from public.profiles where id=uid),'Gold preserved, no new awards');
 -- Completion day, not start day; cap planned duration even after long absence.
 sid := public.start_activity_session(30,'other');
 update public.activity_sessions set started_at=now()-interval '1 day',last_resumed_at=now()-interval '2 minutes' where id=sid;
 r := public.complete_activity_session(sid);
 perform public.test_assert((r->>'duration_seconds')::integer=30 and (r->>'credited_date')::date=today,'midnight attribution and cap');
 -- Early completion and cross-user calls fail without partial changes.
 sid := public.start_activity_session(60,'other');
 select xp_bank_seconds into before_bank from public.profiles where id=uid;
 begin
   perform public.complete_activity_session(sid); raise exception 'early accepted';
 exception when others then if sqlerrm <> 'Session has not reached its target duration yet' then raise; end if; end;
 perform public.test_assert((select xp_bank_seconds=before_bank from public.profiles where id=uid),'failed transaction preserves credit');
 perform set_config('request.jwt.claim.sub',other_uid::text,true);
 begin perform public.complete_activity_session(sid); raise exception 'cross-user accepted';
 exception when others then if sqlerrm <> 'Session not found' then raise; end if; end;
 perform set_config('request.jwt.claim.sub','',true);
 begin perform public.complete_activity_session(sid); raise exception 'anonymous accepted';
 exception when others then if sqlerrm <> 'Not authenticated' then raise; end if; end;
 perform set_config('request.jwt.claim.sub',uid::text,true);
 perform public.cancel_activity_session(sid);
 perform public.test_assert((select status='cancelled' and xp_earned=0 from public.activity_sessions where id=sid),'cancellation preserved');
 -- Multiple level-ups retain both original curves.
 update public.profiles set current_xp=99,level=1,xp_bank_seconds=59 where id=uid;
 update public.subjects set current_xp=49,level=1,xp_bank_seconds=59 where id=2;
 r := public.test_complete(28800,2);
 perform public.test_assert((r->>'level')::integer>2 and (select level>2 from public.subjects where id=2),'multiple level-ups');
 -- Server timezone owns the completion date, including opposite calendar days.
 update public.profiles set timezone='Pacific/Kiritimati' where id=uid;
 r := public.test_complete(1);
 perform public.test_assert((r->>'credited_date')::date=(now() at time zone 'Pacific/Kiritimati')::date,'UTC+14');
 update public.profiles set timezone='America/New_York' where id=uid;
 r := public.test_complete(1);
 perform public.test_assert((r->>'credited_date')::date=(now() at time zone 'America/New_York')::date,'DST timezone');
 perform public.test_assert(('2026-03-08T06:59:59Z'::timestamptz at time zone 'America/New_York')::date=('2026-03-08T07:00:00Z'::timestamptz at time zone 'America/New_York')::date,'spring-forward date');
end;
$test$;
-- Inject a late write failure: PostgreSQL must roll back daily credit and XP too.
create function public.test_fail_receipt() returns trigger language plpgsql as $$
begin if new.credit_result is not null then raise exception 'Synthetic receipt failure'; end if; return new; end $$;
create trigger synthetic_receipt_failure before update on public.activity_sessions for each row execute function public.test_fail_receipt();
do $$ declare sid uuid; before_profile jsonb; before_daily jsonb; begin
 perform set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
 sid := public.start_activity_session(30,'other',null,1);
 update public.activity_sessions set status='paused',elapsed_seconds=30,last_resumed_at=null where id=sid;
 select to_jsonb(p) into before_profile from public.profiles p where id=auth.uid();
 select jsonb_agg(to_jsonb(d) order by progress_date) into before_daily from public.daily_progress d where user_id=auth.uid();
 begin perform public.complete_activity_session(sid); raise exception 'late failure not raised';
 exception when others then if sqlerrm <> 'Synthetic receipt failure' then raise; end if; end;
 perform public.test_assert(before_profile=(select to_jsonb(p) from public.profiles p where id=auth.uid()),'late failure profile rollback');
 perform public.test_assert(before_daily=(select jsonb_agg(to_jsonb(d) order by progress_date) from public.daily_progress d where user_id=auth.uid()),'late failure daily rollback');
 perform public.test_assert((select status='paused' and credit_result is null from public.activity_sessions where id=sid),'late failure session rollback');
end $$;
drop trigger synthetic_receipt_failure on public.activity_sessions;
-- Test genuine authenticated-role reads and blocked client writes.
set local role authenticated;
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
do $$ begin
 if exists(select 1 from public.daily_progress where user_id='11111111-1111-4111-8111-111111111111') then raise exception 'RLS leak'; end if;
 begin update public.profiles set xp_bank_seconds=59; raise exception 'client bank write accepted';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role anon;
do $$ begin
 begin perform public.complete_activity_session('33333333-3333-4333-8333-333333333333'); raise exception 'Anonymous RPC executable';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
