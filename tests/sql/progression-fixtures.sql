-- Synthetic fixtures inserted BEFORE migration to exercise rollout.
insert into auth.users values ('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222');
insert into public.profiles(id,username,daily_goal_minutes,timezone,gold) values
 ('11111111-1111-4111-8111-111111111111','Synthetic focus fixture',30,'Asia/Kuala_Lumpur',100),
 ('22222222-2222-4222-8222-222222222222','Synthetic other fixture',30,'UTC',200);
insert into public.subjects(id,user_id,title) values
 (1,'11111111-1111-4111-8111-111111111111','Study'),
 (2,'11111111-1111-4111-8111-111111111111','General'),
 (3,'22222222-2222-4222-8222-222222222222','Other');
insert into public.daily_progress(user_id,progress_date,goal_minutes,completed_minutes,goal_completed) values
 ('11111111-1111-4111-8111-111111111111',(now() at time zone 'Asia/Kuala_Lumpur')::date,15,2,false),
 ('11111111-1111-4111-8111-111111111111',(now() at time zone 'Asia/Kuala_Lumpur')::date-1,15,14,false);
insert into public.activity_sessions(id,user_id,target_duration_seconds,duration_seconds,status,xp_earned,gold_earned,completed_at) values
 ('33333333-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111',959,959,'completed',15,75,now());
