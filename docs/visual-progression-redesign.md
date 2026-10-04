# Visual progression redesign

## Initial visual pass (follow-up below supersedes these layouts)

Home uses a compact portrait identity, a native-view segmented daily-goal ring with exact credited time and a large Start/Continue action. Three pending quests preview the existing quest sheet, with View all/Add discoverable. Focus streak and level are quiet footer chips. Gold balance no longer occupies Home; the balance remains stored. Overflow scroll remains available on small screens/large text.

Progress keeps all period navigation, historical queries and detail sheets. Flat sections replace the large boxed hero/cards, with shared Life-area colours, a proportional allocation strip, focus-day dots and distinct goal checks. Bars use the day's largest Life area (not every session's category); detailed day/history reporting remains available. Weekly view avoids the duplicate calendar; month retains it.

Profile uses a larger portrait with glasses/scarf and the existing tap-to-wave animation, a clear effort-not-ability explanation, coloured saved Life-area meters and an earned milestone strip. Locked/earned states come from existing saved session history; no fictional cosmetic inventory or purchase buttons were added. Personalisation and its keyboard/footer safeguards remain.

Milestone rows are flatter; their independent daily-goal panel reads exact saved seconds. Tutorial explains second banking and separate character/area XP. New content fades softly with the native driver and respects reduced motion. Existing bottom navigation, session dock, timer wheels, session gestures, quest sheet and auth flows were not redesigned in this phase.

## Delivery and verification

No new app packages or native configuration changes. JavaScript-only visuals can be delivered using a compatible EAS Update runtime. No update/build was published by this work. Native view drawing avoids an SVG/Skia build dependency.

The live accounting migration is recorded in progression-foundation.md. Do not rerun that non-idempotent migration on the same database.

Phone checks: complete two NEW 30-second sessions in the same area; goal advances by a total of 60 seconds, character and area banks pay 1 XP across the pair (starting banks can change per-session awards), no new Gold. Test presets/wheels, a subsequent session, pause/minimise/reopen, full history and tutorial replay. Check goal ring labels, long names/quests, large fonts, profile editor keyboard, week/month charts, reduced motion and existing sheet dismissal directions.

Native layout and motion still need Android/iOS observation. Earned accessories with manual equipment and richer character artwork remain a later feature; this phase does not claim they exist.


## Reference-alignment follow-up

Home now matches the reference's smaller continuous arc, compact identity, single goal hint, broad Start button, flat quest preview and footer chips. Progress places the selected period/date in one compact toolbar, followed immediately by total time and the entire chart; the allocation strip and history entrance follow. Extra session/focus-day/goal-day counts remain in the Consistency detail sheet. Historical date navigation, area/day drilldowns and full history still work. The chart's code-level default-text budget is tested; this is not a device measurement.

Profile uses the reference's small bust portrait, floating edit/settings actions, username/level, short effort disclaimer, thin Life-area meters and compact milestones. The profile editor and its fixed Save footer remain intact. Settings uses flat groups; milestones use Starting, Consistency and Time invested with actual saved rules. The quest sheet gains Today/All tabs while retaining editing, Start and protected deletion.

Session now uses the reference's setup hierarchy: editable wheels, 15/25/45/60-minute presets, direct Life-area chips and an optional Quest row. A running/paused timer has a teal circle, quest title, Pause/Resume beside a separate End control, and honest cancellation copy. Saved completion shows a check ring, actual focused duration and saved XP; Done/New session remain unchanged. Wheels/countdown stay mounted across setup/running/paused, and their commit/validation logic is unchanged. Typed duration, picker/keyboard/back priority, interactive swipe-down, reduced motion, restoration and completion retry safeguards remain. The completion popup adopts the same arc and flatter reward presentation.

No database/account changes or native dependencies/configuration changed in this follow-up. Unimplemented accessories, earned cosmetic titles and a new Life-area onboarding selection step were not invented to imitate sample data. Native layouts, especially large text, long names, running ring alignment and transitions, still require phone observation. No EAS Update was published.


### Home proportions with a short quest list

Home fills its measured viewport above the existing tabs/dock. The goal section absorbs spare height, the ring scales to about 55% of content width (bounded for short screens and large text), and the streak/level chips follow the quest section near the bottom. No fixed empty quest reservation or overlay over the tab bar is added. Overflow remains scrollable on small screens/large text. Other screens, quest management and navigation are unchanged in this follow-up. Phone verification of zero, one, two and three quests remains required.


