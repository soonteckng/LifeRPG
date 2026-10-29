-- Round 82: rest days in the focus streak. Run in the SQL Editor AFTER
-- publishing Round 82, with Soon Teck's approval. Replaces one read-only
-- function; nothing is stored, so it can be undone by re-running the old one.
--
-- The rule, the same as the app's focusStreakWithRest (src/utils/focusDays.ts):
-- every 7 focus days in a streak earn a rest day (hold at most 2). A missed
-- day uses one automatically, so one missed day doesn't end the streak. Rested
-- days keep the streak alive but don't add to it. The streak stays alive
-- through yesterday while today still has a chance.
-- Used by squads (member streaks) and player cards.

create or replace function liferpg_squad_private.focus_streak(p_user uuid, p_time_zone text)
 returns integer
 language plpgsql
 stable
 security definer
 set search_path to ''
as $function$
declare
  today date := (now() at time zone p_time_zone)::date;
  d date; previous date := null; missed integer;
  streak integer := 0; tokens integer := 0; earned integer := 0;
begin
  for d in
    select distinct (a.completed_at at time zone p_time_zone)::date as day
    from public.activity_sessions a
    where a.user_id = p_user and a.status = 'completed' and a.duration_seconds > 0 and a.completed_at <= now()
    order by 1
  loop
    if d > today then exit; end if;
    missed := case when previous is null then 0 else d - previous - 1 end;
    if previous is null or missed > tokens then
      streak := 1; tokens := 0; earned := 0;
    else
      tokens := tokens - missed; streak := streak + 1;
    end if;
    earned := earned + 1;
    if earned % 7 = 0 and tokens < 2 then tokens := tokens + 1; end if;
    previous := d;
  end loop;
  if previous is null then return 0; end if;
  -- Days missed since the last focus day, not counting today.
  if greatest(0, today - previous - 1) > tokens then return 0; end if;
  return streak;
end
$function$;
revoke all on function liferpg_squad_private.focus_streak(uuid, text) from public, anon, authenticated;
