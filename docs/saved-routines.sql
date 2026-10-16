-- UNAPPLIED PROPOSAL. Install only after the user explicitly approves live SQL.
-- Adds account routines only. No session, quest, XP or daily-goal function changes.
begin;
create schema if not exists liferpg_routine_private;
revoke all on schema liferpg_routine_private from public,anon,authenticated;
create table if not exists liferpg_routine_private.routines (
  owner_id uuid not null references auth.users(id) on delete cascade,
  id uuid not null,
  revision bigint not null check(revision between 1 and 9007199254740991),
  name text not null check(length(name) between 1 and 80),
  focus_area_id bigint,
  duration_seconds integer not null check(duration_seconds between 1 and 28800),
  reminder_enabled boolean not null,
  reminder_hour integer not null check(reminder_hour between 0 and 23),
  reminder_minute integer not null check(reminder_minute between 0 and 59),
  deleted_at timestamptz,
  primary key(owner_id,id)
);
create table if not exists liferpg_routine_private.operations (
  owner_id uuid not null references auth.users(id) on delete cascade,
  operation_id uuid not null,
  request jsonb not null,
  reply jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key(owner_id,operation_id)
);
alter table liferpg_routine_private.routines enable row level security;
alter table liferpg_routine_private.operations enable row level security;
revoke all on all tables in schema liferpg_routine_private from public,anon,authenticated;

create or replace function liferpg_routine_private.routine_json(r liferpg_routine_private.routines)
returns jsonb language sql immutable set search_path='' as $$
select jsonb_build_object('id',r.id,'revision',r.revision,'name',r.name,'focusAreaId',r.focus_area_id,
  'durationSeconds',r.duration_seconds,'reminder',jsonb_build_object('enabled',r.reminder_enabled,'hour',r.reminder_hour,'minute',r.reminder_minute),
  'deletedAt',case when r.deleted_at is null then null else floor(extract(epoch from r.deleted_at)*1000)::bigint end)
$$;
revoke all on function liferpg_routine_private.routine_json(liferpg_routine_private.routines) from public,anon,authenticated;

-- Do not leave an earlier unbound prototype callable if this proposal is retested.
drop function if exists public.list_saved_routines_v1();
drop function if exists public.change_saved_routine_v1(uuid,uuid,bigint,jsonb,boolean);

