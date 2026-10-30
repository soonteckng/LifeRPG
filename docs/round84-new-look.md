# Round 84 (Claude): the awhile look, Today as home, a circle, Your rhythm

30 October 2026. Base: Round 83. **No SQL.** No native, config or dependency change;
the Android fingerprint is unchanged (`de0355ad…`).

Soon Teck chose the theme after comparing five options on a canvas, with GPT and
Gemini agreeing: **lilac and aubergine on warm paper**, Newsreader for titles and
Inter for everything else, light as the main look. He asked for one big round
instead of several small ones.

## What changed

### The look
- `constants/theme.ts`: every token remapped to the paper palette (background
  `#F6F2EC`, ink `#2A2028`, main button `#3B2737`, lilac `#EADFF0` for the one card
  that matters, earthy tones for progress, protection, streak and warnings). New
  tokens: `track`, `dangerSoft`, `scrim`, `inputFill`, `fonts`, and `sceneInk` for
  text drawn over the session's night scene. The guide becomes an aubergine card.
- Every reading colour passes 4.5:1 on every surface (checked by a test). Category
  and subject colours move to deeper tones; colours saved by both earlier palettes
  map onto the new ones, so nobody's categories change colour order.
- Hard-coded dark-theme colours removed across the app (bars, tracks, scrims,
  remove buttons, icon tints, the glass surface). Settings icons are one ink colour.
- Initials use warm tints with paper-coloured letters.
- Switches, spinners and pull-to-refresh set their own colours, so Android never
  shows its system accent (teal or green) in them.

### Fonts
- Newsreader (400, 500) and Inter (400, 500, 600, 700) are bundled in
  `assets/fonts` (SIL Open Font License, `LICENSES.txt`). They were taken from the
  `@expo-google-fonts` npm packages' files; **no dependency was added**.
- `services/appFonts.ts` loads them with `expo-font` (already installed). The
  launch logo stays until they are ready, at most two seconds, so text never
  switches font in front of you; a failure keeps the phone's own font.
- `AppText` maps a weight to its own Inter file (Android can't pick a weight inside
  a custom family) and `fontFamily: "display"` to Newsreader. Page titles, section
  titles, big numbers and the greeting use Newsreader. The timer digits stay in
  Inter for now (steady widths while seconds tick).

### Status bar
- Dark icons on paper (`StatusBar` in the root layout); light icons while the
  session screen is focused, because its night scene is dark. Both use React
  Native's own `StatusBar`, so no native change.

### Today is home, no tab bar
- The tab pill is gone. The bottom dock keeps only the session banner (the way back
  into an open session), the offline notice and a page's pinned action.
- Today's header: the date in small capitals and a serif greeting, Settings and
  your initials on the right. The Start card is the one lilac card.
- A list at the bottom opens Routines, Study, Squads and Your rhythm. Each of those
  pages has a "Today" link above its title (`AppHeader onToday`, `PersonalPage
  today`). Android Back from them still returns to Today.
- The guide is now five tips, all on Today, ending on your initials; the tab-tapping
  steps are gone because there are no tabs.

### Squads as a circle
- No places, medals, leaderboard or levels anywhere (board, Home tile and peek,
  summary card, player card). Members are listed by `circleOrder`: whoever is
  focusing now first, then everyone by name, you last. Each row shows "Focusing
  now", this week's time or "Not started this week".
- The player card drops "#2 on the board"; it keeps this week's time and streak.

### Your rhythm
- Progress is renamed "Your rhythm" everywhere you can see it (title, menu items,
  guide, help text).
- **Along the way** (the quiet markers): plain facts from your whole history under
  the streak: hours focused, days you showed up, sessions finished (each the largest
  round number passed), your longest run of days and your longest session. Nothing to
  unlock or collect. Shown only once there is something to say.

### Profile
- Category levels and XP are gone: each category shows its all-time time with a bar
  relative to your biggest category. The category sheet's header shows its total
  time and the "Next level" card is removed. "Shown to your squads and on the
  leaderboard" is now "Shown to your squads".

### The session scene
- The camp scene is unchanged and still dark, so the header, timer digits, ring,
  title and hints over it use `sceneInk` (light). Setup stays on paper.

## Not in this round
- **Dark mode** needs `userInterfaceStyle` changed from `"dark"` to `"automatic"` in
  `app.json`, which is a native config change: held for the November build. Until
  then the app is light. The dark palette is planned (deeper aubergine background,
  lifted cards with a faint lilac edge).
- The notification accent colour (`expo-notifications` plugin, `#AAB3FF`) is also
  build config: November.
- Merging Routines and Study into activities (needs a database change and approval),
  the session redesign (arch timer, break and finish screens), Circle's Join and
  "hide my sessions".

## Verification

| Check | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npx expo lint --no-cache` | clean |
| Android fingerprint | `de0355adda848fb7ff4453b91b284c71253e25c9` (unchanged) |
| Tests | Round 83: 1,616 passed. Round 84: 1,626 passed, 0 failed |
| Visual check | Today, Routines, Study, Squads, Your rhythm, Profile, Settings, sign-in, the result card and a running session rendered with react-native-web and looked at |
| SQL | none |

### Tests changed (behaviour kept, expectations moved to the new look)

| File | Removed | Rewritten |
|---|---|---|
| `feature-tour` | the tap-a-tab step tests (hole over a tab, unmeasured tab) because the guide no longer has tab steps | the walk is five tips on Today ending on your initials; Back and hardware Back; the whole walk finishes once and readies the notification invitation; welcome title and "1 of 5" |
| `progress` | none | palette test covers both earlier palettes; legacy colours expect the deep tones; history hook mocked |
| `character` | none | category tiles show time, never "Lv" or XP; labels end "in total. View details" |
| `study-squads` | none | the squad page is a circle (no leaderboard, no "1."), the player card has no board place and six steady tiles |
| `round68-squad-performance` | none | the peek now draws seven faces (three in its summary, four in its circle); unchanged Home faces still never redraw |
| `focus-area-detail` | none | the sheet shows total time instead of "XP to level" |
| `auth-recovery` | none | `StatusBar` and the font loader are mocked; intro timing unchanged |
| `quests`, `study-ui` | none | "Open your rhythm" |
| `round60-session-scene`, `session`, `visual-motion`, `round79-sync-summary` | none | colour values from the paper palette |

New: `round84-new-look` (palette contrast, category colours, font mapping, waiting
for fonts with a two-second limit, no tab pill and the Today links, the Today header
link, circle order, quiet markers, light ink over the scene, switch and spinner
colours) and one render test in `progress` for Along the way.