### Visual weight and timer alignment refinement

Home increases the ring's diameter, stroke and clock size along with greeting, goal hint, Start, quest and chip typography. Section gaps are tighter. Session presets are centred, category labels are larger, and the redundant area picker entrance is omitted when all areas fit in the visible chips; it remains available for more than six areas. Timer columns are wider for three-digit minute values. Wheel and countdown text use explicit row-height boxes, centred vertical alignment, no Android font padding and no automatic scroll insets. Running-ring placement follows the same font/grid measurements. Snapping, duration validation, keyboard/back priority and timer identity are preserved. These are code changes; visible digit alignment and visual density still require phone verification.


## Cross-screen alignment and reporting refinement

The next refinement covers the supplied Claude quest-list reference and the earlier Session setup/running/completion reference. Existing navigation-bar geometry, session identity, accounting, cancellation, authentication and storage contracts are preserved.

| Request | Implementation |
| --- | --- |
| Scrolling digits align with selection rectangle | Real header/footer rows replace implicit list padding. `getItemLayout` includes the header, initial scrolling targets the preceding row, and settling explicitly snaps to a whole-row offset. Removed 3D rotation of digits. |
| Running timer looks like the reference | Single contiguous countdown centred inside the teal ring; shared measured geometry for the wheel and ring; compact geometry for shorter phones. |
| Completion presentation | Full-screen themed message with lavender check ring, focused duration, saved XP rows and Done. Summary remains available. Daily goal text is conditional on the actual saved outcome. Focus-day confirmation does not fabricate a streak count. |
| Recent sessions mismatch | Sessions entry opens only the selected period; all-time history is a separate explicit action inside the sheet. Zero in a new week can be correct after local Monday rollover. |
| Mixed category chart colours | Daily bars stack exact per-area seconds, including each area's saved colour. Equal General/Knowledge minutes occupy equal coloured segments. |
| Week/Month visual and placement | Full-width blue selected segment; a readable date-navigation row below it. |
| Quest sheet reference | Larger heading, plus control, Today/All pills, coloured row markers, compact metadata and outlined play icon. Existing Edit/Delete safeguards remain available. Done today opens completed quests. Add/Edit retain their established fields and keyboard handling. |
| Header coherence | Shared header chrome and large heading typography for Progress, Milestones and standard personal pages. Pushed pages retain a real back affordance; Session's active heading is centred like the reference. |
| Character | Explicit centred head/orbit/scarf anchors, larger portrait and visible badge, badge-driven accent and Home badge, plus waving/nodding/three facial expressions. Auth and onboarding reuse the same portrait. |
| App typography | Shared text/input primitives use iOS System (native San Francisco) and Android's native system font. Readable supporting text has a 14-point minimum. Timer line height is preserved exactly; no Apple font files or extra dependencies are bundled. |

Automated checks cover mixed chart segments, period-scoped history, local week rollover, list frame offsets, portrait centring/badge changes, readable typography and non-mutating completion dismissal, alongside the existing session/auth/quest suites. Android/iOS JavaScript exports check bundling. These are not native screenshot or animation tests: confirm wheel centring after fast and slow scrolling, small screens, large text, safe areas, sheet gestures and completion presentation on installed devices.


## Visual polish pass from main

Baseline: `main` at `a56b5ff78b9a426da8707b80aa3d24f93bed2004`. Reviewed AGENTS.md, CLAUDE.md and this document before editing. All six new attachments are Android device screenshots; no new mockup file was included in that set. The hierarchy guidance in the request and the documented prior references guide this pass.

### Scope and delivery

Initially prepared locally without committing, as requested. The owner subsequently authorised committing and publishing this pass on the separate `visual-polish` branch for Expo Go review. No EAS builds/updates, migrations, account edits or remote database calls were made. The approved SVG dependency changes package.json and package-lock.json. App.json, progression/context/service code, SQL, route definitions and transition/gesture handlers are unchanged. The root layout changes only the data already supplied to the reward presentation; it does not alter navigation. The display palette does not rewrite saved colours.

