# Round 83 (Claude): the reward layer comes out

30 October 2026. Base: Round 82. **No SQL.**

The new direction ("awhile") makes LifeRPG a calm focus app, not a game. The app
has no real users yet, so the reward layer is **deleted**, not hidden behind a
switch. Sessions, protection, offline recovery, widgets, reminders, Progress and
squads are kept exactly as they were.

## Removed from the app

- Stardust, the trader and Outfits (the `/outfits` route is gone).
- Today's trail and finds, the Home map button, the finds/trail screens after a
  session (`SessionReveal`) and the map after an offline catch-up.
- The daily pack and chosen rewards (client). **Never run
  `round-82-chosen-rewards.sql`.**
- Milestones: pets, frames and badges (Home, Profile and Progress sections).
- The character everywhere: Home, Profile, Settings, the session scene (the
  walker and camp decorations), the result card banner, squad faces and player
  cards, the sign-in screen and the onboarding wording.
- XP and levels: the Home level chip and level sheet, Profile's level and XP,
  the level-up card, the XP rows on the result card and in Progress' session
  details, the developer level-colour preview.
- Celebration pop-ups after a session (first session today, daily goal reached).
- Developer reward tools (test inventory, packs, finds, chosen-reward lab).

## What replaces them

- **People as initials:** `InitialsAvatar` (stable tint from the account id).
  Used on Home, Profile, Settings, squad faces and player cards.
- **Result card:** the time recorded, then the category ("Time added"), "Focus
  day recorded" and the daily goal line. No XP. The offline catch-up card lists
  the sessions, their lengths and their categories, then Done acknowledges
  them, with no map.
- **Session scene:** the same camp, dusk, night and morning, with nobody in it.
  The setting-off words say "Settling in" and the activity name. The timings
  are unchanged (`WALK_MS`, `NIGHT_FADE_MS`), so session start behaves exactly
  as before. There is no walk back: the card opens as soon as the result is
  ready, and Done closes the session screen straight away.
- **Result host:** `GlobalRewardListener` is now `SessionResultHost`, with the
  same saving screen, retry, acknowledgement and offline catch-up rules, minus
  the walk-back gate, celebrations and reward pop-ups.
- **Profile:** initials, name (editable), all-time time, focus days and best
  streak, categories and subjects.
- **Developer:** Share session log, Replay the guide, Restart the intro, and
  every session card on the real component: complete, earlier session saved,
  ended early, saved offline, offline sync summary, could not be credited, and
  the saving screen.
- **Wording:** the guide, tour, onboarding, delete-account, sign-out and End
  confirmations no longer mention rewards, XP, levels or a companion.

## Kept on purpose, for later rounds

- **Category levels** in Profile and the category detail sheet (XP per
  category). They go in the "Your rhythm" round, which replaces them with time
  per activity.
- The server: reward tables and RPCs are untouched and simply unused. Session
  completion may still record XP server-side. Dropping them is a separate SQL
  step that needs approval.
- The session scene timings and the `focusBand` lane measuring (now unused by
  the scene, harmless) until the session redesign.

## Two small fixes found while rewriting tests

- **Squad faces:** every face used to subscribe to your profile, so renaming
  yourself redrew everyone in the squad. Now only your own face follows your
  profile (`YourInitials` in `SquadSheets.tsx`).
- **Offline catch-up:** a late second "dismissed" callback released the
  underlying completed timer a second time. The host now forgets the outgoing
  batch after handling it once.

## Verification

