-- REVIEWED PROPOSAL ONLY. Requires explicit approval before any live application.
-- Pause new scheduling while preserving accepted dates, history and rewards.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
do $guard$
begin
  if to_regclass('public.daily_goal_changes') is null
    or to_regprocedure('public.daily_goal_for_date(date)') is null
    or to_regprocedure('public.get_daily_goal_settings()') is null
    or to_regprocedure('public.schedule_daily_goal(integer)') is null then
    raise exception 'Goal scheduling proposal is not installed';
  end if;
end;$guard$;

create or replace function public.schedule_daily_goal(p_goal_minutes integer) returns jsonb
language plpgsql security definer set search_path='' as $fn$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  raise exception 'Goal changes are temporarily unavailable';
end;$fn$;

create or replace function public.get_daily_goal_settings() returns jsonb
language plpgsql stable security invoker set search_path='' as $fn$
declare v_user uuid:=auth.uid(); v_profile public.profiles%rowtype; v_today date; v_next timestamptz;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;
  select * into v_profile from public.profiles where id=v_user;
  if not found then raise exception 'Profile not found'; end if;
  v_today:=(statement_timestamp() at time zone v_profile.timezone)::date;
  select max(updated_at)+interval '168 hours' into v_next from public.daily_goal_changes where user_id=v_user;
  return jsonb_build_object('user_id',v_user,'local_date',v_today,'timezone',v_profile.timezone,
    'today_goal_minutes',public.daily_goal_for_date(v_today),'next_goal_minutes',public.daily_goal_for_date(v_today+1),
    'next_effective_date',v_today+1,'scheduling_available',false,'weekly_limit_available',true,
    'can_change_goal',false,'next_change_at',v_next,
    'pending',exists(select 1 from public.daily_goal_changes where user_id=v_user and effective_date=v_today+1));
end;$fn$;

revoke all on function public.get_daily_goal_settings(),public.schedule_daily_goal(integer) from public,anon,authenticated;
grant execute on function public.get_daily_goal_settings(),public.schedule_daily_goal(integer) to authenticated;
notify pgrst, 'reload schema';
commit;
