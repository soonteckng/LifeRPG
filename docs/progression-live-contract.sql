-- Read-only schema snapshot 2026-10-04. No account rows.
CREATE OR REPLACE FUNCTION public.cancel_activity_session(p_session_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  update public.activity_sessions
  set
    status = 'cancelled',
    completed_at = now()
  where id = p_session_id
    and user_id = v_user_id
    and status in ('active', 'paused');

  if not found then
    raise exception 'Open session not found';
  end if;
end;
$function$;
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

  v_goal_minutes := v_profile.daily_goal_minutes;

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
$function$;
CREATE OR REPLACE FUNCTION public.pause_activity_session(p_session_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  update public.activity_sessions
  set
    elapsed_seconds =
      elapsed_seconds
      + greatest(
          0,
          floor(
            extract(epoch from (now() - last_resumed_at))
          )::integer
        ),
    status = 'paused',
    paused_at = now(),
    last_resumed_at = null
  where id = p_session_id
    and user_id = v_user_id
    and status = 'active';

  if not found then
    raise exception 'Active session not found';
  end if;
end;
$function$;
CREATE OR REPLACE FUNCTION public.resume_activity_session(p_session_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  update public.activity_sessions
  set
    status = 'active',
    paused_at = null,
    last_resumed_at = now()
  where id = p_session_id
    and user_id = v_user_id
    and status = 'paused';

  if not found then
    raise exception 'Paused session not found';
  end if;
end;
$function$;
CREATE OR REPLACE FUNCTION public.start_activity_session(p_target_duration_seconds integer, p_activity_type text DEFAULT 'general'::text, p_task_id bigint DEFAULT NULL::bigint, p_subject_id bigint DEFAULT NULL::bigint, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_local_date date;
  v_session_id uuid;
  v_task_valid boolean;
  v_subject_valid boolean;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_target_duration_seconds is null or p_target_duration_seconds < 1
     or p_target_duration_seconds > 28800 then
    raise exception 'Session duration must be between 1 second and 8 hours';
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

  if exists (
    select 1
    from public.activity_sessions
    where user_id = v_user_id
      and status in ('active', 'paused')
  ) then
    raise exception 'You already have an unfinished session';
  end if;

  if p_task_id is not null then
    select exists (
      select 1
      from public.tasks
      where id = p_task_id
        and user_id = v_user_id
        and (
          is_completed = false
          or (
            is_recurring = true
            and (
              last_completed_date is null
              or last_completed_date <> v_local_date
            )
          )
        )
    )
    into v_task_valid;

    if not v_task_valid then
      raise exception 'Task is invalid or already completed';
    end if;
  end if;

  if p_subject_id is not null then
    select exists (
      select 1
      from public.subjects
      where id = p_subject_id
        and user_id = v_user_id
    )
    into v_subject_valid;

    if not v_subject_valid then
      raise exception 'Subject is invalid';
    end if;
  end if;

  insert into public.activity_sessions (
    user_id,
    task_id,
    subject_id,
    activity_type,
    target_duration_seconds,
    duration_seconds,
    status,
    notes,
    xp_earned,
    gold_earned,
    started_at,
    last_resumed_at
  )
  values (
    v_user_id,
    p_task_id,
    p_subject_id,
    coalesce(nullif(trim(p_activity_type), ''), 'general'),
    p_target_duration_seconds,
    0,
    'active',
    p_notes,
    0,
    0,
    now(),
    now()
  )
  returning id into v_session_id;

  return v_session_id;
end;
$function$;