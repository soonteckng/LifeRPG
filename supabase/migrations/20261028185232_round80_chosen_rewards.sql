-- REVIEW ONLY. Do not install until the chosen-reward client is delivered,
-- published and this SQL has been separately reviewed and approved.
-- Enabling records this transaction's time once. Launch-day packs survive;
-- credits start at the next midnight in each frozen launch timezone.
begin;

create table liferpg_reward_private.chosen_rollout (
  singleton boolean primary key default true check (singleton),
  launched_at timestamptz not null default now()
);
insert into liferpg_reward_private.chosen_rollout(singleton) values (true);
create table liferpg_reward_private.chosen_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  launch_zone text not null,
  first_credit_date date not null,
  starts_at timestamptz not null,
  target text references liferpg_reward_private.items(id),
  revision bigint not null default 1 check (revision > 0)
);
create table liferpg_reward_private.goal_day_credits (
  user_id uuid not null references auth.users(id) on delete cascade,
  local_date date not null,
  recorded_at timestamptz not null default now(),
  primary key (user_id, local_date)
);
create table liferpg_reward_private.chosen_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id text not null references liferpg_reward_private.items(id),
  spent_days smallint not null default 5 check (spent_days = 5),
  granted_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  unique (user_id, item_id)
);
create table liferpg_reward_private.chosen_offers (
  user_id uuid not null references auth.users(id) on delete cascade,
  slot smallint not null check (slot between 1 and 4),
  item_id text not null references liferpg_reward_private.items(id),
  primary key (user_id, slot), unique (user_id, item_id)
);
create table liferpg_reward_private.chosen_requests (
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  item_id text references liferpg_reward_private.items(id),
  expected_revision bigint not null,
  recorded_at timestamptz not null default now(),
  primary key (user_id, request_id)
);
alter table liferpg_reward_private.chosen_rollout enable row level security;
alter table liferpg_reward_private.chosen_accounts enable row level security;
alter table liferpg_reward_private.goal_day_credits enable row level security;
alter table liferpg_reward_private.chosen_grants enable row level security;
alter table liferpg_reward_private.chosen_offers enable row level security;
alter table liferpg_reward_private.chosen_requests enable row level security;
revoke all on liferpg_reward_private.chosen_rollout, liferpg_reward_private.chosen_accounts,
  liferpg_reward_private.goal_day_credits, liferpg_reward_private.chosen_grants,
  liferpg_reward_private.chosen_offers, liferpg_reward_private.chosen_requests from public, anon, authenticated;

create function liferpg_reward_private.chosen_boundary(p_user uuid) returns liferpg_reward_private.chosen_accounts
language plpgsql security definer set search_path = '' as $$
declare z text := liferpg_reward_private.zone(p_user); d date; a liferpg_reward_private.chosen_accounts;
begin
  select * into a from liferpg_reward_private.chosen_accounts where user_id = p_user;
  if found then return a; end if;
  select (launched_at at time zone z)::date + 1 into d from liferpg_reward_private.chosen_rollout;
  if d is null then raise exception 'Chosen rewards are not enabled'; end if;
  insert into liferpg_reward_private.chosen_accounts(user_id, launch_zone, first_credit_date, starts_at)
    values (p_user, z, d, d::timestamp at time zone z) on conflict do nothing;
  select * into a from liferpg_reward_private.chosen_accounts where user_id = p_user;
  return a;
end $$;
-- Existing owners are frozen at installation; new profiles are frozen at creation.
select liferpg_reward_private.chosen_boundary(id) from public.profiles order by id;
create function liferpg_reward_private.chosen_profile_created() returns trigger
language plpgsql security definer set search_path = '' as $$
begin perform liferpg_reward_private.chosen_boundary(new.id); return new; end $$;
create trigger chosen_profile_created after insert on public.profiles
for each row execute function liferpg_reward_private.chosen_profile_created();

create function liferpg_reward_private.capture_goal_day(p_user uuid, p_day date) returns void
language plpgsql security definer set search_path = '' as $$
declare a liferpg_reward_private.chosen_accounts;
begin
  a := liferpg_reward_private.chosen_boundary(p_user);
  if now() < a.starts_at or p_day < a.first_credit_date or p_day > liferpg_reward_private.local_today(p_user) then return; end if;
  if exists(select 1 from public.daily_progress where user_id = p_user and progress_date = p_day and goal_completed)
    and not exists(select 1 from liferpg_reward_private.pack_claims where user_id = p_user and pack_date = p_day) then
    insert into liferpg_reward_private.goal_day_credits(user_id, local_date) values(p_user, p_day) on conflict do nothing;
  end if;
