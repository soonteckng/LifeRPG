-- UNAPPLIED OPERATIONAL ROLLBACK. Requires the same explicit live approval.
-- Pause new admissions; keep imports, banks, IDs, handoffs and replay receipts.
-- Removing the accounting kernel or restoring a pre-import schema after accepted
-- work could lose history or permit duplicate rewards, so this rollback never
-- deletes data or reverses awarded credit. Existing online completion still works.
begin;
set local lock_timeout='5s';
update liferpg_session_private.sync_policy set enabled=false where singleton;
notify pgrst,'reload schema';
commit;
