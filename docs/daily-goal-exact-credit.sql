-- REVIEWED PROPOSAL. No live application is authorised by this file.
-- Built for the exact-seconds completion contract inspected on 2026-10-07.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
-- Apply during an agreed write pause; retain all existing rows and balances.
lock table public.activity_sessions, public.profiles, public.daily_progress in access exclusive mode;
create table public.daily_goal_changes (
  user_id uuid not null references public.profiles(id) on delete cascade,
  effective_date date not null,
  goal_minutes integer not null check (goal_minutes between 30 and 480),
  updated_at timestamptz not null default statement_timestamp(),
  primary key(user_id,effective_date)
);
alter table public.daily_goal_changes enable row level security;
revoke all on public.daily_goal_changes from public, anon, authenticated;
grant select on public.daily_goal_changes to authenticated;
create policy own_goal_read on public.daily_goal_changes for select to authenticated using (user_id=(select auth.uid()));
create index daily_goal_changes_latest_change on public.daily_goal_changes(user_id,updated_at desc);

create function public.daily_goal_for_date(p_day date) returns integer
language plpgsql stable security invoker set search_path='' as $fn$
declare v_user uuid:=auth.uid(); v_goal integer;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;
  select goal_minutes into v_goal from public.daily_progress where user_id=v_user and progress_date=p_day;
  if found then return v_goal; end if;
  select goal_minutes into v_goal from public.daily_goal_changes where user_id=v_user and effective_date<=p_day order by effective_date desc limit 1;
  if found then return v_goal; end if;
  select daily_goal_minutes into v_goal from public.profiles where id=v_user;
  if not found then raise exception 'Profile not found'; end if;
  return v_goal;
end;$fn$;
create function public.get_daily_goal_settings() returns jsonb
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
    'next_effective_date',v_today+1,'scheduling_available',v_profile.onboarding_completed,'weekly_limit_available',true,
    'can_change_goal',v_profile.onboarding_completed and (v_next is null or statement_timestamp()>=v_next),
    'next_change_at',v_next,'pending',exists(select 1 from public.daily_goal_changes where user_id=v_user and effective_date=v_today+1));
end;$fn$;
-- The scheduler alone may write its ledger. It locks the authenticated user's
-- profile in the same order as completion, and never edits the baseline or history.
create function public.schedule_daily_goal(p_goal_minutes integer) returns jsonb
language plpgsql security definer set search_path='' as $fn$
declare v_user uuid:=auth.uid(); v_profile public.profiles%rowtype; v_last timestamptz; v_day date;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;
  if p_goal_minutes is null or p_goal_minutes<30 or p_goal_minutes>480 then raise exception 'Choose 30 to 480 minutes'; end if;
  select * into v_profile from public.profiles where id=v_user for update;
  if not found or not v_profile.onboarding_completed then raise exception 'Finish onboarding first'; end if;
  select max(updated_at) into v_last from public.daily_goal_changes where user_id=v_user;
  if v_last is not null and statement_timestamp()<v_last+interval '168 hours' then raise exception 'Change your goal once every seven days'; end if;
  v_day:=(statement_timestamp() at time zone v_profile.timezone)::date+1;
  insert into public.daily_goal_changes(user_id,effective_date,goal_minutes) values(v_user,v_day,p_goal_minutes);
  return public.get_daily_goal_settings();
end;$fn$;
create function public.guard_onboarded_daily_goal() returns trigger
language plpgsql security invoker set search_path='' as $fn$
begin
  if old.onboarding_completed and new.daily_goal_minutes is distinct from old.daily_goal_minutes then raise exception 'Use schedule_daily_goal'; end if;
  if new.daily_goal_minutes is distinct from old.daily_goal_minutes and (new.daily_goal_minutes is null or new.daily_goal_minutes<30 or new.daily_goal_minutes>480) then raise exception 'Choose 30 to 480 minutes'; end if;
  return new;
end;$fn$;
create trigger guard_onboarded_daily_goal before update of daily_goal_minutes on public.profiles for each row execute function public.guard_onboarded_daily_goal();
revoke all on function public.daily_goal_for_date(date),public.get_daily_goal_settings(),public.schedule_daily_goal(integer),public.guard_onboarded_daily_goal() from public,anon,authenticated;
grant execute on function public.daily_goal_for_date(date),public.get_daily_goal_settings(),public.schedule_daily_goal(integer) to authenticated;

-- Patch only goal selection in the current definition. Abort on any drift.
do $patch$
declare v_source text; v_after text;
begin
  v_source:=pg_get_functiondef('public.complete_activity_session(uuid)'::regprocedure);
  if md5(v_source)<>'f1610035d1eaeddcd2a9108eadcd8e33' then raise exception 'Completion contract changed. Re-review before applying'; end if;
  if (length(v_source)-length(replace(v_source,'v_goal_minutes := v_profile.daily_goal_minutes;','')))/length('v_goal_minutes := v_profile.daily_goal_minutes;')<>2 then raise exception 'Unexpected goal selection'; end if;
  v_after:=replace(v_source,'v_goal_minutes := v_profile.daily_goal_minutes;','v_goal_minutes := public.daily_goal_for_date(v_local_date);');
  execute v_after;
end;$patch$;
notify pgrst, 'reload schema';
commit;
