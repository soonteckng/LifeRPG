-- REVIEWED PROPOSAL ONLY. Applying this to a live database needs explicit approval.
-- Online sessions still use server timing. No reward/completion functions change.
-- A repaired account must use Start v2 on every device: legacy Start is fenced for
-- that owner only. Other accounts and the legacy RPC remain unchanged.
-- Keep tombstones/fences indefinitely. A timeout is not proof a delayed Start died.
-- All Start/repair paths lock the profile first. The insertion trigger also checks
-- the fence, covering a legacy function body already executing when repair runs.
-- Completion currently locks the session first, so repair uses NOWAIT on that row
-- and is retried after an in-flight completion rather than waiting in reverse order.
-- New RPCs require read committed (the PostgREST default), keeping ownership/open
-- row checks fresh after waiting for the profile lock. Stale direct SQL snapshots
-- fail before any mutation. Legacy RPC signatures and bodies remain unchanged.
-- PGlite tests cover permissions and serialized orderings, not parallel row locks.
-- Before production rollout, run the documented two-connection PostgreSQL checks.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

create schema if not exists liferpg_session_private;
revoke all on schema liferpg_session_private from public, anon, authenticated;

create table liferpg_session_private.start_requests (
  client_session_id uuid primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  target_duration_seconds integer not null check (target_duration_seconds between 1 and 28800),
  activity_type text not null,
  task_id bigint,
  subject_id bigint,
  notes text,
  stopped boolean not null default false,
  created_at timestamptz not null default now(),
  stopped_at timestamptz,
  check (stopped = (stopped_at is not null))
);
create index start_requests_owner_idx on liferpg_session_private.start_requests(user_id);
alter table liferpg_session_private.start_requests enable row level security;
revoke all on liferpg_session_private.start_requests from public, anon, authenticated;

alter table public.profiles add column session_start_protocol_version smallint not null default 1
  check (session_start_protocol_version in (1, 2));
revoke update (session_start_protocol_version) on public.profiles from public, anon, authenticated;
-- A table-level UPDATE grant overrides column revocation. Fail deployment rather
-- than quietly let a client remove its own fence. Existing column grants stay intact.
do $check$
begin
  if has_column_privilege('anon', 'public.profiles', 'session_start_protocol_version', 'UPDATE')
     or has_column_privilege('authenticated', 'public.profiles', 'session_start_protocol_version', 'UPDATE') then
    raise exception 'Client profile UPDATE grants must exclude the session protocol fence';
  end if;
end;
$check$;

alter table public.activity_sessions add column client_start_id uuid;
alter table public.activity_sessions add constraint activity_sessions_client_start_identity
  check (client_start_id is null or client_start_id = id);
create unique index activity_sessions_client_start_id_idx
  on public.activity_sessions(client_start_id) where client_start_id is not null;
-- The marker is evidence checked by a trigger, not a client-writable capability.
revoke insert (client_start_id), update (client_start_id)
  on public.activity_sessions from public, anon, authenticated;
do $check$
begin
  if has_column_privilege('anon', 'public.activity_sessions', 'client_start_id', 'INSERT')
     or has_column_privilege('authenticated', 'public.activity_sessions', 'client_start_id', 'INSERT')
     or has_column_privilege('anon', 'public.activity_sessions', 'client_start_id', 'UPDATE')
     or has_column_privilege('authenticated', 'public.activity_sessions', 'client_start_id', 'UPDATE') then
    raise exception 'Client session grants must exclude the session start identity';
  end if;
end;
$check$;

create function liferpg_session_private.guard_session_insert()
returns trigger language plpgsql security definer set search_path = ''
as $function$
declare
  v_request liferpg_session_private.start_requests%rowtype;
  v_protocol_version smallint;
begin
  select session_start_protocol_version into v_protocol_version
    from public.profiles where id = new.user_id for update;
  if not found then
    raise exception 'Profile not found';
  end if;

  if new.client_start_id is null then
    if v_protocol_version = 2 then
      raise exception 'Legacy session starts are disabled for this account; update the app';
    end if;
    return new;
  end if;

  select * into v_request from liferpg_session_private.start_requests
    where client_session_id = new.client_start_id and user_id = new.user_id;
  if not found or v_request.stopped or new.id is distinct from new.client_start_id
     or row(new.target_duration_seconds, new.activity_type, new.task_id, new.subject_id, new.notes)
        is distinct from row(v_request.target_duration_seconds, v_request.activity_type,
                             v_request.task_id, v_request.subject_id, v_request.notes) then
    raise exception 'Session start identity is not registered';
  end if;
  return new;