end $$;
create function liferpg_reward_private.chosen_goal_confirmed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.goal_completed then perform liferpg_reward_private.capture_goal_day(new.user_id, new.progress_date); end if;
  return new;
end $$;
-- Captures the first qualification permanently, before a later goal edit can
-- change the flag. This trigger never locks the wallet or grants anything:
-- completion already owns a daily row; rewards RPCs lock wallet first.
create trigger chosen_goal_confirmed after insert or update of goal_completed on public.daily_progress
for each row execute function liferpg_reward_private.chosen_goal_confirmed();

create function liferpg_reward_private.chosen_owns(p_user uuid, p_item text, p_test boolean) returns boolean
language sql stable security definer set search_path = '' as $$
  select case when p_test then exists(select 1 from liferpg_reward_private.inventory where user_id = p_user and item_id = p_item)
    or exists(select 1 from liferpg_reward_private.items where id = p_item and is_free)
    else liferpg_reward_private.owns(p_user, p_item) end
$$;
create function liferpg_reward_private.chosen_balance(p_user uuid) returns bigint
language sql stable security definer set search_path = '' as $$
  select (select count(*) from liferpg_reward_private.goal_day_credits where user_id = p_user)
    - (select coalesce(sum(spent_days),0) from liferpg_reward_private.chosen_grants where user_id = p_user)
$$;
create function liferpg_reward_private.chosen_refresh(p_user uuid, p_test boolean default false) returns void
language plpgsql security definer set search_path = '' as $$
declare a liferpg_reward_private.chosen_accounts; d record; s smallint; item text; changed boolean := false; n integer;
begin
  perform liferpg_reward_private.wallet_for(p_user);
  a := liferpg_reward_private.chosen_boundary(p_user);
  if p_test and not liferpg_reward_private.is_dev(p_user) then raise exception 'Only developer accounts can use this'; end if;
  if not p_test then
    for d in select progress_date from public.daily_progress where user_id = p_user
      and progress_date >= a.first_credit_date and goal_completed
      and not exists(select 1 from liferpg_reward_private.goal_day_credits c where c.user_id = p_user and c.local_date = progress_date)
      order by progress_date loop
      perform liferpg_reward_private.capture_goal_day(p_user, d.progress_date);
    end loop;
  end if;
  if a.target is not null and (liferpg_reward_private.chosen_owns(p_user,a.target,p_test)
    or not exists(select 1 from liferpg_reward_private.items where id=a.target and not is_free and kind in ('wearable','background','decor'))) then
    update liferpg_reward_private.chosen_accounts set target = null where user_id = p_user;
    a.target := null; changed := true;
  end if;
  if a.target is not null and (p_test or now() >= a.starts_at) and liferpg_reward_private.chosen_balance(p_user) >= 5 then
    -- Existing source/event constraints remain intact. It is an effort milestone,
    -- recorded separately below as a chosen grant, never a trail find or a pack.
    perform liferpg_reward_private.give(p_user,a.target,'milestone',null,null);
    insert into liferpg_reward_private.chosen_grants(user_id,item_id) values(p_user,a.target);
    update liferpg_reward_private.chosen_accounts set target = null where user_id = p_user;
    changed := true;
  end if;
  delete from liferpg_reward_private.chosen_offers o where o.user_id = p_user
    and (liferpg_reward_private.chosen_owns(p_user,o.item_id,p_test)
      or not exists(select 1 from liferpg_reward_private.items i where i.id=o.item_id and not is_free and i.kind in ('wearable','background','decor')));
  get diagnostics n = row_count; changed := changed or n > 0;
  for s in 1..4 loop
    if exists(select 1 from liferpg_reward_private.chosen_offers where user_id=p_user and slot=s) then continue; end if;
    select id into item from liferpg_reward_private.items i where not i.is_free and i.kind in ('wearable','background','decor')
      and not liferpg_reward_private.chosen_owns(p_user,i.id,p_test)
      and not exists(select 1 from liferpg_reward_private.chosen_offers o where o.user_id=p_user and o.item_id=i.id)
      order by i.id limit 1;
    if item is not null then
      insert into liferpg_reward_private.chosen_offers(user_id,slot,item_id) values(p_user,s,item);
      changed := true;
    end if;
  end loop;
  if changed then update liferpg_reward_private.chosen_accounts set revision = revision + 1 where user_id = p_user; end if;
