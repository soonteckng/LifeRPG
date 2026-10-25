-- Round 66: run in the SQL Editor AFTER publishing the app update.
-- This REPLACES the pending Round 64 daily-trail proposal. It works directly
-- on the Round 58 live schema, and also if Round 64 has already been applied.
-- Do not apply the older Round 64 proposal after this file.
-- Created with `supabase migration new`; its generated UTC version preceded
-- the existing future-dated Round 64 file. The version was moved to the next
-- second after Round 64 so a fresh migration replay ends on these new rules.
--
-- Four daily find stops: 30, 60, 90 and 120 focused minutes. The new session
-- that reaches 120 minutes also brings the existing 50-Stardust trail bonus.
-- Past 120 minutes, ordinary minute Stardust continues and no more finds roll.
-- Existing inventory, currency, claimed sessions and the old carry-over bank
-- are preserved. The old bank remains stored but no longer drives this trail.
-- Already awarded session finds occupy the first stops of their local day;
-- they are never taken back or awarded again when the rules change.

begin;

alter table liferpg_reward_private.events drop constraint if exists events_kind_check;
alter table liferpg_reward_private.events add constraint events_kind_check
  check (kind in ('find', 'duplicate', 'minutes', 'milestone', 'streak', 'set', 'pack', 'purchase', 'trail'));

create or replace function liferpg_reward_private.trail_rules() returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_build_object('findSeconds', 1800, 'stops', 4, 'bonus', 50)
$$;
revoke all on function liferpg_reward_private.trail_rules() from public, anon, authenticated;

-- One source for the day's saved effort and its actual session-derived finds.
-- Use next LOCAL midnight, not a fixed 24 hours, on daylight-saving boundaries.
-- Developer gifts and pack/milestone duplicates have no claimed session and
-- cannot fill the trail. Late offline imports join the day they finished.
-- The map and claim use the same wallet eligibility cutoff. Earlier sessions
-- remain in history/XP, but cannot promise a reward that this wallet cannot claim.
create or replace function liferpg_reward_private.trail_day(p_user uuid, p_day date) returns jsonb
language sql stable security definer set search_path = '' as $$
  with bounds as (
    select p_day::timestamp at time zone liferpg_reward_private.zone(p_user) as starts,
      (p_day + 1)::timestamp at time zone liferpg_reward_private.zone(p_user) as ends,
      (select w.rewards_since from liferpg_reward_private.wallets w where w.user_id = p_user) as eligible_since
  ), valid as (
    select s.id, least(s.duration_seconds, 86400) as seconds
    from public.activity_sessions s, bounds b
    where s.user_id = p_user and s.status = 'completed' and s.credit_result is not null
      and coalesce(s.duration_seconds, 0) > 0 and s.completed_at >= b.starts
      and s.completed_at < b.ends and s.completed_at <= now() and s.completed_at >= b.eligible_since
  ), claimed as (
    select v.id, v.seconds from valid v join liferpg_reward_private.claimed_sessions c on c.session_id = v.id
    where c.user_id = p_user
  )
  select jsonb_build_object(
    'date', p_day,
    'seconds', least(coalesce((select sum(seconds) from valid), 0), 2147483647),
    'claimedSeconds', least(coalesce((select sum(seconds) from claimed), 0), 2147483647),
    'finds', (select count(*) from liferpg_reward_private.events e join claimed c on c.id = e.session_id
      where e.user_id = p_user and e.kind in ('find', 'duplicate') and e.pack_date is null),
    'bonusClaimed', exists(select 1 from liferpg_reward_private.events e join claimed c on c.id = e.session_id
      where e.user_id = p_user and e.kind = 'trail'))
$$;
revoke all on function liferpg_reward_private.trail_day(uuid, date) from public, anon, authenticated;

