-- Developer accounts: a private list only the database reads. The app asks
-- whether the signed-in account is on it to show its hidden Developer tools,
-- which only preview screens and never change progress.
create table if not exists liferpg_auth_private.developers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  note text,
  created_at timestamptz not null default now()
);
alter table liferpg_auth_private.developers enable row level security;
revoke all on liferpg_auth_private.developers from public, anon, authenticated;

create or replace function public.is_developer_v1() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (select 1 from liferpg_auth_private.developers where user_id = auth.uid())
$$;
revoke all on function public.is_developer_v1() from public, anon;
grant execute on function public.is_developer_v1() to authenticated;
