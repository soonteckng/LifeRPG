# Repository cleanup on progress-redesign

The source import/re-export graph was traced from every Expo Router entry, including hidden compatibility routes. No regular screen, provider, service, hook or shared utility was orphaned.

## Removed

- The resolved animation investigation's `session-transition-test` screen, root registration, Home long-press menu and retained-listener bookkeeping used only by that investigation. Actual Session entry/exit animation code and opt-in transition logging remain.
- The Expo starter `scripts/reset-project.js` and its npm command. It resets the app to a blank scaffold and has no role in this developed project.
- Four unreferenced direct dependencies: `expo-device`, `expo-image`, `expo-status-bar` and `expo-web-browser`. No source import, dynamic require, build plugin or dependency/peer consumer needs them. The regenerated lockfile also drops `ua-parser-js`; no remaining package versions changed.
- Fourteen unreferenced image files: Expo badges/logo, React logos, starter tab artwork, tutorial screenshot and the unused glow logo. Configured app icons, splash images, favicon and both layers of the iOS icon-composer asset remain.
- Unused React default imports, Profile's unused Switch import and unused settings destructuring. The actual settings still live in their provider and Settings screen.

## Kept intentionally

Onboarding/tutorial, hidden tasks/timer compatibility routes, existing tests and SQL scripts, Session safeguards and all live UI modules remain. `@expo/ui`, glass effects and symbols are needed by Expo Router's dependency graph. Font/linking/screens/worklets support icons, navigation and animation. System UI, splash and updates support the configured appearance/build/update behavior even without a source import.

The README now describes LifeRPG's current source structure and commands. TypeScript's `noUnusedLocals` and `noUnusedParameters` checks prevent unused imports/locals/parameters from silently returning.

## Verification

A fresh `npm ci`, strict TypeScript checks and all 64 tests passed after dependency removal. The remaining source graph has no orphaned modules; removed package names are absent from the regenerated lockfile, and retained package versions match the original lockfile.

Scoped lint reports four pre-existing issues, also reproduced in the original source: an unescaped apostrophe in onboarding, Rewards callback memoization, DurationEditor's effect-driven retained mount and SessionScreen's PanResponder/ref compiler rule. This cleanup does not change those feature behaviors or suppress their rules. They remain separate lint work; lint is not claimed to pass.

No native build or device animation test was performed in this cleanup. No database/reward rule or production feature logic was changed.
