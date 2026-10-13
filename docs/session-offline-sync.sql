-- UNAPPLIED PROPOSAL. A staging rehearsal, backup and explicit live approval are
-- required. Install atomically during an agreed write pause. Existing rows,
-- rewards, primary keys and completion receipts are never rewritten.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
lock table public.activity_sessions, public.profiles, public.daily_progress in access exclusive mode;

do $guard$
declare item record; actual text;
begin
  for item in select * from (values
    ('public.complete_activity_session(uuid)','a815c30a20323367da56df967740fe86'),
    ('liferpg_session_private.guard_session_insert()','ae9b46254d8ae868baf93e50f4bd0902'),
    ('public.start_activity_session_v2(uuid,integer,text,bigint,bigint,text)','82281c13f499086b89cdda2cf2bb99e7'),
    ('public.confirm_activity_session_stop_v2(uuid,integer,text,bigint,bigint,text)','e6fea825c24f51238b11cbf26378926d')
  ) as expected(signature,hash) loop
    if to_regprocedure(item.signature) is null then raise exception 'Offline prerequisite missing: %',item.signature; end if;
    actual:=md5(pg_get_functiondef(to_regprocedure(item.signature)));
    if actual<>item.hash then raise exception 'Offline prerequisite definition changed: %',item.signature; end if;
  end loop;
  if to_regprocedure('public.daily_goal_for_date(date)') is null
     or to_regclass('public.daily_goal_changes') is null then raise exception 'Approved daily goal scheduler missing'; end if;
  if to_regclass('liferpg_session_private.client_submissions') is not null then raise exception 'Offline proposal already installed; review rather than overwrite'; end if;
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='activity_sessions'
      and column_name in ('client_session_id','sync_revision','verification_class','client_reported_started_at','client_reported_ended_at','server_received_at')) then
    raise exception 'Offline schema columns already exist; review rather than overwrite';
  end if;
end;$guard$;

create table liferpg_session_private.sync_policy (
  singleton boolean primary key default true check(singleton),
  enabled boolean not null default true,
  policy_version integer not null default 1 check(policy_version=1)
);
insert into liferpg_session_private.sync_policy values(true,true,1);
create table liferpg_session_private.client_submissions (
  user_id uuid not null references public.profiles(id) on delete cascade,
  client_session_id uuid not null,
  submission jsonb not null,
  outcome text not null check(outcome in ('pending','accepted','rejected')),
  result jsonb,
  session_id uuid,
  created_at timestamptz not null default statement_timestamp(),
  primary key(user_id,client_session_id),
  check(octet_length(submission::text)<=65536)
);
create table liferpg_session_private.sync_handoffs (
  user_id uuid not null references public.profiles(id) on delete cascade,
  session_id uuid not null references public.activity_sessions(id) on delete cascade,
  client_session_id uuid not null,
  revision bigint not null,
  observed_at_ms bigint not null,
  confirmed_ms bigint not null check(confirmed_ms>=0),
  original_setup jsonb not null,
  timing_state jsonb not null,
  status text not null check(status in ('active','paused')),
  primary key(user_id,session_id,revision,observed_at_ms)
);
alter table liferpg_session_private.sync_policy enable row level security;
alter table liferpg_session_private.client_submissions enable row level security;
alter table liferpg_session_private.sync_handoffs enable row level security;
revoke all on liferpg_session_private.sync_policy,liferpg_session_private.client_submissions,liferpg_session_private.sync_handoffs from public,anon,authenticated;
revoke all on schema liferpg_session_private from public,anon,authenticated;

alter table public.activity_sessions
  add column client_session_id uuid,
  add column sync_revision bigint not null default 0 check(sync_revision>=0),
  add column verification_class text not null default 'server_timed' check(verification_class in ('server_timed','client_reported')),
  add column client_reported_started_at timestamptz,
  add column client_reported_ended_at timestamptz,
  add column server_received_at timestamptz,
  add column client_clock_warning boolean not null default false;
