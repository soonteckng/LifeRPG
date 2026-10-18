-- Extras for exams and squads. Additive only: new nullable columns, replaced
-- functions with the same signatures, and two owner-only squad functions.
-- Older app versions keep working: exam drafts without a time or reminder
-- still save, and squads without a goal show no goal.

alter table liferpg_study_private.exams add column exam_minute integer check (exam_minute between 0 and 1439);
alter table liferpg_study_private.exams add column remind boolean not null default true;
alter table liferpg_squad_private.squads add column weekly_goal_minutes integer check (weekly_goal_minutes between 60 and 6000);

create or replace function liferpg_study_private.exam_json(e liferpg_study_private.exams)
returns jsonb language sql immutable set search_path = '' as $$
  select jsonb_build_object('kind','exam','id',e.id,'revision',e.revision,'title',e.title,'courseId',e.course_id,
    'examDate',to_char(e.exam_date,'YYYY-MM-DD'),'examMinute',e.exam_minute,'remind',e.remind,
    'deletedAt',case when e.deleted_at is null then null else floor(extract(epoch from e.deleted_at)*1000)::bigint end)
$$;

create or replace function public.change_study_item_v1(p_operation_id uuid, p_kind text, p_item_id uuid, p_expected_revision bigint,
  p_draft jsonb, p_deleted boolean, p_expected_owner uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare owner uuid := auth.uid(); request jsonb; old_op liferpg_study_private.operations; result jsonb;
  cur_course liferpg_study_private.courses; cur_exam liferpg_study_private.exams;
  next_name text; area bigint; course uuid; day date; minute integer; remind boolean; current_json jsonb; current_revision bigint; current_deleted boolean; exists_now boolean;
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
    if not (p_draft ?& array['title','courseId','examDate']) or p_draft-array['title','courseId','examDate','examMinute','remind']<>'{}'::jsonb
      or (p_draft ? 'examMinute' and not (p_draft->'examMinute'='null'::jsonb or (jsonb_typeof(p_draft->'examMinute')='number' and (p_draft->>'examMinute')~'^[0-9]{1,4}$')))
      or (p_draft ? 'remind' and jsonb_typeof(p_draft->'remind')<>'boolean')
      or jsonb_typeof(p_draft->'title')<>'string' or length(p_draft->>'title') not between 1 and 80
      or btrim(p_draft->>'title')<>p_draft->>'title' or (p_draft->>'title') ~ '[[:cntrl:]]'
      or not (p_draft->'courseId'='null'::jsonb or (jsonb_typeof(p_draft->'courseId')='string'
        and (p_draft->>'courseId') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'))
      or jsonb_typeof(p_draft->'examDate')<>'string' or (p_draft->>'examDate') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      then raise exception 'Invalid study settings'; end if;
    next_name := p_draft->>'title'; course := (p_draft->>'courseId')::uuid;
    minute := (p_draft->>'examMinute')::integer; remind := coalesce((p_draft->>'remind')::boolean, true);
    if minute is not null and minute > 1439 then raise exception 'Invalid study settings'; end if;
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
    insert into liferpg_study_private.exams(owner_id,id,revision,title,course_id,exam_date,exam_minute,remind,deleted_at)
    values(owner,p_item_id,p_expected_revision+1,next_name,course,day,minute,remind,case when p_deleted then clock_timestamp() else null end)
    on conflict(owner_id,id) do update set revision=excluded.revision,title=excluded.title,course_id=excluded.course_id,exam_date=excluded.exam_date,
      exam_minute=excluded.exam_minute,remind=excluded.remind,deleted_at=excluded.deleted_at
    returning * into cur_exam;
    result := jsonb_build_object('status','saved','item',liferpg_study_private.exam_json(cur_exam));
  end if;
  insert into liferpg_study_private.operations(owner_id,operation_id,request,reply) values(owner,p_operation_id,request,result);
  return result;
end $$;

create or replace function liferpg_squad_private.squad_json(p_squad uuid, p_viewer uuid, p_since timestamptz) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', s.id, 'name', s.name, 'code', s.code, 'ownerIsYou', s.owner_id = p_viewer, 'goalMinutes', s.weekly_goal_minutes,
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

-- The owner names the squad and may set a weekly goal (null clears it).
create function public.update_squad_v1(p_squad_id uuid, p_name text, p_goal_minutes integer, p_expected_owner uuid, p_since timestamptz) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare owner uuid := liferpg_squad_private.signed_in(p_expected_owner);
begin
  if p_squad_id is null or p_name is null or length(p_name) not between 1 and 40 or btrim(p_name) <> p_name or p_name ~ '[[:cntrl:]]'
    or (p_goal_minutes is not null and p_goal_minutes not between 60 and 6000) then raise exception 'Invalid squad settings'; end if;
  if p_since is null or p_since < now() - interval '8 days' or p_since > now() + interval '1 day' then raise exception 'Invalid week'; end if;
  perform pg_advisory_xact_lock(hashtextextended('liferpg-squad:' || p_squad_id::text, 0));
  update liferpg_squad_private.squads set name = p_name, weekly_goal_minutes = p_goal_minutes where id = p_squad_id and owner_id = owner and closed_at is null;
  if not found then return jsonb_build_object('status', 'not_owner'); end if;
  return jsonb_build_object('status', 'saved', 'squad', liferpg_squad_private.squad_json(p_squad_id, owner, p_since));
end $$;

-- A fresh code stops the old one working; current members stay.
create function public.new_squad_code_v1(p_squad_id uuid, p_expected_owner uuid, p_since timestamptz) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare owner uuid := liferpg_squad_private.signed_in(p_expected_owner);
begin
  if p_squad_id is null then raise exception 'Invalid squad'; end if;
  if p_since is null or p_since < now() - interval '8 days' or p_since > now() + interval '1 day' then raise exception 'Invalid week'; end if;
  perform pg_advisory_xact_lock(hashtextextended('liferpg-squad:' || p_squad_id::text, 0));
  update liferpg_squad_private.squads set code = liferpg_squad_private.new_code() where id = p_squad_id and owner_id = owner and closed_at is null;
  if not found then return jsonb_build_object('status', 'not_owner'); end if;
  return jsonb_build_object('status', 'saved', 'squad', liferpg_squad_private.squad_json(p_squad_id, owner, p_since));
end $$;

revoke all on function liferpg_study_private.exam_json(liferpg_study_private.exams) from public, anon, authenticated;
revoke all on function liferpg_squad_private.squad_json(uuid, uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.update_squad_v1(uuid, text, integer, uuid, timestamptz) from public, anon;
revoke all on function public.new_squad_code_v1(uuid, uuid, timestamptz) from public, anon;
grant execute on function public.update_squad_v1(uuid, text, integer, uuid, timestamptz) to authenticated;
grant execute on function public.new_squad_code_v1(uuid, uuid, timestamptz) to authenticated;
