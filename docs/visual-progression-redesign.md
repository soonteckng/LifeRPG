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


## Device-feedback follow-up

After Expo Go testing, the owner requested these corrections on `visual-polish`:

- Week/Month labels use the same explicit 20-point line height and no Android font padding to hold a common baseline.
- Session's timer anchor no longer expands to consume spare space. Its shared stage is sized from the ring and wheel geometry, keeping timer nodes/layout stable between setup, running and paused while exposing more setup controls.
- Clean quest editors use native pan-down dismissal and content sizing. Dirty editors keep the existing discard safeguard; downward motion from the handle or scroll top follows translation directly, then the library settles the sheet before the guard. Scrolls starting within the form remain library-owned.
- One-off completion is no longer synonymous with completion today: `taskService` derives today's state from the saved date/timestamp in the existing Kuala Lumpur reporting timezone. Unknown dates are not invented as today. The Today/All selector does not widen Done today to historical completions. No persisted task or reward data changed.
- Remove the strip/fade above the tab pill. The wrapper is transparent, absolutely positioned and passes touches through empty space. Home/Progress/Profile scroll padding accounts for the pill, safe area and only visible session banners, so their last content can scroll clear of the floating elements.
- Badge rework remains future work as requested.

TypeScript, full lint and 187/187 tests passed after these changes. Android JavaScript export with --no-bytecode also passed. Tests cover date filtering in both list scopes, native clean-editor dismissal versus dirty guarding, guarded drag/scroll priority, dock padding, and existing session/quest behaviour. Actual label alignment, timer density and drag smoothness require another phone observation; no physical device was available in this workspace. The earlier scope table describes the original pass; this explicitly requested follow-up also corrects the client-side task completion-date derivation and sheet gesture handling.

## Second device-feedback follow-up: period labels and completion flow

- Period selection uses one decorative highlight behind two structurally identical buttons. The selected button no longer gains an extra sibling View. Both labels keep the same width, line height, font weight, alignment and padding when switching Week/Month; only their colour and accessibility selection state change.
- Running, paused and completed Session use a flexible timer region to fill available vertical space, centring the mounted timer stage and anchoring actions at the bottom. Setup retains its compact region so Life area choices remain reachable. This supersedes the earlier identical outer-position constraint; timer/wheel nodes and their internal geometry remain mounted, and running/paused share the same layout.
- `GlobalRewardListener` is now a separate, testable component. It suppresses the reward popup on `/session` (and the legacy `/timer`) and clears only popup visibility after a saved result exists. The open Session goes straight to its retained completion summary, including level-up information. Completion outside Session retains the popup. Closing/viewing UI does not award, reset or delete completion data.
- No dependency, SQL, account, reward calculation or session persistence changes were made.

TypeScript/full lint and all 190 tests pass. Android and iOS JavaScript exports passed with --no-bytecode. Regression tests cover identical period-button geometry, selection switching, timer-node continuity with running/paused layout, foreground versus minimised completion presentation, retained rewards and level-up information. Native layout and animation need the owner's next Android/iOS phone observation; JavaScript bundle checks do not verify pixels or gesture frame rate.


### Screenshot correction: selected period pill bounds

The supplied Android screenshot shows the selected blue pill extending beneath the outer period track. Earlier label-only/independent-decoration adjustments did not address this geometry. The selection is now a child of a single clipped 36-point track, with top/bottom both zero and an inset drawn by its border. The enclosing touch row explicitly has a relative position and minimum height 44. This prevents two independently sized absolute surfaces from using different vertical bounds; label and touch behaviour are unchanged. The regression test now checks track containment and shared vertical bounds, rather than checking only identical text styles. Actual device rendering needs another observation.

## App-wide glass material and interaction pass

The owner confirmed the period alignment fix and requested a more readable glass-like nav bar and fluid app-wide interaction, before any feature rework.

| Area | Visual/motion change |
| --- | --- |
| Floating navigation | Shared GlassSurface with denser Android shading, subtle diagonal sheen and a fine rim; supported iOS uses the existing expo-glass-effect native material. Active icons settle gently. No strip/fade above the pill or opaque surrounding dock. |
| Progress | The corrected, clipped Week/Month track is retained. Its measured selection now glides using a native-driven spring; labels/hit areas stay stationary. |
| Quests | Today/All receives the same sliding-selection motion. Bottom-sheet-native buttons stay library-owned to preserve pan/scroll coordination. |
| Home/Session | Restrained reversible press feedback on primary actions, quest entries, presets, Life area chips and duration-edit controls. Wheel scrolling/alignment and session exits are unchanged. |
| Profile/Settings/Milestones | Shared press feedback on rows, header actions and primary/secondary controls; shared primary colour/edge treatment. Existing character animation and badge storage remain. |
| Authentication/Recovery/Onboarding/Tutorial | Shared buttons and password visibility controls gain the same press feedback. No account, routing, validation, keyboard or onboarding logic changed. |
| Sheets/Confirmations | One critically damped settling profile for existing sheets, honouring system reduced motion; denser sheet surfaces and a glass-styled confirmation background. Dirty drafts, scroll priority and dismissal callbacks remain. |
| Content | Existing content reveal becomes subtler (0.94 to 1 opacity); no new hidden-screen flash or route replacement. |