update public.activity_sessions set client_session_id=client_start_id where client_start_id is not null;
create unique index activity_sessions_owned_client_identity on public.activity_sessions(user_id,client_session_id) where client_session_id is not null;
create index activity_sessions_owner_interval on public.activity_sessions(user_id,started_at);
create index activity_sessions_client_credit_date on public.activity_sessions(user_id,((credit_result->>'credited_date')))
  where verification_class='client_reported' and status='completed';
revoke insert(client_session_id,sync_revision,verification_class,client_reported_started_at,client_reported_ended_at,server_received_at,client_clock_warning),
  update(client_session_id,sync_revision,verification_class,client_reported_started_at,client_reported_ended_at,server_received_at,client_clock_warning)
  on public.activity_sessions from public,anon,authenticated;
do $privileges$
declare column_name text; role_name text;
begin
  foreach role_name in array array['anon','authenticated'] loop
    foreach column_name in array array['client_session_id','sync_revision','verification_class','client_reported_started_at','client_reported_ended_at','server_received_at','client_clock_warning'] loop
      if has_column_privilege(role_name,'public.activity_sessions',column_name,'INSERT')
         or has_column_privilege(role_name,'public.activity_sessions',column_name,'UPDATE') then
        raise exception 'Client session writes must exclude offline authority columns';
      end if;
    end loop;
  end loop;
end;$privileges$;

create function liferpg_session_private.bump_sync_revision() returns trigger
language plpgsql security definer set search_path='' as $fn$
begin
  if row(new.status,new.target_duration_seconds,new.elapsed_seconds,new.last_resumed_at,new.paused_at,new.completed_at,
    new.task_id,new.subject_id,new.activity_type,new.notes,new.credit_result,new.client_session_id,new.verification_class,
    new.client_reported_started_at,new.client_reported_ended_at)
    is distinct from row(old.status,old.target_duration_seconds,old.elapsed_seconds,old.last_resumed_at,old.paused_at,old.completed_at,
    old.task_id,old.subject_id,old.activity_type,old.notes,old.credit_result,old.client_session_id,old.verification_class,
    old.client_reported_started_at,old.client_reported_ended_at) then
    new.sync_revision:=old.sync_revision+1;
  else new.sync_revision:=old.sync_revision; end if;
  return new;
end;$fn$;
revoke all on function liferpg_session_private.bump_sync_revision() from public,anon,authenticated;
create trigger activity_sessions_sync_revision before update on public.activity_sessions
  for each row execute function liferpg_session_private.bump_sync_revision();

-- Extend the existing fenced INSERT guard with a private, transaction-local
-- import registration. Clients cannot write that registration or new metadata.
do $extend_guard$
declare source text; insertion text;
begin
  source:=pg_get_functiondef('liferpg_session_private.guard_session_insert()'::regprocedure);
  insertion:=$text$
  if new.verification_class='client_reported' then
    if new.client_start_id is not null or new.client_session_id is null or not exists(
      select 1 from liferpg_session_private.client_submissions
      where user_id=new.user_id and client_session_id=new.client_session_id
        and session_id=new.id and outcome='pending'
    ) then raise exception 'Offline insert is not registered'; end if;
    return new;
  end if;
  if new.client_session_id is not null and new.client_session_id is distinct from new.client_start_id then
    raise exception 'Session client mapping is not registered';
  end if;
  new.client_session_id:=new.client_start_id;
  if new.client_start_id is null then$text$;
  if position('  if new.client_start_id is null then' in source)=0 then raise exception 'Unexpected start guard'; end if;
  execute replace(source,'  if new.client_start_id is null then',insertion);
end;$extend_guard$;

