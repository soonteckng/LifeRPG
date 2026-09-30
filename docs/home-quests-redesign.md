# Home and quests redesign

Implemented on `core-ux-redesign`. No commits or pushes were made.

## Behavior

- Home keeps its fixed composition, with a compact greeting, character identity, quiet gold/streak values, and an XP progress line. Smaller displays use tighter spacing and shorter supporting copy. Home's supporting typography and toolbar labels have explicit text-scaling limits; the scrollable quest form supports larger text.
- Today's quests is a single flow: tap a quest to edit; use the separate Start button to configure its session. Add quest is beside the heading. All quests changes scope within the same sheet.
- The editor supports name, preset/custom duration, recurrence, weekdays, area, completion/reopening, and deletion. Difficulty and completion history are preserved by the existing service functions. No services, database schemas, or onboarding/tutorial content were changed.
- Successful mutations update shared quest state immediately. Home's accent badge reflects unfinished quests due today and disappears at zero. An older refresh cannot overwrite a successful save/delete.
- An already active or paused session is continued without changing its task, duration, or area. Its linked quest cannot be deleted or manually completed until that session is finished/cancelled. Editing a quest affects future sessions.
- The shared sheet dynamically measures content, caps its initial height, supports expansion, pins its header, and scrolls its body. It uses the existing Reanimated/Gesture Handler installation with `@gorhom/bottom-sheet` 5.2.14.
- Backdrop, native back, accessibility escape, and editor Cancel share a dismissal request. A downward drag on an editor's handle requests cancellation before hiding anything; a dirty draft opens a discard confirmation. Normal list sheets use the library's animated pan-to-close. In-flight writes block dismissal.
- Outgoing sheets stay mounted through the exit animation. On iOS, navigation also waits for native modal dismissal. Reduced-motion preferences apply to sheets, stack transitions, and existing success dialogs.
- The same sheet is used by session quest/area pickers and the personal reward editor. Success dialogs retain their centered alert presentation.

## Files

| File | Change |
| --- | --- |
| `src/app/(tabs)/index.tsx` | Home header, responsive spacing, live count, quest sheet entry |
| `src/components/QuestSheet.tsx` | Shared list/editor flow, quest actions and session handoff |
| `src/components/AppSheet.tsx` | Content sizing, keyboard, gestures, backdrop, dismissal lifecycle |
| `src/context/QuestContext.tsx` | Shared quest state, refresh ordering, mutation updates |
| `src/utils/questDraft.ts` | Draft initialization, dirty comparison, validation, service parameters |
| `src/constants/theme.ts` | Shared values extracted from the existing Home palette |
| `src/hooks/useReducedMotion.ts` | Native reduced-motion preference subscription |
| `src/app/(tabs)/tasks.tsx` | Existing quest route reuses the shared flow |
| `src/app/_layout.tsx` | Quest provider and coherent native route transitions |
| `src/app/(tabs)/timer.tsx` | Session pickers use the shared sheet |
| `src/app/rewards.tsx` | Shared reward editor sheet with protected drafts |
| `src/app/(tabs)/profile.tsx` | Reduced-motion handling for success dialog |
| `src/components/LevelUpModal.tsx` | Reduced-motion handling, native back, retained dismissal lifecycle |
| `tests/quests.test.cjs` | Isolated component/state regression tests |
| `package.json`, `package-lock.json` | Sheet dependency, matching test renderer, Expo lint dependencies, test/typecheck scripts |
| `eslint.config.js` | Expo v57 lint setup; the repository previously had no lint config |

## Verification performed

- `npm run typecheck`: passed.
- `npm test`: 12 tests passed. Covers zero/one/many quests, long titles, create/edit, validation, cancellation and dirty-draft dismissal, failed persistence, completion/reopening/deletion, future schedules, active-session preservation, navigation after dismissal, refresh races, and Android/iOS sheet lifecycle wiring.
- Scoped ESLint on Home, the new quest components/provider/helpers, the legacy quest route, root navigation, and LevelUpModal: passed.
- `expo export --platform android --output-dir .expo/redesign-android`: passed, including Hermes bytecode.
- `expo export --platform ios --output-dir .expo/redesign-ios`: passed, including Hermes bytecode.
- Full-project lint: 7 existing errors and 12 warnings remain. Errors are in the timer screen (effect state synchronization), onboarding (unescaped apostrophe), rewards (existing callback dependencies), TimerContext (compiler diagnostics), and UserContext (effect state synchronization). No unrelated timer/auth rewrites were made for lint cleanup.
- Web JavaScript bundled, but static HTML generation failed because existing `lib/supabase.ts` initializes AsyncStorage during server rendering (`window is not defined`). No authentication changes were made to work around this separate issue.

Tests replace native primitives and service/network boundaries. They do not establish native gesture/keyboard behavior, visual correctness, or successful live database round trips. No live quest data was modified by the tests. The test renderer currently emits its upstream deprecation notice.

## Device verification still needed

No browser surface or native emulator was accessible in this session, so visual inspection was not possible. Check on both Android and iOS:

1. Home at small and large phone sizes, long names, and increased system text size; verify goal/session controls stay above the tab bar.
2. Zero, one, and many quests; confirm initial height, expansion, fixed heading, long-title wrapping, and list scrolling.
3. Add/edit every field, save/cancel, complete/reopen, and delete; confirm the sheet and Home badge update and survive an app restart.
4. Focus the title and custom-minute inputs, scroll with the keyboard open, and use pinned Save/Cancel. Verify safe areas with gesture and three-button navigation.
5. Swipe the list sheet down, tap the backdrop, and use Android back/button/edge gesture. In the editor, exercise each path with both clean and dirty drafts. Keep editing must retain the draft.
6. Start a quest and return from the session. Repeat with an already running and a paused session; confirm their task, duration, and area remain intact.
7. Enable reduced motion and check sheet, backdrop, alert, and horizontal navigation transitions. Verify session pickers and personal reward creation too.
8. Run first-login onboarding/tutorial once; its existing routing and completion flow remain in place.

## References consulted

- [Exact Expo v57 SDK documentation](https://docs.expo.dev/versions/v57.0.0/)
- [Expo v57 Reanimated integration](https://docs.expo.dev/versions/v57.0.0/sdk/reanimated/)
- [Expo v57 stack navigation](https://docs.expo.dev/versions/v57.0.0/sdk/router/stack/)
- [Bottom sheet configuration, sizing, keyboard, and motion](https://gorhom.dev/react-native-bottom-sheet/props)