**Step 1 is approved and implemented.** `react-native-svg` 15.15.4 replaces the segmented View arc in the shared ProgressRing. Two SVG circles draw a track and round-capped progress arc from twelve o’clock. Progress updates use the existing 220 ms rhythm; reduced motion updates immediately. GoalRing API and host accessibility values are preserved. Expo Go includes SVG; the installed APK needs a fresh native build, since OTA cannot add this native module. No cloud build or update was published.

### Steps and checks

Each completed step was followed by TypeScript, full Expo lint and the full interaction/unit suite. Checks that initially failed due to intentional palette/text presentation changes or missing native mock properties were corrected; the final runs below pass. Tests still exercise session and account behaviour and do not measure native rendering.

| Step | Result and files changed | Checks |
| --- | --- | --- |
| 1 — Rings | `ProgressRing`, package manifests, Session/Home test mocks and `tests/rings.test.cjs`. Shared SVG arc, round caps, zero-progress dot suppression, reduced-motion support. | Typecheck, full lint, 183/183 tests. Native rendering still needs phone observation. |
| 2 — Type | `src/constants/typography.ts`; `AppText`, `AppHeader`, `PersonalUI`, `GoalRing`, `DurationPicker`, `LevelUpModal`, `QuestSheet`, `SessionScreen`, `SessionTabBar`, `SheetConfirmation`, `LaunchIntro`; tab layout and Home/Profile/Progress; `tests/character.test.cjs`. Medium weights replace heavy labels/titles. Hero numbers retain 600; readable text is at least 13. | Typecheck, full lint, 180/180 tests. |
| 3 — Sizes/spacing | Home and Progress; `SessionScreen`, `PersonalUI`. Compact segmented/chip surfaces remain inside full 44-point hit areas. Shared screen margins are 20; rows are at least 52; the chart is 64 points high with at most one active day, otherwise 88. | Typecheck, full lint, 180/180 tests. |
| 4 — Colours | `src/utils/lifeAreaColor.ts`, `src/constants/theme.ts`, `SessionScreen`, `DurationPicker`, Progress, `tests/progress.test.cjs`. Source hues map to a calm display palette. Indigo/lavender areas become sky blue; area labels retain category identity. Hints use secondary, unselected chips neutral, primary actions lavender. | Typecheck, full lint, 180/180 tests. |
| 5 — Avatar badge | `CharacterPortrait`, `CharacterMark`, `tests/character.test.cjs`. Remove visible emoji overlays; stored badge values and all editor choices remain. Scarves retain badge-specific colouring. | Typecheck, full lint, 180/180 tests. |
| 6 — Home | `src/app/(tabs)/index.tsx`. One 44-point avatar, 20-point greeting with a short display name, one secondary line. The full name remains available to screen readers. Ring/hint/Start form one group; measured viewport and overflow logic are retained. | Typecheck, full lint, 180/180 tests (rerun after the final mock correction). |
| 7 — Tabs/dividers | Tab layout; `SessionTabBar`, `PersonalUI`, `DurationPicker`, `QuestSheet`, `SheetConfirmation`, Home/Profile/Progress/Session; `tests/character.test.cjs`. Hairline decorative dividers, lighter translucent tab surface, 12-point medium labels and accent icons/labels. A non-interactive native-View fade softens content at the dock edge. | Typecheck, full lint, 180/180 tests. |
| 8 — Session/completion | `src/components/CompletionDetails.tsx`, `SessionScreen`, `LevelUpModal`, root layout, `tests/session.test.cjs`. Shared completion hero/rows, resolved quest name, area tint and honest goal row. Running timer is centred in its available region; setup/active titles use the same left-aligned header. Redundant visual running status is removed; pause description, saving/errors and live announcements remain. | Typecheck, full lint, 180/180 tests. |
| 9 — Profile | Profile; `CharacterPortrait`, `PersonalUI`. Smaller portrait/body, softer silhouette, existing mouth/expressions, saved class title, short effort disclaimer, aligned edit/settings toolbar, quiet sections. Existing decorative sparkle is retained; no unimplemented sparkle action was invented. | Typecheck, full lint, 180/180 tests. |

The minimum readable size is 13, except tab labels explicitly requested at 12. Existing fixed timer digits and existing scaling caps remain; no new font-scaling disable was introduced. Smaller control surfaces are decorative children inside 44-point touch wrappers, rather than relying on hitSlop outside parent bounds.

