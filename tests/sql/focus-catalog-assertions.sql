do $$ declare u uuid; fresh uuid:=gen_random_uuid(); a public.subjects%rowtype; begin
select id into u from focus_test_owners where kind='legacy';
if(select count(*) from public.subjects where user_id=u)<>7 then raise exception 'Synthetic catalogue count'; end if;
select * into a from public.subjects where user_id=u and title='Wellbeing';
if a.level<>4 or a.current_xp<>14 or a.xp_bank_seconds<>14 then raise exception 'Level/remainder merge: %/%/%',a.level,a.current_xp,a.xp_bank_seconds; end if;
if exists(select 1 from public.tasks where user_id=u and subject_id<>a.id) or exists(select 1 from public.activity_sessions where user_id=u and subject_id<>a.id) then raise exception 'Synthetic references'; end if;
if not exists(select 1 from public.subjects where user_id=u and title='My pottery' and level=3 and current_xp=4 and xp_bank_seconds=5 and color_code='#abcdef') then raise exception 'Custom area changed'; end if;
insert into auth.users(id,raw_user_meta_data) values(fresh,'{"full_name":"New catalogue test"}'::jsonb);
if(select count(*) from public.subjects where user_id=fresh)<>6 then raise exception 'New-account defaults'; end if;
if exists(select 1 from public.subjects where user_id=fresh and title not in('Everyday focus','Learning','Work & projects','Creativity','Everyday life','Wellbeing')) then raise exception 'Legacy default seeded'; end if;
if(select count(*) from public.rewards where user_id=fresh)<>4 then raise exception 'Account reward defaults changed'; end if;
if not exists(select 1 from public.profiles where id=fresh and username='New catalogue test') then raise exception 'Account profile changed'; end if;
if has_function_privilege('anon','public.handle_new_user()','execute') or has_function_privilege('authenticated','public.handle_new_user()','execute') then raise exception 'Trigger exposed'; end if;
perform set_config('request.jwt.claim.sub',u::text,false);
end $$;
set role authenticated;
do $$ begin
if(select count(*) from public.subjects)<>7 then raise exception 'Account ownership isolation failed'; end if;
end $$;
reset role;
select 'Focus catalogue: merged XP and exact-second banks, references, custom areas, new-account defaults and ownership pass' as result;
