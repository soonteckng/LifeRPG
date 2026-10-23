-- Round 58.
-- 1. Developer accounts can open today's supply pack without reaching the
--    daily goal first, so the pack screen can be tried any day. Everyone else
--    still needs the goal. Nothing else about packs changes.
-- 2. The rewards state says how far you walked today and how many finds you
--    made, for today's trail map; each claimed session says how long it was.
-- 3. Player cards always show stats to squad mates (the share setting is
--    gone), with more of them: longest session, days focused, the last seven
--    days, and the pets and badges they've earned.

-- A valid time zone for someone, or UTC.
create or replace function liferpg_reward_private.zone(p_user uuid) returns text
language plpgsql stable security definer set search_path = '' as $$
declare z text := coalesce(nullif((select timezone from public.profiles where id = p_user), ''), 'UTC');
begin
  perform now() at time zone z;
  return z;
exception when others then
  return 'UTC';
end $$;
revoke all on function liferpg_reward_private.zone(uuid) from public, anon, authenticated;

create or replace function liferpg_reward_private.state(p_user uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare w liferpg_reward_private.wallets; a liferpg_reward_private.avatars; today date := liferpg_reward_private.local_today(p_user);
  reached boolean; next_days integer; base integer; earned jsonb; day_start timestamptz;
begin
  select * into w from liferpg_reward_private.wallets where user_id = p_user;
  select * into a from liferpg_reward_private.avatars where user_id = p_user;
  reached := exists(select 1 from public.daily_progress where user_id = p_user and progress_date = today and goal_completed);
  base := case when w.last_pack_date is null then 0 when w.last_pack_date >= today - 1 then w.pack_days
    else (array[0, 1, 3, 7])[liferpg_reward_private.pack_tier(w.pack_days) + 1] end;
  next_days := base + 1;
  earned := coalesce((select jsonb_agg(item_id order by acquired_at, item_id) from liferpg_reward_private.inventory where user_id = p_user), '[]'::jsonb);
  day_start := today::timestamp at time zone liferpg_reward_private.zone(p_user);
  return jsonb_build_object(
    'stardust', coalesce(w.stardust, 0),
    'nextFindSeconds', 1500 - coalesce(w.find_bank_seconds, 0),
    'owned', case when liferpg_reward_private.is_dev(p_user)
      then (select jsonb_agg(id order by id) from liferpg_reward_private.items) else earned end,
    'earned', earned,
    'today', jsonb_build_object(
      'seconds', coalesce((select sum(least(s.duration_seconds, 86400)) from public.activity_sessions s
        where s.user_id = p_user and s.status = 'completed' and s.credit_result is not null and s.completed_at >= day_start), 0),
      'finds', (select count(*) from liferpg_reward_private.events e where e.user_id = p_user and e.created_at >= day_start
        and (e.kind = 'find' or (e.kind = 'duplicate' and e.pack_date is null)))),
    'avatar', jsonb_build_object('look', coalesce(a.look, '{}'::jsonb), 'equipped', coalesce(a.equipped, '{}'::jsonb),
      'frame', liferpg_reward_private.auto_frame(p_user), 'background', coalesce(a.background, 'bg_dusk'), 'title', a.title, 'revision', coalesce(a.revision, 0)),
    'pack', jsonb_build_object('date', today, 'goalReached', reached,
      'claimed', exists(select 1 from liferpg_reward_private.pack_claims where user_id = p_user and pack_date = today),
      'tier', case when w.last_pack_date = today then liferpg_reward_private.pack_tier(w.pack_days) else liferpg_reward_private.pack_tier(next_days) end,
      'daysInARow', case when w.last_pack_date = today then w.pack_days else base end));
end $$;

-- Unchanged, except each session also says how long it was.
create or replace function public.claim_session_rewards_v1(p_expected_owner uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare owner uuid := liferpg_reward_private.signed_in(p_expected_owner); w liferpg_reward_private.wallets;
  sess record; bank integer; finds integer; minutes_dust integer; per jsonb; results jsonb := '[]'::jsonb; item text; got jsonb; i integer;
begin
  w := liferpg_reward_private.wallet_for(owner);
  bank := w.find_bank_seconds;
  for sess in
    select a.id, a.duration_seconds from public.activity_sessions a
    where a.user_id = owner and a.status = 'completed' and a.credit_result is not null and coalesce(a.duration_seconds, 0) > 0
      and a.completed_at >= w.rewards_since
      and not exists(select 1 from liferpg_reward_private.claimed_sessions c where c.session_id = a.id)
    order by a.completed_at, a.id limit 50
  loop
    insert into liferpg_reward_private.claimed_sessions(session_id, user_id) values (sess.id, owner);
    per := '[]'::jsonb;
    bank := bank + least(sess.duration_seconds, 86400);
    finds := bank / 1500; bank := bank % 1500;
    for i in 1..finds loop
      item := liferpg_reward_private.pick_item('finds', '{"common": 62, "uncommon": 28, "rare": 10}'::jsonb);
      got := liferpg_reward_private.give(owner, item, 'find', sess.id, null);
      if got is not null then per := per || got; end if;
    end loop;
    minutes_dust := least(sess.duration_seconds, 86400) / 300;
    if minutes_dust > 0 then
      update liferpg_reward_private.wallets set stardust = least(stardust + minutes_dust, 100000000) where user_id = owner;
      insert into liferpg_reward_private.events(user_id, kind, stardust, session_id) values (owner, 'minutes', minutes_dust, sess.id);
    end if;
    results := results || jsonb_build_object('sessionId', sess.id, 'finds', per, 'minutesStardust', minutes_dust, 'seconds', least(sess.duration_seconds, 86400));
  end loop;
  update liferpg_reward_private.wallets set find_bank_seconds = bank where user_id = owner;
  return jsonb_build_object('sessions', results, 'milestones', liferpg_reward_private.grant_milestones(owner), 'state', liferpg_reward_private.state(owner));
end $$;

-- Unchanged for everyone else; developer accounts don't need the daily goal.
create or replace function public.open_daily_pack_v1(p_expected_owner uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare owner uuid := liferpg_reward_private.signed_in(p_expected_owner); w liferpg_reward_private.wallets;
  today date := liferpg_reward_private.local_today(owner); days integer; tier smallint; goal integer; dust integer; contents jsonb := '[]'::jsonb; item text; got jsonb;
begin
  w := liferpg_reward_private.wallet_for(owner);
  if exists(select 1 from liferpg_reward_private.pack_claims where user_id = owner and pack_date = today) then raise exception 'Pack already opened today'; end if;
  select goal_minutes into goal from public.daily_progress where user_id = owner and progress_date = today and goal_completed;
  if not found then
    if not liferpg_reward_private.is_dev(owner) then raise exception 'Reach your daily goal to open a pack'; end if;
    goal := 0;
  end if;
  days := case when w.last_pack_date is null then 0 when w.last_pack_date = today - 1 then w.pack_days
    else (array[0, 1, 3, 7])[liferpg_reward_private.pack_tier(w.pack_days) + 1] end + 1;
  tier := liferpg_reward_private.pack_tier(days);
  item := liferpg_reward_private.pick_item('packs', case tier
    when 0 then '{"common": 75, "uncommon": 25}' when 1 then '{"common": 40, "uncommon": 50, "rare": 10}'
    when 2 then '{"uncommon": 65, "rare": 35}' else '{"uncommon": 30, "rare": 70}' end::jsonb);
  got := liferpg_reward_private.give(owner, item, 'pack', null, today);
  if got is not null then contents := contents || got; end if;
  dust := (array[10, 20, 35, 60])[tier + 1] + least(coalesce(goal, 0) / 30 * 2, 16);
  update liferpg_reward_private.wallets set stardust = least(stardust + dust, 100000000), pack_days = days, last_pack_date = today where user_id = owner;
  insert into liferpg_reward_private.pack_claims(user_id, pack_date, tier) values (owner, today, tier);
  insert into liferpg_reward_private.events(user_id, kind, stardust, pack_date) values (owner, 'pack', dust, today);
  return jsonb_build_object('tier', tier, 'daysInARow', days, 'items', contents, 'stardust', dust,
    'milestones', liferpg_reward_private.grant_milestones(owner), 'state', liferpg_reward_private.state(owner));
end $$;

-- One player's card, for you or a squad mate. Stats are part of being in a squad.
create or replace function public.get_player_card_v1(p_expected_owner uuid, p_player uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare owner uuid := liferpg_squad_private.signed_in(p_expected_owner); p public.profiles; z text; today date;
begin
  if p_player is null then raise exception 'Player not found'; end if;
  if p_player <> owner and not exists(
      select 1 from liferpg_squad_private.members a join liferpg_squad_private.members b on b.squad_id = a.squad_id
      join liferpg_squad_private.squads s on s.id = a.squad_id
      where a.user_id = owner and b.user_id = p_player and a.left_at is null and b.left_at is null and s.closed_at is null) then
    raise exception 'Player not found'; end if;
  select * into p from public.profiles where id = p_player;
  if not found then raise exception 'Player not found'; end if;
  z := liferpg_reward_private.zone(p_player);
  today := (now() at time zone z)::date;
  return jsonb_build_object('id', p_player, 'isYou', p_player = owner,
    'name', coalesce(nullif(btrim(p.username), ''), 'Friend'), 'level', coalesce(p.level, 1),
    'look', liferpg_reward_private.public_look(p_player),
    'statsShared', true,
    'stats', jsonb_build_object(
      'streak', liferpg_squad_private.focus_streak(p_player, coalesce(nullif(p.timezone, ''), 'Asia/Kuala_Lumpur')),
      'totalSeconds', coalesce((select sum(least(a.duration_seconds, 86400)) from public.activity_sessions a
        where a.user_id = p_player and a.status = 'completed' and a.credit_result is not null), 0),
      'sessions', (select count(*) from public.activity_sessions a where a.user_id = p_player and a.status = 'completed' and a.credit_result is not null),
      'longestSeconds', coalesce((select max(least(a.duration_seconds, 86400)) from public.activity_sessions a
        where a.user_id = p_player and a.status = 'completed' and a.credit_result is not null), 0),
      'daysFocused', (select count(distinct (a.completed_at at time zone z)::date) from public.activity_sessions a
        where a.user_id = p_player and a.status = 'completed' and a.credit_result is not null),
      'last7', (select jsonb_agg(coalesce((select sum(least(a.duration_seconds, 86400)) from public.activity_sessions a
          where a.user_id = p_player and a.status = 'completed' and a.credit_result is not null
            and (a.completed_at at time zone z)::date = d::date), 0) order by d)
        from generate_series(today - 6, today, interval '1 day') d),
      'collected', (select count(*) from liferpg_reward_private.inventory v join liferpg_reward_private.items i on i.id = v.item_id
        where v.user_id = p_player and i.kind in ('wearable', 'pet', 'background', 'decor')),
      'pets', coalesce((select jsonb_agg(v.item_id order by v.acquired_at) from liferpg_reward_private.inventory v join liferpg_reward_private.items i on i.id = v.item_id
        where v.user_id = p_player and i.kind = 'pet'), '[]'::jsonb),
      'badges', coalesce((select jsonb_agg(v.item_id order by v.acquired_at) from liferpg_reward_private.inventory v join liferpg_reward_private.items i on i.id = v.item_id
        where v.user_id = p_player and i.kind = 'title'), '[]'::jsonb),
      'since', (select min(a.completed_at) from public.activity_sessions a where a.user_id = p_player and a.status = 'completed' and a.credit_result is not null)
    ));
end $$;
