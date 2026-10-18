-- Exams and study subjects ("courses" here, because public.subjects already
-- holds focus areas). Same shape as saved routines: a private schema that only
-- SECURITY DEFINER functions can reach, owner checks on every call, idempotent
-- operations and revision conflicts for offline edits.

create schema if not exists liferpg_study_private;
revoke all on schema liferpg_study_private from public, anon, authenticated;

create table liferpg_study_private.courses (
  owner_id uuid not null references auth.users(id) on delete cascade,
  id uuid not null,
  revision bigint not null check (revision between 1 and 9007199254740991),
  name text not null check (length(name) between 1 and 60),
  focus_area_id bigint,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (owner_id, id)
);

create table liferpg_study_private.exams (
  owner_id uuid not null references auth.users(id) on delete cascade,
  id uuid not null,
  revision bigint not null check (revision between 1 and 9007199254740991),
  title text not null check (length(title) between 1 and 80),
  course_id uuid,
  exam_date date not null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (owner_id, id)
);

-- Which subject a focus session was for. Keyed by the client session id so a
-- session can be tagged while offline, before the server has seen it.
create table liferpg_study_private.session_courses (
  owner_id uuid not null references auth.users(id) on delete cascade,
  client_session_id uuid not null,
  course_id uuid not null,
  tagged_at timestamptz not null default now(),
  primary key (owner_id, client_session_id),
  foreign key (owner_id, course_id) references liferpg_study_private.courses(owner_id, id) on delete cascade
);
create index session_courses_course on liferpg_study_private.session_courses(owner_id, course_id);

create table liferpg_study_private.operations (
  owner_id uuid not null references auth.users(id) on delete cascade,
  operation_id uuid not null,
  request jsonb not null,
  reply jsonb not null,
  created_at timestamptz not null default now(),
  primary key (owner_id, operation_id)
);

alter table liferpg_study_private.courses enable row level security;
alter table liferpg_study_private.exams enable row level security;
alter table liferpg_study_private.session_courses enable row level security;
alter table liferpg_study_private.operations enable row level security;
revoke all on all tables in schema liferpg_study_private from public, anon, authenticated;

create function liferpg_study_private.course_json(c liferpg_study_private.courses)
returns jsonb language sql immutable set search_path = '' as $$
  select jsonb_build_object('kind','course','id',c.id,'revision',c.revision,'name',c.name,'focusAreaId',c.focus_area_id,
    'deletedAt',case when c.deleted_at is null then null else floor(extract(epoch from c.deleted_at)*1000)::bigint end)
$$;

create function liferpg_study_private.exam_json(e liferpg_study_private.exams)
returns jsonb language sql immutable set search_path = '' as $$
  select jsonb_build_object('kind','exam','id',e.id,'revision',e.revision,'title',e.title,'courseId',e.course_id,
    'examDate',to_char(e.exam_date,'YYYY-MM-DD'),
    'deletedAt',case when e.deleted_at is null then null else floor(extract(epoch from e.deleted_at)*1000)::bigint end)
$$;

-- Everything the Study tab needs in one call. p_since is the start of the
-- caller's local 7-day window; completed tagged sessions after it come back
-- individually so the phone can bucket them into its own days.
create function public.list_study_plan_v1(p_expected_owner uuid, p_since timestamptz)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare owner uuid := auth.uid(); result jsonb;
begin
  if owner is null or p_expected_owner is null or owner<>p_expected_owner or not exists(select 1 from auth.users where id=owner) then
    raise exception 'Account changed. Reconnect to your account'; end if;
  if p_since is null or p_since < now()-interval '40 days' or p_since > now()+interval '1 day' then raise exception 'Invalid study window'; end if;
  select jsonb_build_object(
    'courses', coalesce((select jsonb_agg(liferpg_study_private.course_json(c) || jsonb_build_object('totalSeconds',
        coalesce((select sum(a.duration_seconds) from liferpg_study_private.session_courses t
          join public.activity_sessions a on a.user_id=owner and a.client_session_id=t.client_session_id and a.status='completed'
          where t.owner_id=owner and t.course_id=c.id),0)) order by c.created_at, c.id)
      from liferpg_study_private.courses c where c.owner_id=owner and c.deleted_at is null),'[]'::jsonb),
    'exams', coalesce((select jsonb_agg(liferpg_study_private.exam_json(e) || jsonb_build_object('courseId', case when exists(select 1
        from liferpg_study_private.courses c where c.owner_id=owner and c.id=e.course_id and c.deleted_at is null) then e.course_id end)
        order by e.exam_date, e.id)
      from liferpg_study_private.exams e where e.owner_id=owner and e.deleted_at is null and e.exam_date >= current_date-7),'[]'::jsonb),
    'recent', coalesce((select jsonb_agg(jsonb_build_object('courseId',r.course_id,'completedAt',floor(extract(epoch from r.completed_at)*1000)::bigint,'seconds',r.duration_seconds) order by r.completed_at)
      from (select t.course_id, a.completed_at, a.duration_seconds from liferpg_study_private.session_courses t
        join public.activity_sessions a on a.user_id=owner and a.client_session_id=t.client_session_id
        join liferpg_study_private.courses c on c.owner_id=owner and c.id=t.course_id and c.deleted_at is null
        where t.owner_id=owner and a.status='completed' and a.duration_seconds>0 and a.completed_at>=p_since
        order by a.completed_at desc limit 500) r),'[]'::jsonb))
  into result;
  return result;
