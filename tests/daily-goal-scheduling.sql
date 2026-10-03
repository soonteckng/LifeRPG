-- Run ONLY against a disposable local database after the proposed goal SQL.
-- Synthetic fixtures and all test writes are rolled back. Never run against the old test account.
begin;
do $test$
declare
  fixture_user uuid := gen_random_uuid();
  fixture_other uuid := gen_random_uuid();
  today date;
  before_profile jsonb;
  after_profile jsonb;
  before_history jsonb;
  result jsonb;
  sid uuid;
begin
  insert into auth.users(id, raw_user_meta_data) values
    (fixture_user, '{"full_name":"Goal contract test"}'::jsonb),
    (fixture_other, '{"full_name":"Other goal contract test"}'::jsonb);
  perform set_config('test.goal_fixture_uid', fixture_user::text, true);
  perform set_config('test.goal_fixture_other', fixture_other::text, true);
  perform set_config('request.jwt.claim.sub', fixture_user::text, true);
  update public.profiles set daily_goal_minutes=60, timezone='Asia/Kuala_Lumpur', onboarding_completed=true where id=fixture_user;
  today := (statement_timestamp() at time zone 'Asia/Kuala_Lumpur')::date;
  insert into public.daily_progress(user_id, progress_date, goal_minutes, completed_minutes, goal_completed, goal_completed_at)
    values (fixture_user, today-1, 60, 60, true, statement_timestamp()),
           (fixture_user, today, 90, 5, false, null);
  insert into public.daily_goal_changes(user_id, effective_date, goal_minutes) values (fixture_other,today+1,75);
  select to_jsonb(p) into before_profile from public.profiles p where id=fixture_user;
  select jsonb_agg(to_jsonb(d) order by progress_date) into before_history from public.daily_progress d where user_id=fixture_user;
  result := public.schedule_daily_goal(30);
  if (result->>'today_goal_minutes')::integer <> 90
    or (result->>'next_goal_minutes')::integer <> 30
    or (result->>'next_effective_date')::date <> today+1 then raise exception 'Wrong effective day/target: %',result; end if;
  select to_jsonb(p) into after_profile from public.profiles p where id=fixture_user;
  if before_profile <> after_profile then raise exception 'Scheduling changed account progress'; end if;
  if before_history <> (select jsonb_agg(to_jsonb(d) order by progress_date) from public.daily_progress d where user_id=fixture_user)
    then raise exception 'Scheduling changed daily history'; end if;
  perform public.schedule_daily_goal(120);
  if (select count(*) from public.daily_goal_changes where user_id=fixture_user) <> 1
    or public.daily_goal_for_date(today+1) <> 120
    or public.daily_goal_for_date(today-1) <> 60 then raise exception 'Replacement/history mismatch'; end if;
  begin
    perform public.schedule_daily_goal(0); raise exception 'Accepted invalid goal';
  exception when others then
    if sqlerrm <> 'Daily goal must be between 1 and 480 whole minutes' then raise; end if;
  end;
  sid := public.start_activity_session(60, 'other');
  update public.activity_sessions set elapsed_seconds=60, status='paused', last_resumed_at=null where id=sid and user_id=fixture_user;
  result := public.complete_activity_session(sid);
  if (result->>'daily_goal_minutes')::integer <> 90
    or (result->>'xp_earned')::integer <> 1
    or (result->>'gold_earned')::integer <> 5 then raise exception 'Completion lost target/reward contract'; end if;
  perform set_config('request.jwt.claim.sub', fixture_other::text, true);
  if public.daily_goal_for_date(today+1) = 120 then raise exception 'Other account read scheduled target'; end if;
  perform set_config('request.jwt.claim.sub', '', true);
  begin
    perform public.get_daily_goal_settings(); raise exception 'Unauthenticated access accepted';
  exception when others then
    if sqlerrm <> 'Not authenticated' then raise; end if;
  end;
end;
$test$;
select 'goal scheduling, preserved history/economy, ownership and authentication contract passed' as verification;
set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('test.goal_fixture_uid'), true);
do $rls$
declare
  today date := (public.get_daily_goal_settings()->>'local_date')::date;
  own_id uuid := auth.uid();
  other_id uuid := current_setting('test.goal_fixture_other')::uuid;
begin
  if exists(select 1 from public.daily_goal_changes where user_id <> own_id) then
    raise exception 'RLS exposed another account';
  end if;
  perform public.schedule_daily_goal(45);
  if public.daily_goal_for_date(today+1) <> 45 then raise exception 'Own scheduled update failed'; end if;
  begin
    insert into public.daily_goal_changes(user_id,effective_date,goal_minutes) values (other_id,today+2,30);
    raise exception 'RLS allowed cross-user insert';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.daily_goal_changes(user_id,effective_date,goal_minutes) values (own_id,today,30);
    raise exception 'RLS allowed immediate target change';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.daily_goal_changes set effective_date=today where user_id=own_id and effective_date=today+1;
    raise exception 'RLS allowed moving schedule to today';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.daily_goal_changes where user_id=own_id;
    raise exception 'RLS allowed deleting scheduled history';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.profiles set daily_goal_minutes=30 where id=own_id;
    raise exception 'Baseline goal changed after onboarding';
  exception when others then
    if sqlerrm <> 'Use schedule_daily_goal after onboarding' then raise; end if;
  end;
end;
$rls$;
reset role;
select 'role-based RLS and baseline goal guard passed' as verification;
rollback;

