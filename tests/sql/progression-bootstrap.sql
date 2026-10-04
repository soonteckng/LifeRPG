-- DISPOSABLE DATABASE ONLY. Synthetic schema approximates inspected live columns.
create role anon; create role authenticated;
create schema auth;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema auth,public to anon,authenticated;
grant execute on function auth.uid() to anon,authenticated;
create table public.profiles (
  id uuid not null,
  username text default 'Hero'::text not null,
  avatar text default '🧙‍♂️'::text not null,
  class_title text default 'Novice Scholar 📚'::text not null,
  level integer default 1 not null,
  current_xp integer default 0 not null,
  gold integer default 0 not null,
  streak_count integer default 1 not null,
  last_active_date date,
  created_at timestamp with time zone default now() not null,
  onboarding_completed boolean default false not null,
  daily_goal_minutes integer default 60 not null,
  timezone text default 'Asia/Kuala_Lumpur'::text not null,
  last_goal_completed_date date,
  primary key (id)
);
alter table public.profiles enable row level security;
create policy own_rows on public.profiles for select to authenticated using (auth.uid() = id);
grant select on public.profiles to authenticated;
create table public.subjects (
  id bigint not null,
  user_id uuid not null,
  title text not null,
  level integer default 1 not null,
  current_xp integer default 0 not null,
  color_code text,
  primary key (id)
);
alter table public.subjects enable row level security;
create policy own_rows on public.subjects for select to authenticated using (auth.uid() = user_id);
grant select on public.subjects to authenticated;
create table public.tasks (
  id bigint not null,
  user_id uuid not null,
  title text not null,
  difficulty text default 'medium'::text not null,
  is_completed boolean default false not null,
  xp_awarded integer default 100 not null,
  is_recurring boolean default false not null,
  repeat_rule text default 'once'::text not null,
  target_minutes integer default 30 not null,
  subject_id bigint,
  last_completed_date date,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  completed_at timestamp with time zone,
  primary key (id)
);
create table public.daily_progress (
  user_id uuid not null,
  progress_date date not null,
  goal_minutes integer not null,
  completed_minutes integer default 0 not null,
  goal_completed boolean default false not null,
  goal_completed_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  primary key (user_id,progress_date)
);
alter table public.daily_progress enable row level security;
create policy own_rows on public.daily_progress for select to authenticated using (auth.uid() = user_id);
grant select on public.daily_progress to authenticated;
create table public.activity_sessions (
  id uuid default gen_random_uuid() not null,
  user_id uuid not null,
  task_id bigint,
  subject_id bigint,
  activity_type text default 'general'::text not null,
  target_duration_seconds integer not null,
  duration_seconds integer default 0 not null,
  status text default 'active'::text not null,
  notes text,
  xp_earned integer default 0 not null,
  gold_earned integer default 0 not null,
  started_at timestamp with time zone default now() not null,
  completed_at timestamp with time zone,
  created_at timestamp with time zone default now() not null,
  elapsed_seconds integer default 0 not null,
  last_resumed_at timestamp with time zone,
  paused_at timestamp with time zone,
  primary key (id)
);
alter table public.activity_sessions enable row level security;
create policy own_rows on public.activity_sessions for select to authenticated using (auth.uid() = user_id);
grant select on public.activity_sessions to authenticated;
grant update(username,avatar,class_title) on public.profiles to authenticated;
alter table public.subjects add unique(user_id,title);
alter table public.daily_progress add check(goal_minutes between 15 and 480);
alter table public.profiles add check(daily_goal_minutes between 15 and 480);
alter table public.activity_sessions add check(status in ('active','paused','completed','cancelled'));
