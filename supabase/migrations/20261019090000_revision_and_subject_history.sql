-- Revision, and subjects that keep their history.
--
-- 1. Every account gets a "Revision" category. The app picks it when a study
--    session starts for a subject with an exam coming up; it is never offered
--    in routine pickers. It is added the next time the account loads its
--    categories, like the rest of the catalogue. No existing rows change.
-- 2. A removed subject can be restored with its id, so its minutes return
--    when it is added back on any phone.
-- 3. Progress can ask which subject each study session in a period was for,
--    to break Revision and Learning down by subject.
-- Only the private study tables and the account's own categories are written.

begin;

create or replace function public.ensure_focus_area_catalog(expected_owner uuid)
returns setof public.subjects
language plpgsql security definer set search_path = ''
as $function$
declare
  v_owner uuid := auth.uid();
begin
  if v_owner is null or expected_owner is distinct from v_owner or not exists(select 1 from public.profiles p where p.id = v_owner) then
    raise exception 'An authenticated account is required' using errcode = '42501';
  end if;
  -- Serialize catalogue repair for this account, including simultaneous devices.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('liferpg:focus-catalog:' || v_owner::text, 0));
  insert into public.subjects(user_id,title,level,current_xp,color_code,xp_bank_seconds)
  select v_owner,c.title,1,0,c.color_code,0 from (values
    ('Everyday focus','#AAB3FF',array['general','everyday focus']),
    ('Learning','#79BFF2',array['learning','knowledge','study']),
    ('Revision','#FF8A80',array['revision']),
    ('Work & projects','#C1A8FA',array['work & projects','work','career','projects']),
    ('Creativity','#E98ABC',array['creative','creativity','creative practice']),
    ('Everyday life','#6DD4B5',array['life admin','personal life','everyday life']),
    ('Wellbeing','#F4AA88',array['wellbeing','fitness & health','grooming & vitality','health'])
  ) as c(title,color_code,aliases)
  where not exists(select 1 from public.subjects s where s.user_id=v_owner and pg_catalog.lower(pg_catalog.btrim(s.title))=any(c.aliases))
  on conflict(user_id,title) do nothing;
  return query select s.* from public.subjects s where s.user_id=v_owner order by s.id;
end;
$function$;
revoke all on function public.ensure_focus_area_catalog(uuid) from public,anon,authenticated;
grant execute on function public.ensure_focus_area_catalog(uuid) to authenticated;

-- The plan now also lists removed subjects (newest first), so the app can
-- restore one by name instead of starting it again from zero.
create or replace function public.list_study_plan_v1(p_expected_owner uuid, p_since timestamptz)
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
        order by a.completed_at desc limit 500) r),'[]'::jsonb),
    'removed', coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'revision',c.revision,'name',c.name) order by c.deleted_at desc, c.id)
      from (select * from liferpg_study_private.courses where owner_id=owner and deleted_at is not null order by deleted_at desc limit 48) c),'[]'::jsonb))
  into result;
  return result;
end $$;
revoke all on function public.list_study_plan_v1(uuid, timestamptz) from public, anon;
grant execute on function public.list_study_plan_v1(uuid, timestamptz) to authenticated;

-- Bring a removed subject back with the same id, so its tagged sessions count
-- again. Saying it again is harmless: an active subject is returned as it is.
create function public.restore_study_course_v1(p_course_id uuid, p_expected_owner uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare owner uuid := auth.uid(); cur liferpg_study_private.courses;
begin
  if owner is null or p_expected_owner is null or owner<>p_expected_owner or not exists(select 1 from auth.users where id=owner) then
    raise exception 'Account changed. Reconnect to your account'; end if;
  if p_course_id is null then raise exception 'Invalid study settings'; end if;
  perform pg_advisory_xact_lock(hashtextextended('liferpg-study:'||owner::text,0));
  select * into cur from liferpg_study_private.courses where owner_id=owner and id=p_course_id for update;
  if cur.id is null then return jsonb_build_object('status','conflict','reason','course','item',null); end if;
  if cur.deleted_at is not null then
    if (select count(*) from liferpg_study_private.courses where owner_id=owner and deleted_at is null)>=24 then
      return jsonb_build_object('status','conflict','reason','limit','item',null); end if;
    if cur.revision>=9007199254740991 then return jsonb_build_object('status','conflict','reason','revision','item',null); end if;
    update liferpg_study_private.courses set deleted_at=null, revision=revision+1 where owner_id=owner and id=p_course_id returning * into cur;
  end if;
  return jsonb_build_object('status','saved','item',liferpg_study_private.course_json(cur) || jsonb_build_object('totalSeconds',
    coalesce((select sum(a.duration_seconds) from liferpg_study_private.session_courses t
      join public.activity_sessions a on a.user_id=owner and a.client_session_id=t.client_session_id and a.status='completed'
      where t.owner_id=owner and t.course_id=cur.id),0)));
end $$;

-- Which subject each completed study session between two times was for.
-- Removed subjects are included, so older weeks keep their names.
create function public.list_session_courses_v1(p_expected_owner uuid, p_from timestamptz, p_to timestamptz)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare owner uuid := auth.uid();
begin
  if owner is null or p_expected_owner is null or owner<>p_expected_owner or not exists(select 1 from auth.users where id=owner) then
    raise exception 'Account changed. Reconnect to your account'; end if;
  if p_from is null or p_to is null or p_to <= p_from or p_to - p_from > interval '45 days' then raise exception 'Invalid study window'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('clientSessionId',r.client_session_id,'courseId',r.course_id,'name',r.name) order by r.completed_at)
    from (select t.client_session_id, t.course_id, c.name, a.completed_at from liferpg_study_private.session_courses t
      join public.activity_sessions a on a.user_id=owner and a.client_session_id=t.client_session_id
      join liferpg_study_private.courses c on c.owner_id=owner and c.id=t.course_id
      where t.owner_id=owner and a.status='completed' and a.completed_at>=p_from and a.completed_at<p_to
      order by a.completed_at limit 1000) r),'[]'::jsonb);
end $$;

revoke all on function public.restore_study_course_v1(uuid, uuid) from public, anon;
revoke all on function public.list_session_courses_v1(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.restore_study_course_v1(uuid, uuid) to authenticated;
grant execute on function public.list_session_courses_v1(uuid, timestamptz, timestamptz) to authenticated;

commit;
