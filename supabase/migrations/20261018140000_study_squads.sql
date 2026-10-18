-- Study squads: small invite-code groups (up to 8) that see each other's
-- focus time for the week and who is focusing right now. Private schema,
-- SECURITY DEFINER functions only, owner checks on every call. Members see
-- only name, look, level, streak and focus time of people in their squads.
-- Leaving and closing are recorded with timestamps rather than deleting rows.

create schema if not exists liferpg_squad_private;
revoke all on schema liferpg_squad_private from public, anon, authenticated;

create table liferpg_squad_private.squads (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 40),
  code text not null unique check (code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  owner_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  unique (owner_id, request_id)
);

create table liferpg_squad_private.members (
  squad_id uuid not null references liferpg_squad_private.squads(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default clock_timestamp(),
  left_at timestamptz,
  primary key (squad_id, user_id)
);
create index squad_members_user on liferpg_squad_private.members(user_id);

-- Wrong codes are counted so codes can't be guessed by trying many. Only
-- wrong codes add a row, at most 10 an hour per person.
create table liferpg_squad_private.join_attempts (
  user_id uuid not null references auth.users(id) on delete cascade,
  attempted_at timestamptz not null default now()
);
create index squad_join_attempts_user on liferpg_squad_private.join_attempts(user_id, attempted_at);

alter table liferpg_squad_private.squads enable row level security;
alter table liferpg_squad_private.members enable row level security;
alter table liferpg_squad_private.join_attempts enable row level security;
revoke all on all tables in schema liferpg_squad_private from public, anon, authenticated;

create function liferpg_squad_private.signed_in(p_expected_owner uuid) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare owner uuid := auth.uid();
begin
  if owner is null or p_expected_owner is null or owner<>p_expected_owner or not exists(select 1 from auth.users where id=owner) then
    raise exception 'Account changed. Reconnect to your account'; end if;
  return owner;
end $$;

create function liferpg_squad_private.squad_json(p_squad uuid, p_viewer uuid, p_since timestamptz) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', s.id, 'name', s.name, 'code', s.code, 'ownerIsYou', s.owner_id = p_viewer,
    'members', coalesce((select jsonb_agg(jsonb_build_object(
        'id', m.user_id, 'isYou', m.user_id = p_viewer, 'isOwner', m.user_id = s.owner_id,
        'name', coalesce(nullif(btrim(p.username), ''), 'Friend'), 'avatar', coalesce(p.avatar, ''), 'level', coalesce(p.level, 1), 'streak', coalesce(p.streak_count, 0),
        'weekSeconds', coalesce((select sum(a.duration_seconds) from public.activity_sessions a
          where a.user_id = m.user_id and a.status = 'completed' and a.completed_at >= p_since), 0),
        'focusingNow', exists(select 1 from public.activity_sessions a where a.user_id = m.user_id and a.status = 'active' and a.started_at > now() - interval '10 hours'))
      order by m.joined_at, m.user_id)
      from liferpg_squad_private.members m left join public.profiles p on p.id = m.user_id where m.squad_id = s.id and m.left_at is null), '[]'::jsonb))
  from liferpg_squad_private.squads s where s.id = p_squad
$$;

create function liferpg_squad_private.new_code() returns text language plpgsql volatile set search_path = '' as $$
declare alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; result text; attempt int := 0;
begin
  loop
    result := '';
    for i in 1..6 loop result := result || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1); end loop;
    exit when not exists(select 1 from liferpg_squad_private.squads where code = result);
    attempt := attempt + 1; if attempt > 20 then raise exception 'Try again in a moment'; end if;
  end loop;
  return result;
end $$;

-- Squads for the Study tab. p_since is the start of the viewer's local week.
create function public.list_squads_v1(p_expected_owner uuid, p_since timestamptz) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare owner uuid := liferpg_squad_private.signed_in(p_expected_owner);
begin
  if p_since is null or p_since < now() - interval '8 days' or p_since > now() + interval '1 day' then raise exception 'Invalid week'; end if;
  return coalesce((select jsonb_agg(liferpg_squad_private.squad_json(m.squad_id, owner, p_since) order by m.joined_at)
    from liferpg_squad_private.members m join liferpg_squad_private.squads s on s.id = m.squad_id
    where m.user_id = owner and m.left_at is null and s.closed_at is null), '[]'::jsonb);
end $$;

create function public.create_squad_v1(p_request_id uuid, p_name text, p_expected_owner uuid, p_since timestamptz) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare owner uuid := liferpg_squad_private.signed_in(p_expected_owner); squad uuid;
begin
  if p_request_id is null or p_name is null or length(p_name) not between 1 and 40 or btrim(p_name) <> p_name or p_name ~ '[[:cntrl:]]' then raise exception 'Invalid squad name'; end if;
  if p_since is null or p_since < now() - interval '8 days' or p_since > now() + interval '1 day' then raise exception 'Invalid week'; end if;
  perform pg_advisory_xact_lock(hashtextextended('liferpg-squad-user:' || owner::text, 0));
  select id into squad from liferpg_squad_private.squads where owner_id = owner and request_id = p_request_id;
  if squad is null then
    if (select count(*) from liferpg_squad_private.members where user_id = owner and left_at is null) >= 5 then return jsonb_build_object('status', 'limit'); end if;
    insert into liferpg_squad_private.squads(name, code, owner_id, request_id) values (p_name, liferpg_squad_private.new_code(), owner, p_request_id) returning id into squad;
    insert into liferpg_squad_private.members(squad_id, user_id) values (squad, owner);
  end if;
  return jsonb_build_object('status', 'saved', 'squad', liferpg_squad_private.squad_json(squad, owner, p_since));
