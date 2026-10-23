-- Rewards, stage 1: the item catalog, what each person owns, Stardust,
-- the saved look of their character, finds from focus time, hour-milestone
-- pets, streak frames, set titles, the daily supply pack and the trader.
--
-- Everything lives in a private schema and changes only through
-- SECURITY DEFINER functions with an owner check, so nothing can be granted
-- from the app directly. Finds are worked out on the server from sessions
-- the server already credited; the app only asks "anything new for me?".
-- Nothing here changes an existing table or function.

create schema if not exists liferpg_reward_private;
revoke all on schema liferpg_reward_private from public, anon, authenticated;

-- What exists. Names and art live in the app; the server only needs the rules.
create table liferpg_reward_private.items (
  id text primary key check (id ~ '^[a-z0-9_]{2,40}$'),
  kind text not null check (kind in ('wearable', 'pet', 'frame', 'background', 'decor', 'title')),
  slot text check (slot in ('head', 'face', 'neck', 'top', 'back', 'bag', 'held', 'shoes', 'pet')),
  set_key text check (set_key in ('scholar', 'artist', 'wanderer')),
  rarity text not null check (rarity in ('common', 'uncommon', 'rare', 'epic', 'legendary')),
  is_free boolean not null default false,
  from_finds boolean not null default false,
  from_packs boolean not null default false,
  price integer check (price is null or price > 0),
  check ((kind = 'wearable') = (slot is not null and slot <> 'pet')),
  check ((kind = 'pet') = (slot is not null and slot = 'pet'))
);

create table liferpg_reward_private.wallets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stardust integer not null default 0 check (stardust between 0 and 100000000),
  find_bank_seconds integer not null default 0 check (find_bank_seconds between 0 and 1499),
  pack_days integer not null default 0 check (pack_days >= 0),
  last_pack_date date,
  rewards_since timestamptz not null default now() - interval '1 day',
  created_at timestamptz not null default now()
);

create table liferpg_reward_private.inventory (
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id text not null references liferpg_reward_private.items(id),
  source text not null check (source in ('find', 'pack', 'milestone', 'streak', 'set', 'trader')),
  acquired_at timestamptz not null default now(),
  primary key (user_id, item_id)
);

create table liferpg_reward_private.avatars (
  user_id uuid primary key references auth.users(id) on delete cascade,
  look jsonb not null default '{"skin":"3","hair":"short","hairColor":"darkbrown","glasses":false}'::jsonb,
  equipped jsonb not null default '{}'::jsonb,
  frame text references liferpg_reward_private.items(id),
  background text not null default 'bg_dusk' references liferpg_reward_private.items(id),
  title text references liferpg_reward_private.items(id),
  revision bigint not null default 1,
  updated_at timestamptz not null default now()
);

-- Each credited session is turned into rewards once.
create table liferpg_reward_private.claimed_sessions (
  session_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  claimed_at timestamptz not null default now()
);
create index reward_claimed_user on liferpg_reward_private.claimed_sessions(user_id);

create table liferpg_reward_private.pack_claims (
  user_id uuid not null references auth.users(id) on delete cascade,
  pack_date date not null,
  tier smallint not null check (tier between 0 and 3),
  claimed_at timestamptz not null default now(),
  primary key (user_id, pack_date)
);

-- A plain record of what was given and why, for the reveal screens and support.
create table liferpg_reward_private.events (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('find', 'duplicate', 'minutes', 'milestone', 'streak', 'set', 'pack', 'purchase')),
  item_id text references liferpg_reward_private.items(id),
  stardust integer not null default 0,
  session_id uuid,
  pack_date date,
  created_at timestamptz not null default now()
);
create index reward_events_user on liferpg_reward_private.events(user_id, created_at desc);