-- Extract one private accounting implementation from the exact approved normal
-- completion definition. Every online path executes the original arithmetic,
-- timing gate, handling-day policy and returned fields. Import-only substitutions
-- are conditional. Differential tests compare all pre-existing fields exactly.
do $kernel$
declare source text; kernel text;
begin
  source:=pg_get_functiondef('public.complete_activity_session(uuid)'::regprocedure);
  kernel:=replace(source,'public.complete_activity_session(p_session_id uuid)',
    'liferpg_session_private.credit_session(p_session_id uuid, p_import boolean, p_import_end timestamptz)');
  if kernel=source then raise exception 'Unexpected completion signature'; end if;
  kernel:=replace(kernel,$old$  v_local_date := (
    now() at time zone v_profile.timezone
  )::date;$old$,$new$  v_local_date := (
    (case when p_import then p_import_end else now() end) at time zone v_profile.timezone
  )::date;$new$);
  kernel:=replace(kernel,'  -- Do not allow a client to claim a session before its target duration',
    '  if p_import then v_elapsed:=v_session.target_duration_seconds; end if;'||chr(10)||
    '  -- Do not allow a client to claim a session before its target duration');
  kernel:=replace(kernel,'      goal_completed_at = now()',
    '      goal_completed_at = case when p_import then p_import_end else now() end');
  kernel:=replace(kernel,'    if v_profile.last_goal_completed_date = v_local_date - 1 then',
    '    if p_import then v_new_streak:=v_profile.streak_count;'||chr(10)||
    '    elsif v_profile.last_goal_completed_date = v_local_date - 1 then');
  kernel:=replace(kernel,$old$          is_completed = false
          or is_recurring = true$old$,$new$          (not p_import and (is_completed = false or is_recurring = true))
          or (p_import and is_recurring = false and is_completed = false)$new$);
  kernel:=replace(kernel,'        completed_at = now(),','        completed_at = case when p_import then p_import_end else now() end,');
  kernel:=replace(kernel,'    completed_at = now(),','    completed_at = case when p_import then p_import_end else now() end,');
  kernel:=replace(kernel,'        when v_goal_now_completed and not v_goal_was_completed',
    '        when not p_import and v_goal_now_completed and not v_goal_was_completed');
  kernel:=replace(kernel,'    last_active_date = v_local_date',
    '    last_active_date = case when p_import then greatest(last_active_date,v_local_date) else v_local_date end');
  execute kernel;
