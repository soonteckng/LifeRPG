# Focus area consistency

Prepared 11 October 2026 for the session-reliability feature branch. **The repair function was approved by the user and installed on 11 October 2026 (Asia/Kuala_Lumpur).** Supabase recorded migration `20261010162742_ensure_focus_area_catalog`; its matching SQL is in `supabase/migrations/`.

## Behavior

- Both selectors share one catalogue: Everyday focus, Learning, Work & projects, Creativity, Everyday life, Wellbeing. The five suggested directions take their names and explanations from that catalogue; Everyday focus is the neutral free-focus choice.
- Choosing Free focus clears the previous suggested area to Everyday focus while keeping the exact duration. A manually selected free-focus area remains a free session and is saved for that account. A past session does not silently supply the area for a new neutral selection.
- Home, quest choices and Session use canonical labels. Legacy duplicates are hidden in selection lists while preserving the selected real area ID. Custom categories remain available.
- Home, Profile and Progress use the same catalogue-loading path. A missing category is never represented by an invented ID or silently credited to Everyday focus.
- New starts are blocked during failed catalogue loading, with the existing Home retry action. Continuing an existing session remains available. Tour text explains the same behavior; spotlight anchors and animation code are unchanged.

## Account catalogue repair

The saved database contract grants category reads, so a client insert is not an available repair path. `focus-area-catalog-repair.sql` proposes the authenticated function `ensure_focus_area_catalog(expected_owner uuid)`.

The app calls it only when a default category is missing. It checks the authenticated owner and expected owner, serializes repairs for that account, inserts only missing defaults at level 1 and zero XP/bank, and returns that account's real rows. Existing aliases count as present. It does not rename, merge, delete or overwrite existing rows, XP, session references, quest references, goals, rewards or profiles. Other accounts are not repaired by this call. There are no native dependencies or permission changes.

Installing the SQL creates the function and its restricted permission only. It does not run repair on real accounts. Anonymous and PUBLIC execution are revoked. `focus-area-catalog-repair-rollback.sql` removes the function while retaining rows that might have acquired XP or references; roll back the caller app first.

**Deployment gate satisfied:** section 3.1 of `liferpg-stage2-milestone1-brief.md` requires explicit approval for live database changes. The user approved this exact repair function in a later message. It is installed; the app can now request missing defaults for the signed-in account. No account repair was invoked by the coding agent.

Live metadata verification confirmed the expected-owner UUID argument, `SETOF public.subjects` return type, empty search path, authenticated execution, and denial for both anonymous and PUBLIC execution. The stored function-body MD5 (`dc6bad3dd5b2a117c6436d7fb230a141`) matches the approved SQL. The API schema cache was refreshed.

The security advisor reports signed-in execution of a SECURITY DEFINER function, which is intentional for this account-scoped RPC: the caller has category read access, and the function restricts inserts to missing zero-XP defaults for `auth.uid()`, checks the expected owner, and accepts no category payload. Anonymous and PUBLIC execution stay revoked. See the [advisor explanation](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable). Other existing project advisories were outside this approved repair.

## Validation

The complete Node suite passed before deployment: 516 tests, 0 failures, 0 skipped. Typecheck and lint without cache passed in the validation workspace. SQL behavior was tested in an isolated in-memory database; deployment verification read schema metadata only. No native device or real-account operation was tested.

The automated suites cover switching modes, durable neutral-area persistence, manual free-focus categorization, retaining the timer, matching directions and area labels, preserving a selected legacy ID, missing-category repair, error gating and account switches during reads.

The isolated SQL checks cover repeat installation/calls, authenticated owner enforcement, anonymous denial, unchanged existing rows/XP/banks/custom categories/session and quest references, another account staying untouched, zero-XP missing defaults, and rollback retaining data. Advisory locking is implemented; concurrent multi-device execution and native appearance require device/backend acceptance.

Phone check: select Learning suggestions, set a custom duration, save Free focus, and check Everyday focus plus the unchanged duration. Choose Work & projects manually and check it remains Free focus. Switch to suggestions and check that direction and card agree. Check all six areas are selectable in Home and Session, and repeat after reopening.