alter table liferpg_reward_private.items enable row level security;
alter table liferpg_reward_private.wallets enable row level security;
alter table liferpg_reward_private.inventory enable row level security;
alter table liferpg_reward_private.avatars enable row level security;
alter table liferpg_reward_private.claimed_sessions enable row level security;
alter table liferpg_reward_private.pack_claims enable row level security;
alter table liferpg_reward_private.events enable row level security;
revoke all on all tables in schema liferpg_reward_private from public, anon, authenticated;
revoke all on all sequences in schema liferpg_reward_private from public, anon, authenticated;

-- The first catalog. Prices: common 60, uncommon 120, rare 240 Stardust.
insert into liferpg_reward_private.items(id, kind, slot, set_key, rarity, is_free, from_finds, from_packs, price) values
  ('glasses', 'wearable', 'face', null, 'common', true, false, false, null),
  ('cardigan', 'wearable', 'top', 'scholar', 'uncommon', false, true, false, 120),
  ('tie', 'wearable', 'neck', 'scholar', 'common', false, true, false, 60),
  ('book_bag', 'wearable', 'bag', 'scholar', 'common', false, true, false, 60),
  ('notebook', 'wearable', 'held', 'scholar', 'rare', false, true, false, 240),
  ('overalls', 'wearable', 'top', 'artist', 'uncommon', false, true, false, 120),
  ('beret', 'wearable', 'head', 'artist', 'common', false, true, false, 60),
  ('tote', 'wearable', 'bag', 'artist', 'common', false, true, false, 60),
  ('sneakers', 'wearable', 'shoes', 'artist', 'rare', false, true, false, 240),
  ('field_jacket', 'wearable', 'top', 'wanderer', 'uncommon', false, true, false, 120),
  ('forest_cloak', 'wearable', 'back', 'wanderer', 'rare', false, true, false, 240),
  ('walking_staff', 'wearable', 'held', 'wanderer', 'common', false, true, false, 60),
  ('trail_boots', 'wearable', 'shoes', 'wanderer', 'common', false, true, false, 60),
  ('pet_owl', 'pet', 'pet', null, 'epic', false, false, false, null),
  ('pet_cat', 'pet', 'pet', null, 'epic', false, false, false, null),
  ('pet_fox', 'pet', 'pet', null, 'epic', false, false, false, null),
  ('frame_streak_7', 'frame', null, null, 'uncommon', false, false, false, null),
  ('frame_streak_30', 'frame', null, null, 'rare', false, false, false, null),
  ('frame_streak_100', 'frame', null, null, 'epic', false, false, false, null),
  ('frame_streak_365', 'frame', null, null, 'legendary', false, false, false, null),
  ('title_scholar', 'title', null, 'scholar', 'rare', false, false, false, null),
  ('title_artist', 'title', null, 'artist', 'rare', false, false, false, null),
  ('title_wanderer', 'title', null, 'wanderer', 'rare', false, false, false, null),
  ('bg_dusk', 'background', null, null, 'common', true, false, false, null),
  ('bg_forest', 'background', null, null, 'common', false, false, true, 60),
  ('bg_meadow', 'background', null, null, 'common', false, false, true, 60),
  ('bg_night', 'background', null, null, 'uncommon', false, false, true, 120),
  ('bg_library', 'background', null, null, 'uncommon', false, false, true, 120),
  ('bg_sunset', 'background', null, null, 'rare', false, false, true, 240),
  ('decor_signpost', 'decor', null, null, 'common', false, true, true, 60),
  ('decor_crates', 'decor', null, null, 'common', false, true, true, 60),
  ('decor_easel', 'decor', null, null, 'common', false, true, true, 60),
  ('decor_bonsai', 'decor', null, null, 'uncommon', false, true, true, 120),
  ('decor_herb_garden', 'decor', null, null, 'uncommon', false, true, true, 120),
  ('decor_hammock', 'decor', null, null, 'uncommon', false, true, true, 120),
  ('decor_reading_nook', 'decor', null, null, 'rare', false, true, true, 240);

