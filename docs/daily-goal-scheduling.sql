-- REVIEWED LOCAL PROPOSAL ONLY. Not applied to any database.
-- Apply to a disposable local database first, after docs/session-seconds.sql.
begin;
create table public.daily_goal_changes (
  user_id uuid not null references public.profiles(id) on delete cascade,
  effective_date date not null,
  goal_minutes integer not null check (goal_minutes between 15 and 480),
  updated_at timestamptz not null default statement_timestamp(),
  primary key (user_id, effective_date)
);
alter table public.daily_goal_changes enable row level security;
revoke all on public.daily_goal_changes from public, anon, authenticated;
grant select, insert, update on public.daily_goal_changes to authenticated;
create policy own_goal_read on public.daily_goal_changes for select to authenticated
  using (user_id = (select auth.uid()));
create policy own_next_day_goal_insert on public.daily_goal_changes for insert to authenticated
  with check (user_id = (select auth.uid()) and effective_date =
    (select (statement_timestamp() at time zone p.timezone)::date + 1
      from public.profiles p where p.id = (select auth.uid()) and p.onboarding_completed));
create policy own_next_day_goal_update on public.daily_goal_changes for update to authenticated
  using (user_id = (select auth.uid()) and effective_date =
    (select (statement_timestamp() at time zone p.timezone)::date + 1
      from public.profiles p where p.id = (select auth.uid()) and p.onboarding_completed))
  with check (user_id = (select auth.uid()) and effective_date =
    (select (statement_timestamp() at time zone p.timezone)::date + 1
      from public.profiles p where p.id = (select auth.uid()) and p.onboarding_completed));

-- Prevent older clients from bypassing next-day scheduling by editing the baseline.
create function public.guard_onboarded_daily_goal()
returns trigger language plpgsql security invoker set search_path = ''
as $fn$
begin
  if old.onboarding_completed and new.daily_goal_minutes is distinct from old.daily_goal_minutes then
    raise exception 'Use schedule_daily_goal after onboarding';
  end if;
  if new.daily_goal_minutes is null or new.daily_goal_minutes < 15 or new.daily_goal_minutes > 480 then
    raise exception 'Daily goal must be between 15 and 480 whole minutes';
  end if;
  return new;
end;
$fn$;
revoke all on function public.guard_onboarded_daily_goal() from public, anon, authenticated;
create trigger guard_onboarded_daily_goal before update of daily_goal_minutes on public.profiles
  for each row execute function public.guard_onboarded_daily_goal();

create function public.daily_goal_for_date(p_day date)
returns integer language plpgsql stable security invoker set search_path = ''
as $fn$
declare v_user uuid := auth.uid(); v_goal integer;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;
  -- A stored daily target always wins, including historical days.
  select d.goal_minutes into v_goal from public.daily_progress d
    where d.user_id = v_user and d.progress_date = p_day;
  if found then return v_goal; end if;
  select g.goal_minutes into v_goal from public.daily_goal_changes g
    where g.user_id = v_user and g.effective_date <= p_day
    order by g.effective_date desc limit 1;
  if found then return v_goal; end if;
  select p.daily_goal_minutes into v_goal from public.profiles p where p.id = v_user;
  if not found then raise exception 'Profile not found'; end if;
  return v_goal;
end;
$fn$;

create function public.get_daily_goal_settings()
returns jsonb language plpgsql security invoker set search_path = ''
as $fn$
declare v_user uuid := auth.uid(); v_profile public.profiles%rowtype; v_today date;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;
  select * into v_profile from public.profiles where id = v_user;
  if not found then raise exception 'Profile not found'; end if;
  v_today := (statement_timestamp() at time zone v_profile.timezone)::date;
  return jsonb_build_object(
    'user_id', v_user, 'local_date', v_today, 'timezone', v_profile.timezone,
    'today_goal_minutes', public.daily_goal_for_date(v_today),
    'next_goal_minutes', public.daily_goal_for_date(v_today + 1),
    'next_effective_date', v_today + 1,
    'scheduling_available', v_profile.onboarding_completed,
    'pending', exists(select 1 from public.daily_goal_changes
      where user_id = v_user and effective_date = v_today + 1)
  );
end;
$fn$;