end $$;

create function public.join_squad_v1(p_code text, p_expected_owner uuid, p_since timestamptz) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare owner uuid := liferpg_squad_private.signed_in(p_expected_owner); found_squad liferpg_squad_private.squads; clean text := upper(btrim(coalesce(p_code, '')));
begin
  if p_since is null or p_since < now() - interval '8 days' or p_since > now() + interval '1 day' then raise exception 'Invalid week'; end if;
  perform pg_advisory_xact_lock(hashtextextended('liferpg-squad-user:' || owner::text, 0));
  if (select count(*) from liferpg_squad_private.join_attempts where user_id = owner and attempted_at > now() - interval '1 hour') >= 10 then
    return jsonb_build_object('status', 'slow_down'); end if;
  select * into found_squad from liferpg_squad_private.squads where code = clean and closed_at is null;
  if found_squad.id is null then
    insert into liferpg_squad_private.join_attempts(user_id) values (owner);
    return jsonb_build_object('status', 'not_found');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('liferpg-squad:' || found_squad.id::text, 0));
  if not exists(select 1 from liferpg_squad_private.members where squad_id = found_squad.id and user_id = owner and left_at is null) then
    if (select count(*) from liferpg_squad_private.members where user_id = owner and left_at is null) >= 5 then return jsonb_build_object('status', 'limit'); end if;
    if (select count(*) from liferpg_squad_private.members where squad_id = found_squad.id and left_at is null) >= 8 then return jsonb_build_object('status', 'full'); end if;
    insert into liferpg_squad_private.members(squad_id, user_id) values (found_squad.id, owner)
      on conflict (squad_id, user_id) do update set left_at = null, joined_at = clock_timestamp();
  end if;
  return jsonb_build_object('status', 'saved', 'squad', liferpg_squad_private.squad_json(found_squad.id, owner, p_since));
end $$;

-- Leaving hands the squad to the longest-standing member, or ends it when empty.
create function public.leave_squad_v1(p_squad_id uuid, p_expected_owner uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare owner uuid := liferpg_squad_private.signed_in(p_expected_owner); heir uuid;
begin
  if p_squad_id is null then raise exception 'Invalid squad'; end if;
  perform pg_advisory_xact_lock(hashtextextended('liferpg-squad:' || p_squad_id::text, 0));
  update liferpg_squad_private.members set left_at = clock_timestamp() where squad_id = p_squad_id and user_id = owner and left_at is null;
  if exists(select 1 from liferpg_squad_private.squads where id = p_squad_id and owner_id = owner and closed_at is null) then
    select user_id into heir from liferpg_squad_private.members where squad_id = p_squad_id and left_at is null order by joined_at, user_id limit 1;
    if heir is null then update liferpg_squad_private.squads set closed_at = clock_timestamp() where id = p_squad_id;
    else update liferpg_squad_private.squads set owner_id = heir where id = p_squad_id; end if;
  end if;
  return jsonb_build_object('status', 'saved');
end $$;

create function public.remove_squad_member_v1(p_squad_id uuid, p_member uuid, p_expected_owner uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare owner uuid := liferpg_squad_private.signed_in(p_expected_owner);
begin
  if p_squad_id is null or p_member is null or p_member = owner then raise exception 'Invalid member'; end if;
  perform pg_advisory_xact_lock(hashtextextended('liferpg-squad:' || p_squad_id::text, 0));
  if not exists(select 1 from liferpg_squad_private.squads where id = p_squad_id and owner_id = owner and closed_at is null) then return jsonb_build_object('status', 'not_owner'); end if;
  update liferpg_squad_private.members set left_at = clock_timestamp() where squad_id = p_squad_id and user_id = p_member and left_at is null;
  return jsonb_build_object('status', 'saved');
end $$;

revoke all on function liferpg_squad_private.signed_in(uuid) from public, anon, authenticated;
revoke all on function liferpg_squad_private.squad_json(uuid, uuid, timestamptz) from public, anon, authenticated;
revoke all on function liferpg_squad_private.new_code() from public, anon, authenticated;
revoke all on function public.list_squads_v1(uuid, timestamptz) from public, anon;
revoke all on function public.create_squad_v1(uuid, text, uuid, timestamptz) from public, anon;
revoke all on function public.join_squad_v1(text, uuid, timestamptz) from public, anon;
revoke all on function public.leave_squad_v1(uuid, uuid) from public, anon;
revoke all on function public.remove_squad_member_v1(uuid, uuid, uuid) from public, anon;
grant execute on function public.list_squads_v1(uuid, timestamptz) to authenticated;
grant execute on function public.create_squad_v1(uuid, text, uuid, timestamptz) to authenticated;
grant execute on function public.join_squad_v1(text, uuid, timestamptz) to authenticated;
grant execute on function public.leave_squad_v1(uuid, uuid) to authenticated;
grant execute on function public.remove_squad_member_v1(uuid, uuid, uuid) to authenticated;