create function liferpg_reward_private.signed_in(p_expected_owner uuid) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare owner uuid := auth.uid();
begin
  if owner is null or p_expected_owner is null or owner <> p_expected_owner or not exists(select 1 from auth.users where id = owner) then
    raise exception 'Account changed. Reconnect to your account'; end if;
  return owner;
end $$;

create function liferpg_reward_private.local_today(p_user uuid) returns date
language plpgsql stable security definer set search_path = '' as $$
declare zone text := (select timezone from public.profiles where id = p_user);
begin
  begin
    return (now() at time zone coalesce(nullif(zone, ''), 'UTC'))::date;
  exception when others then
    return (now() at time zone 'UTC')::date;
  end;
end $$;

-- Stardust for an item someone already owns.
create function liferpg_reward_private.duplicate_value(p_rarity text) returns integer
language sql immutable set search_path = '' as $$
  select case p_rarity when 'common' then 5 when 'uncommon' then 10 when 'rare' then 20 when 'epic' then 40 else 80 end
$$;

-- Picks a rarity by weight, then an item of that rarity from the given pool.
create function liferpg_reward_private.pick_item(p_pool text, p_weights jsonb) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare roll numeric := random() * (select sum(value::numeric) from jsonb_each_text(p_weights)); acc numeric := 0; r record; chosen_rarity text; chosen text;
begin
  for r in select key, value::numeric w from jsonb_each_text(p_weights) order by key loop
    acc := acc + r.w;
    if chosen_rarity is null and roll < acc then chosen_rarity := r.key; end if;
  end loop;
  chosen_rarity := coalesce(chosen_rarity, 'common');
  select id into chosen from liferpg_reward_private.items
    where rarity = chosen_rarity and not is_free and ((p_pool = 'finds' and from_finds) or (p_pool = 'packs' and from_packs))
    order by random() limit 1;
  if chosen is null then
    select id into chosen from liferpg_reward_private.items
      where not is_free and ((p_pool = 'finds' and from_finds) or (p_pool = 'packs' and from_packs)) order by random() limit 1;
  end if;
  return chosen;
end $$;

-- Gives an item, or Stardust if it is already owned. Returns what happened.
create function liferpg_reward_private.give(p_user uuid, p_item text, p_source text, p_session uuid, p_pack_date date) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare it liferpg_reward_private.items; added integer;
begin
  select * into it from liferpg_reward_private.items where id = p_item;
  if not found then return null; end if;
  insert into liferpg_reward_private.inventory(user_id, item_id, source) values (p_user, p_item, p_source) on conflict do nothing;
  get diagnostics added = row_count;
  if added = 1 then
    insert into liferpg_reward_private.events(user_id, kind, item_id, session_id, pack_date)
      values (p_user, case p_source when 'trader' then 'purchase' else p_source end, p_item, p_session, p_pack_date);
    return jsonb_build_object('item', p_item, 'rarity', it.rarity, 'new', true, 'stardust', 0);
  end if;
  update liferpg_reward_private.wallets set stardust = least(stardust + liferpg_reward_private.duplicate_value(it.rarity), 100000000) where user_id = p_user;
  insert into liferpg_reward_private.events(user_id, kind, item_id, stardust, session_id, pack_date)
    values (p_user, 'duplicate', p_item, liferpg_reward_private.duplicate_value(it.rarity), p_session, p_pack_date);
  return jsonb_build_object('item', p_item, 'rarity', it.rarity, 'new', false, 'stardust', liferpg_reward_private.duplicate_value(it.rarity));
end $$;

