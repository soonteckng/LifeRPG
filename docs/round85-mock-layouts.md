# Round 85 (Claude): every page follows the awhile mockups

30 October 2026. Base: Round 84. **No SQL.** No native, config or dependency change;
the Android fingerprint is unchanged (`de0355ad…`).

Soon Teck said Round 84 only changed the colours and removed the tab bar, and asked
for the mockup layouts on every page ("follow the mock layout, for every page also").
The mockups are the nine `awhile` screens (Today, Plan, Routine, Session, Break,
Complete, Progress, Squads). Where a mockup needs data or a setting we don't
have yet, this round shows what we do have and says so below.

## What changed

### Today (mockup 01)
- Header: the `LifeRPG.` wordmark, Settings (sliders) and your initials. Under it
  the date in small capitals, a big serif "Today" and "Your rhythm ↗".
- **Up next** is the one lilac card: the routine whose daily reminder comes next
  today (from ten minutes ago onwards), with its time, length, category and a dark
  "Start {name}" button. With no reminder due it shows an exam this week ("Revise ·
  exam in N days"), and otherwise "Just focus".
- **Later today** lists the rest in one plain list, four rows at most: an exam (when a
  routine is up next), the later reminders by time, routines with no reminder ("Any
  time"), study subjects, then "Something else" (any activity). Each row has its own
  Start. "Your activities ↗" opens the full list.
- **Time for yourself today**: minutes against the goal with a bar, the streak, the
  session and offline notes and the ••• menu (change goal, Your rhythm). A failed
  goal check says "Goal unavailable".
- **Your circle**: a card with up to three faces and who is focusing, opening Squads.
- The guide's five tips follow the page from top to bottom: welcome, What's next,
  Time for yourself today, Your circle, You're all set.

### Your activities (mockup 03)
- The Routines page is now **Your activities**: "Your time. Your rules.", a ? and a
  "+ New" button in the header, tag chips to filter, then **Repeats** (routines
  with a daily reminder) and **Any time** (the rest). A **Study** row opens Subjects
  and exams with their counts. Ideas, pending and conflict notes are unchanged.
- Just focus is no longer repeated here; it is "Something else" on Today and the
  Up next fallback. The same `useJustFocus` runs behind both.

### Routine setup (mockup 04)
- "Make it yours.", with a serif header across every sheet. Name, Tag, then
  **When**: Repeats or Any time. Repeats shows the week's day circles (every day,
  for now) and "Remind me at" with the hour and minute fields. Length as before.
  Saving says "Save".
- Not yet: picking days, and "Just a reminder" (a routine with no timer). Both need
  the database change we agreed to ask about first.

### Focus and Break (mockups 05, 06)
- The night scene now shows only while the session opens (the launch moment). The
  running session sits on paper: a "Distracting apps set aside" pill when protected,
  the serif title, "N min · ends at 8:50 PM", and the time in a lilac **arch** with
  "FOCUS TIME REMAINING", serif digits and eight segments for how far you are.
- On a break the arch turns peach: "ON A BREAK", "A small pause.", "BREAK ENDS IN",
  "Break time doesn't count as focus" and "Back to focus now". The break button
  reads "Take a break" and is outlined while you focus. End session is a quiet text
  button. The header's back link says "Today".
- Timing, protection, the break rules and every confirmation are unchanged.

### Finished (mockup 07)
- "SESSION COMPLETE · 8:50 PM" over a serif **You made room.**, then a warm card:
  the category, the minutes in big serif digits ("min focused"; short sessions keep
  their seconds), the session's name and, once the server confirms, **Your total
  today** against your goal with a bar and "Your daily goal is met." or "N min
  more".
- Two small tiles under it: your focus streak and your time on this routine (or in
  total) over the past seven days. They are read once the result is confirmed
  online (`hooks/useResultExtras.ts`, read-only); if a read fails the tile stays away.
- "Back to today" closes the card (the old Done, same test ID and same single-close
  guard) and "See your rhythm ↗" closes it and opens Your rhythm.
- Saving, offline, stopped early, rejected and synced cards keep their own titles and
  messages, with the time in the same warm card and no goal claims.

### Your rhythm (mockup 08)
- Opens on **this week**: the range, the week's total in big serif digits, a lilac
  card with "N days here", the streak, the week's circles (✓ for a day you focused,
  a dashed "rest" circle for a saved rest day, empty for the rest) and a line about
  rest days. Then **Time by activity** (routine or session names with bars), Daily
  goal, and Along the way.
