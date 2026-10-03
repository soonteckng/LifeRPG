# Progress redesign

## Experience

Progress now uses the shared dark/lavender theme and a single Week/Month selection for the full overview. The date navigator browses earlier periods and returns to the current period when its date label is tapped. Focus time leads the page; sessions, active days and saved goal days are supporting metrics.

Daily bars and the calendar open the same retained bottom sheet. Life-area rows open a period-specific session breakdown. Recent sessions link to saved details; full history loads in 50-row pages on demand. Details show the saved duration and rewards without invoking completion again. The shared sheet provides downward dismissal, backdrop/back handling, a handle, safe-area padding and system reduced-motion behavior. Overview updates use a short opacity transition without moving the layout; reduced motion disables it. Haptics respect the profile preference.

## Consistency and reward boundaries

- Any saved completed session with positive duration makes an active day, including a sub-minute session.
- Focus streaks count consecutive active days in the account time zone. Yesterday's streak stays alive until today ends. Home now uses the same focus-streak read model.
- Green dots and goal-day counts come from saved `daily_progress.goal_completed`, with each day's saved goal threshold. Goals and XP/gold retain the existing whole-minute backend rules. No schema, completion RPC or reward calculations changed.
- Focus totals aggregate exact seconds. Paused/cancelled sessions and future timestamps are excluded.
- Previous-period comparisons use an equal number of elapsed calendar days. Unequal month lengths use the matching first N days, explained below the total. A zero previous baseline does not produce a misleading percentage.
- The former level/streak badge concept is retained as a quiet Milestones sheet. It reflects current saved level/current focus streak; it does not claim persistent unlocked achievements or grant additional rewards.

## Data and failure handling

Period reads include a padded UTC range, then filter by local calendar dates. Calendar arithmetic uses date keys, avoiding DST-length assumptions. Completed sessions and daily-progress reads paginate beyond the server row limit and use stable ordering. Full history uses a captured upper completion timestamp so newly completed sessions do not shift its paging offsets.

Focus, foreground, midnight and saved-completion changes refresh the overview. Request generations reject out-of-order results. Same-period refresh failures retain loaded data with Retry; switching periods does not show stale figures under a different date heading. Initial errors are distinct from a genuinely empty period.

All queries use the existing signed-in Supabase client and existing RLS. No service-role key or database migration is introduced.

## Verification

Automated checks cover the existing Home/quest/Session flows plus exact-second aggregation, saved goal separation, timezone/DST/leap dates, comparable period bounds, legacy life-area labels, query pagination, streak gaps and duplicate dates across pages, query failures, history snapshots, refresh races and screen interactions. Native animations and gesture physics still need a phone check.

Phone checks: week/month switching, earlier/current dates, month chart horizontal scrolling, day/area/history sheets and long lists, Back/swipe/backdrop dismissal, reduced motion, large text, narrow screens, dock spacing, a 30-second completion, background completion recovery, offline refresh/retry, and Home/Progress streak agreement.
