-- Developer accounts only: test helpers for rewards. Everything else a
-- developer does (finds, packs, the trader, saving a look) goes through the
-- same functions as everyone. The server refuses anyone not on the private
-- developer list, and each action only touches the developer's own rows.

create function public.dev_rewards_v1(p_expected_owner uuid, p_action text, p_amount integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare owner uuid := liferpg_reward_private.signed_in(p_expected_owner); today date;
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
  elsif p_action = 'reset' then
    delete from liferpg_reward_private.inventory where user_id = owner;
    delete from liferpg_reward_private.events where user_id = owner;
    delete from liferpg_reward_private.pack_claims where user_id = owner;
    delete from liferpg_reward_private.claimed_sessions where user_id = owner;
    update liferpg_reward_private.wallets set stardust = 0, find_bank_seconds = 0, pack_days = 0, last_pack_date = null,
      rewards_since = now() - interval '1 day' where user_id = owner;
    update liferpg_reward_private.avatars set look = '{"skin":"3","hair":"short","hairColor":"darkbrown","glasses":false}'::jsonb,
      equipped = '{}'::jsonb, frame = null, background = 'bg_dusk', title = null, revision = revision + 1, updated_at = now() where user_id = owner;
  else
    raise exception 'Unknown developer action';
  end if;
  return liferpg_reward_private.state(owner);
end $$;

revoke all on function public.dev_rewards_v1(uuid, text, integer) from public, anon;
grant execute on function public.dev_rewards_v1(uuid, text, integer) to authenticated;