create or replace function public.list_saved_routines_v1(p_expected_owner uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare owner uuid := auth.uid(); result jsonb;
begin
  if owner is null or p_expected_owner is null or owner<>p_expected_owner or not exists(select 1 from auth.users where id=owner) then raise exception 'Account changed. Reconnect to your account'; end if;
  select coalesce(jsonb_agg(liferpg_routine_private.routine_json(r) order by r.name,r.id),'[]'::jsonb)
    into result from liferpg_routine_private.routines r where r.owner_id=owner and r.deleted_at is null;
  return result;
end $$;
revoke all on function public.list_saved_routines_v1(uuid) from public,anon,authenticated;
grant execute on function public.list_saved_routines_v1(uuid) to authenticated;

create or replace function public.change_saved_routine_v1(p_operation_id uuid,p_routine_id uuid,p_expected_revision bigint,p_draft jsonb,p_deleted boolean,p_expected_owner uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare owner uuid := auth.uid(); request jsonb; old_op liferpg_routine_private.operations;
  current_routine liferpg_routine_private.routines; result jsonb; next_name text; area bigint; seconds integer; enabled boolean; hour integer; minute integer;
begin
  -- The owner lock serializes capacity and revision checks using fresh snapshots.
  -- A caller using REPEATABLE READ could otherwise retain a stale count of 31.
  if current_setting('transaction_isolation')<>'read committed' then raise exception 'Use read committed for routine changes'; end if;
  if owner is null or p_expected_owner is null or owner<>p_expected_owner or not exists(select 1 from auth.users where id=owner) then raise exception 'Account changed. Reconnect to your account'; end if;
  if p_operation_id is null or p_routine_id is null or p_deleted is null or p_expected_revision is null or p_expected_revision<0 or p_expected_revision>=9007199254740991
    or p_draft is null or jsonb_typeof(p_draft)<>'object' or octet_length(p_draft::text)>2048
    or not (p_draft ?& array['name','focusAreaId','durationSeconds','reminder']) or p_draft-array['name','focusAreaId','durationSeconds','reminder']<>'{}'::jsonb
    or jsonb_typeof(p_draft->'name')<>'string' or length(p_draft->>'name') not between 1 and 80
    or btrim(p_draft->>'name')<>p_draft->>'name' or (p_draft->>'name') ~ '[[:cntrl:]]'
    or jsonb_typeof(p_draft->'durationSeconds')<>'number' or (p_draft->>'durationSeconds')!~'^[0-9]{1,5}$'
    or jsonb_typeof(p_draft->'reminder')<>'object' or not ((p_draft->'reminder') ?& array['enabled','hour','minute'])
    or (p_draft->'reminder')-array['enabled','hour','minute']<>'{}'::jsonb
    or jsonb_typeof(p_draft->'reminder'->'enabled')<>'boolean'
    or jsonb_typeof(p_draft->'reminder'->'hour')<>'number' or (p_draft->'reminder'->>'hour')!~'^[0-9]{1,2}$'
    or jsonb_typeof(p_draft->'reminder'->'minute')<>'number' or (p_draft->'reminder'->>'minute')!~'^[0-9]{1,2}$'
    or not (p_draft->'focusAreaId'='null'::jsonb or (jsonb_typeof(p_draft->'focusAreaId')='number' and (p_draft->>'focusAreaId')~'^[0-9]{1,16}$'))
    then raise exception 'Invalid routine settings'; end if;
  next_name := p_draft->>'name'; area := (p_draft->>'focusAreaId')::bigint; seconds := (p_draft->>'durationSeconds')::integer;
  enabled := (p_draft->'reminder'->>'enabled')::boolean; hour := (p_draft->'reminder'->>'hour')::integer; minute := (p_draft->'reminder'->>'minute')::integer;
  if seconds not between 1 and 28800 or hour not between 0 and 23 or minute not between 0 and 59 or (area is not null and (area<1 or area>9007199254740991))
    then raise exception 'Invalid routine settings'; end if;
  request := jsonb_build_object('routineId',p_routine_id,'expectedRevision',p_expected_revision,'draft',p_draft,'deleted',p_deleted);
  perform pg_advisory_xact_lock(hashtextextended('liferpg-routine:'||owner::text,0));
  select * into old_op from liferpg_routine_private.operations where owner_id=owner and operation_id=p_operation_id;
  if found then
    if old_op.request<>request then raise exception 'Operation already used with different settings'; end if;
    return old_op.reply;
  end if;
  select * into current_routine from liferpg_routine_private.routines where owner_id=owner and id=p_routine_id for update;
  if (current_routine.id is null and (p_expected_revision<>0 or p_deleted))
    or (current_routine.id is not null and (current_routine.revision<>p_expected_revision or current_routine.deleted_at is not null)) then
    result := jsonb_build_object('status','conflict','routine',case when current_routine.id is null then null else liferpg_routine_private.routine_json(current_routine) end);
  else
    if not p_deleted and area is not null and not exists(select 1 from public.subjects where user_id=owner and id=area) then
      result := jsonb_build_object('status','conflict','reason','area','routine',case when current_routine.id is null then null else liferpg_routine_private.routine_json(current_routine) end);
    elsif current_routine.id is null and (select count(*) from liferpg_routine_private.routines where owner_id=owner and deleted_at is null)>=32 then
      result := jsonb_build_object('status','conflict','reason','limit','routine',null);
    else
      insert into liferpg_routine_private.routines(owner_id,id,revision,name,focus_area_id,duration_seconds,reminder_enabled,reminder_hour,reminder_minute,deleted_at)
      values(owner,p_routine_id,p_expected_revision+1,next_name,area,seconds,enabled,hour,minute,case when p_deleted then clock_timestamp() else null end)
      on conflict(owner_id,id) do update set revision=excluded.revision,name=excluded.name,focus_area_id=excluded.focus_area_id,duration_seconds=excluded.duration_seconds,
        reminder_enabled=excluded.reminder_enabled,reminder_hour=excluded.reminder_hour,reminder_minute=excluded.reminder_minute,deleted_at=excluded.deleted_at
      returning * into current_routine;
      result := jsonb_build_object('status','saved','routine',liferpg_routine_private.routine_json(current_routine));
    end if;
  end if;
  insert into liferpg_routine_private.operations(owner_id,operation_id,request,reply) values(owner,p_operation_id,request,result);
  return result;
end $$;
revoke all on function public.change_saved_routine_v1(uuid,uuid,bigint,jsonb,boolean,uuid) from public,anon,authenticated;
grant execute on function public.change_saved_routine_v1(uuid,uuid,bigint,jsonb,boolean,uuid) to authenticated;
commit;
