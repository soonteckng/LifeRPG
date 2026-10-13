-- Proposal only. Apply after explicit approval; does not query or migrate accounts at installation.
-- Missing defaults are inserted only when the signed-in account calls this function.
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
commit;
