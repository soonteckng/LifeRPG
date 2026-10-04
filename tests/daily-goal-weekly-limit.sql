-- Disposable local database ONLY, after both daily-goal proposals and session SQL.
-- Not executed. Synthetic fixtures and schema/data changes roll back.
begin;
do $fixture$
declare v_user uuid := gen_random_uuid();
begin
  insert into auth.users(id, raw_user_meta_data) values (v_user, '{"full_name":"Weekly goal fixture"}'::jsonb);
  perform set_config('test.weekly_fixture', v_user::text, true);
  update public.profiles set daily_goal_minutes=60, timezone='Asia/Kuala_Lumpur', onboarding_completed=true where id=v_user;
end;
$fixture$;
set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('test.weekly_fixture'), true);
do $test$
declare v_result jsonb; v_before jsonb; v_today date; v_invalid integer;
begin
  v_result := public.get_daily_goal_settings();
  v_today := (v_result->>'local_date')::date;
  if v_result->>'can_change_goal' <> 'true' or v_result->>'weekly_limit_available' <> 'true' then
    raise exception 'Initial weekly capability missing';
  end if;
  select to_jsonb(p) into v_before from public.profiles p where id=auth.uid();
  foreach v_invalid in array array[null, -1, 0, 15, 29, 481] loop
    begin
      perform public.schedule_daily_goal(v_invalid);
      raise exception 'Invalid goal accepted';
    exception when others then
      if sqlerrm <> 'Daily goal must be between 30 and 480 whole minutes' then raise; end if;
    end;
  end loop;
  v_result := public.schedule_daily_goal(30);
  if (v_result->>'next_goal_minutes')::integer <> 30
    or (v_result->>'today_goal_minutes')::integer <> 60
    or (v_result->>'next_effective_date')::date <> v_today+1
    or v_result->>'can_change_goal' <> 'false'
    or (v_result->>'next_change_at')::timestamptz <> statement_timestamp()+interval '168 hours' then
    raise exception 'Wrong weekly scheduling result: %', v_result;
  end if;
  if v_before <> (select to_jsonb(p) from public.profiles p where id=auth.uid()) then
    raise exception 'Scheduling changed account progress';
  end if;
  begin
    perform public.schedule_daily_goal(480);
    raise exception 'Second change accepted';
  exception when others then
    if sqlerrm <> 'Daily goal can only be changed once every seven days' then raise; end if;
  end;
  begin
    update public.daily_goal_changes set goal_minutes=90, updated_at=statement_timestamp()-interval '8 days'
      where user_id=auth.uid();
    raise exception 'Direct update bypassed cooldown';
  exception when others then
    if sqlerrm <> 'Daily goal can only be changed once every seven days' then raise; end if;
  end;
  begin
    insert into public.daily_goal_changes(user_id,effective_date,goal_minutes,updated_at)
      values(auth.uid(), v_today+1,90,statement_timestamp()-interval '8 days');
    raise exception 'Direct insert bypassed cooldown';
  exception when others then
    if sqlerrm <> 'Daily goal can only be changed once every seven days' then raise; end if;
  end;
end;
$test$;
reset role;
-- Simulate passage of exactly seven days using the synthetic row only.
alter table public.daily_goal_changes disable trigger guard_weekly_daily_goal_change;
update public.daily_goal_changes set effective_date=effective_date-7, updated_at=statement_timestamp()-interval '168 hours'
  where user_id=current_setting('test.weekly_fixture')::uuid;
alter table public.daily_goal_changes enable trigger guard_weekly_daily_goal_change;
set local role authenticated;
do $boundary$
declare v_result jsonb;
begin
  if public.get_daily_goal_settings()->>'can_change_goal' <> 'true' then raise exception 'Seven-day boundary still blocked'; end if;
  v_result := public.schedule_daily_goal(480);
  if (v_result->>'next_goal_minutes')::integer <> 480 or v_result->>'can_change_goal' <> 'false' then
    raise exception 'Boundary/max target failed';
  end if;
end;
$boundary$;
reset role;
select 'Weekly minimum, cooldown, direct-write protection and boundary checks passed' as verification;
rollback;
