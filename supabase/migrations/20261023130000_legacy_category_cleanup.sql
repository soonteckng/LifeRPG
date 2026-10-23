-- Cleanup of the old level-system leftovers.
--
-- 1. Old category names. Accounts were created with the original five
--    categories (Knowledge, General, Fitness & Health, Grooming & Vitality,
--    Life Admin), which the app only displayed under today's names. They are
--    renamed to today's names, and Grooming & Vitality (which also showed as
--    Wellbeing, giving everyone two Wellbeing categories) is folded into
--    Wellbeing: its sessions, routines, subjects and XP move across.
--    New accounts start with today's seven categories.
-- 2. The old class title ("Novice Scholar"): the intro no longer saves it and
--    new profiles no longer get it. The column itself is removed in a later
--    round, once every phone runs an app version that no longer reads it.
--
-- Nothing is lost: every session keeps its time and XP, only the category
-- name it sits under changes.

-- 1a + 1b. Each old name becomes today's name. Where today's name already
-- exists for that account, the old category is folded into it instead: its
-- sessions, routines, subjects and XP move across, then the old row goes.
do $$
declare m record; r record; v_total integer; v_bank integer; v_level integer;
begin
  for m in select * from (values
      (1, 'knowledge', 'Learning', '#79BFF2'), (2, 'general', 'Everyday focus', '#AAB3FF'),
      (3, 'life admin', 'Everyday life', '#6DD4B5'), (4, 'fitness & health', 'Wellbeing', '#F4AA88'),
      (5, 'grooming & vitality', 'Wellbeing', '#F4AA88')) as v(n, old_title, new_title, color) order by n
  loop
    for r in
      select g.id as old_id, w.id as new_id, g.user_id,
             g.level as g_level, g.current_xp as g_xp, g.xp_bank_seconds as g_bank,
             w.level as w_level, w.current_xp as w_xp, w.xp_bank_seconds as w_bank
      from public.subjects g
      join public.subjects w on w.user_id = g.user_id and w.title = m.new_title and w.id <> g.id
      where lower(btrim(g.title)) = m.old_title
    loop
      update public.activity_sessions set subject_id = r.new_id where subject_id = r.old_id and user_id = r.user_id;
      update public.tasks set subject_id = r.new_id where subject_id = r.old_id and user_id = r.user_id;
      update liferpg_routine_private.routines set focus_area_id = r.new_id where focus_area_id = r.old_id and owner_id = r.user_id;
      update liferpg_study_private.courses set focus_area_id = r.new_id where focus_area_id = r.old_id and owner_id = r.user_id;
      update liferpg_session_private.start_requests set subject_id = r.new_id where subject_id = r.old_id and user_id = r.user_id;
      -- Category levels need 50 x level XP each: add both totals, then count the levels again.
      v_bank := coalesce(r.g_bank, 0) + coalesce(r.w_bank, 0);
      v_total := 25 * r.g_level * (r.g_level - 1) + r.g_xp + 25 * r.w_level * (r.w_level - 1) + r.w_xp + v_bank / 60;
      v_bank := v_bank % 60;
      v_level := 1;
      while v_total >= v_level * 50 loop v_total := v_total - v_level * 50; v_level := v_level + 1; end loop;
      update public.subjects set level = v_level, current_xp = v_total, xp_bank_seconds = v_bank where id = r.new_id;
      delete from public.subjects where id = r.old_id and user_id = r.user_id;
    end loop;
    -- Where today's name is still free, the old row is simply renamed.
    update public.subjects s set title = m.new_title, color_code = m.color
    where lower(btrim(s.title)) = m.old_title
      and not exists (select 1 from public.subjects t where t.user_id = s.user_id and t.title = m.new_title);
  end loop;
end $$;

-- 1c. New accounts start with today's seven categories.
create or replace function public.handle_new_user()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_name text := btrim(left(btrim(regexp_replace(regexp_replace(coalesce(
    new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', ''), '[@[:cntrl:]]', '', 'g'), '\s+', ' ', 'g')), 15));
begin
  insert into public.profiles (id, username)
  values (new.id, coalesce(nullif(v_name, ''), 'Hero'));

  insert into public.subjects (user_id, title, level, current_xp, color_code)
  values
    (new.id, 'Everyday focus', 1, 0, '#AAB3FF'),
    (new.id, 'Learning', 1, 0, '#79BFF2'),
    (new.id, 'Revision', 1, 0, '#FF8A80'),
    (new.id, 'Work & projects', 1, 0, '#C1A8FA'),
    (new.id, 'Creativity', 1, 0, '#E98ABC'),
    (new.id, 'Everyday life', 1, 0, '#6DD4B5'),
    (new.id, 'Wellbeing', 1, 0, '#F4AA88');

  return new;
end;
$function$;

-- 2. The intro stops saving a class title. The parameter stays so older app
--    versions keep working; it is simply ignored.
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

-- New profiles leave it empty (it was required, so it becomes optional first).
alter table public.profiles alter column class_title drop not null, alter column class_title drop default;
