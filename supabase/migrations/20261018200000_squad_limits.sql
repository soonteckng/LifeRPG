-- Free squad limits: you can lead one open squad and belong to up to three.
-- Existing memberships are kept; only new creates and joins are checked.
create or replace function public.create_squad_v1(p_request_id uuid, p_name text, p_expected_owner uuid, p_since timestamptz) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare owner uuid := liferpg_squad_private.signed_in(p_expected_owner); squad uuid;
begin
  if p_request_id is null or p_name is null or length(p_name) not between 1 and 40 or btrim(p_name) <> p_name or p_name ~ '[[:cntrl:]]' then raise exception 'Invalid squad name'; end if;
  if p_since is null or p_since < now() - interval '8 days' or p_since > now() + interval '1 day' then raise exception 'Invalid week'; end if;
  perform pg_advisory_xact_lock(hashtextextended('liferpg-squad-user:' || owner::text, 0));
  select id into squad from liferpg_squad_private.squads where owner_id = owner and request_id = p_request_id;
  if squad is null then
    if exists(select 1 from liferpg_squad_private.squads where owner_id = owner and closed_at is null) then return jsonb_build_object('status', 'lead_limit'); end if;
    if (select count(*) from liferpg_squad_private.members m join liferpg_squad_private.squads s on s.id = m.squad_id where m.user_id = owner and m.left_at is null and s.closed_at is null) >= 3 then return jsonb_build_object('status', 'limit'); end if;
    insert into liferpg_squad_private.squads(name, code, owner_id, request_id) values (p_name, liferpg_squad_private.new_code(), owner, p_request_id) returning id into squad;
    insert into liferpg_squad_private.members(squad_id, user_id) values (squad, owner);
  end if;
  return jsonb_build_object('status', 'saved', 'squad', liferpg_squad_private.squad_json(squad, owner, p_since));
end $$;

create or replace function public.join_squad_v1(p_code text, p_expected_owner uuid, p_since timestamptz) returns jsonb
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
    if (select count(*) from liferpg_squad_private.members m join liferpg_squad_private.squads s on s.id = m.squad_id where m.user_id = owner and m.left_at is null and s.closed_at is null) >= 3 then return jsonb_build_object('status', 'limit'); end if;
    if (select count(*) from liferpg_squad_private.members where squad_id = found_squad.id and left_at is null) >= 8 then return jsonb_build_object('status', 'full'); end if;
    insert into liferpg_squad_private.members(squad_id, user_id) values (found_squad.id, owner)
      on conflict (squad_id, user_id) do update set left_at = null, joined_at = clock_timestamp();
  end if;
  return jsonb_build_object('status', 'saved', 'squad', liferpg_squad_private.squad_json(found_squad.id, owner, p_since));
end $$;

