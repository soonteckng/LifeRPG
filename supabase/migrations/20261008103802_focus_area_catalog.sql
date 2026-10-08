-- Replace legacy defaults in the synced catalogue. The two old self-care areas
-- merge into Wellbeing; session receipts, quests and overall balances survive.
begin;
set local lock_timeout = '5s';
lock table public.activity_sessions, public.profiles, public.subjects, public.tasks, public.daily_progress, public.rewards in share row exclusive mode;

do $$ begin
  if exists (select 1 from public.activity_sessions where status in ('active','paused')) then
    raise exception 'Finish or cancel open sessions before updating focus areas';
  end if;
  if exists (select 1 from public.subjects where level < 1 or current_xp < 0 or level is null or current_xp is null) then
    raise exception 'Unexpected focus-area progression; migration stopped';
  end if;
  if exists(select 1 from public.activity_sessions a join public.subjects s on s.id=a.subject_id where a.user_id<>s.user_id)
    or exists(select 1 from public.tasks t join public.subjects s on s.id=t.subject_id where t.user_id<>s.user_id) then
    raise exception 'Unexpected cross-account area reference; migration stopped';
  end if;
end $$;

create temporary table focus_catalog(title text primary key,color_code text not null) on commit drop;
insert into focus_catalog values
  ('Everyday focus','#AAB3FF'),('Learning','#79BFF2'),
  ('Work & projects','#C1A8FA'),('Creativity','#E98ABC'),
  ('Everyday life','#6DD4B5'),('Wellbeing','#F4AA88');

create temporary table focus_integrity_before on commit drop as
select 'profiles' as name, md5(coalesce(string_agg(to_jsonb(t)::text,'' order by id),'')) as fingerprint from public.profiles t
union all select 'sessions',md5(coalesce(string_agg((to_jsonb(t)-'subject_id')::text,'' order by id),'')) from public.activity_sessions t
union all select 'tasks',md5(coalesce(string_agg((to_jsonb(t)-'subject_id')::text,'' order by id),'')) from public.tasks t
union all select 'goals',md5(coalesce(string_agg(to_jsonb(t)::text,'' order by user_id,progress_date),'')) from public.daily_progress t
union all select 'rewards',md5(coalesce(string_agg(to_jsonb(t)::text,'' order by id),'')) from public.rewards t;
create temporary table focus_xp_before on commit drop as
select user_id,sum((25::bigint*level*(level-1)+current_xp)*60+xp_bank_seconds) as seconds from public.subjects group by user_id;

create temporary table focus_map on commit drop as
with named as (
  select s.*,case lower(trim(title))
    when 'general' then 'Everyday focus' when 'everyday focus' then 'Everyday focus'
    when 'knowledge' then 'Learning' when 'learning' then 'Learning'
    when 'fitness & health' then 'Wellbeing' when 'grooming & vitality' then 'Wellbeing'
    when 'personal care' then 'Wellbeing' when 'wellbeing' then 'Wellbeing'
    when 'life admin' then 'Everyday life' when 'everyday life' then 'Everyday life'
    when 'work & projects' then 'Work & projects' when 'creativity' then 'Creativity'
    else null end as canonical
  from public.subjects s
)
select id,user_id,canonical,
  first_value(id) over(partition by user_id,canonical order by (title=canonical) desc,id) as keeper
from named where canonical is not null;

-- Reconstruct total earned area XP, including the exact-second remainder.
-- This handles already-levelled areas, canonical/legacy duplicates and retries.
do $$ declare area record; points bigint; new_level integer; bank integer; begin
  for area in
    select m.user_id,m.canonical,m.keeper,
      sum((25::bigint*s.level*(s.level-1)+s.current_xp)*60+s.xp_bank_seconds) as total_seconds
    from focus_map m join public.subjects s on s.id=m.id
    group by m.user_id,m.canonical,m.keeper
  loop
    points := area.total_seconds / 60; bank := area.total_seconds % 60; new_level := 1;
    while points >= new_level::bigint*50 loop
      points := points-new_level::bigint*50; new_level := new_level+1;
    end loop;
    update public.tasks t set subject_id=area.keeper
      from focus_map m where m.user_id=area.user_id and m.canonical=area.canonical
      and t.user_id=m.user_id and t.subject_id=m.id and m.id<>area.keeper;
    update public.activity_sessions t set subject_id=area.keeper
      from focus_map m where m.user_id=area.user_id and m.canonical=area.canonical
      and t.user_id=m.user_id and t.subject_id=m.id and m.id<>area.keeper;
    delete from public.subjects s using focus_map m
      where s.id=m.id and m.user_id=area.user_id and m.canonical=area.canonical and s.id<>area.keeper;
    update public.subjects s set title=area.canonical,level=new_level,current_xp=points,xp_bank_seconds=bank,
      color_code=(select c.color_code from focus_catalog c where c.title=area.canonical)
      where s.id=area.keeper and s.user_id=area.user_id;
  end loop;
