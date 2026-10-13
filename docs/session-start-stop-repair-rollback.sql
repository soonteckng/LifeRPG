-- REVIEWED PROPOSAL ONLY. Requires explicit approval for live execution.
-- This is a fail-closed rollback of public v2 APIs only. Keep the insertion guard,
-- marker, registrations and fences. Removing them or returning a repaired account
-- to a legacy client permits an old delayed Start to revive a session after End.
-- A full destructive rollback is deliberately not supplied; first establish a
-- server-side quiescence boundary for ALL legacy and v2 requests and separately
-- review every affected account. A fixed waiting period is not that proof.
begin;
revoke all on function public.start_activity_session_v2(uuid, integer, text, bigint, bigint, text)
  from public, anon, authenticated;
revoke all on function public.confirm_activity_session_stop_v2(uuid, integer, text, bigint, bigint, text)
  from public, anon, authenticated;
commit;
