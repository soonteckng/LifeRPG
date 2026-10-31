# Round 88 (Claude): phone fixes, three ideas, a simpler Your rhythm and a short first-time setup

31 October 2026. Base: Round 87. **No SQL.** No native, config or dependency change;
the Android fingerprint is unchanged (`de0355ad…`).

Soon Teck tested Round 87 on his phone and sent three screenshots: the Session
ended page looked broken, removing routines left a blank first row (and an old
"Past-year paper" stayed on Today after every routine was gone), and the ideas
sheet did not open smoothly. He also asked for Your rhythm to stop feeling like
two pages, for fewer ideas at the start, for a shorter first-time setup, and for
developer-only ways to replay setup. Study as activities moved to Round 89.

## What changed

### The ended page
- A session ended early keeps the same quiet page as a running one: its name
  small at the top, "Ended early" under it, the time where it stopped in the
  arch, and the two round buttons faded, labelled Stopped and End, disabled
  until the card takes over. The big "Session ended" header and the "Ending now doesn't save this
  session" line are gone from it (screen readers still hear "Session ended").

### Your activities
- **The blank row:** rows that wiggle in edit mode were drawn to a GPU texture on
  Android (`renderToHardwareTextureAndroid`). When a row was removed the texture
  could stay behind as an empty space. That flag is gone. It never showed on
  web, so please check it on the phone.
- **"Past-year paper"** was an older-style task, not a routine, so Your
  activities had no way to remove it. Its − badge now opens its editor, which
  has Remove.
- **Ideas:** with fewer than five routines, three ideas show as plain rows with
  a + each, and **More ideas** opens the rest (with **Fewer** to fold them back).
  With nothing saved: one each from Learning, Wellbeing and Work. Once you have
  routines: two from the area you use most and one from an area you don't use
  yet. Only ideas you haven't saved, and the picks change at midnight. With five
  or more routines the ideas become a small **Need ideas?** link.
  (`src/utils/ideaPicks.ts`.)
- **Routine setup opens smoothly:** it now opens at a fixed height (88% of the
  screen). Sized to its content, the sheet grew while it was still sliding up
  because the reminder permission and your last tag load a moment later.

### Your rhythm is one page
- The week overview has its own arrows (‹ This week ›) to go back through weeks;
  › is off on this week. Tap a day circle to see that day's sessions. The
  detailed charts sit behind **More detail** at the bottom, and the top-right
  button only appears there, as **This week**, to come back. Along the way only
  shows on this week.

### First-time setup
- Areas, name, goal (and app protection on Android), then **one** "How it works"
  page instead of three, ending with **Go to Today**. The finish says "You’re
  in." The welcome, frame titles and finish use the serif. The guided tour on
  Today no longer runs after setup: a pending one closes itself, which also
  lets the notification ask appear. The Guide page is rewritten for the simple
  app.

### Developer account only
- Settings › Developer: **Replay first-time setup** (the same restart as
  before, now landing on the new short setup) and **Show the notification ask
  again** (sets the one-time ask back to ready; go to Today to see it). Replay
  the guide is gone with the tour. The session-complete preview now shows the
  real tiles and the today-against-goal card with sample numbers.

### Also
- Profile study time reads `totalSeconds` safely when it is missing.

### Not this round
- Study as activities (subjects with exam dates in the activities list, no
  separate Study page): **Round 89**.

## Tests

Before: 1,612 passed (Round 87). After: 1,620 passed, 0 failed.

| Test file | Change |
|---|---|
| `tests/round88-fixes.test.cjs` | New: 10 tests (idea picks with no routines, with routines, gaps and midnight; the ideas UI; the ended page; no hardware texture and legacy remove; rhythm arrows and days; routine setup height; one-page setup; developer replays and `reopen`). |
| `tests/onboarding-flow.test.cjs` | Rewritten expectations: 4 steps without protection (was 6), 5 with it (was 7), "How it works" as the last page, "Go to Today" instead of "Start my journey"; the tutorial opens on its last page. No assertion removed. |
| `tests/account-settings.test.cjs` | Legacy avatar test: two Continues fewer, "Go to Today". |
| `tests/character.test.cjs` | Onboarding retry: two Continues fewer; tutorial retry no longer presses Continue first; "Go to Today". |
| `tests/guided-quests.test.cjs` | Skip and three-areas tests: fewer Continues, "Go to Today"; Previous step still lands on step 3. |
| `tests/feature-tour.test.cjs` | Three tests about the tour auto-starting after setup replaced by one: a pending guide closes itself (no overlay, receipt done, notification invite readied). |
| `tests/developer-tools.test.cjs` | Row list updated; "Replay the guide" tests replaced by "Show the notification ask again"; Replay first-time setup keeps its confirm, refusal and session-wait checks. |
| `tests/session.test.cjs` | Pending End: End is now present but disabled (was absent) and "Ended early" shows; restored End reads the name then "Ended early" (was "Review your notes · Ended"); the terminal layout test accepts a disabled End instead of none. The "cannot be pressed" intent is unchanged. |
| `tests/round84-new-look.test.cjs` | Markers only on this week (`markers={currentPeriod ? markers : []}`). |
| `tests/round85-mock-layouts.test.cjs` | `overviewReady` no longer needs `anchor === null`; new check that the arrows never step past this week. |

An attempt to delay every sheet's open by a frame broke about 40 sheet and
session tests and was dropped; the fixed-height editor fixes the jerk instead.

## Verification

| Check | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npx expo lint --no-cache` | clean |
| Android fingerprint | `de0355adda848fb7ff4453b91b284c71253e25c9` (unchanged) |
| Tests | Round 87: 1,612 passed. Round 88: 1,620 passed, 0 failed |
| Visual check | Your activities (three ideas), Your rhythm (week arrows, More detail), Today and the session page rendered with react-native-web |
| SQL | none |
