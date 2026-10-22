-- Developer accounts can go through the intro again without a new account.
-- Only the "intro finished" mark is cleared. Level, XP, sessions, routines,
-- squads and goal history all stay. The intro then opens with the current
-- name and goal already filled in.
create or replace function public.dev_restart_intro_v1() returns boolean
language plpgsql volatile security definer set search_path = '' as $$
begin
  if auth.uid() is null or not exists (select 1 from liferpg_auth_private.developers where user_id = auth.uid()) then
    raise exception 'Developer accounts only' using errcode = '42501';
  end if;
  update public.profiles set onboarding_completed = false where id = auth.uid();
  return found;
end $$;
revoke all on function public.dev_restart_intro_v1() from public, anon;
grant execute on function public.dev_restart_intro_v1() to authenticated;