`MotionPressable` interrupts springs and reverses on release, uses the native driver and returns directly to rest when disabled/reduced motion is enabled. `SlidingSelection` measures its own width and drives transform only; it never changes text layout or blocks state updates. Tab icon motion follows the same selection spring. Decorative materials do not receive touches or accessibility focus.

**Platform honesty:** Android's material is a translucent shaded surface at 94% base opacity, with vector highlights, rather than a claimed real-time blur/refraction. The existing Expo glass package supports native liquid glass on compatible iOS. Its import is guarded to avoid evaluating a native entry on Android; incompatible/unavailable iOS uses the shaded fallback. iOS Reduce Transparency forces an opaque surface and removes the sheen/native glass. No new dependency, build configuration, SQL, account, reward calculation or persistence changes were introduced.

Verification: TypeScript, full lint and 193/193 tests pass. Android/iOS JavaScript exports pass with --no-bytecode. New tests render the shared motion/material components against native boundaries: press/release/callbacks/disabled/reduced motion, measured selection and interrupted springs, Android native-import avoidance, supported/unsupported iOS and reduced transparency. Existing auth, quest, wheel, completion and restoration tests still pass. These do not measure native frames or confirm phone appearance.

Phone observation required: nav readability over chart/text, icon selection, rapid Week/Month and Today/All taps, keyboard open/close, dirty/clean sheet drags and scrolling, short/large screens and large text, all session states and completion, disabled/loading buttons, reduced motion and iOS Reduce Transparency/native glass. Device screenshots or an installed build were not available during this pass.


### Home quest preview consistency and card

Home and QuestSheet now consume `questLists` for the same unfinished-today membership and order. Completed one-off quests cannot leak into the Home preview; recurring quests remain eligible when due and unfinished today. Home previews the first three and counts the full list. The existing dismissal reset restores Today and exits Done today when Home reopens the sheet; regression coverage now verifies this. Switching scopes inside the open sheet still updates in place.

Home now groups the preview in a compact rounded surface, uses a 20/26 heading, a remaining count, area-tinted icons, 17/23 quest names and 14/20 duration/area metadata. The card fits its contents rather than reserving empty row space. Existing row taps still open management; no new persistence or session actions were introduced.

Regression coverage checks historical completions, recurring eligibility, upcoming quests, stable ordering, live completion updates to the preview, and reopening scope. Native appearance, long titles and large text remain phone-observation requirements.


### Home clearance above the active-session dock

Home now ends its scroll viewport above the floating dock instead of relying only on scroll-end padding. Its streak/level footer cannot draw beneath the running/paused/completion bar; short devices can scroll the reduced viewport. Ring sizing uses this already-reduced viewport, avoiding subtracting the dock twice. The navigation pill remains independently floating with a transparent wrapper and no external strip/fade.

A tab-scoped FloatingDockProvider receives actual native wrapper heights. Measurements are keyed to visible banner, safe bottom, device width and font scale; Home uses a conservative estimate until the matching layout is available. No session or account state is changed. Test Home with an active and paused session, completion dock, large text and rotation on-device.


### Quest scope geometry and setup-to-running motion

Today/All now uses equal native View slots around the gesture-handler touchables. Each touchable fills its own slot instead of relying on flex on an inner animated touchable child. The track clips its moving highlight and grows with the row; both labels share line height and Android font-padding settings. Selected text uses the primary text colour. The existing scope logic and sheet-native gesture handling remain intact.

Session phase motion now covers the visible header, ring, running title and action controls (280ms native opacity), rather than only a detail container empty during running. The permanently mounted timer stage measures its relative layout position and animates an inverse offset back to zero (300ms) when setup changes to the centred running layout. It does not rebuild or resize duration wheels. First layout and reduced motion skip relocation; countdown ticks do not replay the phase reveal. Start RPC, retry/locking, navigation and timer state are unchanged.

