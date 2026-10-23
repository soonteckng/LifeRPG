-- Developer accounts have every reward unlocked, so they can try everything
-- on the same screens everyone uses. For everyone else nothing changes: what
-- they own is what is in their inventory. Only the list of what someone owns
-- (and the ownership checks when saving a look) learn about developers.

create function liferpg_reward_private.is_dev(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from liferpg_auth_private.developers where user_id = p_user)
$$;

create or replace function liferpg_reward_private.owns(p_user uuid, p_item text) returns boolean
language sql stable security definer set search_path = '' as $$
  select liferpg_reward_private.is_dev(p_user)
    or exists(select 1 from liferpg_reward_private.items where id = p_item and is_free)
    or exists(select 1 from liferpg_reward_private.inventory where user_id = p_user and item_id = p_item)
$$;

create or replace function liferpg_reward_private.state(p_user uuid) returns jsonb
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
    'owned', case when liferpg_reward_private.is_dev(p_user)
      then (select jsonb_agg(id order by id) from liferpg_reward_private.items)
      else coalesce((select jsonb_agg(item_id order by acquired_at, item_id) from liferpg_reward_private.inventory where user_id = p_user), '[]'::jsonb) end,
    'avatar', jsonb_build_object('look', coalesce(a.look, '{}'::jsonb), 'equipped', coalesce(a.equipped, '{}'::jsonb),
      'frame', a.frame, 'background', coalesce(a.background, 'bg_dusk'), 'title', a.title, 'revision', coalesce(a.revision, 0)),
    'pack', jsonb_build_object('date', today, 'goalReached', reached,
      'claimed', exists(select 1 from liferpg_reward_private.pack_claims where user_id = p_user and pack_date = today),
      'tier', case when w.last_pack_date = today then liferpg_reward_private.pack_tier(w.pack_days) else liferpg_reward_private.pack_tier(next_days) end,
      'daysInARow', case when w.last_pack_date = today then w.pack_days else base end));
end $$;

create or replace function public.save_avatar_v1(p_expected_owner uuid, p_avatar jsonb, p_expected_revision bigint) returns jsonb
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
    if not liferpg_reward_private.owns(owner, it.id) then raise exception 'You don''t have that item yet'; end if;
  end loop;
  if v_frame is not null and not (liferpg_reward_private.owns(owner, v_frame) and exists(select 1 from liferpg_reward_private.items where id = v_frame and kind = 'frame'))
    then raise exception 'You don''t have that frame yet'; end if;
  if not (liferpg_reward_private.owns(owner, v_background) and exists(select 1 from liferpg_reward_private.items where id = v_background and kind = 'background'))
    then raise exception 'You don''t have that background yet'; end if;
  if v_title is not null and not (liferpg_reward_private.owns(owner, v_title) and exists(select 1 from liferpg_reward_private.items where id = v_title and kind = 'title'))
    then raise exception 'You don''t have that title yet'; end if;
  update liferpg_reward_private.avatars set look = v_look, equipped = v_equipped, frame = v_frame, background = v_background, title = v_title,
    revision = a.revision + 1, updated_at = now() where user_id = owner;
  return liferpg_reward_private.state(owner);
end $$;

revoke all on function liferpg_reward_private.is_dev(uuid) from public, anon, authenticated;
revoke all on function liferpg_reward_private.owns(uuid, text) from public, anon, authenticated;
