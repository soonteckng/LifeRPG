-- Round 47: small server fixes, no data changed.
-- 1. The intro's two save functions are for signed-in accounts only.
-- 2. The intro's checks match the app: daily goal 30 to 480 minutes, name up to 15 characters.
-- 3. Squads show the same streak as Home and Progress: focus days in a row
--    (any finished session), counted in each member's own time zone.
-- 4. Developer accounts can change their daily goal any time (it still starts the next day).

-- 1 + 2 -------------------------------------------------------------------
create or replace function public.complete_onboarding(p_username text, p_avatar text, p_class_title text, p_daily_goal_minutes integer)
 returns profiles
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_profile public.profiles;
  v_name text := regexp_replace(btrim(coalesce(p_username, '')), '\s+', ' ', 'g');
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if v_name = '' then
    raise exception 'Username is required';
  end if;

  if char_length(v_name) > 15 then
    raise exception 'Use up to 15 characters';
  end if;

  if v_name ~ '[@[:cntrl:]]' then
    raise exception 'Username cannot contain @';
  end if;

  if p_daily_goal_minutes is null
     or p_daily_goal_minutes < 30
     or p_daily_goal_minutes > 480 then
    raise exception 'Daily goal must be between 30 and 480 minutes';
  end if;

  update public.profiles
  set
    username = v_name,
    username_claimed = true,
    avatar = coalesce(p_avatar, '🧙‍♂️'),
    class_title = coalesce(
      nullif(trim(p_class_title), ''),
      'Adventurer'
    ),
    daily_goal_minutes = p_daily_goal_minutes,
    timezone = 'Asia/Kuala_Lumpur'
  where id = auth.uid()
  returning *
  into v_profile;

  if not found then
    raise exception 'Profile not found';
  end if;

  return v_profile;
end;
$function$;

revoke all on function public.complete_onboarding(text, text, text, integer) from public, anon;
grant execute on function public.complete_onboarding(text, text, text, integer) to authenticated;
revoke all on function public.finish_onboarding() from public, anon;
grant execute on function public.finish_onboarding() to authenticated;

-- 3 -----------------------------------------------------------------------
-- Days in a row with a finished session, ending today or yesterday, in the
-- member's own time zone. The same rule as the app's Home and Progress.
create or replace function liferpg_squad_private.focus_streak(p_user uuid, p_time_zone text)
 returns integer
 language sql
 stable
 security definer
 set search_path to ''
as $function$
  with days as (
    select distinct (a.completed_at at time zone p_time_zone)::date as day
    from public.activity_sessions a
    where a.user_id = p_user and a.status = 'completed' and a.duration_seconds > 0 and a.completed_at <= now()
  ), ordered as (
    select day, day + (row_number() over (order by day desc))::int as run from days
  ), latest as (
    select day, run from ordered order by day desc limit 1
  )
  select coalesce((
    select count(*)::int from ordered, latest
    where ordered.run = latest.run
      and latest.day >= (now() at time zone p_time_zone)::date - 1
  ), 0)
$function$;
revoke all on function liferpg_squad_private.focus_streak(uuid, text) from public, anon, authenticated;

create or replace function liferpg_squad_private.squad_json(p_squad uuid, p_viewer uuid, p_since timestamp with time zone)
 returns jsonb
 language sql
 stable security definer
 set search_path to ''
as $function$
  select jsonb_build_object('id', s.id, 'name', s.name, 'code', s.code, 'ownerIsYou', s.owner_id = p_viewer, 'goalMinutes', s.weekly_goal_minutes,
    'members', coalesce((select jsonb_agg(jsonb_build_object(
        'id', m.user_id, 'isYou', m.user_id = p_viewer, 'isOwner', m.user_id = s.owner_id,
        'name', coalesce(nullif(btrim(p.username), ''), 'Friend'), 'avatar', coalesce(p.avatar, ''), 'level', coalesce(p.level, 1),
        'streak', liferpg_squad_private.focus_streak(m.user_id, coalesce(nullif(p.timezone, ''), 'Asia/Kuala_Lumpur')),
        'weekSeconds', coalesce((select sum(a.duration_seconds) from public.activity_sessions a
          where a.user_id = m.user_id and a.status = 'completed' and a.completed_at >= p_since), 0),
        'focusingNow', exists(select 1 from public.activity_sessions a where a.user_id = m.user_id and a.status = 'active' and a.started_at > now() - interval '10 hours'))
      order by m.joined_at, m.user_id)
      from liferpg_squad_private.members m left join public.profiles p on p.id = m.user_id where m.squad_id = s.id and m.left_at is null), '[]'::jsonb))
  from liferpg_squad_private.squads s where s.id = p_squad
$function$;

-- 4 -----------------------------------------------------------------------
create or replace function public.schedule_daily_goal(p_goal_minutes integer)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare v_user uuid:=auth.uid(); v_profile public.profiles%rowtype; v_last timestamptz; v_day date;
  v_developer boolean;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;
  if p_goal_minutes is null or p_goal_minutes<30 or p_goal_minutes>480 then raise exception 'Choose 30 to 480 minutes'; end if;
  -- A row lock cannot refresh an older ledger snapshot under repeatable read.
  -- Ordinary PostgREST calls use read committed, which rereads after this lock.
  if current_setting('transaction_isolation')<>'read committed' then raise exception 'Goal scheduling requires read committed'; end if;
  select * into v_profile from public.profiles where id=v_user for update;
  if not found or not v_profile.onboarding_completed then raise exception 'Finish onboarding first'; end if;
  v_developer := exists(select 1 from liferpg_auth_private.developers where user_id=v_user);
  select max(updated_at) into v_last from public.daily_goal_changes where user_id=v_user;
  if not v_developer and v_last is not null and statement_timestamp()<v_last+interval '168 hours' then raise exception 'Change your goal once every seven days'; end if;
  v_day:=(statement_timestamp() at time zone v_profile.timezone)::date+1;
  -- Only a developer can reach the same day twice (everyone else waits seven days).
  insert into public.daily_goal_changes(user_id,effective_date,goal_minutes) values(v_user,v_day,p_goal_minutes)
    on conflict (user_id,effective_date) do update set goal_minutes=excluded.goal_minutes, updated_at=statement_timestamp();
  return public.get_daily_goal_settings();
end;$function$;

create or replace function public.get_daily_goal_settings()
 returns jsonb
 language plpgsql
 stable
 set search_path to ''
as $function$
declare v_user uuid:=auth.uid(); v_profile public.profiles%rowtype; v_today date; v_next timestamptz; v_developer boolean;
begin
  if v_user is null then raise exception 'Not authenticated'; end if;
  select * into v_profile from public.profiles where id=v_user;
  if not found then raise exception 'Profile not found'; end if;
  v_today:=(statement_timestamp() at time zone v_profile.timezone)::date;
  v_developer := public.is_developer_v1();
  select max(updated_at)+interval '168 hours' into v_next from public.daily_goal_changes where user_id=v_user;
  if v_developer then v_next := null; end if;
  return jsonb_build_object('user_id',v_user,'local_date',v_today,'timezone',v_profile.timezone,
    'today_goal_minutes',public.daily_goal_for_date(v_today),'next_goal_minutes',public.daily_goal_for_date(v_today+1),
    'next_effective_date',v_today+1,'scheduling_available',v_profile.onboarding_completed,'weekly_limit_available',true,
    'can_change_goal',v_profile.onboarding_completed and (v_next is null or statement_timestamp()>=v_next),
    'next_change_at',v_next,'pending',exists(select 1 from public.daily_goal_changes where user_id=v_user and effective_date=v_today+1));
end;$function$;