end;
$function$;
revoke all on function liferpg_session_private.guard_session_insert() from public, anon, authenticated;
create trigger activity_sessions_guard_start_identity before insert on public.activity_sessions
  for each row execute function liferpg_session_private.guard_session_insert();

create function public.start_activity_session_v2(
  p_client_session_id uuid,
  p_target_duration_seconds integer,
  p_activity_type text default 'general',
  p_task_id bigint default null,
  p_subject_id bigint default null,
  p_notes text default null
)
returns uuid language plpgsql security definer set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_profile public.profiles%rowtype;
  v_local_date date;
  v_request liferpg_session_private.start_requests%rowtype;
  v_session public.activity_sessions%rowtype;
  v_activity_type text := coalesce(nullif(trim(p_activity_type), ''), 'general');
begin
  if v_user_id is null then raise exception 'Not authenticated'; end if;
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'Session protocol requires read committed transactions';
  end if;
  if p_client_session_id is null then raise exception 'Client session identity is required'; end if;
  if p_target_duration_seconds is null or p_target_duration_seconds not between 1 and 28800 then
    raise exception 'Session duration must be between 1 second and 8 hours';
  end if;

  select * into v_profile from public.profiles where id = v_user_id for update;
  if not found then raise exception 'Profile not found'; end if;

  select * into v_request from liferpg_session_private.start_requests where client_session_id = p_client_session_id;
  if found then
    if v_request.user_id is distinct from v_user_id
       or row(v_request.target_duration_seconds, v_request.activity_type, v_request.task_id, v_request.subject_id, v_request.notes)
          is distinct from row(p_target_duration_seconds, v_activity_type, p_task_id, p_subject_id, p_notes) then
      raise exception 'Session start identity conflicts with its original request';
    end if;
  end if;

  select * into v_session from public.activity_sessions where id = p_client_session_id;
  if found then
    if v_session.user_id is distinct from v_user_id or v_session.client_start_id is distinct from p_client_session_id
       or row(v_session.target_duration_seconds, v_session.activity_type, v_session.task_id, v_session.subject_id, v_session.notes)
          is distinct from row(p_target_duration_seconds, v_activity_type, p_task_id, p_subject_id, p_notes) then
      raise exception 'Session start identity conflicts with an existing session';
    end if;
    -- Retrying Start never resumes, restarts, completes, or awards an existing row.
    return v_session.id;
  end if;

  if v_request.stopped then raise exception 'This session start has already been stopped'; end if;

  if exists (select 1 from public.activity_sessions where user_id = v_user_id and status in ('active', 'paused')) then
    raise exception 'You already have an unfinished session';
  end if;
  v_local_date := (now() at time zone v_profile.timezone)::date;
  if p_task_id is not null and not exists (
    select 1 from public.tasks where id = p_task_id and user_id = v_user_id
      and (is_completed = false or (is_recurring = true and (last_completed_date is null or last_completed_date <> v_local_date)))
  ) then raise exception 'Task is invalid or already completed'; end if;
  if p_subject_id is not null and not exists (
    select 1 from public.subjects where id = p_subject_id and user_id = v_user_id
  ) then raise exception 'Subject is invalid'; end if;

  insert into liferpg_session_private.start_requests(
    client_session_id, user_id, target_duration_seconds, activity_type, task_id, subject_id, notes
  ) values (p_client_session_id, v_user_id, p_target_duration_seconds, v_activity_type, p_task_id, p_subject_id, p_notes)
  on conflict (client_session_id) do nothing;
  insert into public.activity_sessions (
    id, client_start_id, user_id, task_id, subject_id, activity_type, target_duration_seconds,
    duration_seconds, status, notes, xp_earned, gold_earned, started_at, last_resumed_at
  ) values (
    p_client_session_id, p_client_session_id, v_user_id, p_task_id, p_subject_id, v_activity_type,
    p_target_duration_seconds, 0, 'active', p_notes, 0, 0, now(), now()
  );
  return p_client_session_id;
end;
$function$;
revoke all on function public.start_activity_session_v2(uuid, integer, text, bigint, bigint, text)
  from public, anon, authenticated;
grant execute on function public.start_activity_session_v2(uuid, integer, text, bigint, bigint, text) to authenticated;

create function public.confirm_activity_session_stop_v2(
  p_client_session_id uuid,
  p_target_duration_seconds integer,
  p_activity_type text default 'general',
  p_task_id bigint default null,
  p_subject_id bigint default null,
  p_notes text default null
)
returns jsonb language plpgsql security definer set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_request liferpg_session_private.start_requests%rowtype;
  v_session public.activity_sessions%rowtype;
  v_protocol_version smallint;
  v_activity_type text := coalesce(nullif(trim(p_activity_type), ''), 'general');
  v_session_id uuid := null;
  v_status text := 'cancelled';