create or replace function liferpg_reward_private.state(p_user uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare w liferpg_reward_private.wallets; a liferpg_reward_private.avatars; today date := liferpg_reward_private.local_today(p_user);
  reached boolean; next_days integer; base integer; earned jsonb; progress jsonb; walked integer; found integer;
  rules jsonb := liferpg_reward_private.trail_rules();
  find_seconds integer := (rules ->> 'findSeconds')::integer;
  stops integer := (rules ->> 'stops')::integer;
  trail_seconds integer := find_seconds * stops;
begin
  select * into w from liferpg_reward_private.wallets where user_id = p_user;
  select * into a from liferpg_reward_private.avatars where user_id = p_user;
  reached := exists(select 1 from public.daily_progress where user_id = p_user and progress_date = today and goal_completed);
  base := case when w.last_pack_date is null then 0 when w.last_pack_date >= today - 1 then w.pack_days
    else (array[0, 1, 3, 7])[liferpg_reward_private.pack_tier(w.pack_days) + 1] end;
  next_days := base + 1;
  earned := coalesce((select jsonb_agg(item_id order by acquired_at, item_id) from liferpg_reward_private.inventory where user_id = p_user), '[]'::jsonb);
  progress := liferpg_reward_private.trail_day(p_user, today);
  walked := (progress ->> 'seconds')::integer;
  found := least(stops, (progress ->> 'finds')::integer);
  return jsonb_build_object(
    'stardust', coalesce(w.stardust, 0),
    'findSeconds', find_seconds,
    'trailSeconds', trail_seconds,
    -- An old 25-minute find already occupies stop one: the next award is at
    -- 60 minutes, not another copy at 30. Fully collected finds return zero.
    'nextFindSeconds', case when walked >= trail_seconds or found >= stops then 0
      else greatest(0, find_seconds * (found + 1) - walked) end,
    'owned', case when liferpg_reward_private.is_dev(p_user)
      then (select jsonb_agg(id order by id) from liferpg_reward_private.items) else earned end,
    'earned', earned,
    'today', jsonb_build_object('date', today, 'seconds', walked, 'finds', found,
      'pendingFinds', greatest(0, least(stops, walked / find_seconds) - found),
      'findsComplete', found >= stops, 'trailComplete', walked >= trail_seconds),
    'avatar', jsonb_build_object('look', coalesce(a.look, '{}'::jsonb), 'equipped', coalesce(a.equipped, '{}'::jsonb),
      'frame', liferpg_reward_private.auto_frame(p_user), 'background', coalesce(a.background, 'bg_dusk'), 'title', a.title, 'revision', coalesce(a.revision, 0)),
    'pack', jsonb_build_object('date', today, 'goalReached', reached,
      'claimed', exists(select 1 from liferpg_reward_private.pack_claims where user_id = p_user and pack_date = today),
      'tier', case when w.last_pack_date = today then liferpg_reward_private.pack_tier(w.pack_days) else liferpg_reward_private.pack_tier(next_days) end,
      'daysInARow', case when w.last_pack_date = today then w.pack_days else base end));
end $$;

create or replace function public.claim_session_rewards_v1(p_expected_owner uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare owner uuid := liferpg_reward_private.signed_in(p_expected_owner); w liferpg_reward_private.wallets;
  sess record; finds integer; minutes_dust integer; per jsonb; results jsonb := '[]'::jsonb; item text; got jsonb; i integer;
  z text := liferpg_reward_private.zone(owner); credited_day date; progress jsonb;
  before integer; after integer; found integer; dur integer; bonus integer;
  rules jsonb := liferpg_reward_private.trail_rules();
  find_seconds integer := (rules ->> 'findSeconds')::integer;
  stops integer := (rules ->> 'stops')::integer;
  trail_bonus integer := (rules ->> 'bonus')::integer;
begin
  -- The owner's wallet row serializes simultaneous checks before either can
  -- choose sessions or stops. The session primary key also prevents replay.
  w := liferpg_reward_private.wallet_for(owner);
  for sess in
    select a.id, a.duration_seconds, a.completed_at from public.activity_sessions a
    where a.user_id = owner and a.status = 'completed' and a.credit_result is not null and coalesce(a.duration_seconds, 0) > 0
      and a.completed_at >= w.rewards_since and a.completed_at <= now()
      and not exists(select 1 from liferpg_reward_private.claimed_sessions c where c.session_id = a.id)
    order by a.completed_at, a.id limit 50
  loop
    credited_day := (sess.completed_at at time zone z)::date;
    progress := liferpg_reward_private.trail_day(owner, credited_day);
    before := (progress ->> 'claimedSeconds')::integer;
    found := least(stops, (progress ->> 'finds')::integer);
    dur := least(sess.duration_seconds, 86400);
    after := least(before::bigint + dur, 2147483647)::integer;
    finds := greatest(0, least(stops, after / find_seconds) - found);
    insert into liferpg_reward_private.claimed_sessions(session_id, user_id) values (sess.id, owner);
    per := '[]'::jsonb; bonus := 0;
    for i in 1..finds loop
      item := liferpg_reward_private.pick_item('finds', '{"common": 62, "uncommon": 28, "rare": 10}'::jsonb);
      got := liferpg_reward_private.give(owner, item, 'find', sess.id, null);
      if got is not null then per := per || got; end if;
    end loop;
    if before < stops * find_seconds and after >= stops * find_seconds
      and not (progress ->> 'bonusClaimed')::boolean then
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
      'creditedDate', credited_day, 'daySecondsBefore', before, 'daySecondsAfter', after, 'trailStardust', bonus);
  end loop;
  return jsonb_build_object('sessions', results, 'milestones', liferpg_reward_private.grant_milestones(owner), 'state', liferpg_reward_private.state(owner));
end $$;
revoke all on function public.claim_session_rewards_v1(uuid) from public, anon;
grant execute on function public.claim_session_rewards_v1(uuid) to authenticated;

commit;
