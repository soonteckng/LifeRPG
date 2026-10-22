-- Per-account squad limits. Everyone keeps the defaults (lead 1 squad, be in
-- up to 3); a private list can raise them for named accounts, such as the
-- developer's own. Only the database reads the list.
create table if not exists liferpg_squad_private.limit_overrides (
  user_id uuid primary key references auth.users(id) on delete cascade,
  lead_limit integer not null check (lead_limit between 1 and 20),
  member_limit integer not null check (member_limit between 1 and 20),
  note text,
  created_at timestamptz not null default now()
);
alter table liferpg_squad_private.limit_overrides enable row level security;
revoke all on liferpg_squad_private.limit_overrides from public, anon, authenticated;

create or replace function liferpg_squad_private.lead_limit(p_user uuid) returns integer
language sql stable set search_path = '' as $$
  select coalesce((select lead_limit from liferpg_squad_private.limit_overrides where user_id = p_user), 1)
$$;
create or replace function liferpg_squad_private.member_limit(p_user uuid) returns integer
language sql stable set search_path = '' as $$
  select coalesce((select member_limit from liferpg_squad_private.limit_overrides where user_id = p_user), 3)
$$;
revoke all on function liferpg_squad_private.lead_limit(uuid) from public, anon, authenticated;
revoke all on function liferpg_squad_private.member_limit(uuid) from public, anon, authenticated;

create or replace function public.create_squad_v1(p_request_id uuid, p_name text, p_expected_owner uuid, p_since timestamp with time zone)
 returns jsonb language plpgsql security definer set search_path to '' as $function$
declare owner uuid := liferpg_squad_private.signed_in(p_expected_owner); squad uuid;
begin
  if p_request_id is null or p_name is null or length(p_name) not between 1 and 40 or btrim(p_name) <> p_name or p_name ~ '[[:cntrl:]]' then raise exception 'Invalid squad name'; end if;
  if p_since is null or p_since < now() - interval '8 days' or p_since > now() + interval '1 day' then raise exception 'Invalid week'; end if;
  perform pg_advisory_xact_lock(hashtextextended('liferpg-squad-user:' || owner::text, 0));
  select id into squad from liferpg_squad_private.squads where owner_id = owner and request_id = p_request_id;
  if squad is null then
    if (select count(*) from liferpg_squad_private.squads where owner_id = owner and closed_at is null) >= liferpg_squad_private.lead_limit(owner) then return jsonb_build_object('status', 'lead_limit'); end if;
    if (select count(*) from liferpg_squad_private.members m join liferpg_squad_private.squads s on s.id = m.squad_id where m.user_id = owner and m.left_at is null and s.closed_at is null) >= liferpg_squad_private.member_limit(owner) then return jsonb_build_object('status', 'limit'); end if;
    insert into liferpg_squad_private.squads(name, code, owner_id, request_id) values (p_name, liferpg_squad_private.new_code(), owner, p_request_id) returning id into squad;
    insert into liferpg_squad_private.members(squad_id, user_id) values (squad, owner);
  end if;
  return jsonb_build_object('status', 'saved', 'squad', liferpg_squad_private.squad_json(squad, owner, p_since));
end $function$;

create or replace function public.join_squad_v1(p_code text, p_expected_owner uuid, p_since timestamp with time zone)
 returns jsonb language plpgsql security definer set search_path to '' as $function$
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
    if (select count(*) from liferpg_squad_private.members m join liferpg_squad_private.squads s on s.id = m.squad_id where m.user_id = owner and m.left_at is null and s.closed_at is null) >= liferpg_squad_private.member_limit(owner) then return jsonb_build_object('status', 'limit'); end if;
    if (select count(*) from liferpg_squad_private.members where squad_id = found_squad.id and left_at is null) >= 8 then return jsonb_build_object('status', 'full'); end if;
    insert into liferpg_squad_private.members(squad_id, user_id) values (found_squad.id, owner)
      on conflict (squad_id, user_id) do update set left_at = null, joined_at = clock_timestamp();
  end if;
  return jsonb_build_object('status', 'saved', 'squad', liferpg_squad_private.squad_json(found_squad.id, owner, p_since));
end $function$;

-- The app asks for the signed-in account's own limits, so its sheets match the server.
create or replace function public.squad_limits_v1() returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when auth.uid() is null then null else jsonb_build_object(
    'lead', liferpg_squad_private.lead_limit(auth.uid()), 'member', liferpg_squad_private.member_limit(auth.uid())) end
$$;
revoke all on function public.squad_limits_v1() from public, anon;
grant execute on function public.squad_limits_v1() to authenticated;