create function public.schedule_daily_goal(p_goal_minutes integer)
returns jsonb language plpgsql security invoker set search_path = ''
as $fn$
declare v_user uuid := auth.uid(); v_profile public.profiles%rowtype; v_effective date;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;
  if p_goal_minutes is null or p_goal_minutes < 15 or p_goal_minutes > 480 then
    raise exception 'Daily goal must be between 15 and 480 whole minutes';
  end if;
  -- Serialise with session completion, which also locks this profile.
  select * into v_profile from public.profiles where id = v_user for update;
  if not found then raise exception 'Profile not found'; end if;
  if v_profile.onboarding_completed is not true then raise exception 'Finish onboarding first'; end if;
  v_effective := (statement_timestamp() at time zone v_profile.timezone)::date + 1;
  insert into public.daily_goal_changes(user_id, effective_date, goal_minutes)
    values (v_user, v_effective, p_goal_minutes)
    on conflict (user_id, effective_date) do update
      set goal_minutes = excluded.goal_minutes, updated_at = statement_timestamp();
  -- No writes to profiles, daily_progress, activity_sessions, XP, gold or streaks.
  return public.get_daily_goal_settings();
end;
$fn$;
revoke all on function public.daily_goal_for_date(date) from public, anon;
revoke all on function public.get_daily_goal_settings() from public, anon;
revoke all on function public.schedule_daily_goal(integer) from public, anon;
grant execute on function public.daily_goal_for_date(date) to authenticated;
grant execute on function public.get_daily_goal_settings() to authenticated;
grant execute on function public.schedule_daily_goal(integer) to authenticated;

