# Round 86 (Claude): no white gap, and Gemini's design notes

31 October 2026. Base: Round 85. **No SQL.** No native, config or dependency change;
the Android fingerprint is unchanged (`de0355ad…`).

Soon Teck noticed every page could scroll into a white gap at the bottom. He then
showed Round 85 to Gemini and chose to follow its notes, including the two taste
calls: the finished card in **lilac** (not peach) and a **smooth** progress line
(not segments). He kept the LifeRPG name, so Gemini's "rename to awhile" is not done.

## What changed

- **The white gap.** `floatingTabInset` still added the old tab pill's height
  (the tab bar went in Round 84), so every page reserved roughly a tab bar of
  empty space you could scroll into. An empty dock now reserves only the safe
  area and its 10 px padding; the session banner and pinned buttons still get
  their room. Today, Your activities, Study, Circle and Your rhythm all use it.
- **Up next with a session open** is the way back instead of a greyed-out
  button: "IN A SESSION" / "SESSION PAUSED", "You're in a session.", what's up
  next after it, and "Back to your session" (the same `useJustFocus`, which only
  navigates when a session is open).
- **Today's middle** is grouped: the goal bar, streak and ••• menu sit in one
  quiet card, so Today reads Up next, Later today, today's progress, your circle.
  An empty Later today is a plain row ("Nothing else planned today." with Add)
  instead of loose text.
- **The finished card is lilac**, like Up next. Peach (`warmSurface`) is used
  only for the break arch; the unused warm text and line colours are removed.
- **The tiles** show hours and minutes ("3h 40m"), never "108 min 20 sec", and
  shrink rather than wrap.
- **The arch** shows one smooth progress line under the time instead of eight
  segments.
- **Initials** drop brown and olive for plum (`#7A4F6E`) and deep lilac
  (`#5B4A8A`); every tint keeps 4.5:1 with the light letters.

## Verification

| Check | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npx expo lint --no-cache` | clean |
| Android fingerprint | `de0355adda848fb7ff4453b91b284c71253e25c9` (unchanged) |
| Tests | Round 85: 1,636 passed. Round 86: 1,642 passed, 0 failed |
| Visual check | Today, the finished card and a protected focus session rendered with react-native-web |
| SQL | none |

### Tests changed

| File | Rewritten |
|---|---|
| `session` | the dock-inset test: an empty dock is the safe area plus 10 (no pill), the banner adds 60 plus the safe area |
| `round85-mock-layouts` | the week tile reads "3h 40m" |
| `quests` | with a session open, Today's bottom space grows by the banner's 60 px (it was 70 on top of the old pill) |

New: `round86-polish` (the inset ignores the pill, Up next leads back to a
session, the grouped goal card and empty row, the lilac card with peach only for
the break, the smooth line clamped to 0 to 100%, the initials palette and its
contrast).
