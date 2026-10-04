-- UNAPPLIED PROPOSAL. Standalone against the live contract snapshot, NOT the goal proposals.
-- Rehearse locally and reconcile live definitions/permissions before deployment.
-- Execute as one transaction. Strong locks establish the completion boundary;
-- in-flight legacy completions finish before baseline capture.
begin;
lock table public.profiles, public.subjects, public.daily_progress, public.activity_sessions
in access exclusive mode;
alter table public.profiles add column xp_bank_seconds integer not null default 0
  check (xp_bank_seconds between 0 and 59);
alter table public.subjects add column xp_bank_seconds integer not null default 0
  check (xp_bank_seconds between 0 and 59);
alter table public.daily_progress add column completed_seconds bigint check (completed_seconds >= 0);
alter table public.daily_progress add column credit_version integer check (credit_version in (0,1));
alter table public.activity_sessions add column credit_version integer check (credit_version = 1);
alter table public.activity_sessions add column credit_result jsonb;
-- Historical credited time is NOT reconstructed from exact analytics durations.
-- This preserves old totals/goals; first new completion upgrades only its local day.
update public.daily_progress set completed_seconds = completed_minutes::bigint * 60, credit_version = 0;
-- Do not expose new writable progression fields via existing table-level grants.
-- Abort rather than silently widening client access. Review conflicting grants first.
do $guard$
declare client_role text;
begin
 foreach client_role in array array['anon','authenticated'] loop
  if has_column_privilege(client_role,'public.profiles','xp_bank_seconds','UPDATE')
    or has_column_privilege(client_role,'public.subjects','xp_bank_seconds','UPDATE')
    or has_column_privilege(client_role,'public.daily_progress','completed_seconds','UPDATE')
    or has_column_privilege(client_role,'public.activity_sessions','credit_result','UPDATE')
    or has_column_privilege(client_role,'public.profiles','xp_bank_seconds','INSERT')
    or has_column_privilege(client_role,'public.subjects','xp_bank_seconds','INSERT')
    or has_column_privilege(client_role,'public.daily_progress','completed_seconds','INSERT')
    or has_column_privilege(client_role,'public.activity_sessions','credit_result','INSERT') then
    raise exception 'Review client progression write grants before applying exact credit';
  end if;
 end loop;
end;
$guard$;
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
  v_before_seconds bigint;
  v_after_seconds bigint;
  v_area_award integer := null;
  v_area_bank integer := null;
  v_character_bank integer;
  v_result jsonb;
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
    if v_session.credit_result is not null then
      return v_session.credit_result || jsonb_build_object('already_completed', true, 'goal_reached_now', false);
    end if;
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

  -- Compatibility minutes field; exact seconds are credited below.
  v_minutes := floor(v_awarded_seconds / 60.0)::integer;

  -- Bank exact seconds at 60 seconds per character XP.
  -- Gold history is preserved; new completions award no Gold.
  v_xp := (v_profile.xp_bank_seconds + v_awarded_seconds) / 60;
  v_character_bank := (v_profile.xp_bank_seconds + v_awarded_seconds) % 60;
  v_gold := 0;


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
    goal_completed,
    goal_minutes,
    coalesce(completed_seconds, completed_minutes::bigint * 60)
  into
    v_before_daily_minutes,
    v_goal_was_completed,
    v_goal_minutes,
    v_before_seconds
  from public.daily_progress
  where user_id = v_user_id
    and progress_date = v_local_date
  for update;

  if not found then
    v_goal_minutes := v_profile.daily_goal_minutes;
    v_before_seconds := 0;
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

  v_after_seconds := v_before_seconds + v_awarded_seconds;
  v_after_daily_minutes := (v_after_seconds / 60)::integer;
  update public.daily_progress set completed_seconds = v_after_seconds, credit_version = 1
  where user_id = v_user_id and progress_date = v_local_date;

  v_goal_now_completed :=
    v_goal_was_completed or v_after_seconds >= v_goal_minutes::bigint * 60;

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
      v_area_award := (v_subject.xp_bank_seconds + v_awarded_seconds) / 60;
      v_area_bank := (v_subject.xp_bank_seconds + v_awarded_seconds) % 60;
      v_subject_xp := v_subject.current_xp + v_area_award;
      v_subject_level := v_subject.level;
      v_subject_required := v_subject_level * 50;

      while v_subject_xp >= v_subject_required loop
        v_subject_xp := v_subject_xp - v_subject_required;
        v_subject_level := v_subject_level + 1;
        v_subject_required := v_subject_level * 50;
      end loop;

      update public.subjects
      set
        xp_bank_seconds = v_area_bank,
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
    xp_bank_seconds = v_character_bank,
    level = v_new_level,
    current_xp = v_new_xp,
    gold = v_profile.gold + v_gold,
    streak_count = v_new_streak,
    last_goal_completed_date =
      case
        when v_goal_now_completed and not v_goal_was_completed
          then v_local_date
        else last_goal_completed_date
      end,
    last_active_date = v_local_date
  where id = v_user_id;


  v_result := jsonb_build_object(
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
    'streak_count', v_new_streak,
    'credit_version', 1,
    'character_xp_earned', v_xp,
    'area_xp_earned', v_area_award,
    'character_remainder_seconds', v_character_bank,
    'area_remainder_seconds', v_area_bank,
    'daily_completed_seconds', v_after_seconds,
    'credited_date', v_local_date,
    'goal_reached_now', v_goal_now_completed and not v_goal_was_completed
  );
  update public.activity_sessions set credit_version = 1, credit_result = v_result
  where id = v_session.id and user_id = v_user_id;
  return v_result;
end;
$function$;

revoke all on function public.complete_activity_session(uuid) from public, anon;
grant execute on function public.complete_activity_session(uuid) to authenticated;
commit;