CREATE OR REPLACE FUNCTION public.complete_activity_session(p_session_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := auth.uid();

  v_session public.activity_sessions%rowtype;
  v_profile public.profiles%rowtype;

  v_local_date date;

  v_elapsed integer;
  v_awarded_seconds integer;
  v_minutes integer;

  v_xp integer;
  v_gold integer;

  v_new_xp integer;
  v_new_level integer;
  v_required_xp integer;
  v_leveled_up boolean := false;

  v_before_daily_minutes integer := 0;
  v_after_daily_minutes integer;

  v_goal_minutes integer;
  v_goal_was_completed boolean := false;
  v_goal_now_completed boolean := false;

  v_new_streak integer;

  v_subject public.subjects%rowtype;
  v_subject_xp integer;
  v_subject_level integer;
  v_subject_required integer;

  v_task_exists boolean;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select *
  into v_session
  from public.activity_sessions
  where id = p_session_id
    and user_id = v_user_id
  for update;

  if not found then
    raise exception 'Session not found';
  end if;

  -- Idempotent retry protection
  if v_session.status = 'completed' then
    select *
    into v_profile
    from public.profiles
    where id = v_user_id;

    return jsonb_build_object(
      'already_completed', true,
      'session_id', v_session.id,
      'duration_seconds', v_session.duration_seconds,
      'minutes', floor(v_session.duration_seconds / 60.0)::integer,
      'xp_earned', v_session.xp_earned,
      'gold_earned', v_session.gold_earned,
      'level', v_profile.level,
      'current_xp', v_profile.current_xp,
      'gold', v_profile.gold,
      'streak_count', v_profile.streak_count
    );
  end if;

  if v_session.status not in ('active', 'paused') then
    raise exception 'Session cannot be completed';
  end if;

  select *
  into v_profile
  from public.profiles
  where id = v_user_id
  for update;

  if not found then
    raise exception 'Profile not found';
  end if;

  v_local_date := (
    now() at time zone v_profile.timezone
  )::date;

  -- Calculate actual server-side elapsed time
  v_elapsed := v_session.elapsed_seconds;

  if v_session.status = 'active' then
    v_elapsed :=
      v_elapsed
      + greatest(
          0,
          floor(
            extract(epoch from (now() - v_session.last_resumed_at))
          )::integer
        );
  end if;

  -- Do not allow a client to claim a session before its target duration
  if v_elapsed < v_session.target_duration_seconds then
    raise exception 'Session has not reached its target duration yet';
  end if;

  -- Reward at most the planned duration
  v_awarded_seconds := least(
    v_elapsed,
    v_session.target_duration_seconds
  );

  -- Whole completed minutes only; sub-minute sessions retain seconds but earn no rewards.
  v_minutes := floor(v_awarded_seconds / 60.0)::integer;

  -- Current LifeRPG economy:
  -- 1 minute = 1 XP
  -- 1 minute = 5 Gold
  v_xp := v_minutes;
  v_gold := v_minutes * 5;


  -- ==========================================================
  -- CHARACTER LEVEL / XP
  -- ==========================================================

  v_new_xp := v_profile.current_xp + v_xp;
  v_new_level := v_profile.level;

  v_required_xp := floor(
    100 * power(v_new_level, 1.5)
  )::integer;

  while v_new_xp >= v_required_xp loop
    v_new_xp := v_new_xp - v_required_xp;
    v_new_level := v_new_level + 1;
    v_leveled_up := true;

    v_required_xp := floor(
      100 * power(v_new_level, 1.5)
    )::integer;
  end loop;


  -- ==========================================================
  -- DAILY GOAL
  -- ==========================================================

  v_goal_minutes := public.daily_goal_for_date(v_local_date);

  select
    completed_minutes,
    goal_completed
  into
    v_before_daily_minutes,
    v_goal_was_completed
  from public.daily_progress
  where user_id = v_user_id
    and progress_date = v_local_date
  for update;

  if not found then
    v_before_daily_minutes := 0;
    v_goal_was_completed := false;

    insert into public.daily_progress (
      user_id,
      progress_date,
      goal_minutes,
      completed_minutes,
      goal_completed
    )
    values (
      v_user_id,
      v_local_date,
      v_goal_minutes,
      0,
      false
    );
  end if;

  v_after_daily_minutes :=
    v_before_daily_minutes + v_minutes;

  v_goal_now_completed :=
    v_after_daily_minutes >= v_goal_minutes;

  if v_goal_now_completed and not v_goal_was_completed then
    update public.daily_progress
    set
      completed_minutes = v_after_daily_minutes,
      goal_completed = true,
      goal_completed_at = now()
    where user_id = v_user_id
      and progress_date = v_local_date;

    -- Streak is based on completing the Daily Goal,
    -- not merely doing any session.
    if v_profile.last_goal_completed_date = v_local_date - 1 then
      v_new_streak := v_profile.streak_count + 1;
    else
      v_new_streak := 1;
    end if;

  else
    update public.daily_progress
    set
      completed_minutes = v_after_daily_minutes
    where user_id = v_user_id
      and progress_date = v_local_date;

    v_new_streak := v_profile.streak_count;
  end if;


  -- ==========================================================
  -- SUBJECT / ATTRIBUTE XP
  -- ==========================================================

  if v_session.subject_id is not null then
    select *
    into v_subject
    from public.subjects
    where id = v_session.subject_id
      and user_id = v_user_id
    for update;

    if found then
      v_subject_xp := v_subject.current_xp + v_xp;
      v_subject_level := v_subject.level;
      v_subject_required := v_subject_level * 50;

      while v_subject_xp >= v_subject_required loop
        v_subject_xp := v_subject_xp - v_subject_required;
        v_subject_level := v_subject_level + 1;
        v_subject_required := v_subject_level * 50;
      end loop;

      update public.subjects
      set
        current_xp = v_subject_xp,
        level = v_subject_level
      where id = v_subject.id
        and user_id = v_user_id;
    end if;
  end if;


  -- ==========================================================
  -- LINKED QUEST
  -- ==========================================================

  if v_session.task_id is not null then
    select exists (
      select 1
      from public.tasks
      where id = v_session.task_id
        and user_id = v_user_id
    )
    into v_task_exists;

    if v_task_exists then
      update public.tasks
      set
        is_completed = true,
        last_completed_date = v_local_date,
        completed_at = now(),
        updated_at = now()
      where id = v_session.task_id
        and user_id = v_user_id
        and (
          is_completed = false
          or is_recurring = true
        );
    end if;
  end if;


  -- ==========================================================
  -- SAVE SESSION RESULT
  -- ==========================================================

  update public.activity_sessions
  set
    duration_seconds = v_awarded_seconds,
    status = 'completed',
    completed_at = now(),
    xp_earned = v_xp,
    gold_earned = v_gold,
    elapsed_seconds = v_awarded_seconds
  where id = v_session.id
    and user_id = v_user_id;


  -- ==========================================================
  -- SAVE PROFILE PROGRESSION
  -- ==========================================================

  update public.profiles
  set
    level = v_new_level,
    current_xp = v_new_xp,
    gold = v_profile.gold + v_gold,
    streak_count = v_new_streak,
    last_goal_completed_date =
      case
        when v_goal_now_completed
          then v_local_date
        else last_goal_completed_date
      end,
    last_active_date = v_local_date
  where id = v_user_id;


  return jsonb_build_object(
    'already_completed', false,
    'session_id', v_session.id,
    'duration_seconds', v_awarded_seconds,
    'minutes', v_minutes,
    'xp_earned', v_xp,
    'gold_earned', v_gold,
    'level', v_new_level,
    'current_xp', v_new_xp,
    'gold', v_profile.gold + v_gold,
    'leveled_up', v_leveled_up,
    'daily_goal_minutes', v_goal_minutes,
    'daily_completed_minutes', v_after_daily_minutes,
    'daily_goal_completed', v_goal_now_completed,
    'streak_count', v_new_streak
  );
end;
$function$
;


revoke all on function public.complete_activity_session(uuid) from public, anon;
grant execute on function public.complete_activity_session(uuid) to authenticated;
commit;
