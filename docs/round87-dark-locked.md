# Round 87 (Claude): dark, a still Today, and a locked session

31 October 2026. Base: Round 86. **No SQL.** No native, config or dependency change;
the Android fingerprint is unchanged (`de0355ad…`).

Soon Teck found the paper look too bright and asked for everything dark (he saw
three dark previews first). He wanted Today to never move, with only the Later
today list scrolling; a started session that you can't leave until you end it,
with just the timer and two small buttons; and the day-to-night animation gone.
The squeezed When control in routine setup was fixed too.

## What changed

### Everything dark
- `constants/theme.ts`: a deep aubergine page (`#1C1519`), lifted plum cards,
  warm light text, lilac main buttons with dark words (`#D9C2E6` / `#22191F`),
  the one lilac card per screen in a richer plum (`#3B2D44`), and progress,
  protection, streak and warning colours lifted so they read on dark. The break
  arch is a dark warm brown with peach words.
- The guide is a lilac card with dark words and a dark Next button; its ring is
  lilac. Status bar icons are light everywhere. `app.json` already said
  `"userInterfaceStyle": "dark"`, so the system parts match with no native change.
- Leftover light-only colours (session banner bar, goal tracks, rest-day circles,
  week bars) moved onto the dark tokens.

### Today stays still
- Today is sized to the screen. The header, Up next, the goal card and your
  circle stay put; **Later today scrolls inside its own space** (at least two
  rows always show) and now lists everything instead of four rows.
- On a screen shorter than 600 points or with text larger than 130%, the page
  scrolls as before, so nothing is ever cut off.
- A little tighter to fit: 16 px gaps, a 46 pt "Today", a slimmer Up next.

### The locked session
- Once a session is open you stay on its page until you end it: the header has
  no way out, a downward swipe does nothing, and Android Back (or a navigation
  back) asks "End this session?". Back again closes that question. A session
  that couldn't be restored can still be left, so nobody is stuck. Before
  starting (setup) and after it ends, leaving works as before.
- The page is just the timer: the session's name small at the top (with a
  shield when distracting apps are set aside), "Ends at 3:46 PM", the time in
  the arch with a thin progress line, and two small round buttons: **Break**
  (protected), or **Pause / Resume** (unprotected), and **End**. On a break the
  arch turns warm with "BREAK", the left button reads **Focus**, and the top
  line says when you'll be back. End still asks first. The extra lines ("Just
  this, for a while", the break hint, the long break explanation, "Ending now
  doesn't save this session") are gone; the saving and ending messages stay.
- When a routine can't be loaded the title says "Focus", not "Routine
  unavailable".

### No more day-to-night walk
- Start fades setup out for 320 ms and then starts the session (at once with
  Reduce Motion); Back during the fade cancels it. The camp scene, its walk,
  the night, the intro words and Skip are gone, along with the code:
  `session/SessionBackdrop.tsx`, `session/TrailScenes.tsx`,
  `utils/focusSceneLayout.ts`, `ArrivalBanner.tsx`, and the old
  `CompletionHero` / `CompletionRows`.

### Routine setup
- **When** (Repeats / Any time) now splits the width evenly; the sheet's
  touchable had been shrinking each half to its words.

### Not this round
- Keeping the screen awake: `expo-keep-awake` is only present through `expo`, so
  declaring and using it goes with the November build (section 10 of HANDOFF).
- Round 88 (agreed): Your rhythm as one page with week arrows, study as
  activities with exam dates, three rotating ideas with More ideas, and Profile,
  Settings and sign-in in the new style.

## Verification

| Check | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npx expo lint --no-cache` | clean |
| Android fingerprint | `de0355adda848fb7ff4453b91b284c71253e25c9` (unchanged) |
| Tests | Round 86: 1,642 passed. Round 87: 1,612 passed, 0 failed |
| Visual check | Today (844 and 700 tall), the locked session (protected, unprotected, on a break), the finish card, Your rhythm, Settings, Profile, sign-in, routine setup, Circle and Study rendered with react-native-web |
| SQL | none |

### Tests removed (the feature is gone)

| File | Removed |
|---|---|
| `round58`, `round59` | the camp scene and the arrival banner (one test each) |
| `round73-scene-visibility` | the scene's decorative loops while hidden (8) |
| `round76-scene-layout` | the walker lane geometry (2) |
| `round71-completion-motion` | the arrival banner's layout events (2) |
| `round77-intro-continuity` | the night walk's dusk, skip and callback handoff (6); a cancelled setting-off is now covered in `session` |
| `round60-session-scene` | the eight scene tests (dawn, morning, lights); the saving portal test stays |
| `session` | the walker lane test |
| `round78-offline-start` | Skip's quick night fade (Skip is gone) |

### Tests rewritten (behaviour kept)

| File | Rewritten |
|---|---|
| `session` | swipe closes setup and a finished session but never an open one; header close from setup, and an open session has no header way out, Back asks to end and Back again closes the question; the lost-pop, Android and iOS exit tests run from setup; Start fades then starts once, Back cancels, a failed start shows setup, Reduce Motion starts at once, another account never starts; no Backdrop behind the result; the dock button is lilac |
| `global-session-result` | no scene; retained-route entrances happen when something else comes in front (the locked header has no way out, so no route-close); the queued-close test closes from setup and a widget start reopens it |
| `round78-offline-start` | the offline start, permission gate and second offline session wait for the fade instead of the night animation |
| `quests`, `saved-routines-ui`, `guided-quests` | the layout style is flattened (it can stretch), gap 16; Later today gets every row (it scrolls) |
| `round84-new-look`, `focus-area-theme`, `visual-motion`, `feature-tour` | dark values: the palette and its contrast, light status bar, no scene ink, the dark glass, the darker guide wash |
| `round85-mock-layouts`, `round86-polish` | Today's anchor and spacing |
| `progress` | two tests pin the clock to 15 Oct: on the first day of a month (1 Nov in Kuala Lumpur, during this round) "yesterday" and "last month" fell outside their assumption. The same two failed on Round 86's code at that hour; nothing about them was loosened |

New: `round87-dark-locked` (the dark palette and its contrast, Today fitting
with the list scrolling inside, the lock, the minimal page, the removed scene
and the fade, the When fix).