end;$kernel$;
revoke all on function liferpg_session_private.credit_session(uuid,boolean,timestamptz) from public,anon,authenticated;
create or replace function public.complete_activity_session(p_session_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $fn$
begin
  return liferpg_session_private.credit_session(p_session_id,false,null);
end;$fn$;
-- Existing grant is retained; explicitly remove the unsafe PostgreSQL default.
revoke all on function public.complete_activity_session(uuid) from public,anon;
grant execute on function public.complete_activity_session(uuid) to authenticated;

create function public.session_sync_capabilities_v1() returns jsonb
language plpgsql stable security definer set search_path='' as $fn$
declare owner uuid:=auth.uid(); enabled boolean;
begin
  if owner is null then raise exception 'Not authenticated'; end if;
  if not exists(select 1 from public.profiles where id=owner) then raise exception 'Profile not found'; end if;
  select p.enabled into enabled from liferpg_session_private.sync_policy p where singleton;
  return jsonb_build_object('policy_version',1,'offline_enabled',enabled,'owner_id',owner,'server_time',statement_timestamp(),
    'max_cached_grant_age_seconds',604800,'max_age_seconds',604800,'max_span_seconds',86400,'max_target_seconds',28800,
    'max_segments',256,'max_future_skew_seconds',120,'clock_tolerance_seconds',15,'max_client_reported_daily_seconds',57600);
end;$fn$;

create function public.session_sync_snapshot_v1(server_session_id uuid,client_session_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $fn$
declare owner uuid:=auth.uid(); row_data public.activity_sessions%rowtype; at_ms bigint; confirmed bigint; setup jsonb;
begin
  if owner is null then raise exception 'Not authenticated'; end if;
  if current_setting('transaction_isolation')<>'read committed' then raise exception 'Session sync requires read committed'; end if;
  select * into row_data from public.activity_sessions where id=server_session_id and user_id=owner for update;
  if not found then return null; end if;
  if client_session_id is not null and row_data.client_session_id is null and row_data.client_start_id is null then
    if exists(select 1 from public.activity_sessions s where s.user_id=owner and s.client_session_id=session_sync_snapshot_v1.client_session_id)
      or exists(select 1 from liferpg_session_private.client_submissions s where s.user_id=owner and s.client_session_id=session_sync_snapshot_v1.client_session_id)
      then raise exception 'Client mapping conflicts'; end if;
    update public.activity_sessions set client_session_id=session_sync_snapshot_v1.client_session_id where id=row_data.id returning * into row_data;
  elsif client_session_id is not null and row_data.client_session_id is distinct from client_session_id then
    raise exception 'Client mapping conflicts';
  end if;
  at_ms:=floor(extract(epoch from clock_timestamp())*1000)::bigint;
  -- A handoff can precede a valid queued end by 24h, then wait seven days.
  -- Keep eight days plus clock skew; receipts/submissions are never pruned here.
  delete from liferpg_session_private.sync_handoffs h using public.activity_sessions s
    where h.user_id=owner and h.session_id=s.id and s.status not in ('active','paused') and h.observed_at_ms<at_ms-691320000;
  if row_data.status in ('active','paused') and row_data.client_session_id is not null then
    confirmed:=greatest(0,row_data.elapsed_seconds::bigint*1000);
    if row_data.status='active' then confirmed:=confirmed+greatest(0,at_ms-floor(extract(epoch from row_data.last_resumed_at)*1000)::bigint); end if;
    confirmed:=least(confirmed,row_data.target_duration_seconds::bigint*1000);
    setup:=jsonb_build_object('targetSeconds',row_data.target_duration_seconds,'activityType',row_data.activity_type,
      'taskId',row_data.task_id,'subjectId',row_data.subject_id,'notes',row_data.notes);
    -- Start v2 retained the original link request, even if a foreign-key deletion
    -- cleared an audit row link before the handoff was requested.
    if row_data.client_start_id is not null then
      select jsonb_build_object('targetSeconds',r.target_duration_seconds,'activityType',r.activity_type,
        'taskId',r.task_id,'subjectId',r.subject_id,'notes',r.notes) into setup
        from liferpg_session_private.start_requests r where r.user_id=owner and r.client_session_id=row_data.client_start_id;
    end if;
    insert into liferpg_session_private.sync_handoffs(user_id,session_id,client_session_id,revision,observed_at_ms,confirmed_ms,original_setup,timing_state,status)
    values(owner,row_data.id,row_data.client_session_id,row_data.sync_revision,at_ms,confirmed,setup,
      to_jsonb(row_data)-array['sync_revision','task_id','subject_id'],row_data.status) on conflict do nothing;
    return to_jsonb(row_data)||jsonb_build_object('server_time',to_timestamp(at_ms/1000.0),
      'sync_handoff',jsonb_build_object('revision',row_data.sync_revision,'observed_at_ms',at_ms,'confirmed_ms',confirmed));
  end if;
  return to_jsonb(row_data)||jsonb_build_object('server_time',to_timestamp(at_ms/1000.0),'sync_handoff',null);
end;$fn$;

create function liferpg_session_private.reject_submission(owner uuid,client_id uuid,payload jsonb,reason text,server_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare result jsonb;
begin
  if auth.uid() is distinct from owner then raise exception 'Not authenticated'; end if;
  result:=jsonb_build_object('outcome','rejected','reason_code',reason,'client_session_id',client_id,'session_id',server_id,
    'sync_revision',null,'verification_class',null);
  insert into liferpg_session_private.client_submissions(user_id,client_session_id,submission,outcome,result,session_id)
  values(owner,client_id,payload,'rejected',result,server_id);
  return result;
end;$fn$;
revoke all on function liferpg_session_private.reject_submission(uuid,uuid,jsonb,text,uuid) from public,anon,authenticated;

create function public.submit_client_session_v1(client_session_id uuid,submission jsonb) returns jsonb
language plpgsql security definer set search_path='' as $fn$
<<sync>>
declare
  owner uuid:=auth.uid(); prior liferpg_session_private.client_submissions%rowtype;
  row_data public.activity_sessions%rowtype; profile public.profiles%rowtype; handoff liferpg_session_private.sync_handoffs%rowtype;
  server_id uuid; revision bigint; target integer; activity text; task bigint; subject bigint; note text; ending text;
  start_ms bigint; end_ms bigint; confirmed_ms bigint; observed_ms bigint; total_ms bigint:=0;
  segment jsonb; seg_start bigint; seg_end bigint; previous_end bigint; shift_ms bigint:=0;
  received timestamptz:=clock_timestamp(); start_at timestamptz; end_at timestamptz; envelope_start timestamptz;
  local_day date; result jsonb; receipt jsonb; reason text; enabled boolean; prior_daily bigint; warning boolean;
begin
  if owner is null then raise exception 'Not authenticated'; end if;
  if current_setting('transaction_isolation')<>'read committed' then raise exception 'Session sync requires read committed'; end if;
  if client_session_id is null or submission is null or octet_length(submission::text)>65536 then
    raise exception 'Invalid or oversized session submission';
  end if;
  -- Identity lock before an existing row, then profile. Pure imports hold profile
  -- before their new INSERT. No path waits on another existing row under profile.
  perform pg_advisory_xact_lock(hashtextextended(owner::text||':'||client_session_id::text,0));
  select * into prior from liferpg_session_private.client_submissions s where s.user_id=owner and s.client_session_id=submit_client_session_v1.client_session_id;
  if found then
    if prior.submission is distinct from submission then return jsonb_build_object('outcome','rejected','reason_code','changed_submission','client_session_id',client_session_id,'session_id',prior.session_id,'sync_revision',null,'verification_class',null); end if;
    if prior.outcome='accepted' then
      result:=prior.result||jsonb_build_object('outcome','already_saved');
      if prior.result->'receipt' is not null and prior.result->'receipt'<>'null'::jsonb then
        result:=result||jsonb_build_object('receipt',(prior.result->'receipt')||jsonb_build_object('already_completed',true,'goal_reached_now',false));
      end if;
      return result;
    end if;
    return prior.result;
  end if;
  select p.enabled into enabled from liferpg_session_private.sync_policy p where singleton;
  -- Strict shape/type checking before casts. JSONB canonical equality retains
  -- requested deleted/foreign links, title and notes as immutable audit input.
  begin
    if jsonb_typeof(submission)<>'object' or not(submission ?& array['policyVersion','clientSessionId','serverSessionId','expectedRevision','setup','startedAtMs','endedAtMs','serverConfirmedMs','serverObservedAtMs','segments','clockWarning','ending'])
       or (submission-array['policyVersion','clientSessionId','serverSessionId','expectedRevision','setup','startedAtMs','endedAtMs','serverConfirmedMs','serverObservedAtMs','segments','clockWarning','ending'])<>'{}'::jsonb
       or submission->'policyVersion'<>'1'::jsonb or (submission->>'clientSessionId')::uuid is distinct from client_session_id
       or jsonb_typeof(submission->'setup')<>'object' or not((submission->'setup') ?& array['targetSeconds','activityType','taskId','subjectId','notes','title'])
       or ((submission->'setup')-array['targetSeconds','activityType','taskId','subjectId','notes','title'])<>'{}'::jsonb
       or jsonb_typeof(submission->'segments')<>'array' or jsonb_typeof(submission->'clockWarning')<>'boolean' or jsonb_typeof(submission->'ending')<>'string'
       or jsonb_typeof(submission#>'{setup,activityType}')<>'string' or jsonb_typeof(submission#>'{setup,title}') not in ('string','null')
       or jsonb_typeof(submission#>'{setup,notes}') not in ('string','null') then raise exception 'Invalid shape'; end if;
    foreach reason in array array['startedAtMs','endedAtMs','serverConfirmedMs'] loop
      if jsonb_typeof(submission->reason)<>'number' or (submission->>reason)!~'^[0-9]+$' then raise exception 'Invalid integer'; end if;
    end loop;
    foreach reason in array array['taskId','subjectId','targetSeconds'] loop
      if jsonb_typeof(submission#>array['setup',reason])<>'null' and (jsonb_typeof(submission#>array['setup',reason])<>'number' or (submission#>>array['setup',reason])!~'^[0-9]+$') then raise exception 'Invalid setup integer'; end if;
    end loop;
    if jsonb_typeof(submission->'expectedRevision') not in ('number','null') or (submission->>'expectedRevision')!~'^[0-9]+$'
      or jsonb_typeof(submission->'serverObservedAtMs') not in ('number','null') or (submission->>'serverObservedAtMs')!~'^[0-9]+$'
      or jsonb_typeof(submission->'serverSessionId') not in ('string','null') then raise exception 'Invalid mapping type'; end if;
    server_id:=(submission->>'serverSessionId')::uuid; revision:=(submission->>'expectedRevision')::bigint;
    target:=(submission#>>'{setup,targetSeconds}')::integer; task:=(submission#>>'{setup,taskId}')::bigint; subject:=(submission#>>'{setup,subjectId}')::bigint;
    activity:=submission#>>'{setup,activityType}'; note:=submission#>>'{setup,notes}'; ending:=submission->>'ending'; warning:=(submission->>'clockWarning')::boolean;
    start_ms:=(submission->>'startedAtMs')::bigint; end_ms:=(submission->>'endedAtMs')::bigint;
    confirmed_ms:=(submission->>'serverConfirmedMs')::bigint; observed_ms:=(submission->>'serverObservedAtMs')::bigint;
    if target is null or target not between 1 and 28800 or length(activity) not between 1 and 128 or activity<>btrim(activity)
       or length(coalesce(note,''))>10000 or length(submission#>>'{setup,title}')>256 or ending not in ('completed','cancelled')
       or start_ms>9007199254740991 or end_ms>9007199254740991 or end_ms<start_ms
       or (ending='completed' and end_ms=start_ms) then raise exception 'Invalid bounds'; end if;
    start_at:=to_timestamp(start_ms/1000.0); end_at:=to_timestamp(end_ms/1000.0);
  exception when invalid_text_representation or numeric_value_out_of_range or raise_exception or datetime_field_overflow then
    return liferpg_session_private.reject_submission(owner,client_session_id,submission,'invalid_submission');
  end;
  -- A remotely saved normal receipt wins before expiry, span, skew, revision or
  -- client duration checks. It is not converted into a second imported reward.
  if server_id is not null then
    select * into row_data from public.activity_sessions where id=server_id and user_id=owner for update;
    if found and row_data.client_session_id=client_session_id and row_data.status='completed' then
      receipt:=public.complete_activity_session(row_data.id);
      result:=jsonb_build_object('outcome','already_saved','client_session_id',client_session_id,'session_id',row_data.id,'sync_revision',row_data.sync_revision,
        'verification_class',row_data.verification_class,'ending','completed','receipt',receipt);
      insert into liferpg_session_private.client_submissions values(owner,client_session_id,submission,'accepted',result,row_data.id,received);
      return result;
    end if;
  end if;
  if not enabled and ending<>'cancelled' then return jsonb_build_object('outcome','rejected','reason_code','policy_disabled','client_session_id',client_session_id,'session_id',server_id,'sync_revision',null,'verification_class',null); end if;
  if ending='completed' and end_ms-start_ms>86400000 then return liferpg_session_private.reject_submission(owner,client_session_id,submission,'span_too_large',server_id); end if;
  if end_at>received+interval '120 seconds' then return liferpg_session_private.reject_submission(owner,client_session_id,submission,'clock_skew',server_id); end if;
  if end_at>received then shift_ms:=ceil(extract(epoch from(end_at-received))*1000)::bigint; end if;
  start_at:=to_timestamp((start_ms-shift_ms)/1000.0); end_at:=to_timestamp((end_ms-shift_ms)/1000.0);
  if received-end_at>interval '7 days' then return liferpg_session_private.reject_submission(owner,client_session_id,submission,'expired',server_id); end if;
  if jsonb_array_length(submission->'segments')>256 then return liferpg_session_private.reject_submission(owner,client_session_id,submission,'segments_invalid',server_id); end if;
  begin
    previous_end:=start_ms;
    for segment in select value from jsonb_array_elements(submission->'segments') loop
      if jsonb_typeof(segment)<>'object' or not(segment ?& array['startedAtMs','endedAtMs']) or (segment-array['startedAtMs','endedAtMs'])<>'{}'::jsonb
        or jsonb_typeof(segment->'startedAtMs')<>'number' or jsonb_typeof(segment->'endedAtMs')<>'number'
        or (segment->>'startedAtMs')!~'^[0-9]+$' or (segment->>'endedAtMs')!~'^[0-9]+$' then raise exception 'Invalid segment'; end if;
      seg_start:=(segment->>'startedAtMs')::bigint; seg_end:=(segment->>'endedAtMs')::bigint;
      if seg_start<previous_end or seg_start<start_ms or seg_end>end_ms or seg_end<=seg_start then raise exception 'Invalid segment bounds'; end if;
      total_ms:=total_ms+seg_end-seg_start; previous_end:=seg_end;
    end loop;
  exception when invalid_text_representation or numeric_value_out_of_range or raise_exception then
    return liferpg_session_private.reject_submission(owner,client_session_id,submission,'segments_invalid',server_id);
  end;
  if server_id is null then
    if revision is not null or confirmed_ms<>0 or observed_ms is not null or ending='cancelled' then return liferpg_session_private.reject_submission(owner,client_session_id,submission,'invalid_submission'); end if;
    select * into row_data from public.activity_sessions s where s.user_id=owner and s.client_session_id=submit_client_session_v1.client_session_id for update;
    if found then return liferpg_session_private.reject_submission(owner,client_session_id,submission,'mapping_mismatch',row_data.id); end if;
    if exists(select 1 from liferpg_session_private.start_requests r where r.client_session_id=submit_client_session_v1.client_session_id) then
      return liferpg_session_private.reject_submission(owner,client_session_id,submission,'identity_conflict');
    end if;
  else
    select * into row_data from public.activity_sessions where id=server_id and user_id=owner for update;
    if not found or row_data.client_session_id is distinct from client_session_id then return liferpg_session_private.reject_submission(owner,client_session_id,submission,'mapping_mismatch'); end if;
    if row_data.status='completed' then
      receipt:=public.complete_activity_session(row_data.id);
      result:=jsonb_build_object('outcome','already_saved','client_session_id',client_session_id,'session_id',row_data.id,'sync_revision',row_data.sync_revision,'verification_class',row_data.verification_class,'ending','completed','receipt',receipt);
      insert into liferpg_session_private.client_submissions values(owner,client_session_id,submission,'accepted',result,row_data.id,received);
      return result;
    end if;
    if row_data.status='cancelled' then return liferpg_session_private.reject_submission(owner,client_session_id,submission,'session_cancelled',row_data.id); end if;
    select * into handoff from liferpg_session_private.sync_handoffs h where h.user_id=owner and h.session_id=row_data.id
      and h.client_session_id=submit_client_session_v1.client_session_id and h.revision=sync.revision and h.observed_at_ms=observed_ms;
    if not found or handoff.confirmed_ms<>confirmed_ms then return liferpg_session_private.reject_submission(owner,client_session_id,submission,'handoff_not_found',row_data.id); end if;
    if revision is null or (row_data.sync_revision<>revision and
      (to_jsonb(row_data)-array['sync_revision','task_id','subject_id'] is distinct from handoff.timing_state
       or (row_data.task_id is not null and row_data.task_id is distinct from (handoff.original_setup->>'taskId')::bigint)
       or (row_data.subject_id is not null and row_data.subject_id is distinct from (handoff.original_setup->>'subjectId')::bigint))) then
      return liferpg_session_private.reject_submission(owner,client_session_id,submission,'revision_conflict',row_data.id);
    end if;
    if abs(start_ms-floor(extract(epoch from row_data.started_at)*1000)::bigint)>15000
      or exists(select 1 from jsonb_array_elements(submission->'segments') s where (s->>'startedAtMs')::bigint<observed_ms)
      or end_ms<observed_ms then return liferpg_session_private.reject_submission(owner,client_session_id,submission,'segments_invalid',row_data.id); end if;
    -- Original server setup, not current task edits, determines mixed identity.
    if ((submission->'setup')-'title') is distinct from handoff.original_setup
       or row_data.target_duration_seconds<>target or row_data.activity_type<>activity or row_data.notes is distinct from note
       or (row_data.task_id is distinct from task and row_data.task_id is not null)
       or (row_data.subject_id is distinct from subject and row_data.subject_id is not null) then
      return liferpg_session_private.reject_submission(owner,client_session_id,submission,'setup_mismatch',row_data.id);
    end if;
    total_ms:=total_ms+confirmed_ms;
  end if;
  if ending='completed' and total_ms<target::bigint*1000 then return liferpg_session_private.reject_submission(owner,client_session_id,submission,'target_not_reached',server_id); end if;
  if ending='cancelled' and total_ms>=target::bigint*1000 then return liferpg_session_private.reject_submission(owner,client_session_id,submission,'target_reached_needs_completion',server_id); end if;
  select * into profile from public.profiles where id=owner for update;
  if not found then raise exception 'Profile not found'; end if;
  envelope_start:=case when server_id is null then start_at else least(start_at,row_data.started_at) end;
  if ending='completed' and exists(select 1 from public.activity_sessions s where s.user_id=owner and (server_id is null or s.id<>server_id)
    and tstzrange(least(s.started_at,coalesce(s.client_reported_started_at,s.started_at)),
      case when s.status in ('active','paused') or greatest(s.completed_at,s.client_reported_ended_at)<=least(s.started_at,coalesce(s.client_reported_started_at,s.started_at))
        then null else greatest(s.completed_at,s.client_reported_ended_at) end,'[)')
      && tstzrange(envelope_start,end_at,'[)')) then
    return liferpg_session_private.reject_submission(owner,client_session_id,submission,'overlap',server_id);
  end if;
  local_day:=(end_at at time zone profile.timezone)::date;
  select coalesce(sum(s.duration_seconds),0) into prior_daily from public.activity_sessions s where s.user_id=owner
    and s.verification_class='client_reported' and s.status='completed' and s.credit_result->>'credited_date'=local_day::text;
  if ending='completed' and prior_daily+target>57600 then return liferpg_session_private.reject_submission(owner,client_session_id,submission,'daily_cap',server_id); end if;
  -- Pure imports keep original links in submission but only credit owned live
  -- links. An imported one-off may complete; recurring quests remain untouched.
  if server_id is null then
    if task is not null and not exists(select 1 from public.tasks where id=task and user_id=owner) then task:=null; end if;
    if subject is not null and not exists(select 1 from public.subjects where id=subject and user_id=owner) then subject:=null; end if;
    server_id:=gen_random_uuid();
    insert into liferpg_session_private.client_submissions(user_id,client_session_id,submission,outcome,session_id)
    values(owner,client_session_id,submission,'pending',server_id);
    insert into public.activity_sessions(id,user_id,client_session_id,task_id,subject_id,activity_type,target_duration_seconds,
      status,notes,started_at,elapsed_seconds,verification_class,client_reported_started_at,client_reported_ended_at,server_received_at,client_clock_warning)
    values(server_id,owner,client_session_id,task,subject,activity,target,'paused',note,start_at,target,'client_reported',start_at,end_at,received,warning);
  else
    insert into liferpg_session_private.client_submissions(user_id,client_session_id,submission,outcome,session_id)
    values(owner,client_session_id,submission,'pending',server_id);
    update public.activity_sessions set verification_class='client_reported',client_reported_started_at=start_at,
      client_reported_ended_at=end_at,server_received_at=received,client_clock_warning=warning where id=server_id;
  end if;
  if ending='cancelled' then
    update public.activity_sessions set status='cancelled',completed_at=end_at where id=server_id;
  else receipt:=liferpg_session_private.credit_session(server_id,true,end_at); end if;
  select * into row_data from public.activity_sessions where id=server_id;
  result:=jsonb_build_object('outcome','accepted','client_session_id',client_session_id,'session_id',server_id,
    'sync_revision',row_data.sync_revision,'verification_class','client_reported','ending',ending,'receipt',receipt);
  update liferpg_session_private.client_submissions s set outcome='accepted',result=sync.result
    where s.user_id=owner and s.client_session_id=submit_client_session_v1.client_session_id;
  return result;
end;$fn$;
revoke all on function public.session_sync_capabilities_v1(),public.session_sync_snapshot_v1(uuid,uuid),public.submit_client_session_v1(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.session_sync_capabilities_v1(),public.session_sync_snapshot_v1(uuid,uuid),public.submit_client_session_v1(uuid,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
