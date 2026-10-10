-- Roll back the caller app first. Keep all area rows because sessions/XP may now reference them.
begin;
drop function if exists public.ensure_focus_area_catalog(uuid);
commit;
