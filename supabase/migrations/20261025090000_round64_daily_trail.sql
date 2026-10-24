-- Round 64, run in the SQL Editor AFTER publishing the app update.
-- Today's trail becomes the rewards: every 20 focused minutes of the day is a
-- stop with a find, up to 6 stops (120 minutes). Reaching the end of the
-- trail gives a one-off bonus of 50 Stardust that day. Past the end, minutes
-- still give Stardust (1 per 5 minutes) but no more finds; the trail starts
-- again tomorrow.
--
-- Before this, finds came every 25 minutes from a bank that carried over
-- between days; that bank is no longer used (its column stays, unused).

alter table liferpg_reward_private.events drop constraint if exists events_kind_check;
alter table liferpg_reward_private.events add constraint events_kind_check
  check (kind in ('find', 'duplicate', 'minutes', 'milestone', 'streak', 'set', 'pack', 'purchase', 'trail'));

-- The trail's numbers, in one place.
create or replace function liferpg_reward_private.trail_rules() returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_object('findSeconds', 1200, 'stops', 6, 'bonus', 50)
$$;
revoke all on function liferpg_reward_private.trail_rules() from public, anon, authenticated;

-- Focused seconds credited on someone's local day, before a given session.
create or replace function liferpg_reward_private.day_seconds_before(p_user uuid, p_day_start timestamptz, p_at timestamptz, p_session uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(least(s.duration_seconds, 86400)), 0)::integer from public.activity_sessions s
  where s.user_id = p_user and s.status = 'completed' and s.credit_result is not null and coalesce(s.duration_seconds, 0) > 0
    and s.completed_at >= p_day_start and (s.completed_at, s.id) < (p_at, p_session)
$$;
revoke all on function liferpg_reward_private.day_seconds_before(uuid, timestamptz, timestamptz, uuid) from public, anon, authenticated;