Tests exercise free and quest starts, loading-to-success phase changes, mounted-node continuity, measured relocation, countdown updates, reduced motion and equal scope slots. Device observation is still needed for Android gesture-handler wrapper sizing, large text, actual animation timing and any one-frame layout artefacts.


### Shorter Today-to-All settling and opaque session dock

Quest scope selection uses a quicker clamped spring toward All (stiffness 460, mass 0.65, shorter settling tail); returning to Today retains the existing spring. The same measured travel distance and equal touch slots remain. Progress selections retain their current motion.

The active-session banner now has an opaque tinted #20283D surface and a subtle accent edge. Its pressed opacity remains 1, so tab content cannot pass through even while tapping. The navigation pill and transparent space around the dock are unchanged. Verify subjective spring timing and readability over Home, Progress and Profile on-phone.


### Quest-sheet height timing, direct Home entry and quest setup

The extra upward slide when changing Today to All comes from dynamic sheet height, separate from the segmented highlight. The quest list opts into Gorhom's 220ms timing configuration (cubic ease-out) instead of an open-ended spring tail. Other sheets retain the shared spring, and native finger-follow gestures, guarded dismissal and system reduced motion remain intact.

Home's individual quest rows now configure the linked task, inherited duration and area and navigate directly to /session. View all remains the management entry. Row taps never start automatically or mutate active/paused sessions, restoring sessions, in-flight actions or an unsaved completion; those states reopen Session instead. Saved completion can become a new draft through the existing duration setter.

Quest setup now shows a centred planned-duration ring, a selected-quest card with readable title and area, Change quest affordance and Switch to free session. It uses a Quest session header and avoids repeating the quest title/duration in plain rows. The duration remains inherited/read-only; running and free-session wheel behavior remain unchanged. On small/large-text screens, quest details can scroll while the primary Start remains outside the scroll region.

Regression checks cover direct Home entry and blockers, no automatic Start, timed list configuration, reduced-motion setting and quest metadata/read-only duration. Phone observation is still required for actual sheet resizing, long titles and visual composition.


## Home Quick Start — 5 October 2026

Home now has a compact focus card beneath the daily-goal ring. It shows the
exact planned duration and Life area before the primary Start focus action;
Change duration or area opens the existing free-session setup. The card changes
to In focus/Paused, remaining duration and Continue session for open sessions.
The ring scales slightly smaller to make room for the explicit choice and the
secondary control. Existing floating dock measurement, Home quests, native
modal navigation, press motion and reduced-motion handling remain in use.

The last completed **free** session of at least five minutes and at most eight
hours provides the default, preserving seconds. The lookup is bounded to one
row, explicitly filtered by account and ignores future completion dates. The
fallback is 30 minutes in General; a removed area also falls back to General.
A history lookup failure does not prevent use of this visible default. This is
a default choice, not a new minimum duration: the existing setup still permits
short sessions.

Quick Start passes a complete free-session draft atomically through the timer
provider and its existing synchronous submission lock, RPC and notification
lifecycle. It cannot accidentally inherit a quest, old Activity or notes from
setup. Navigation follows successful creation; a failed start retains its exact
choice on Home with Retry start. Saved completion can start anew without
cancelling or awarding the previous session again. Unresolved completion,
restoration and open sessions remain protected. No backend schema, progression,
notification settings or dependencies change in this phase.

Verification: 207 automated tests, TypeScript and full lint passed locally.
Added cases cover owner-filtered/bounded history, free-only defaults, missing
areas, exact seconds, rapid taps, failed starts/retry, Change setup, active/paused
continuation and completion safeguards. Native primitives and network
boundaries are mocked; these tests do not prove visual layout or delivery.

Still needs phone observation: Home proportions at normal/large text on small
and large screens; long area names; loading and Retry presentation; immediate
start followed by the existing upward Session presentation; reduced motion;
installed-build completion notifications and foreground/background recovery.
No live backend query, migration, account modification or device test was run.


### Quick Start phone feedback: floating dock, popups and presets

Home's scroll surface now extends behind the floating dock. The dock's measured
height is reserved as scroll-content bottom padding instead of a viewport
margin, removing the blank footer block while keeping the last rows reachable.
The hero still uses the unobstructed height, avoiding a second dock subtraction.
The session banner itself remains opaque and readable.

Completion now uses the shared animated, content-sized AppSheet with a fixed
Done footer, downward swipe, backdrop/back dismissal and existing reduced-motion
rules. Session owns its popup while open; the global listener presents the same
popup outside Session. No visibility is consumed merely by entering Session.
The inline result is hidden during initial popup presentation and dismissal;
Done/dismissal exits Session only after the sheet closes, without a second result
page. Saved results remain retained, without reset or repeat awards.