end $$;
create function liferpg_reward_private.chosen_state(p_user uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('version',1,'enabled',now() >= a.starts_at,'startsOn',a.first_credit_date,
    'requiredDays',5,'balance',liferpg_reward_private.chosen_balance(p_user),'target',a.target,'revision',a.revision,
    'offers',coalesce((select jsonb_agg(jsonb_build_object('slot',slot,'item',item_id) order by slot)
      from liferpg_reward_private.chosen_offers where user_id=p_user),'[]'::jsonb),
    'grants',coalesce((select jsonb_agg(jsonb_build_object('id',g.id,'item',g.item_id,'rarity',i.rarity,'new',true,'stardust',0) order by g.granted_at,g.id)
      from liferpg_reward_private.chosen_grants g join liferpg_reward_private.items i on i.id=g.item_id
      where g.user_id=p_user and g.acknowledged_at is null),'[]'::jsonb))
  from liferpg_reward_private.chosen_accounts a where a.user_id=p_user
$$;
create function liferpg_reward_private.chosen_pick(p_user uuid, p_item text, p_revision bigint, p_request uuid, p_test boolean default false) returns void
language plpgsql security definer set search_path = '' as $$
declare a liferpg_reward_private.chosen_accounts; prior liferpg_reward_private.chosen_requests;
begin
  perform liferpg_reward_private.wallet_for(p_user);
  if p_request is null or p_revision is null or p_revision < 1 then raise exception 'Invalid reward choice'; end if;
  select * into prior from liferpg_reward_private.chosen_requests where user_id=p_user and request_id=p_request;
  if found then
    if prior.item_id is distinct from p_item or prior.expected_revision <> p_revision then raise exception 'This request was already used for another reward'; end if;
    return;
  end if;
  perform liferpg_reward_private.chosen_refresh(p_user,p_test);
  a := liferpg_reward_private.chosen_boundary(p_user);
  if not p_test and now() < a.starts_at then raise exception 'Chosen rewards start tomorrow'; end if;
  if a.revision <> p_revision then raise exception 'Your rewards changed on another device. Refresh and choose again'; end if;
  if p_item is not null and not exists(select 1 from liferpg_reward_private.chosen_offers where user_id=p_user and item_id=p_item) then
    raise exception 'Choose one of your available rewards';
  end if;
  insert into liferpg_reward_private.chosen_requests(user_id,request_id,item_id,expected_revision) values(p_user,p_request,p_item,p_revision);
  update liferpg_reward_private.chosen_accounts set target=p_item, revision=revision+1 where user_id=p_user;
  perform liferpg_reward_private.chosen_refresh(p_user,p_test);
end $$;
create function public.choose_reward_v1(p_expected_owner uuid, p_item text, p_expected_revision bigint, p_request_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare owner uuid := liferpg_reward_private.signed_in(p_expected_owner);
begin
  perform liferpg_reward_private.chosen_pick(owner,p_item,p_expected_revision,p_request_id,false);
  perform liferpg_reward_private.grant_milestones(owner);
  return liferpg_reward_private.state(owner);
end $$;
create function public.acknowledge_chosen_rewards_v1(p_expected_owner uuid, p_grants uuid[]) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare owner uuid := liferpg_reward_private.signed_in(p_expected_owner);
begin
  if p_grants is null or coalesce(array_length(p_grants,1),0) > 64 then raise exception 'Invalid reward acknowledgement'; end if;
  perform liferpg_reward_private.wallet_for(owner);
  update liferpg_reward_private.chosen_grants set acknowledged_at=now()
    where user_id=owner and id=any(p_grants) and acknowledged_at is null;
  return liferpg_reward_private.state(owner);
end $$;
revoke all on function public.choose_reward_v1(uuid,text,bigint,uuid), public.acknowledge_chosen_rewards_v1(uuid,uuid[]) from public,anon;
grant execute on function public.choose_reward_v1(uuid,text,bigint,uuid), public.acknowledge_chosen_rewards_v1(uuid,uuid[]) to authenticated;

-- Existing state/claim/purchase/pack bodies, additive integrations and revokes
-- follow. The proposal-generation check compares their pre-change bodies with
-- the current branch and the read-only live metadata before writing them.
-- BEGIN GENERATED COMPATIBILITY
CREATE OR REPLACE FUNCTION liferpg_reward_private.state(p_user uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  return jsonb_build_object('chosen', liferpg_reward_private.chosen_state(p_user),
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
end $function$;

CREATE OR REPLACE FUNCTION public.get_rewards_v1(p_expected_owner uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare owner uuid := liferpg_reward_private.signed_in(p_expected_owner);
begin
  perform liferpg_reward_private.wallet_for(owner);
  perform liferpg_reward_private.chosen_refresh(owner);
  return liferpg_reward_private.state(owner);
end $function$;

CREATE OR REPLACE FUNCTION public.claim_session_rewards_v1(p_expected_owner uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  perform liferpg_reward_private.chosen_refresh(owner);
  return jsonb_build_object('chosenGrants', liferpg_reward_private.chosen_state(owner)->'grants', 'sessions', results, 'milestones', liferpg_reward_private.grant_milestones(owner), 'state', liferpg_reward_private.state(owner));
end $function$;

CREATE OR REPLACE FUNCTION public.buy_reward_item_v1(p_expected_owner uuid, p_item text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  perform liferpg_reward_private.chosen_refresh(owner);
  return jsonb_build_object('item', p_item, 'milestones', liferpg_reward_private.grant_milestones(owner), 'state', liferpg_reward_private.state(owner));
end $function$;

CREATE OR REPLACE FUNCTION liferpg_reward_private.open_legacy_pack(p_expected_owner uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
end $function$;


create or replace function public.open_daily_pack_v1(p_expected_owner uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare owner uuid := liferpg_reward_private.signed_in(p_expected_owner); a liferpg_reward_private.chosen_accounts;
begin
  perform liferpg_reward_private.wallet_for(owner);
  a := liferpg_reward_private.chosen_boundary(owner);
  if now() >= a.starts_at then
    raise exception 'Daily packs have been replaced by chosen rewards. Reach your daily goal to earn progress in the latest app';
  end if;
  return liferpg_reward_private.open_legacy_pack(owner);
end $$;

CREATE OR REPLACE FUNCTION public.dev_reward_lab_v1(p_expected_owner uuid, p_action text, p_snapshot jsonb, p_item text DEFAULT NULL::text, p_amount integer DEFAULT 0, p_avatar jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare owner uuid := liferpg_reward_private.signed_in(p_expected_owner);
  result jsonb; next_state jsonb; gift jsonb; got jsonb := '[]'::jsonb; pack jsonb;
  today date; item_kind text; source_kind text; dust integer; days integer; e record;
begin
  if not exists(select 1 from liferpg_auth_private.developers where user_id = owner) then
    raise exception 'Only developer accounts can use this' using errcode = '42501';
  end if;
  if p_action is null or p_action not in ('load','buy','avatar','find','pack','give','duplicate','stardust')
    or p_snapshot is null or octet_length(p_snapshot::text) > 50000
    or jsonb_typeof(p_snapshot -> 'earned') is distinct from 'array'
    or jsonb_typeof(p_snapshot -> 'owned') is distinct from 'array'
    or jsonb_typeof(p_snapshot -> 'avatar') is distinct from 'object'
    or coalesce(p_snapshot ->> 'stardust','') !~ '^[0-9]{1,9}$'
    or coalesce(p_snapshot #>> '{pack,daysInARow}','') !~ '^[0-9]{1,6}$'
    or coalesce(p_snapshot #>> '{avatar,revision}','') !~ '^[0-9]{1,9}$' then
    raise exception 'Invalid test inventory' using errcode = '22023';
  end if;
  dust := (p_snapshot ->> 'stardust')::integer;
  days := (p_snapshot #>> '{pack,daysInARow}')::integer;
  if dust > 100000000 or jsonb_array_length(p_snapshot -> 'earned') > 128
    or jsonb_array_length(p_snapshot -> 'owned') > 128
    or exists(select 1 from jsonb_array_elements_text(p_snapshot -> 'earned') a(id)
      where not exists(select 1 from liferpg_reward_private.items i where i.id = a.id)) then
    raise exception 'Invalid test inventory' using errcode = '22023';
  end if;
  today := liferpg_reward_private.local_today(owner);
  -- No statement outside this block writes account data. The exception rolls
  -- back the test setup AND all nested normal RPC writes, including failures.
  begin
    perform liferpg_reward_private.wallet_for(owner);
    delete from liferpg_reward_private.inventory where user_id = owner;
    insert into liferpg_reward_private.inventory(user_id,item_id,source)
      select owner, a.id, 'find' from jsonb_array_elements_text(p_snapshot -> 'earned') a(id) group by a.id;
    update liferpg_reward_private.wallets set stardust = dust, pack_days = days, last_pack_date = today - 1 where user_id = owner;
    update liferpg_reward_private.avatars set look = p_snapshot #> '{avatar,look}',
      equipped = p_snapshot #> '{avatar,equipped}', background = p_snapshot #>> '{avatar,background}',
      title = nullif(p_snapshot #>> '{avatar,title}', ''), revision = (p_snapshot #>> '{avatar,revision}')::bigint
      where user_id = owner;
    if p_action = 'buy' then
      result := public.buy_reward_item_v1(owner, p_item);
      got := coalesce(result -> 'milestones', '[]'::jsonb);
    elsif p_action = 'avatar' then
      -- The real developer account may wear everything. In the lab, also
      -- enforce the selected test ownership before running the real validator.
      if p_avatar is null or jsonb_typeof(p_avatar -> 'equipped') is distinct from 'object' then raise exception 'Invalid outfit'; end if;
      for e in select value #>> '{}' as item from jsonb_each(p_avatar -> 'equipped')
        union all select p_avatar ->> 'background' union all select nullif(p_avatar ->> 'title','') loop
        if e.item is not null and not (p_snapshot -> 'owned' ? e.item)
          and not exists(select 1 from liferpg_reward_private.items where id = e.item and is_free) then
          raise exception 'You don''t have that item yet';
        end if;
      end loop;
      perform public.save_avatar_v1(owner, p_avatar, (p_snapshot #>> '{avatar,revision}')::bigint);
    elsif p_action = 'pack' then
      if p_amount is null or p_amount not between 0 and 3 then raise exception 'Invalid pack tier'; end if;
      delete from liferpg_reward_private.pack_claims where user_id = owner and pack_date = today;
      update liferpg_reward_private.wallets set pack_days = (array[0,2,6,13])[p_amount + 1], last_pack_date = today - 1 where user_id = owner;
      pack := liferpg_reward_private.open_legacy_pack(owner);
      got := coalesce(pack -> 'items','[]'::jsonb) || coalesce(pack -> 'milestones','[]'::jsonb);
    elsif p_action = 'find' then
      result := public.dev_rewards_v1(owner, 'find', 0);
      got := coalesce(result -> 'gifts','[]'::jsonb);
    elsif p_action in ('give','duplicate') then
      select kind into item_kind from liferpg_reward_private.items where id = p_item;
      if not found then raise exception 'Invalid reward'; end if;
      source_kind := case item_kind when 'pet' then 'milestone' when 'frame' then 'streak' when 'title' then 'set' else 'find' end;
      if p_action = 'duplicate' and not exists(select 1 from liferpg_reward_private.inventory where user_id = owner and item_id = p_item) then
        perform liferpg_reward_private.give(owner,p_item,source_kind,null,null);
      end if;
      gift := liferpg_reward_private.give(owner,p_item,source_kind,null,null);
      got := jsonb_build_array(gift);
    elsif p_action = 'stardust' then
      if p_amount is null or p_amount not between 0 and 1000000 then raise exception 'Invalid test balance'; end if;
      update liferpg_reward_private.wallets set stardust = p_amount where user_id = owner;
    end if;
    next_state := liferpg_reward_private.state(owner);
    -- Remove the developer's automatic all-owned override for test purchases.
    next_state := next_state || jsonb_build_object('owned', (
      select coalesce(jsonb_agg(i.id order by i.id),'[]'::jsonb) from liferpg_reward_private.items i where i.is_free
        or exists(select 1 from liferpg_reward_private.inventory v where v.user_id = owner and v.item_id = i.id)));
    result := jsonb_build_object('state',next_state,'gifts',got);
    if pack is not null then result := result || jsonb_build_object('pack',pack - 'state'); end if;
    raise exception using errcode = 'P7500', message = 'Rollback completed developer reward test';
  exception when sqlstate 'P7500' then
    -- PL/pgSQL variables retain the result while all table writes roll back.
    null;
  end;
  return result;
end $function$;


-- A separate rolled-back preview. Only test setup may create test credits;
-- ordinary qualification and the developer pack bypass never call it.
create function public.dev_chosen_reward_lab_v1(p_expected_owner uuid, p_action text, p_snapshot jsonb,
  p_item text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare owner uuid := liferpg_reward_private.signed_in(p_expected_owner); a liferpg_reward_private.chosen_accounts;
  c jsonb; result jsonb; balance integer; row record; d date;
begin
  if not liferpg_reward_private.is_dev(owner) then raise exception 'Only developer accounts can use this'; end if;
  if p_action is null or p_action not in ('load','day','select') or p_snapshot is null or octet_length(p_snapshot::text)>50000
    or jsonb_typeof(p_snapshot->'earned') is distinct from 'array' or jsonb_array_length(p_snapshot->'earned')>128 then
    raise exception 'Invalid test inventory';
  end if;
  if exists(select 1 from jsonb_array_elements_text(p_snapshot->'earned') e(id)
    where not exists(select 1 from liferpg_reward_private.items where id=e.id)) then raise exception 'Invalid test inventory'; end if;
  c := p_snapshot->'chosen';
  if c is not null and (jsonb_typeof(c) is distinct from 'object' or coalesce(c->>'balance','') !~ '^[0-9]{1,4}$'
    or coalesce(c->>'revision','') !~ '^[0-9]{1,9}$' or jsonb_typeof(c->'offers') is distinct from 'array'
    or jsonb_array_length(c->'offers')>4) then raise exception 'Invalid test credits'; end if;
  balance := coalesce((c->>'balance')::integer,0);
  if balance>1000 then raise exception 'Invalid test credits'; end if;
  begin
    perform liferpg_reward_private.wallet_for(owner);
    a := liferpg_reward_private.chosen_boundary(owner);
    delete from liferpg_reward_private.inventory where user_id=owner;
    insert into liferpg_reward_private.inventory(user_id,item_id,source)
      select owner,e.id,'milestone' from jsonb_array_elements_text(p_snapshot->'earned') e(id) group by e.id;
    delete from liferpg_reward_private.chosen_requests where user_id=owner;
    delete from liferpg_reward_private.chosen_grants where user_id=owner;
    delete from liferpg_reward_private.goal_day_credits where user_id=owner;
    delete from liferpg_reward_private.chosen_offers where user_id=owner;
    update liferpg_reward_private.chosen_accounts set target=nullif(c->>'target',''), revision=greatest(1,coalesce((c->>'revision')::bigint,1)) where user_id=owner;
    insert into liferpg_reward_private.goal_day_credits(user_id,local_date)
      select owner,a.first_credit_date+n from generate_series(1,balance) n;
    if c is not null then
      for row in select value v from jsonb_array_elements(c->'offers') loop
        if coalesce(row.v->>'slot','') !~ '^[1-4]$' or not exists(select 1 from liferpg_reward_private.items
          where id=row.v->>'item' and not is_free and kind in ('wearable','background','decor')) then raise exception 'Invalid test offers'; end if;
        insert into liferpg_reward_private.chosen_offers(user_id,slot,item_id) values(owner,(row.v->>'slot')::smallint,row.v->>'item');
      end loop;
    end if;
    perform liferpg_reward_private.chosen_refresh(owner,true);
    if p_action='day' then
      select coalesce(max(local_date),a.first_credit_date)+1 into d from liferpg_reward_private.goal_day_credits where user_id=owner;
      insert into liferpg_reward_private.goal_day_credits(user_id,local_date) values(owner,d);
      perform liferpg_reward_private.chosen_refresh(owner,true);
    elsif p_action='select' then
      select * into a from liferpg_reward_private.chosen_accounts where user_id=owner;
      perform liferpg_reward_private.chosen_pick(owner,p_item,a.revision,gen_random_uuid(),true);
    end if;
    result := liferpg_reward_private.state(owner);
    result := result || jsonb_build_object('owned',(select coalesce(jsonb_agg(id order by id),'[]'::jsonb)
      from liferpg_reward_private.items i where i.is_free or exists(select 1 from liferpg_reward_private.inventory where user_id=owner and item_id=i.id)),
      'chosen',(liferpg_reward_private.chosen_state(owner)||jsonb_build_object('enabled',true)));
    raise exception using errcode='P8000',message='Rollback completed chosen reward preview';
  exception when sqlstate 'P8000' then null;
  end;
  return result;
end $$;
revoke all on function public.dev_chosen_reward_lab_v1(uuid,text,jsonb,text) from public,anon;
grant execute on function public.dev_chosen_reward_lab_v1(uuid,text,jsonb,text) to authenticated;
-- New helpers are private even though Postgres otherwise grants PUBLIC EXECUTE.
do $$ declare f record; begin
  for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='liferpg_reward_private' and (p.proname like 'chosen_%' or p.proname in ('capture_goal_day','open_legacy_pack')) loop
    execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  end loop;
end $$;
-- No public grants were widened: existing RPCs preserve their owner checks.
commit;
