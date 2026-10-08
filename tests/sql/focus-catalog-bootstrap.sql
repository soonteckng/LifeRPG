-- Isolated disposable database only; reflects inspected live table contracts.
do $$ begin
  if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
  if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
end $$;
create schema auth;
create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}'::jsonb);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema public,auth to anon,authenticated;
create table public.profiles(
  id uuid primary key references auth.users(id),username text default 'Hero',
  level integer default 1,current_xp integer default 0,gold integer default 0,
  daily_goal_minutes integer default 60,timezone text default 'UTC',xp_bank_seconds integer default 0
);
create table public.subjects(
  id bigint generated always as identity primary key,user_id uuid references auth.users(id),title text not null,
  level integer not null default 1,current_xp integer not null default 0,color_code text,
  xp_bank_seconds integer not null default 0 check(xp_bank_seconds between 0 and 59),unique(user_id,title)
);
create table public.tasks(
  id bigint generated always as identity primary key,user_id uuid references auth.users(id),title text not null,
  subject_id bigint references public.subjects(id) on delete set null,is_completed boolean default false
);
create table public.activity_sessions(
  id uuid default gen_random_uuid() primary key,user_id uuid references auth.users(id),
  subject_id bigint references public.subjects(id) on delete set null,target_duration_seconds integer not null,
  duration_seconds integer not null default 0,status text not null default 'active',completed_at timestamptz,
  xp_earned integer default 0,gold_earned integer default 0,credit_result jsonb
);
create table public.daily_progress(user_id uuid,progress_date date,goal_minutes integer,completed_seconds bigint,primary key(user_id,progress_date));
create table public.rewards(id bigint generated always as identity primary key,user_id uuid,title text,cost_gold integer,is_claimed boolean);
alter table public.subjects enable row level security;
create policy own_areas on public.subjects for select to authenticated using(auth.uid()=user_id);
grant select on public.subjects to authenticated;
create function public.handle_new_user() returns trigger language plpgsql security definer set search_path='public' as $$begin
  insert into public.profiles(id,username) values(new.id,coalesce(new.raw_user_meta_data->>'full_name','Hero'));
  insert into public.subjects(user_id,title,color_code) values
    (new.id,'Fitness & Health','#EF4444'),(new.id,'Knowledge','#6366F1'),
    (new.id,'Grooming & Vitality','#EC4899'),(new.id,'Life Admin','#10B981'),(new.id,'General','#F59E0B');
  insert into public.rewards(user_id,title,cost_gold,is_claimed) values(new.id,'Existing reward',100,false);
  return new;
end$$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