- **History ↗** shows the detailed week and month charts, categories and sessions
  exactly as before; "This week" comes back.
- The rest days come from the same streak read the page already made
  (`getFocusStreakDetail`, falling back to the plain count).
- Not yet: "Workout · ticked off 2 of 3 times", which needs reminder-only routines.

### Circle (mockup 09)
- "{SQUAD} · N FRIENDS" over a serif **Here, together.** Friends focusing now each
  get a lilac card with **Join**, which starts your own session (it never touches
  theirs). Then "This week together" with the total, the goal bar if one is set, and
  everyone as a plain row with this week's time, "Focusing now" or "Away for now".
  The invite code and Invite friends stay pinned at the bottom.
- Not yet: what each friend is working on and their time left, and "Show my sessions
  here". Both need the database to share them.

## Verification

| Check | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npx expo lint --no-cache` | clean |
| Android fingerprint | `de0355adda848fb7ff4453b91b284c71253e25c9` (unchanged) |
| Tests | Round 84: 1,626 passed. Round 85: 1,636 passed, 0 failed |
| Visual check | Today, Your activities, routine setup, Focus (protected), Break, the finished card, Your rhythm and Circle rendered with react-native-web and compared with the mockups |
| SQL | none |

### Tests changed (behaviour kept, expectations moved to the new layouts)

No test was deleted, and no timing, recovery, isolation, protection, widget,
repeated-Done or offline-sync check was loosened.

| File | Rewritten |
|---|---|
| `progress` | the page harness taps History before the chart tests (they test the same charts); the quiet-markers render test uses the week overview |
| `quests` | Home layout gap 22 and the "today" layout; the exam is `upNext` (testID, action, label, title) instead of `lead`; "goal reached" wording; the two Just focus tests run through Today's "Something else" (same hook, same calls) |
| `saved-routines-ui`, `guided-quests`, `routine-ui-lifecycle` | the editor's button says "Save"; Home passes `limit={4}` and `layout="today"` |
| `study-squads` | the squad's name is in the "CALC CREW · 2 FRIENDS · YOU LEAD" label over "Here, together."; who is focusing moved to the week line; the goal line reads "20m to go of 1h"; the single-squad page has no title of its own; `useJustFocus` mocked; a Join assertion added |
| `study-ui` | the Routines-page test is renamed "Your activities holds every routine and the study row, adds new ones from the header, and starts old routines the same way Home does": title, layout, the Study row and its counts, "+ New" and the help button (`useStudyPlan` mocked); the old-routine start is unchanged; Just focus asserted absent here |
| `session` | "Take a break" for the break button; "Back to today"; the warm card instead of the arrival banner, the exact duration via its label; the arch instead of the ring SVG while running; "You made room." while confirming |
| `session-result-native-footer`, `completion-layout-followup`, `round79-sync-sheet`, `session-card-steady` | "Back to today"; the warm card; the header's small label; "Focus day recorded." |
| `round78-result-lifecycle`, `quest-sync` | the CompletionDetails mock includes the new card and tiles |
| `feature-tour` | the new tip titles and order |
| `round84-new-look` | Today's links (Your activities, Your rhythm, the circle card, Study from Your activities); quiet markers in the overview; light ink tied to `sceneShowing` |
| `round71-goal-truth`, `helpers/study-stubs` | `HomeCircle` in the HomeSections stub |
| `home-and-start-fixes` | strips every `export` from the slice it transpiles (the file now exports `reminderClock` too) |

New: `round85-mock-layouts` (minutes and seconds on the card, the goal line only
after confirmation, the tiles and their one read per session, See your rhythm
closes once, Today's order, Your rhythm's History toggle and rest days, Join only
for others and only your own session, no em dashes) and two tests in `progress` for
the week overview and the rest-day line.