-- Pets for total focus hours, frames for the day streak, titles for full sets.
create function liferpg_reward_private.grant_milestones(p_user uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare hours numeric; streak integer; got jsonb := '[]'::jsonb; m record; s record;
begin
  select coalesce(sum(duration_seconds), 0) / 3600.0 into hours from public.activity_sessions
    where user_id = p_user and status = 'completed' and credit_result is not null;
  for m in select * from (values ('pet_owl', 10), ('pet_cat', 50), ('pet_fox', 100)) v(item, need) loop
    if hours >= m.need and not exists(select 1 from liferpg_reward_private.inventory where user_id = p_user and item_id = m.item) then
      perform liferpg_reward_private.give(p_user, m.item, 'milestone', null, null);
      got := got || jsonb_build_object('item', m.item, 'rarity', 'epic', 'new', true, 'stardust', 0, 'reason', 'hours');
    end if;
  end loop;
  select coalesce(streak_count, 0) into streak from public.profiles where id = p_user;
  for m in select * from (values ('frame_streak_7', 7), ('frame_streak_30', 30), ('frame_streak_100', 100), ('frame_streak_365', 365)) v(item, need) loop
    if coalesce(streak, 0) >= m.need and not exists(select 1 from liferpg_reward_private.inventory where user_id = p_user and item_id = m.item) then
      perform liferpg_reward_private.give(p_user, m.item, 'streak', null, null);
      got := got || jsonb_build_object('item', m.item, 'rarity', (select rarity from liferpg_reward_private.items where id = m.item), 'new', true, 'stardust', 0, 'reason', 'streak');
    end if;
  end loop;
  for s in select i.set_key from liferpg_reward_private.items i where i.kind = 'wearable' and i.set_key is not null group by i.set_key
      having count(*) = count(*) filter (where exists(select 1 from liferpg_reward_private.inventory v where v.user_id = p_user and v.item_id = i.id)) loop
    if not exists(select 1 from liferpg_reward_private.inventory where user_id = p_user and item_id = 'title_' || s.set_key) then
      perform liferpg_reward_private.give(p_user, 'title_' || s.set_key, 'set', null, null);
      got := got || jsonb_build_object('item', 'title_' || s.set_key, 'rarity', 'rare', 'new', true, 'stardust', 0, 'reason', 'set');
    end if;
  end loop;
  return got;
end $$;

create function liferpg_reward_private.wallet_for(p_user uuid) returns liferpg_reward_private.wallets
language plpgsql volatile security definer set search_path = '' as $$
declare w liferpg_reward_private.wallets;
begin
  insert into liferpg_reward_private.wallets(user_id) values (p_user) on conflict do nothing;
  insert into liferpg_reward_private.avatars(user_id) values (p_user) on conflict do nothing;
  select * into w from liferpg_reward_private.wallets where user_id = p_user for update;
  return w;
end $$;

create function liferpg_reward_private.pack_tier(p_days integer) returns smallint
language sql immutable set search_path = '' as $$
  select (case when p_days >= 14 then 3 when p_days >= 7 then 2 when p_days >= 3 then 1 else 0 end)::smallint
$$;

create function liferpg_reward_private.state(p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare w liferpg_reward_private.wallets; a liferpg_reward_private.avatars; today date := liferpg_reward_private.local_today(p_user);
  reached boolean; next_days integer; base integer;
begin
  select * into w from liferpg_reward_private.wallets where user_id = p_user;
  select * into a from liferpg_reward_private.avatars where user_id = p_user;
  reached := exists(select 1 from public.daily_progress where user_id = p_user and progress_date = today and goal_completed);
  base := case when w.last_pack_date is null then 0 when w.last_pack_date >= today - 1 then w.pack_days
    else (array[0, 1, 3, 7])[liferpg_reward_private.pack_tier(w.pack_days) + 1] end;
  next_days := base + 1;
  return jsonb_build_object(
    'stardust', coalesce(w.stardust, 0),
    'nextFindSeconds', 1500 - coalesce(w.find_bank_seconds, 0),
    'owned', coalesce((select jsonb_agg(item_id order by acquired_at, item_id) from liferpg_reward_private.inventory where user_id = p_user), '[]'::jsonb),
    'avatar', jsonb_build_object('look', coalesce(a.look, '{}'::jsonb), 'equipped', coalesce(a.equipped, '{}'::jsonb),
      'frame', a.frame, 'background', coalesce(a.background, 'bg_dusk'), 'title', a.title, 'revision', coalesce(a.revision, 0)),
    'pack', jsonb_build_object('date', today, 'goalReached', reached,
      'claimed', exists(select 1 from liferpg_reward_private.pack_claims where user_id = p_user and pack_date = today),
      'tier', case when w.last_pack_date = today then liferpg_reward_private.pack_tier(w.pack_days) else liferpg_reward_private.pack_tier(next_days) end,
      'daysInARow', case when w.last_pack_date = today then w.pack_days else base end));
end $$;

-- Everything the rewards screens need.
create function public.get_rewards_v1(p_expected_owner uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare owner uuid := liferpg_reward_private.signed_in(p_expected_owner);
begin
  perform liferpg_reward_private.wallet_for(owner);
  return liferpg_reward_private.state(owner);
end $$;

-- Turns newly credited sessions into finds and Stardust. Safe to call any
-- number of times: each session counts once. Finds start from sessions in
-- the day before someone first opens rewards; all past hours still count
-- towards pets.
create function public.claim_session_rewards_v1(p_expected_owner uuid) returns jsonb
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
    results := results || jsonb_build_object('sessionId', sess.id, 'finds', per, 'minutesStardust', minutes_dust);
  end loop;
  update liferpg_reward_private.wallets set find_bank_seconds = bank where user_id = owner;
  return jsonb_build_object('sessions', results, 'milestones', liferpg_reward_private.grant_milestones(owner), 'state', liferpg_reward_private.state(owner));
end $$;

-- Opens today's supply pack once the daily goal is reached. Hitting the goal
-- on days in a row grows the pack; a missed day steps back one pack.
create function public.open_daily_pack_v1(p_expected_owner uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare owner uuid := liferpg_reward_private.signed_in(p_expected_owner); w liferpg_reward_private.wallets;
  today date := liferpg_reward_private.local_today(owner); days integer; tier smallint; goal integer; dust integer; contents jsonb := '[]'::jsonb; item text; got jsonb;
begin
  w := liferpg_reward_private.wallet_for(owner);
  if exists(select 1 from liferpg_reward_private.pack_claims where user_id = owner and pack_date = today) then raise exception 'Pack already opened today'; end if;
  select goal_minutes into goal from public.daily_progress where user_id = owner and progress_date = today and goal_completed;
  if not found then raise exception 'Reach your daily goal to open a pack'; end if;
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

-- The trader: buy exactly the piece you want with Stardust.
create function public.buy_reward_item_v1(p_expected_owner uuid, p_item text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare owner uuid := liferpg_reward_private.signed_in(p_expected_owner); w liferpg_reward_private.wallets; it liferpg_reward_private.items;
begin
  w := liferpg_reward_private.wallet_for(owner);
  select * into it from liferpg_reward_private.items where id = p_item;
  if not found or it.price is null then raise exception 'This item is not sold at the trader'; end if;
  if exists(select 1 from liferpg_reward_private.inventory where user_id = owner and item_id = p_item) then raise exception 'You already have this item'; end if;
  if w.stardust < it.price then raise exception 'Not enough Stardust'; end if;
  update liferpg_reward_private.wallets set stardust = stardust - it.price where user_id = owner;
  insert into liferpg_reward_private.inventory(user_id, item_id, source) values (owner, p_item, 'trader');
  insert into liferpg_reward_private.events(user_id, kind, item_id, stardust) values (owner, 'purchase', p_item, -it.price);
  return jsonb_build_object('item', p_item, 'milestones', liferpg_reward_private.grant_milestones(owner), 'state', liferpg_reward_private.state(owner));
end $$;

-- Saves the character's look. Only free or owned items can be worn, each in
-- its own slot. p_expected_revision guards against two phones overwriting
-- each other.
create function public.save_avatar_v1(p_expected_owner uuid, p_avatar jsonb, p_expected_revision bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare owner uuid := liferpg_reward_private.signed_in(p_expected_owner); a liferpg_reward_private.avatars;
  v_look jsonb := p_avatar -> 'look'; v_equipped jsonb := coalesce(p_avatar -> 'equipped', '{}'::jsonb); e record; it liferpg_reward_private.items;
  v_frame text := nullif(p_avatar ->> 'frame', ''); v_background text := coalesce(nullif(p_avatar ->> 'background', ''), 'bg_dusk'); v_title text := nullif(p_avatar ->> 'title', '');
begin
  perform liferpg_reward_private.wallet_for(owner);
  select * into a from liferpg_reward_private.avatars where user_id = owner for update;
  if p_expected_revision is null or p_expected_revision <> a.revision then raise exception 'Your look changed on another device. Reload and try again'; end if;
  if p_avatar is null or jsonb_typeof(v_look) is distinct from 'object' or jsonb_typeof(v_equipped) <> 'object'
    or (v_look ->> 'skin') is null or (v_look ->> 'skin') !~ '^[1-8]$'
    or coalesce(v_look ->> 'hair', '') not in ('short', 'long', 'coily', 'braids', 'bun', 'locs', 'curly', 'buzz')
    or coalesce(v_look ->> 'hairColor', '') not in ('black', 'darkbrown', 'brown', 'auburn', 'blonde', 'grey')
    or jsonb_typeof(v_look -> 'glasses') is distinct from 'boolean'
    or (select count(*) from jsonb_object_keys(v_look)) <> 4 then
    raise exception 'Invalid look'; end if;
  for e in select key, value from jsonb_each(v_equipped) loop
    if jsonb_typeof(e.value) <> 'string' then raise exception 'Invalid outfit'; end if;
    select * into it from liferpg_reward_private.items where id = e.value #>> '{}';
    if not found or it.slot is distinct from e.key then raise exception 'Invalid outfit'; end if;
    if not it.is_free and not exists(select 1 from liferpg_reward_private.inventory where user_id = owner and item_id = it.id) then raise exception 'You don''t have that item yet'; end if;
  end loop;
  if v_frame is not null and not exists(select 1 from liferpg_reward_private.inventory v join liferpg_reward_private.items i on i.id = v.item_id
      where v.user_id = owner and v.item_id = v_frame and i.kind = 'frame') then raise exception 'You don''t have that frame yet'; end if;
  if not exists(select 1 from liferpg_reward_private.items i where i.id = v_background and i.kind = 'background'
      and (i.is_free or exists(select 1 from liferpg_reward_private.inventory v where v.user_id = owner and v.item_id = i.id))) then raise exception 'You don''t have that background yet'; end if;
  if v_title is not null and not exists(select 1 from liferpg_reward_private.inventory v join liferpg_reward_private.items i on i.id = v.item_id
      where v.user_id = owner and v.item_id = v_title and i.kind = 'title') then raise exception 'You don''t have that title yet'; end if;
  update liferpg_reward_private.avatars set look = v_look, equipped = v_equipped, frame = v_frame, background = v_background, title = v_title,
    revision = a.revision + 1, updated_at = now() where user_id = owner;
  return liferpg_reward_private.state(owner);
end $$;

revoke all on function public.get_rewards_v1(uuid) from public, anon;
revoke all on function public.claim_session_rewards_v1(uuid) from public, anon;
revoke all on function public.open_daily_pack_v1(uuid) from public, anon;
revoke all on function public.buy_reward_item_v1(uuid, text) from public, anon;
revoke all on function public.save_avatar_v1(uuid, jsonb, bigint) from public, anon;
grant execute on function public.get_rewards_v1(uuid) to authenticated;
grant execute on function public.claim_session_rewards_v1(uuid) to authenticated;
grant execute on function public.open_daily_pack_v1(uuid) to authenticated;
grant execute on function public.buy_reward_item_v1(uuid, text) to authenticated;
grant execute on function public.save_avatar_v1(uuid, jsonb, bigint) to authenticated;
revoke all on all functions in schema liferpg_reward_private from public, anon, authenticated;
