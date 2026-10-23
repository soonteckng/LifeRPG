-- Streak frames are no longer worn by choice. Your picture always shows the
-- highest streak frame you have earned, and it upgrades on its own as the
-- streak grows. Two more steps fill the gaps: 60 days and 180 days.
-- The app also gets the list of what each person really earned, so it can
-- celebrate anything new (developers see every item as owned, but only what
-- they really earned is celebrated or decides their frame).

insert into liferpg_reward_private.items(id, kind, slot, set_key, rarity, is_free, from_finds, from_packs, price) values
  ('frame_streak_60', 'frame', null, null, 'rare', false, false, false, null),
  ('frame_streak_180', 'frame', null, null, 'epic', false, false, false, null)
on conflict (id) do nothing;

create or replace function liferpg_reward_private.streak_frames() returns table(item text, need integer)
language sql immutable set search_path = '' as $$
  select * from (values ('frame_streak_7', 7), ('frame_streak_30', 30), ('frame_streak_60', 60), ('frame_streak_100', 100),
    ('frame_streak_180', 180), ('frame_streak_365', 365)) v(item, need)
$$;

-- The highest streak frame really earned, or none (the level frame shows).
create or replace function liferpg_reward_private.auto_frame(p_user uuid) returns text
language sql volatile security definer set search_path = '' as $$
  select f.item from liferpg_reward_private.streak_frames() f
  where exists(select 1 from liferpg_reward_private.inventory v where v.user_id = p_user and v.item_id = f.item)
  order by f.need desc limit 1
$$;

create or replace function liferpg_reward_private.grant_milestones(p_user uuid) returns jsonb
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
  for m in select * from liferpg_reward_private.streak_frames() order by need loop
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

-- Volatile, so a reply that just gave something already shows it (a stable
-- function would see the rows as they were when the call started).
create or replace function liferpg_reward_private.state(p_user uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare w liferpg_reward_private.wallets; a liferpg_reward_private.avatars; today date := liferpg_reward_private.local_today(p_user);
  reached boolean; next_days integer; base integer; earned jsonb;
begin
  select * into w from liferpg_reward_private.wallets where user_id = p_user;
  select * into a from liferpg_reward_private.avatars where user_id = p_user;
  reached := exists(select 1 from public.daily_progress where user_id = p_user and progress_date = today and goal_completed);
  base := case when w.last_pack_date is null then 0 when w.last_pack_date >= today - 1 then w.pack_days
    else (array[0, 1, 3, 7])[liferpg_reward_private.pack_tier(w.pack_days) + 1] end;
  next_days := base + 1;
  earned := coalesce((select jsonb_agg(item_id order by acquired_at, item_id) from liferpg_reward_private.inventory where user_id = p_user), '[]'::jsonb);
  return jsonb_build_object(
    'stardust', coalesce(w.stardust, 0),
    'nextFindSeconds', 1500 - coalesce(w.find_bank_seconds, 0),
    'owned', case when liferpg_reward_private.is_dev(p_user)
      then (select jsonb_agg(id order by id) from liferpg_reward_private.items) else earned end,
    'earned', earned,
    'avatar', jsonb_build_object('look', coalesce(a.look, '{}'::jsonb), 'equipped', coalesce(a.equipped, '{}'::jsonb),
      'frame', liferpg_reward_private.auto_frame(p_user), 'background', coalesce(a.background, 'bg_dusk'), 'title', a.title, 'revision', coalesce(a.revision, 0)),
    'pack', jsonb_build_object('date', today, 'goalReached', reached,
      'claimed', exists(select 1 from liferpg_reward_private.pack_claims where user_id = p_user and pack_date = today),
      'tier', case when w.last_pack_date = today then liferpg_reward_private.pack_tier(w.pack_days) else liferpg_reward_private.pack_tier(next_days) end,
      'daysInARow', case when w.last_pack_date = today then w.pack_days else base end));
end $$;

-- The frame is no longer part of a saved look; any frame sent is ignored.
create or replace function public.save_avatar_v1(p_expected_owner uuid, p_avatar jsonb, p_expected_revision bigint) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare owner uuid := liferpg_reward_private.signed_in(p_expected_owner); a liferpg_reward_private.avatars;
  v_look jsonb := p_avatar -> 'look'; v_equipped jsonb := coalesce(p_avatar -> 'equipped', '{}'::jsonb); e record; it liferpg_reward_private.items;
  v_background text := coalesce(nullif(p_avatar ->> 'background', ''), 'bg_dusk'); v_title text := nullif(p_avatar ->> 'title', '');
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
    if not liferpg_reward_private.owns(owner, it.id) then raise exception 'You don''t have that item yet'; end if;
  end loop;
  if not (liferpg_reward_private.owns(owner, v_background) and exists(select 1 from liferpg_reward_private.items where id = v_background and kind = 'background'))
    then raise exception 'You don''t have that background yet'; end if;
  if v_title is not null and not (liferpg_reward_private.owns(owner, v_title) and exists(select 1 from liferpg_reward_private.items where id = v_title and kind = 'title'))
    then raise exception 'You don''t have that title yet'; end if;
  update liferpg_reward_private.avatars set look = v_look, equipped = v_equipped, frame = null, background = v_background, title = v_title,
    revision = a.revision + 1, updated_at = now() where user_id = owner;
  return liferpg_reward_private.state(owner);
end $$;

revoke all on function liferpg_reward_private.streak_frames() from public, anon, authenticated;
revoke all on function liferpg_reward_private.auto_frame(uuid) from public, anon, authenticated;