create or replace function liferpg_reward_private.state(p_user uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare w liferpg_reward_private.wallets; a liferpg_reward_private.avatars; today date := liferpg_reward_private.local_today(p_user);
  reached boolean; next_days integer; base integer; earned jsonb; day_start timestamptz; walked integer;
  find_seconds integer := (liferpg_reward_private.trail_rules() ->> 'findSeconds')::integer;
  trail_seconds integer := find_seconds * (liferpg_reward_private.trail_rules() ->> 'stops')::integer;
begin
  select * into w from liferpg_reward_private.wallets where user_id = p_user;
  select * into a from liferpg_reward_private.avatars where user_id = p_user;
  reached := exists(select 1 from public.daily_progress where user_id = p_user and progress_date = today and goal_completed);
  base := case when w.last_pack_date is null then 0 when w.last_pack_date >= today - 1 then w.pack_days
    else (array[0, 1, 3, 7])[liferpg_reward_private.pack_tier(w.pack_days) + 1] end;
  next_days := base + 1;
  earned := coalesce((select jsonb_agg(item_id order by acquired_at, item_id) from liferpg_reward_private.inventory where user_id = p_user), '[]'::jsonb);
  day_start := today::timestamp at time zone liferpg_reward_private.zone(p_user);
  walked := coalesce((select sum(least(s.duration_seconds, 86400)) from public.activity_sessions s
    where s.user_id = p_user and s.status = 'completed' and s.credit_result is not null and s.completed_at >= day_start), 0);
  return jsonb_build_object(
    'stardust', coalesce(w.stardust, 0),
    'findSeconds', find_seconds,
    'trailSeconds', trail_seconds,
    'nextFindSeconds', case when walked >= trail_seconds then 0 else find_seconds - walked % find_seconds end,
    'owned', case when liferpg_reward_private.is_dev(p_user)
      then (select jsonb_agg(id order by id) from liferpg_reward_private.items) else earned end,
    'earned', earned,
    'today', jsonb_build_object(
      'seconds', walked,
      'finds', (select count(*) from liferpg_reward_private.events e where e.user_id = p_user and e.created_at >= day_start
        and (e.kind = 'find' or (e.kind = 'duplicate' and e.pack_date is null))),
      'trailComplete', exists(select 1 from liferpg_reward_private.events e where e.user_id = p_user and e.kind = 'trail' and e.created_at >= day_start)),
    'avatar', jsonb_build_object('look', coalesce(a.look, '{}'::jsonb), 'equipped', coalesce(a.equipped, '{}'::jsonb),
      'frame', liferpg_reward_private.auto_frame(p_user), 'background', coalesce(a.background, 'bg_dusk'), 'title', a.title, 'revision', coalesce(a.revision, 0)),
    'pack', jsonb_build_object('date', today, 'goalReached', reached,
      'claimed', exists(select 1 from liferpg_reward_private.pack_claims where user_id = p_user and pack_date = today),
      'tier', case when w.last_pack_date = today then liferpg_reward_private.pack_tier(w.pack_days) else liferpg_reward_private.pack_tier(next_days) end,
      'daysInARow', case when w.last_pack_date = today then w.pack_days else base end));
end $$;

-- Each session's finds come from the stops it walked past on that day's
-- trail. The session that reaches the end also brings the trail bonus, once
-- a day. Sessions are claimed in order, so two sessions never share a stop.
create or replace function public.claim_session_rewards_v1(p_expected_owner uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare owner uuid := liferpg_reward_private.signed_in(p_expected_owner); w liferpg_reward_private.wallets;
  sess record; finds integer; minutes_dust integer; per jsonb; results jsonb := '[]'::jsonb; item text; got jsonb; i integer;
  z text := liferpg_reward_private.zone(owner); day_start timestamptz; before integer; dur integer; bonus integer;
  find_seconds integer := (liferpg_reward_private.trail_rules() ->> 'findSeconds')::integer;
  stops integer := (liferpg_reward_private.trail_rules() ->> 'stops')::integer;
  trail_bonus integer := (liferpg_reward_private.trail_rules() ->> 'bonus')::integer;
begin
  w := liferpg_reward_private.wallet_for(owner);
  for sess in
    select a.id, a.duration_seconds, a.completed_at from public.activity_sessions a
    where a.user_id = owner and a.status = 'completed' and a.credit_result is not null and coalesce(a.duration_seconds, 0) > 0
      and a.completed_at >= w.rewards_since
      and not exists(select 1 from liferpg_reward_private.claimed_sessions c where c.session_id = a.id)
    order by a.completed_at, a.id limit 50
  loop
    insert into liferpg_reward_private.claimed_sessions(session_id, user_id) values (sess.id, owner);
    per := '[]'::jsonb; bonus := 0;
    dur := least(sess.duration_seconds, 86400);
    day_start := ((sess.completed_at at time zone z)::date)::timestamp at time zone z;
    before := liferpg_reward_private.day_seconds_before(owner, day_start, sess.completed_at, sess.id);
    finds := least(stops, (before + dur) / find_seconds) - least(stops, before / find_seconds);
    for i in 1..finds loop
      item := liferpg_reward_private.pick_item('finds', '{"common": 62, "uncommon": 28, "rare": 10}'::jsonb);
      got := liferpg_reward_private.give(owner, item, 'find', sess.id, null);
      if got is not null then per := per || got; end if;
    end loop;
    if before < stops * find_seconds and before + dur >= stops * find_seconds
      and not exists(select 1 from liferpg_reward_private.events e where e.user_id = owner and e.kind = 'trail' and e.created_at >= day_start
        and e.created_at < day_start + interval '1 day') then
      bonus := trail_bonus;
      update liferpg_reward_private.wallets set stardust = least(stardust + bonus, 100000000) where user_id = owner;
      insert into liferpg_reward_private.events(user_id, kind, stardust, session_id) values (owner, 'trail', bonus, sess.id);
    end if;
    minutes_dust := dur / 300;
    if minutes_dust > 0 then
      update liferpg_reward_private.wallets set stardust = least(stardust + minutes_dust, 100000000) where user_id = owner;
      insert into liferpg_reward_private.events(user_id, kind, stardust, session_id) values (owner, 'minutes', minutes_dust, sess.id);
    end if;
    results := results || jsonb_build_object('sessionId', sess.id, 'finds', per, 'minutesStardust', minutes_dust, 'seconds', dur,
      'daySecondsBefore', before, 'trailStardust', bonus);
  end loop;
  return jsonb_build_object('sessions', results, 'milestones', liferpg_reward_private.grant_milestones(owner), 'state', liferpg_reward_private.state(owner));
end $$;
