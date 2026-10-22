-- Delete my account: the signed-in person deletes their own account and
-- everything stored for it. Every table that holds their data is linked to
-- the account and goes with it. Squads they lead pass to the longest-standing
-- member first, exactly like Leave squad, so friends keep their squad.
-- The confirm word guards against an accidental call.
create or replace function public.delete_my_account_v1(p_confirm text)
 returns jsonb
 language plpgsql
 volatile
 security definer
 set search_path to ''
as $function$
declare v_user uuid := auth.uid(); v_squad uuid;
begin
  if v_user is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  if p_confirm is distinct from 'DELETE' then raise exception 'Confirm deletion first' using errcode = '22023'; end if;
  for v_squad in select squad_id from liferpg_squad_private.members where user_id = v_user and left_at is null loop
    perform public.leave_squad_v1(v_squad, v_user);
  end loop;
  delete from auth.users where id = v_user;
  if not found then raise exception 'Account not found'; end if;
  return jsonb_build_object('status', 'deleted');
end $function$;
revoke all on function public.delete_my_account_v1(text) from public, anon;
grant execute on function public.delete_my_account_v1(text) to authenticated;