begin
  if v_user_id is null then raise exception 'Not authenticated'; end if;
  if current_setting('transaction_isolation') <> 'read committed' then
    raise exception 'Session protocol requires read committed transactions';
  end if;
  if p_client_session_id is null then raise exception 'Client session identity is required'; end if;
  if p_target_duration_seconds is null or p_target_duration_seconds not between 1 and 28800 then
    raise exception 'Session duration must be between 1 second and 8 hours';
  end if;
  select session_start_protocol_version into v_protocol_version
    from public.profiles where id = v_user_id for update;
  if not found then raise exception 'Profile not found'; end if;

  select * into v_request from liferpg_session_private.start_requests where client_session_id = p_client_session_id;
  if found and (v_request.user_id is distinct from v_user_id
       or row(v_request.target_duration_seconds, v_request.activity_type, v_request.task_id, v_request.subject_id, v_request.notes)
          is distinct from row(p_target_duration_seconds, v_activity_type, p_task_id, p_subject_id, p_notes)) then
    raise exception 'Session start identity conflicts with its original request';
  end if;

  -- NOWAIT avoids reversing completion's existing session-then-profile lock order.
  select * into v_session from public.activity_sessions where id = p_client_session_id for update nowait;
  if found then
    if v_session.user_id is distinct from v_user_id or v_session.client_start_id is distinct from p_client_session_id
       or row(v_session.target_duration_seconds, v_session.activity_type, v_session.task_id, v_session.subject_id, v_session.notes)
          is distinct from row(p_target_duration_seconds, v_activity_type, p_task_id, p_subject_id, p_notes) then
      raise exception 'Session start identity conflicts with an existing session';
    end if;
    v_session_id := v_session.id;
    if v_session.status in ('active', 'paused') then
      update public.activity_sessions set status = 'cancelled', completed_at = now() where id = v_session.id;
    elsif v_session.status = 'completed' then
      v_status := 'completed';
    elsif v_session.status <> 'cancelled' then
      raise exception 'Session state is not supported';
    end if;
  elsif not (coalesce(v_request.stopped, false) and v_protocol_version = 2)
      and exists (select 1 from public.activity_sessions where user_id = v_user_id and status in ('active', 'paused')) then
    -- An uncorrelated legacy/other-device row is never cancelled by this repair.
    raise exception 'Another unfinished session must be reviewed before this stop can be confirmed';
  end if;

  insert into liferpg_session_private.start_requests (
    client_session_id, user_id, target_duration_seconds, activity_type, task_id, subject_id, notes, stopped, stopped_at
  ) values (p_client_session_id, v_user_id, p_target_duration_seconds, v_activity_type, p_task_id, p_subject_id, p_notes, true, now())
  on conflict (client_session_id) do nothing;
  -- Two different owners can race on the same supplied UUID despite holding
  -- different profile locks. Re-read after the unique-key conflict has settled;
  -- never mutate the winner until ownership and its immutable payload are proven.
  select * into v_request from liferpg_session_private.start_requests
    where client_session_id = p_client_session_id for update;
  if not found or v_request.user_id is distinct from v_user_id
       or row(v_request.target_duration_seconds, v_request.activity_type, v_request.task_id, v_request.subject_id, v_request.notes)
          is distinct from row(p_target_duration_seconds, v_activity_type, p_task_id, p_subject_id, p_notes) then
    raise exception 'Session start identity conflicts with its original request';
  end if;
  update liferpg_session_private.start_requests set stopped = true,
    stopped_at = coalesce(stopped_at, now())
    where client_session_id = p_client_session_id and user_id = v_user_id;
  -- Mutate the same row used by Start/trigger locks. A repeatable-read caller with
  -- a stale profile snapshot must serialize/retry instead of missing a separate
  -- fence-table insert. The UPDATE changes no XP, levels, goals or account fields.
  update public.profiles set session_start_protocol_version = 2 where id = v_user_id
    and session_start_protocol_version <> 2;
  return jsonb_build_object('client_session_id', p_client_session_id, 'session_id', v_session_id,
    'status', v_status, 'legacy_starts_fenced', true);
end;
$function$;
revoke all on function public.confirm_activity_session_stop_v2(uuid, integer, text, bigint, bigint, text)
  from public, anon, authenticated;
grant execute on function public.confirm_activity_session_stop_v2(uuid, integer, text, bigint, bigint, text) to authenticated;

commit;
