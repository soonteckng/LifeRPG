-- REVIEW ONLY. Install only after Soon Teck approves, after publishing Round 75.
-- Adds one allowlisted developer RPC. No existing function/table is changed.
-- The normal purchase, avatar, pack and gift functions run in a PostgreSQL
-- subtransaction that ALWAYS rolls back. Only its JSON reply leaves the lab.
-- Test inventory/wallet live in the app's memory, never in real account caches.
-- No activity, goal, profile, squad, Auth or email writes are performed.
-- Sequence values for rolled-back reward events may have harmless gaps.
begin;
create or replace function public.dev_reward_lab_v1(
  p_expected_owner uuid, p_action text, p_snapshot jsonb,
  p_item text default null, p_amount integer default 0, p_avatar jsonb default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare owner uuid := liferpg_reward_private.signed_in(p_expected_owner);
  result jsonb; next_state jsonb; gift jsonb; got jsonb := '[]'::jsonb; pack jsonb;
  today date; item_kind text; source_kind text; dust integer; days integer; e record;
begin
  if not exists(select 1 from liferpg_auth_private.developers where user_id = owner) then
    raise exception 'Only developer accounts can use this' using errcode = '42501';
  end if;
  if p_action is null or p_action not in ('load','buy','avatar','find','pack','give','duplicate','stardust')
    or p_snapshot is null or octet_length(p_snapshot::text) > 50000
    or jsonb_typeof(p_snapshot -> 'earned') is distinct from 'array'
    or jsonb_typeof(p_snapshot -> 'owned') is distinct from 'array'
    or jsonb_typeof(p_snapshot -> 'avatar') is distinct from 'object'
    or coalesce(p_snapshot ->> 'stardust','') !~ '^[0-9]{1,9}$'
    or coalesce(p_snapshot #>> '{pack,daysInARow}','') !~ '^[0-9]{1,6}$'
    or coalesce(p_snapshot #>> '{avatar,revision}','') !~ '^[0-9]{1,9}$' then
    raise exception 'Invalid test inventory' using errcode = '22023';
  end if;
  dust := (p_snapshot ->> 'stardust')::integer;
  days := (p_snapshot #>> '{pack,daysInARow}')::integer;
  if dust > 100000000 or jsonb_array_length(p_snapshot -> 'earned') > 128
    or jsonb_array_length(p_snapshot -> 'owned') > 128
    or exists(select 1 from jsonb_array_elements_text(p_snapshot -> 'earned') a(id)
      where not exists(select 1 from liferpg_reward_private.items i where i.id = a.id)) then
    raise exception 'Invalid test inventory' using errcode = '22023';
  end if;
  today := liferpg_reward_private.local_today(owner);
  -- No statement outside this block writes account data. The exception rolls
  -- back the test setup AND all nested normal RPC writes, including failures.
  begin
    perform liferpg_reward_private.wallet_for(owner);
    delete from liferpg_reward_private.inventory where user_id = owner;
    insert into liferpg_reward_private.inventory(user_id,item_id,source)
      select owner, a.id, 'find' from jsonb_array_elements_text(p_snapshot -> 'earned') a(id) group by a.id;
    update liferpg_reward_private.wallets set stardust = dust, pack_days = days, last_pack_date = today - 1 where user_id = owner;
    update liferpg_reward_private.avatars set look = p_snapshot #> '{avatar,look}',
      equipped = p_snapshot #> '{avatar,equipped}', background = p_snapshot #>> '{avatar,background}',
      title = nullif(p_snapshot #>> '{avatar,title}', ''), revision = (p_snapshot #>> '{avatar,revision}')::bigint
      where user_id = owner;
    if p_action = 'buy' then
      result := public.buy_reward_item_v1(owner, p_item);
      got := coalesce(result -> 'milestones', '[]'::jsonb);
    elsif p_action = 'avatar' then
      -- The real developer account may wear everything. In the lab, also
      -- enforce the selected test ownership before running the real validator.
      if p_avatar is null or jsonb_typeof(p_avatar -> 'equipped') is distinct from 'object' then raise exception 'Invalid outfit'; end if;
      for e in select value #>> '{}' as item from jsonb_each(p_avatar -> 'equipped')
        union all select p_avatar ->> 'background' union all select nullif(p_avatar ->> 'title','') loop
        if e.item is not null and not (p_snapshot -> 'owned' ? e.item)
          and not exists(select 1 from liferpg_reward_private.items where id = e.item and is_free) then
          raise exception 'You don''t have that item yet';
        end if;
      end loop;
      perform public.save_avatar_v1(owner, p_avatar, (p_snapshot #>> '{avatar,revision}')::bigint);
    elsif p_action = 'pack' then
      if p_amount is null or p_amount not between 0 and 3 then raise exception 'Invalid pack tier'; end if;
      delete from liferpg_reward_private.pack_claims where user_id = owner and pack_date = today;
      update liferpg_reward_private.wallets set pack_days = (array[0,2,6,13])[p_amount + 1], last_pack_date = today - 1 where user_id = owner;
      pack := public.open_daily_pack_v1(owner);
      got := coalesce(pack -> 'items','[]'::jsonb) || coalesce(pack -> 'milestones','[]'::jsonb);
    elsif p_action = 'find' then
      result := public.dev_rewards_v1(owner, 'find', 0);
      got := coalesce(result -> 'gifts','[]'::jsonb);
    elsif p_action in ('give','duplicate') then
      select kind into item_kind from liferpg_reward_private.items where id = p_item;
      if not found then raise exception 'Invalid reward'; end if;
      source_kind := case item_kind when 'pet' then 'milestone' when 'frame' then 'streak' when 'title' then 'set' else 'find' end;
      if p_action = 'duplicate' and not exists(select 1 from liferpg_reward_private.inventory where user_id = owner and item_id = p_item) then
        perform liferpg_reward_private.give(owner,p_item,source_kind,null,null);
      end if;
      gift := liferpg_reward_private.give(owner,p_item,source_kind,null,null);
      got := jsonb_build_array(gift);
    elsif p_action = 'stardust' then
      if p_amount is null or p_amount not between 0 and 1000000 then raise exception 'Invalid test balance'; end if;
      update liferpg_reward_private.wallets set stardust = p_amount where user_id = owner;
    end if;
    next_state := liferpg_reward_private.state(owner);
    -- Remove the developer's automatic all-owned override for test purchases.
    next_state := next_state || jsonb_build_object('owned', (
      select coalesce(jsonb_agg(i.id order by i.id),'[]'::jsonb) from liferpg_reward_private.items i where i.is_free
        or exists(select 1 from liferpg_reward_private.inventory v where v.user_id = owner and v.item_id = i.id)));
    result := jsonb_build_object('state',next_state,'gifts',got);
    if pack is not null then result := result || jsonb_build_object('pack',pack - 'state'); end if;
    raise exception using errcode = 'P7500', message = 'Rollback completed developer reward test';
  exception when sqlstate 'P7500' then
    -- PL/pgSQL variables retain the result while all table writes roll back.
    null;
  end;
  return result;
end $$;
revoke all on function public.dev_reward_lab_v1(uuid,text,jsonb,text,integer,jsonb) from public, anon;
grant execute on function public.dev_reward_lab_v1(uuid,text,jsonb,text,integer,jsonb) to authenticated;
commit;
