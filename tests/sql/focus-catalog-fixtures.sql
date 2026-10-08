create temporary table focus_test_owners(kind text,id uuid);
do $$ declare u uuid:=gen_random_uuid(); other_owner uuid:=gen_random_uuid(); old_id bigint; begin
insert into focus_test_owners values('legacy',u),('other',other_owner);
insert into auth.users(id,raw_user_meta_data) values(u,'{"full_name":"Category migration test"}'::jsonb),(other_owner,'{}'::jsonb);
update public.subjects set level=3,current_xp=17,xp_bank_seconds=59 where user_id=u and title='Fitness & Health';
update public.subjects set level=2,current_xp=42,xp_bank_seconds=58 where user_id=u and title='Grooming & Vitality';
insert into public.subjects(user_id,title,level,current_xp,xp_bank_seconds,color_code) values(u,'Wellbeing',2,3,17,'#fff'),(u,'My pottery',3,4,5,'#abcdef');
select id into old_id from public.subjects where user_id=u and title='Grooming & Vitality';
insert into public.tasks(user_id,title,subject_id) values(u,'Migration test quest',old_id);
insert into public.activity_sessions(user_id,subject_id,target_duration_seconds,duration_seconds,status,completed_at,credit_result)
values(u,old_id,37,37,'completed',now(),'{"duration_seconds":37,"area_xp_earned":0,"goal_reached_now":false}'::jsonb);
insert into public.daily_progress values(u,current_date,60,37);
end $$;