end $$;

create function public.change_study_item_v1(p_operation_id uuid, p_kind text, p_item_id uuid, p_expected_revision bigint,
  p_draft jsonb, p_deleted boolean, p_expected_owner uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare owner uuid := auth.uid(); request jsonb; old_op liferpg_study_private.operations; result jsonb;
  cur_course liferpg_study_private.courses; cur_exam liferpg_study_private.exams;
  next_name text; area bigint; course uuid; day date; current_json jsonb; current_revision bigint; current_deleted boolean; exists_now boolean;
begin
  if current_setting('transaction_isolation')<>'read committed' then raise exception 'Use read committed for study changes'; end if;
  if owner is null or p_expected_owner is null or owner<>p_expected_owner or not exists(select 1 from auth.users where id=owner) then
    raise exception 'Account changed. Reconnect to your account'; end if;
  if p_operation_id is null or p_item_id is null or p_deleted is null or p_kind is null or p_kind not in ('course','exam')
    or p_expected_revision is null or p_expected_revision<0 or p_expected_revision>=9007199254740991
    or p_draft is null or jsonb_typeof(p_draft)<>'object' or octet_length(p_draft::text)>1024 then
    raise exception 'Invalid study settings'; end if;
  if p_kind='course' then
    if not (p_draft ?& array['name','focusAreaId']) or p_draft-array['name','focusAreaId']<>'{}'::jsonb
      or jsonb_typeof(p_draft->'name')<>'string' or length(p_draft->>'name') not between 1 and 60
      or btrim(p_draft->>'name')<>p_draft->>'name' or (p_draft->>'name') ~ '[[:cntrl:]]'
      or not (p_draft->'focusAreaId'='null'::jsonb or (jsonb_typeof(p_draft->'focusAreaId')='number' and (p_draft->>'focusAreaId')~'^[1-9][0-9]{0,15}$'))
      then raise exception 'Invalid study settings'; end if;
    next_name := p_draft->>'name'; area := (p_draft->>'focusAreaId')::bigint;
  else
    if not (p_draft ?& array['title','courseId','examDate']) or p_draft-array['title','courseId','examDate']<>'{}'::jsonb
      or jsonb_typeof(p_draft->'title')<>'string' or length(p_draft->>'title') not between 1 and 80
      or btrim(p_draft->>'title')<>p_draft->>'title' or (p_draft->>'title') ~ '[[:cntrl:]]'
      or not (p_draft->'courseId'='null'::jsonb or (jsonb_typeof(p_draft->'courseId')='string'
        and (p_draft->>'courseId') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'))
      or jsonb_typeof(p_draft->'examDate')<>'string' or (p_draft->>'examDate') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      then raise exception 'Invalid study settings'; end if;
    next_name := p_draft->>'title'; course := (p_draft->>'courseId')::uuid;
    begin day := to_date(p_draft->>'examDate','YYYY-MM-DD'); exception when others then raise exception 'Invalid study settings'; end;
    if to_char(day,'YYYY-MM-DD')<>p_draft->>'examDate' then raise exception 'Invalid study settings'; end if;
  end if;
  request := jsonb_build_object('kind',p_kind,'itemId',p_item_id,'expectedRevision',p_expected_revision,'draft',p_draft,'deleted',p_deleted);
  perform pg_advisory_xact_lock(hashtextextended('liferpg-study:'||owner::text,0));
  select * into old_op from liferpg_study_private.operations where owner_id=owner and operation_id=p_operation_id;
  if found then
    if old_op.request<>request then raise exception 'Operation already used with different settings'; end if;
    return old_op.reply;
  end if;
  if p_kind='course' then
    select * into cur_course from liferpg_study_private.courses where owner_id=owner and id=p_item_id for update;
    exists_now := cur_course.id is not null; current_revision := cur_course.revision; current_deleted := cur_course.deleted_at is not null;
    current_json := case when exists_now then liferpg_study_private.course_json(cur_course) else null end;
  else
    select * into cur_exam from liferpg_study_private.exams where owner_id=owner and id=p_item_id for update;
    exists_now := cur_exam.id is not null; current_revision := cur_exam.revision; current_deleted := cur_exam.deleted_at is not null;
    current_json := case when exists_now then liferpg_study_private.exam_json(cur_exam) else null end;
  end if;
  if (not exists_now and (p_expected_revision<>0 or p_deleted)) or (exists_now and (current_revision<>p_expected_revision or current_deleted)) then
    result := jsonb_build_object('status','conflict','item',current_json);
  elsif not p_deleted and p_kind='course' and area is not null and not exists(select 1 from public.subjects where user_id=owner and id=area) then
    result := jsonb_build_object('status','conflict','reason','area','item',current_json);
  elsif not p_deleted and p_kind='exam' and course is not null
    and not exists(select 1 from liferpg_study_private.courses where owner_id=owner and id=course and deleted_at is null) then
    result := jsonb_build_object('status','conflict','reason','course','item',current_json);
  elsif not p_deleted and p_kind='exam' and (day < current_date-1 or day > current_date+730) then
    result := jsonb_build_object('status','conflict','reason','date','item',current_json);
  elsif not exists_now and p_kind='course' and (select count(*) from liferpg_study_private.courses where owner_id=owner and deleted_at is null)>=24 then
    result := jsonb_build_object('status','conflict','reason','limit','item',null);
  elsif not exists_now and p_kind='exam' and (select count(*) from liferpg_study_private.exams where owner_id=owner and deleted_at is null and exam_date>=current_date-7)>=40 then
    result := jsonb_build_object('status','conflict','reason','limit','item',null);
  elsif p_kind='course' then
    insert into liferpg_study_private.courses(owner_id,id,revision,name,focus_area_id,deleted_at)
    values(owner,p_item_id,p_expected_revision+1,next_name,area,case when p_deleted then clock_timestamp() else null end)
    on conflict(owner_id,id) do update set revision=excluded.revision,name=excluded.name,focus_area_id=excluded.focus_area_id,deleted_at=excluded.deleted_at
    returning * into cur_course;
    result := jsonb_build_object('status','saved','item',liferpg_study_private.course_json(cur_course));
  else
    insert into liferpg_study_private.exams(owner_id,id,revision,title,course_id,exam_date,deleted_at)
    values(owner,p_item_id,p_expected_revision+1,next_name,course,day,case when p_deleted then clock_timestamp() else null end)
    on conflict(owner_id,id) do update set revision=excluded.revision,title=excluded.title,course_id=excluded.course_id,exam_date=excluded.exam_date,deleted_at=excluded.deleted_at
    returning * into cur_exam;
    result := jsonb_build_object('status','saved','item',liferpg_study_private.exam_json(cur_exam));
  end if;
  insert into liferpg_study_private.operations(owner_id,operation_id,request,reply) values(owner,p_operation_id,request,result);
  return result;
end $$;

-- Tags (or untags, with a null course) one focus session. Repeating the same
-- call is harmless. Tags for sessions the server hasn't seen yet are capped so
-- random ids can't pile up.
create function public.tag_session_course_v1(p_client_session_id uuid, p_course_id uuid, p_expected_owner uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare owner uuid := auth.uid();
begin
  if owner is null or p_expected_owner is null or owner<>p_expected_owner or not exists(select 1 from auth.users where id=owner) then
    raise exception 'Account changed. Reconnect to your account'; end if;
  if p_client_session_id is null then raise exception 'Invalid session'; end if;
  perform pg_advisory_xact_lock(hashtextextended('liferpg-study:'||owner::text,0));
  if p_course_id is null then
    delete from liferpg_study_private.session_courses where owner_id=owner and client_session_id=p_client_session_id;
    return jsonb_build_object('status','saved');
  end if;
  if not exists(select 1 from liferpg_study_private.courses where owner_id=owner and id=p_course_id and deleted_at is null) then
    return jsonb_build_object('status','conflict','reason','course'); end if;
  if not exists(select 1 from public.activity_sessions where user_id=owner and client_session_id=p_client_session_id)
    and not exists(select 1 from liferpg_study_private.session_courses where owner_id=owner and client_session_id=p_client_session_id)
    and (select count(*) from liferpg_study_private.session_courses t where t.owner_id=owner
      and not exists(select 1 from public.activity_sessions a where a.user_id=owner and a.client_session_id=t.client_session_id))>=20 then
    return jsonb_build_object('status','conflict','reason','limit'); end if;
  insert into liferpg_study_private.session_courses(owner_id,client_session_id,course_id) values(owner,p_client_session_id,p_course_id)
  on conflict(owner_id,client_session_id) do update set course_id=excluded.course_id, tagged_at=now();
  return jsonb_build_object('status','saved');
end $$;

revoke all on function liferpg_study_private.course_json(liferpg_study_private.courses) from public, anon, authenticated;
revoke all on function liferpg_study_private.exam_json(liferpg_study_private.exams) from public, anon, authenticated;
revoke all on function public.list_study_plan_v1(uuid, timestamptz) from public, anon;
revoke all on function public.change_study_item_v1(uuid, text, uuid, bigint, jsonb, boolean, uuid) from public, anon;
revoke all on function public.tag_session_course_v1(uuid, uuid, uuid) from public, anon;
grant execute on function public.list_study_plan_v1(uuid, timestamptz) to authenticated;
grant execute on function public.change_study_item_v1(uuid, text, uuid, bigint, jsonb, boolean, uuid) to authenticated;
grant execute on function public.tag_session_course_v1(uuid, uuid, uuid) to authenticated;