end $$;

insert into public.subjects(user_id,title,level,current_xp,color_code,xp_bank_seconds)
select p.id,c.title,1,0,c.color_code,0 from public.profiles p cross join focus_catalog c
on conflict(user_id,title) do nothing;

-- Existing account creation behavior is retained; only the default area rows
-- change. A trigger function is not a client RPC, so direct execution is revoked.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $function$
begin
  insert into public.profiles(id,username)
  values(new.id,coalesce(new.raw_user_meta_data->>'full_name',new.raw_user_meta_data->>'name','Hero'));
  insert into public.subjects(user_id,title,level,current_xp,color_code) values
    (new.id,'Everyday focus',1,0,'#AAB3FF'),(new.id,'Learning',1,0,'#79BFF2'),
    (new.id,'Work & projects',1,0,'#C1A8FA'),(new.id,'Creativity',1,0,'#E98ABC'),
    (new.id,'Everyday life',1,0,'#6DD4B5'),(new.id,'Wellbeing',1,0,'#F4AA88');
  insert into public.rewards(user_id,title,cost_gold,is_claimed) values
    (new.id,'☕ 15-Min Coffee Break',150,false),(new.id,'🎮 30-Min Gaming Session',300,false),
    (new.id,'🎬 1-Hour Movie / Series',600,false),(new.id,'🏖️ Full Evening Off',1200,false);
  return new;
end;
$function$;
revoke all on function public.handle_new_user() from public,anon,authenticated;

create temporary table focus_integrity_after on commit drop as
select 'profiles' as name,md5(coalesce(string_agg(to_jsonb(t)::text,'' order by id),'')) as fingerprint from public.profiles t
union all select 'sessions',md5(coalesce(string_agg((to_jsonb(t)-'subject_id')::text,'' order by id),'')) from public.activity_sessions t
union all select 'tasks',md5(coalesce(string_agg((to_jsonb(t)-'subject_id')::text,'' order by id),'')) from public.tasks t
union all select 'goals',md5(coalesce(string_agg(to_jsonb(t)::text,'' order by user_id,progress_date),'')) from public.daily_progress t
union all select 'rewards',md5(coalesce(string_agg(to_jsonb(t)::text,'' order by id),'')) from public.rewards t;
do $$ begin
  if exists(select 1 from focus_integrity_before b join focus_integrity_after a using(name) where a.fingerprint<>b.fingerprint) then
    raise exception 'Unexpected session, quest, goal or character changes; rolling back';
  end if;
  if exists(select 1 from focus_xp_before b full join
    (select user_id,sum((25::bigint*level*(level-1)+current_xp)*60+xp_bank_seconds) as seconds from public.subjects group by user_id) a using(user_id)
    where coalesce(b.seconds,0)<>coalesce(a.seconds,0)) then
    raise exception 'Area XP or exact-second remainder changed; rolling back';
  end if;
  if exists(select 1 from public.subjects where lower(trim(title)) in('general','knowledge','fitness & health','grooming & vitality','personal care','life admin')) then
    raise exception 'Legacy categories remain; rolling back';
  end if;
  if exists(select 1 from public.profiles p cross join focus_catalog c where not exists(select 1 from public.subjects s where s.user_id=p.id and s.title=c.title)) then
    raise exception 'Incomplete focus catalogue; rolling back';
  end if;
end $$;
commit;