A successful early End uses a separate Session ended sheet stating that the
session was cancelled and no time/rewards were saved. Failed cancellation shows
no success notice and keeps the active timer. Cancellation/reward semantics have
not changed. Quick duration presets are now 15, 30, 45 and 60 minutes.

TypeScript, full lint and 211 automated tests pass locally. Added checks cover
preset/default selection, popup ownership, once-only close ordering (including
same-callback swipe closure), early-End success/failure and the unchanged saved
completion data. Native motion and dock appearance still require phone checking,
especially iOS modal dismissal, small-screen sheet scrolling and reduced motion.
No new dependency, backend migration or live account changes were made.


### Ended notice follow-up: preserve its outgoing Session background

A successful cancellation previously reset the live timer and caused Session to
render its setup screen behind the ended notice. Session now retains a local
presentation snapshot of the running/paused timer (including remaining seconds,
quest and Life area) until dismissal completes. This snapshot is presentation
only: the backend session stays cancelled, notifications stay cleared and no XP
or focus credit is added. Failed cancellation continues using the live timer.

The short ended notice now measures its message and Done button together in the
sheet's scroll content, instead of positioning Done as an overlapping footer.
Title/body/button share 20-point horizontal margins; bottom padding includes the
phone safe area. The popup exits first, then the retained Session moves downward
through its existing controlled exit before navigation reveals Home.

212 automated tests, TypeScript and full lint passed locally. The new regression
covers running and paused backgrounds, frozen countdown/layout after cancellation,
no setup controls beneath the popup, button placement and delayed navigation.
Real-phone spacing and native animations still need observation.


### Home hierarchy, preset selection, quest picker and tab motion

Home now separates the quiet time-based greeting from a larger first name, with
a framed character at the right. Focus streak and level sit directly beneath
the identity instead of repeating as a separate bottom row. The goal section
begins eight points lower. Quick Start's Change action shares the duration/area
row, reducing the card height and leaving more initial-screen room for quests.
The page retains its full scroll surface and measured floating-dock clearance;
large text and smaller screens can scroll rather than clip controls. Phone
observation is still needed to confirm exactly how many quest rows are visible.

Session presets use a solid pale-lavender selected surface with dark, heavier
numerals, versus neutral unselected surfaces. Larger text uses wider/taller
wrapping targets. Existing press springs and accessibility selected states stay
in place. No duration parsing, wheel geometry or submission logic changed.

Choose a quest now presents content-sized themed cards with Life-area flag
icons, title, duration/area detail and selection indicators. Long titles wrap;
empty and loading states use the same visual vocabulary. Selecting a quest still
only configures the existing Session draft and closes the picker. Today's/All
quest-management sheets were not edited.

The tab navigator now uses its built-in 180ms crossfade, with the existing icon
spring. Reduced motion disables the scene transition. Tab route identities,
history policy and Session navigation are retained; no remount-based animation
or new native dependency was introduced.

Verification: 214 automated tests, TypeScript and full lint pass locally.
Regression coverage includes themed picker selection without auto-start and
reduced-motion tab options while retaining route identities, alongside existing
Home, timer, completion/cancellation, account and progression tests. Native
visual polish, first-screen quest visibility and rapid tab transitions still
need Android/iOS phone observation; no device appearance is claimed here.

## Guided next steps — October 6, 2026

`feature/guided-quests` adds optional study suggestions without replacing custom quests or free focus. In guided mode Home uses a compact goal indicator and a concrete action card; free-focus mode retains the tested ring/Quick Start hierarchy. New and existing users can select revision, assignments or practice, make a task smaller, choose another or disable suggestions in Settings. New controls reuse MotionPressable, ContentReveal and AppSheet's existing motion/reduced-motion rules; the timer wheel and root navigation are unchanged.

Session instructions, saved titles in Progress, and an optional Save for later completion action complete the flow. The existing shared completion popup remains the sole immediate completion presentation. Character, rewards and early cancellation semantics remain unchanged. See `docs/guided-quests.md` for persistence details, limitations and the full phone checklist. No native appearance, small-phone fit or gesture smoothness is claimed without observation.

### Guided choices and dock clearance follow-up

After device feedback, the preference sheet uses compact radio-style choices and a pinned safe-area Save footer with scroll space reserved for its measured height. Home adds 16 pixels above the floating dock. Smaller starter tasks can return to their original workload and time. Alternatives are grouped into Review / Assignments / Practice, initially showing the selected direction instead of the entire catalogue. Existing AppSheet gestures and reduced-motion-aware reveals are retained. Native positioning and animation remain phone-observation requirements; local typecheck/lint and 232 tests passed.
