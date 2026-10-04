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
