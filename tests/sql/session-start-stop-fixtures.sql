-- DISPOSABLE DATABASE ONLY. No production rows or credentials.
alter table public.profiles add column xp_bank_seconds integer not null default 0;
alter table public.subjects add column xp_bank_seconds integer not null default 0;
alter table public.daily_progress add column completed_seconds bigint;
alter table public.daily_progress add column credit_version integer;
alter table public.activity_sessions add column credit_version integer;
alter table public.activity_sessions add column credit_result jsonb;
insert into auth.users(id) values
  ('11111111-1111-4111-8111-111111111111'), ('22222222-2222-4222-8222-222222222222');
insert into public.profiles(id, username, daily_goal_minutes, timezone) values
  ('11111111-1111-4111-8111-111111111111', 'Synthetic owner', 30, 'UTC'),
  ('22222222-2222-4222-8222-222222222222', 'Synthetic other', 30, 'UTC');
insert into public.subjects(id, user_id, title) values
  (1, '11111111-1111-4111-8111-111111111111', 'Learning'),
  (2, '22222222-2222-4222-8222-222222222222', 'Other owner');
insert into public.tasks(id, user_id, title, subject_id) values
  (1, '11111111-1111-4111-8111-111111111111', 'Synthetic task', 1),
  (2, '22222222-2222-4222-8222-222222222222', 'Other task', 2);