### Two completion presentations

`GlobalRewardListener` in `src/app/_layout.tsx` opens `LevelUpModal` when rewards are visible. `SessionScreen` retains the saved completion beneath it. They are separate states/surfaces by design, not two award calls. `CompletionHero` and `CompletionRows` now supply both surfaces. Closing the popup still only closes it; Done/New session on the retained summary keep their existing behaviour. A genuine level-up can still use the existing Level up heading and sparkle icon.

The generic stored fallback `Quest session` is not written over. The presentation resolves the linked quest from existing loaded data; a free session is labelled Free session. Existing independent area/character awards and historical gold remain readable. No reward calculation or award retry guard changed.

**Exact remaining-goal text is deferred.** The saved summary contains `dailyCompletedSeconds`, `creditedDate` and `goalReachedNow`, but not the historical target. Using the profile's current goal could mislabel an older completed day. The new goal row says Goal reached when the server confirms a newly reached goal, otherwise Progress saved. It does not claim that a previously reached goal was missed. Adding exact remainder requires supplying a verified target/date to the presentation; this pass does not add a query or change saved data to manufacture it.

### Contrast on #0B0D13

Calculated from sRGB relative luminance, not measured from a phone screenshot:

| Text/palette | Contrast |
| --- | --- |
| Secondary #A1A8B8 | 8.15:1 |
| Muted #8992A6 | 6.22:1 |
| Neutral chip text #C5CCDC | 12.06:1 |
| Accent #A5B4FC | 9.74:1 |
| Teal #2DD4BF | 10.43:1 |
| Coral #F0997B | 8.83:1 |
| Sky blue #79BCE8 | 9.41:1 |
| Amber #E8C26A | 11.43:1 |
| Rose #E58BB1 | 8.01:1 |

Colours are accompanied by labels and existing selection/achievement semantics. Colour alone is not proof of accessibility.

### Optional Inter decision

Inter was not added. Native system faces need no extra font load or assets and preserve the current iOS system typography. Bundling separate 400/500/600/700 files would increase APK and OTA asset payloads; exact bytes depend on the selected font files. Runtime loading requires waiting during startup to avoid a font flash and mapping every weight to its own Android family. Runtime-loaded font assets can be delivered with a compatible OTA runtime; a build-time font plugin needs a native rebuild. Check the project's fingerprint compatibility before publishing. Native fonts are the lower-risk choice for this pass. Adding Inter awaits an explicit choice, not an assumption.

### Verification and phone observation

Final TypeScript, full lint and 183 tests pass. Android/iOS JavaScript exports passed with --no-bytecode, using placeholder public build values; no backend calls were made. These exports verify module bundling, not installed APK behaviour or Hermes bytecode/native rendering. App icon/splash binaries were not changed or reviewed; exports used the existing local assets, not downloaded GitHub binaries.

No after-change device screen, gesture, frame rate, TalkBack/VoiceOver or installed build was observed. The supplied screenshots show BEFORE state only. Do not claim the new screen density, tab fade, ring quality or finger motion has been visually verified.

Phone checklist:

- Home with 0/1/2/3 quests, long names and font scaling: greeting stays within two visible lines; ring/hint/Start stay together; measured overflow is reachable.
- Week/Month selected controls have compact visible surfaces and reachable full touch areas. Verify a single bar, mixed categories, long legends, historical navigation and every drilldown.
- Profile: portrait/name/class title/areas/milestones; badge selection saves and colours the scarf without an emoji overlay; editor Save/footer/keyboard remain usable.
- Setup wheels/presets/typed duration: alignment and fluidity are preserved. Check short screens and large text before starting.
- Running/paused: timer remains mounted, descriptor and Pause/Resume are clear, End/minimise/back/swipe retain existing safeguards. Saving and failure states must remain visible.
- Complete linked and free sessions, including a genuine level-up and historical completion: popup and retained summary share visual rows, resolve names honestly, close without new awards, and support Done/New session.
- Check large-text completion wrapping, tab fade/content edge, native font weights, secondary contrast in ambient light, reduced motion and TalkBack/VoiceOver announcements.
- After a native rebuild: observe Home/running/completion ring edges at zero/partial/full progress, 12-o'clock start and reduced motion on Android/iOS. The implementation is complete; native visual verification remains outstanding.
