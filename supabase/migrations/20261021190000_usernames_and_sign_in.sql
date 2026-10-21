-- Usernames people can sign in with.
--
-- A name becomes yours (unique, ignoring capitals and extra spaces) once you
-- pick it in the intro or in Profile. New accounts start with a placeholder
-- that is not claimed, so two sign-ups can never collide.
--
-- Signing in with a username checks the password here and hands back the
-- email only when it matches; the app then signs in with Supabase as usual.
-- Nobody can learn another person's email from a username, and failed tries
-- are limited per name and per connection.

create schema if not exists liferpg_auth_private;
revoke all on schema liferpg_auth_private from public, anon, authenticated;

-- One normal form for names: trimmed, single spaces, lower case.
create or replace function liferpg_auth_private.name_key(p_name text) returns text
language sql immutable set search_path = '' as $$
  select lower(regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g'))
$$;

alter table public.profiles add column if not exists username_claimed boolean not null default false;
alter table public.profiles add column if not exists username_key text
  generated always as (lower(regexp_replace(btrim(username), '\s+', ' ', 'g'))) stored;

-- "@" is kept for emails, so the sign-in box can tell the two apart.
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.profiles'::regclass and conname = 'profiles_username_shape') then
    alter table public.profiles add constraint profiles_username_shape check (username !~ '[@[:cntrl:]]');
  end if;
end $$;

-- Everyone who has finished the intro already chose their name.
update public.profiles set username_claimed = true where onboarding_completed and not username_claimed;
create unique index if not exists profiles_username_key_claimed on public.profiles (username_key) where username_claimed;

-- New accounts: same profile and starting categories as before. A name from
-- Google is kept as a placeholder (up to 15 characters, no "@") until the
-- person picks their own in the intro.
create or replace function public.handle_new_user()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_name text := btrim(left(btrim(regexp_replace(regexp_replace(coalesce(
    new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', ''), '[@[:cntrl:]]', '', 'g'), '\s+', ' ', 'g')), 15));
begin
  insert into public.profiles (
    id,
    username
  )
  values (
    new.id,
    coalesce(nullif(v_name, ''), 'Hero')
  );

  insert into public.subjects (user_id, title, level, current_xp, color_code)
  values
    (new.id, 'Fitness & Health', 1, 0, '#EF4444'),
    (new.id, 'Knowledge', 1, 0, '#6366F1'),
    (new.id, 'Grooming & Vitality', 1, 0, '#EC4899'),
    (new.id, 'Life Admin', 1, 0, '#10B981'),
    (new.id, 'General', 1, 0, '#F59E0B');

  return new;
end;
$function$;

-- The intro's name step: is this name free? Signed-in people only.
create or replace function public.username_available_v1(p_username text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  clean text := regexp_replace(btrim(coalesce(p_username, '')), '\s+', ' ', 'g');
begin
  if me is null then raise exception 'Not authenticated'; end if;
  if char_length(clean) not between 1 and 15 or clean ~ '[@[:cntrl:]]' then return false; end if;
  return not exists (
    select 1 from public.profiles
    where username_claimed and username_key = liferpg_auth_private.name_key(clean) and id <> me
  );
end $$;
revoke all on function public.username_available_v1(text) from public, anon;
grant execute on function public.username_available_v1(text) to authenticated;

-- Saving the intro now claims the name. A name someone else holds fails with
-- a unique violation (23505), which the app shows as "That name is taken".
create or replace function public.complete_onboarding(p_username text, p_avatar text, p_class_title text, p_daily_goal_minutes integer)
 returns profiles
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_profile public.profiles;
  v_name text := regexp_replace(btrim(coalesce(p_username, '')), '\s+', ' ', 'g');
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if v_name = '' then
    raise exception 'Username is required';
  end if;

  if v_name ~ '[@[:cntrl:]]' then
    raise exception 'Username cannot contain @';
  end if;

  if p_daily_goal_minutes < 15
     or p_daily_goal_minutes > 480 then
    raise exception 'Daily goal must be between 15 and 480 minutes';
  end if;

  update public.profiles
  set
    username = v_name,
    username_claimed = true,
    avatar = coalesce(p_avatar, '🧙‍♂️'),
    class_title = coalesce(
      nullif(trim(p_class_title), ''),
      'Adventurer'
    ),
    daily_goal_minutes = p_daily_goal_minutes,
    timezone = 'Asia/Kuala_Lumpur'
  where id = auth.uid()
  returning *
  into v_profile;

  if not found then
    raise exception 'Profile not found';
  end if;

  return v_profile;
end;
$function$;

-- Failed username sign-ins, kept for a day to slow down guessing.
create table if not exists liferpg_auth_private.username_sign_in_failures (
  id bigint generated always as identity primary key,
  username_key text not null,
  client text not null,
  failed_at timestamptz not null default now()
);
create index if not exists username_sign_in_failures_by_name on liferpg_auth_private.username_sign_in_failures (username_key, failed_at);
create index if not exists username_sign_in_failures_by_client on liferpg_auth_private.username_sign_in_failures (client, failed_at);
alter table liferpg_auth_private.username_sign_in_failures enable row level security;
revoke all on liferpg_auth_private.username_sign_in_failures from public, anon, authenticated;

-- Username sign-in: returns the account's email only for the right password,
-- otherwise null. Ten wrong tries for one name, or thirty from one connection,
-- in fifteen minutes pause further tries ("too_many_attempts"). A connection
-- that cannot be identified is never grouped with others, so it can never
-- pause sign-in for everyone.
create or replace function public.username_sign_in_email_v1(p_username text, p_password text) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_key text := liferpg_auth_private.name_key(p_username);
  v_headers json;
  v_client text;
  v_email text;
  v_hash text;
  v_ok boolean := false;
begin
  if v_key = '' or char_length(v_key) > 40 or p_password is null or char_length(p_password) not between 1 and 72 then
    return null;
  end if;
  begin
    v_headers := nullif(current_setting('request.headers', true), '')::json;
  exception when others then
    v_headers := null;
  end;
  v_client := btrim(left(coalesce(v_headers->>'cf-connecting-ip', v_headers->>'x-real-ip',
    split_part(coalesce(v_headers->>'x-forwarded-for', ''), ',', 1), ''), 64));
  if v_client = '' then v_client := 'unknown'; end if;

  perform pg_advisory_xact_lock(hashtextextended('liferpg-username-sign-in:' || v_key, 0));
  delete from liferpg_auth_private.username_sign_in_failures where failed_at < now() - interval '1 day';
  if (select count(*) from liferpg_auth_private.username_sign_in_failures
        where username_key = v_key and failed_at > now() - interval '15 minutes') >= 10
     or (v_client <> 'unknown' and (select count(*) from liferpg_auth_private.username_sign_in_failures
        where client = v_client and failed_at > now() - interval '15 minutes') >= 30) then
    raise exception 'too_many_attempts';
  end if;

  select u.email, u.encrypted_password into v_email, v_hash
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.username_claimed and p.username_key = v_key
    and u.deleted_at is null and (u.banned_until is null or u.banned_until < now())
  limit 1;

  if v_email is not null and v_hash like '$2%' then
    v_ok := extensions.crypt(p_password, v_hash) = v_hash;
  else
    -- Same work as a real check, so an unknown name answers just as slowly.
    perform extensions.crypt(p_password, '$2a$10$czzD0TpvBv4n08J7tCQ.t.UxKxZs9gRAhlBxTVCwMk.vaFD2HysN2');
  end if;

  if v_ok then
    delete from liferpg_auth_private.username_sign_in_failures where username_key = v_key;
    return v_email;
  end if;
  insert into liferpg_auth_private.username_sign_in_failures (username_key, client) values (v_key, v_client);
  return null;
end $$;
revoke all on function public.username_sign_in_email_v1(text, text) from public;
grant execute on function public.username_sign_in_email_v1(text, text) to anon, authenticated;
