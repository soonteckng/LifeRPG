-- LOCAL PROPOSAL ONLY. Not applied to any database.
-- Requires docs/daily-goal-scheduling.sql. Test in a disposable database first.
begin;

-- Grandfather old targets/history; enforce the new minimum on future writes.
alter table public.daily_goal_changes add constraint daily_goal_minimum_30
  check (goal_minutes between 30 and 480) not valid;
create index daily_goal_changes_latest_change on public.daily_goal_changes (user_id, updated_at desc);

create or replace function public.guard_onboarded_daily_goal()
returns trigger language plpgsql security invoker set search_path = ''
as $fn$
begin
  if old.onboarding_completed and new.daily_goal_minutes is distinct from old.daily_goal_minutes then
    raise exception 'Use schedule_daily_goal after onboarding';
  end if;
  -- Preserve an unchanged legacy baseline; new onboarding selections use 30+.
  if new.daily_goal_minutes is distinct from old.daily_goal_minutes
    and (new.daily_goal_minutes is null or new.daily_goal_minutes < 30 or new.daily_goal_minutes > 480) then
    raise exception 'Daily goal must be between 30 and 480 whole minutes';
  end if;
  return new;
end;
$fn$;

create function public.guard_weekly_daily_goal_change()
returns trigger language plpgsql security invoker set search_path = ''
as $fn$
declare v_user uuid := auth.uid(); v_last timestamptz; v_profile public.profiles%rowtype;
begin
  if v_user is null or new.user_id is distinct from v_user then raise exception 'Not authenticated'; end if;
  -- Same lock order as scheduling and session completion, including direct REST writes.
  select * into v_profile from public.profiles where id = v_user for update;
  if not found then raise exception 'Profile not found'; end if;
  if v_profile.onboarding_completed is not true then raise exception 'Finish onboarding first'; end if;
  if new.goal_minutes is null or new.goal_minutes < 30 or new.goal_minutes > 480 then
    raise exception 'Daily goal must be between 30 and 480 whole minutes';
  end if;
  if new.effective_date <> (statement_timestamp() at time zone v_profile.timezone)::date + 1 then
    raise exception 'Goal changes start on the next local day';
  end if;
  select max(updated_at) into v_last from public.daily_goal_changes where user_id = v_user;
  if v_last is not null and statement_timestamp() < v_last + interval '168 hours' then
    raise exception using message = 'Daily goal can only be changed once every seven days', errcode = 'P0001';
  end if;
  -- The client cannot backdate the cooldown or move another historical schedule.
  if tg_op = 'UPDATE' and (new.user_id is distinct from old.user_id or new.effective_date is distinct from old.effective_date) then
    raise exception 'Cannot move goal history';
  end if;
  new.updated_at := statement_timestamp();
  return new;
end;
$fn$;
revoke all on function public.guard_weekly_daily_goal_change() from public, anon, authenticated;
create trigger guard_weekly_daily_goal_change before insert or update on public.daily_goal_changes
  for each row execute function public.guard_weekly_daily_goal_change();

create or replace function public.get_daily_goal_settings()
returns jsonb language plpgsql security invoker set search_path = ''
as $fn$
declare v_user uuid := auth.uid(); v_profile public.profiles%rowtype; v_today date; v_next timestamptz;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;
  select * into v_profile from public.profiles where id = v_user;
  if not found then raise exception 'Profile not found'; end if;
  v_today := (statement_timestamp() at time zone v_profile.timezone)::date;
  select max(updated_at) + interval '168 hours' into v_next from public.daily_goal_changes where user_id = v_user;
  return jsonb_build_object(
    'user_id', v_user, 'local_date', v_today, 'timezone', v_profile.timezone,
    'today_goal_minutes', public.daily_goal_for_date(v_today),
    'next_goal_minutes', public.daily_goal_for_date(v_today + 1),
    'next_effective_date', v_today + 1,
    'scheduling_available', v_profile.onboarding_completed,
    'weekly_limit_available', true,
    'can_change_goal', v_profile.onboarding_completed and (v_next is null or statement_timestamp() >= v_next),
    'next_change_at', v_next,
    'pending', exists(select 1 from public.daily_goal_changes where user_id = v_user and effective_date = v_today + 1)
  );
end;
$fn$;

create or replace function public.schedule_daily_goal(p_goal_minutes integer)
returns jsonb language plpgsql security invoker set search_path = ''
as $fn$
declare v_user uuid := auth.uid(); v_profile public.profiles%rowtype; v_effective date;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;
  if p_goal_minutes is null or p_goal_minutes < 30 or p_goal_minutes > 480 then
    raise exception 'Daily goal must be between 30 and 480 whole minutes';
  end if;
  select * into v_profile from public.profiles where id = v_user for update;
  if not found then raise exception 'Profile not found'; end if;
  if v_profile.onboarding_completed is not true then raise exception 'Finish onboarding first'; end if;
  v_effective := (statement_timestamp() at time zone v_profile.timezone)::date + 1;
  insert into public.daily_goal_changes(user_id, effective_date, goal_minutes)
    values (v_user, v_effective, p_goal_minutes);
  return public.get_daily_goal_settings();
end;
$fn$;
revoke all on function public.get_daily_goal_settings() from public, anon;
revoke all on function public.schedule_daily_goal(integer) from public, anon;
grant execute on function public.get_daily_goal_settings() to authenticated;
grant execute on function public.schedule_daily_goal(integer) to authenticated;
commit;
