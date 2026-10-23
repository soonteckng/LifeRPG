-- Squads show everyone's real profile picture, and tapping someone opens
-- their player card. A card shows only what squad mates may see: the
-- picture, name and level always; focus stats unless that person keeps them
-- to themselves ("Who sees your stats": my squads, the default, or only me).

create table liferpg_squad_private.player_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  show_stats text not null default 'squads' check (show_stats in ('squads', 'private')),
  updated_at timestamptz not null default now()
);
revoke all on liferpg_squad_private.player_settings from public, anon, authenticated;

-- What a squad mate sees of someone's character: their saved look and the
-- frame their streak earned. Null until they've opened their character once.
create function liferpg_reward_private.public_look(p_user uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('look', a.look, 'equipped', a.equipped, 'background', coalesce(a.background, 'bg_dusk'), 'title', a.title,
    'frame', (select f.item from liferpg_reward_private.streak_frames() f
      where exists(select 1 from liferpg_reward_private.inventory v where v.user_id = p_user and v.item_id = f.item) order by f.need desc limit 1))
  from liferpg_reward_private.avatars a where a.user_id = p_user and a.look <> '{}'::jsonb
$$;
revoke all on function liferpg_reward_private.public_look(uuid) from public, anon, authenticated;

create or replace function liferpg_squad_private.squad_json(p_squad uuid, p_viewer uuid, p_since timestamptz) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', s.id, 'name', s.name, 'code', s.code, 'ownerIsYou', s.owner_id = p_viewer, 'goalMinutes', s.weekly_goal_minutes,
    'members', coalesce((select jsonb_agg(jsonb_build_object(
        'id', m.user_id, 'isYou', m.user_id = p_viewer, 'isOwner', m.user_id = s.owner_id,
        'name', coalesce(nullif(btrim(p.username), ''), 'Friend'), 'avatar', coalesce(p.avatar, ''), 'level', coalesce(p.level, 1),
        'streak', liferpg_squad_private.focus_streak(m.user_id, coalesce(nullif(p.timezone, ''), 'Asia/Kuala_Lumpur')),
        'weekSeconds', coalesce((select sum(a.duration_seconds) from public.activity_sessions a
          where a.user_id = m.user_id and a.status = 'completed' and a.completed_at >= p_since), 0),
        'focusingNow', exists(select 1 from public.activity_sessions a where a.user_id = m.user_id and a.status = 'active' and a.started_at > now() - interval '10 hours'),
        'look', liferpg_reward_private.public_look(m.user_id))
      order by m.joined_at, m.user_id)
      from liferpg_squad_private.members m left join public.profiles p on p.id = m.user_id where m.squad_id = s.id and m.left_at is null), '[]'::jsonb))
  from liferpg_squad_private.squads s where s.id = p_squad
$$;

-- One player's card. Only you, or someone sharing a squad with you.
create function public.get_player_card_v1(p_expected_owner uuid, p_player uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare owner uuid := liferpg_squad_private.signed_in(p_expected_owner); p public.profiles; shown boolean;
begin
  if p_player is null then raise exception 'Player not found'; end if;
  if p_player <> owner and not exists(
      select 1 from liferpg_squad_private.members a join liferpg_squad_private.members b on b.squad_id = a.squad_id
      join liferpg_squad_private.squads s on s.id = a.squad_id
      where a.user_id = owner and b.user_id = p_player and a.left_at is null and b.left_at is null and s.closed_at is null) then
    raise exception 'Player not found'; end if;
  select * into p from public.profiles where id = p_player;
  if not found then raise exception 'Player not found'; end if;
  shown := p_player = owner or coalesce((select show_stats from liferpg_squad_private.player_settings where user_id = p_player), 'squads') = 'squads';
  return jsonb_build_object('id', p_player, 'isYou', p_player = owner,
    'name', coalesce(nullif(btrim(p.username), ''), 'Friend'), 'level', coalesce(p.level, 1),
    'look', liferpg_reward_private.public_look(p_player),
    'statsShared', coalesce((select show_stats from liferpg_squad_private.player_settings where user_id = p_player), 'squads') = 'squads',
    'stats', case when not shown then null else jsonb_build_object(
      'streak', liferpg_squad_private.focus_streak(p_player, coalesce(nullif(p.timezone, ''), 'Asia/Kuala_Lumpur')),
      'totalSeconds', coalesce((select sum(a.duration_seconds) from public.activity_sessions a
        where a.user_id = p_player and a.status = 'completed' and a.credit_result is not null), 0),
      'sessions', (select count(*) from public.activity_sessions a where a.user_id = p_player and a.status = 'completed' and a.credit_result is not null),
      'collected', (select count(*) from liferpg_reward_private.inventory v join liferpg_reward_private.items i on i.id = v.item_id
        where v.user_id = p_player and i.kind in ('wearable', 'pet', 'background', 'decor')),
      'since', (select min(a.completed_at) from public.activity_sessions a where a.user_id = p_player and a.status = 'completed' and a.credit_result is not null)
    ) end);
end $$;

-- Who sees your focus stats on your player card.
create function public.set_stats_visibility_v1(p_expected_owner uuid, p_show text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare owner uuid := liferpg_squad_private.signed_in(p_expected_owner);
begin
  if p_show is null or p_show not in ('squads', 'private') then raise exception 'Invalid choice'; end if;
  insert into liferpg_squad_private.player_settings(user_id, show_stats) values (owner, p_show)
    on conflict (user_id) do update set show_stats = excluded.show_stats, updated_at = now();
  return jsonb_build_object('showStats', p_show);
end $$;

create function public.get_stats_visibility_v1(p_expected_owner uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare owner uuid := liferpg_squad_private.signed_in(p_expected_owner);
begin
  return jsonb_build_object('showStats', coalesce((select show_stats from liferpg_squad_private.player_settings where user_id = owner), 'squads'));
end $$;

revoke all on function public.get_player_card_v1(uuid, uuid) from public, anon;
revoke all on function public.set_stats_visibility_v1(uuid, text) from public, anon;
revoke all on function public.get_stats_visibility_v1(uuid) from public, anon;
grant execute on function public.get_player_card_v1(uuid, uuid) to authenticated;
grant execute on function public.set_stats_visibility_v1(uuid, text) to authenticated;
grant execute on function public.get_stats_visibility_v1(uuid) to authenticated;