| Check | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npx expo lint --no-cache` | clean |
| Android fingerprint | `de0355adda848fb7ff4453b91b284c71253e25c9` (unchanged) |
| Tests | Round 82: 1,910 passed. Round 83: 1,616 passed, 0 failed |
| SQL | none |

The suite is smaller because the tests of deleted features went with them
(about 215 test declarations in 24 files; some ran in loops, so the runner's
count differs). No session, offline, protection, widget, repeated-Done,
recovery or account-isolation check was loosened: where a flow still exists,
its test was rewritten to the new behaviour, and two deleted files were
brought back in rewritten form for that reason (`round68-result-flow`,
`round79-offline-sync-flow`).

### Test files deleted (the feature is gone)

| File | What it tested |
|---|---|
| `adventurer`, `adventurer-motion`, `profile-companion-motion` | the character, its looks and idle motion |
| `daily-effort-celebration`, `post-session-celebration`, `round80-sync-celebration` | celebration pop-ups after a session |
| `milestones-collection`, `round73-collection-sheet` | milestones and the collection |
| `rewards-store-races`, `round66-client`, `round66-map`, `round79-trail-labels` | the rewards store, finds and today's trail |
| `round62`, `round63`, `round64` | Stardust, the trader and Outfits |
| `round67-after-session`, `round74-return-readiness` | the walk back and the finds/trail screens after a session |
| `round75-developer-testing`, `round81-dev-preview-windows` | developer reward tools and reward previews |
| `round82-chosen-client` | chosen rewards (client) |
| `rewards-sql`, `round80-chosen-rewards-sql` | reward SQL; the server is untouched but its migrations are no longer the app's concern, and the chosen-rewards file is archived |

### Test files rewritten (deleted feature removed, the flow kept)

| File | Removed | Rewritten or added |
|---|---|---|
| `round68-result-flow` (restored) | lost-callback fallback, interruptions and snapshot store of the walk back | Completion opens its result straight away with no walk, Done closes the session once (compiled and uncompiled); a late receipt opens the result without a walk. The cancelled-result-stays-dismissed test is kept unchanged. |
| `round79-offline-sync-flow` (restored) | the map and the achievement release after it | One card sums three sessions with their category and no XP; Done twice acknowledges all three exactly once, only after the fade; the underlying timer is released once; a dismissal without Done acknowledges nothing. |
| `account-settings` | the saved character badge and twelve-look catalogue | onboarding keeps the saved legacy avatar for older app versions; sign-out wording; Settings shows initials |
| `character` | 9 tests: milestones, tiers, level sheet, character motion and looks | Profile shows initials and all-time totals from your own history with no level, badges or outfits; the name sheet only edits the name |
| `developer-tools` | 10 tests: reward lab, packs, finds, inventory, reward checks | every session card opens on the real result card, and Done closes it |
| `focus-polish` | 2 tests: tier curve and tier path | none |
| `global-session-result` | 4 walk-back tests | a fresh completion opens its result straight away, with no walk or reward screens; the dock-entry test no longer names Outfits; mock path and file name follow `SessionResultHost` |
| `home-and-start-fixes` | the tier pill test | none |
| `progress` | My Milestones placement | Progress shows the analytics with no milestones and no squads |
| `quests` | 2 Home level-button tests | none |
| `round58` | 7 trail, pack, Stardust and tier tests | the one-scene test, with nobody in it and "Settling in" |
| `round59` | trail and Outfits tests | the result card opens on the morning camp with the time recorded and nobody drawn |
| `round60-session-scene` | 3 walker tests | the dim test also checks nobody walks; walker checks became firefly checks |
| `round68-squad-performance` | 3 portrait and saved-look tests | the same three cases for initials: opening the peek draws only new faces; a changed name or focus status redraws one face; your face follows your profile name |
| `round71-completion-motion` | the celebration-close fade test | none; the arrival-layout test stays |
| `round73-scene-visibility` | none | repeat count 3 to 2 (fire and fireflies; no walker) |
| `round78-result-lifecycle` | none | no `sessionReturn`; XP is undefined on the card |
| `round79-sync-sheet` | 2 tests: preparation trail and developer map preview | categories with no XP; Done never queues a celebration |
| `round79-sync-summary` | 15 trail, finds, currency and XP tests | one row per category; a session with no known category adds time but no row |
| `session-card-steady` | the level-up hero test | while confirming, the card shows the category and "…", never XP or Level; a finished card shows the time and focus day with no level, XP or companion |
| `session` | XP rows in the completion test; the return-screen test | completion test now loads `SessionResultSheet` and checks the focus day line; a finished session goes back to the app as soon as Done closes the result |
| `study-squads` | character picture assertions | faces are initials (yours from your profile), the player card has no character, level or finds, and keeps the same seven tiles while loading; member labels no longer include a level |
| `study-ui` | My Milestones row test; Milestones in the sheet-rule list | none |
| `auth-recovery`, `completion-layout-followup`, `round58` | none | mock paths follow the renamed files |

New: `round83-remove-rewards` (initials, tint contrast, no imports of removed
modules, Home and Profile without level or Stardust, chosen-rewards migration
archived).
