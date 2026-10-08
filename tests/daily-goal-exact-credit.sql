-- Disposable synthetic database only, after exact credit and the new goal proposal.
begin;
update public.profiles set onboarding_completed=true;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
set local role authenticated;
do $test$
declare v_result jsonb; v_today date:=(statement_timestamp() at time zone 'Asia/Kuala_Lumpur')::date; v_failed boolean; v_before integer;
begin
  v_before:=public.daily_goal_for_date(v_today);
  v_result:=public.schedule_daily_goal(75);
  assert (v_result->>'today_goal_minutes')::integer=v_before, 'today unchanged';
  assert (v_result->>'next_goal_minutes')::integer=75, 'tomorrow uses new goal';
  assert public.daily_goal_for_date(v_today+1)=75, 'future effective goal';
  assert (v_result->>'can_change_goal')::boolean=false, 'cooldown advertised';
  assert (select daily_goal_minutes from public.profiles where id=auth.uid())=30, 'profile baseline preserved';
  v_failed:=false; begin perform public.schedule_daily_goal(90); exception when others then v_failed:=true; end; assert v_failed,'weekly cooldown enforced';
  v_failed:=false; begin perform public.schedule_daily_goal(29); exception when others then v_failed:=true; end; assert v_failed,'minimum enforced';
  v_failed:=false; begin perform public.schedule_daily_goal(481); exception when others then v_failed:=true; end; assert v_failed,'maximum enforced';
  v_failed:=false; begin insert into public.daily_goal_changes(user_id,effective_date,goal_minutes) values(auth.uid(),v_today+2,90); exception when insufficient_privilege then v_failed:=true; end; assert v_failed,'REST writes cannot bypass cooldown';
end;$test$;
reset role;
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
set local role authenticated;
do $test$ begin assert (select count(*) from public.daily_goal_changes)=0,'owner isolation'; end;$test$;
reset role;
set local role anon;
do $test$
declare v_failed boolean:=false;
begin
  begin perform public.schedule_daily_goal(60); exception when insufficient_privilege then v_failed:=true; end;
  assert v_failed,'anonymous scheduler denied';
end;$test$;
reset role;
rollback;
