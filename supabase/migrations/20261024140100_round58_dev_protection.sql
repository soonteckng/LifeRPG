-- Round 58, run in the SQL Editor.
-- 1. Developer accounts are protected: they can't be deleted, and "Reset my
--    rewards" is turned off for them, so a stray tap can't undo real progress.
-- 2. New developer test actions, each through the same code everyone's
--    rewards use: one find (the real find roll), the next pet, frame and
--    badge (given the same way milestones are), and taking those back.
-- 3. The "share my stats" setting is gone: stats are part of being in a squad.

create or replace function public.dev_rewards_v1(p_expected_owner uuid, p_action text, p_amount integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare owner uuid := liferpg_reward_private.signed_in(p_expected_owner); today date; got jsonb := '[]'::jsonb; gift jsonb; item text;
begin
  if not exists(select 1 from liferpg_auth_private.developers where user_id = owner) then raise exception 'Only developer accounts can use this'; end if;
  perform liferpg_reward_private.wallet_for(owner);
  today := liferpg_reward_private.local_today(owner);
  if p_action = 'stardust' then
    if p_amount is null or p_amount not between 1 and 5000 then raise exception 'Invalid amount'; end if;
    update liferpg_reward_private.wallets set stardust = least(stardust + p_amount, 100000000) where user_id = owner;
  elsif p_action = 'reopen_pack' then
    -- Today's pack can be opened again; the days-in-a-row count carries on, so the ladder can be walked through.
    delete from liferpg_reward_private.pack_claims where user_id = owner and pack_date = today;
    update liferpg_reward_private.wallets set last_pack_date = today - 1 where user_id = owner and last_pack_date = today;
  elsif p_action = 'find' then
    -- One find, rolled and given exactly like a find from 25 focused minutes.
    item := liferpg_reward_private.pick_item('finds', '{"common": 62, "uncommon": 28, "rare": 10}'::jsonb);
    gift := liferpg_reward_private.give(owner, item, 'find', null, null);
    if gift is not null then got := got || gift; end if;
  elsif p_action = 'next_milestones' then
    -- The next pet, streak frame and badge not yet earned, given the way milestones are.
    select v.item into item from (values ('pet_owl', 1), ('pet_cat', 2), ('pet_fox', 3)) v(item, n)
      where not exists(select 1 from liferpg_reward_private.inventory i where i.user_id = owner and i.item_id = v.item) order by v.n limit 1;
    if item is not null then got := got || coalesce(liferpg_reward_private.give(owner, item, 'milestone', null, null), '[]'::jsonb); end if;
    item := null;
    select f.item into item from liferpg_reward_private.streak_frames() f
      where not exists(select 1 from liferpg_reward_private.inventory i where i.user_id = owner and i.item_id = f.item) order by f.need limit 1;
    if item is not null then got := got || coalesce(liferpg_reward_private.give(owner, item, 'streak', null, null), '[]'::jsonb); end if;
    item := null;
    select v.item into item from (values ('title_scholar', 1), ('title_artist', 2), ('title_wanderer', 3)) v(item, n)
      where not exists(select 1 from liferpg_reward_private.inventory i where i.user_id = owner and i.item_id = v.item) order by v.n limit 1;
    if item is not null then got := got || coalesce(liferpg_reward_private.give(owner, item, 'set', null, null), '[]'::jsonb); end if;
  elsif p_action = 'reearn' then
    -- Pets, streak frames and badges are taken back, so they can be earned again with their pop-ups.
    delete from liferpg_reward_private.inventory where user_id = owner and source in ('milestone', 'streak', 'set');
  elsif p_action = 'reset' then
    raise exception 'Reset is turned off to keep this account safe';
  else
    raise exception 'Unknown developer action';
  end if;
  return liferpg_reward_private.state(owner) || jsonb_build_object('gifts', got);
end $$;

-- Developer accounts can't be deleted from the app.
create or replace function public.delete_my_account_v1(p_confirm text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_squad uuid;
begin
  if v_user is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  if p_confirm is distinct from 'DELETE' then raise exception 'Confirm deletion first' using errcode = '22023'; end if;
  if exists(select 1 from liferpg_auth_private.developers where user_id = v_user) then
    raise exception 'This account is protected and can''t be deleted' using errcode = '42501'; end if;
  for v_squad in select squad_id from liferpg_squad_private.members where user_id = v_user and left_at is null loop
    perform public.leave_squad_v1(v_squad, v_user);
  end loop;
  delete from auth.users where id = v_user;
  if not found then raise exception 'Account not found'; end if;
  return jsonb_build_object('status', 'deleted');
end $$;

drop function if exists public.set_stats_visibility_v1(uuid, text);
drop function if exists public.get_stats_visibility_v1(uuid);
drop table if exists liferpg_squad_private.player_settings;
