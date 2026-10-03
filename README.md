# LifeRPG

A productivity app for Android and iOS, built with React Native, Expo SDK 57 and Expo Router. Home, quests and focus sessions track daily progress; Progress shows focus time, consistency and life-area breakdowns.

## Run locally

Use Node.js 22.13 or newer and your existing local environment configuration.

```bash
npm ci
npx expo start
```

Open the project in Expo Go, an Android emulator or an iOS simulator. The `android`, `ios` and `web` npm scripts are also available.

## Checks

```bash
npm run typecheck
npm test
npm run lint
```

GitHub Actions runs a clean dependency install, TypeScript and tests for pull requests targeting `main` and pushes to `main`. TypeScript also checks unused imports, local variables and parameters.

## Source layout

- `src/app/`: Expo Router screens and layouts, including `src/app/(tabs)/progress.tsx`.
- `src/components/`: shared sheets, timer controls and other UI.
- `src/context/`: authentication, user, quest and timer state.
- `src/services/`: persistence and data reads.
- `src/hooks/` and `src/utils/`: lifecycle, reporting and shared logic.
- `tests/`: automated interaction and reporting checks.
- `docs/`: redesign decisions, database scripts and device-verification notes.

The hidden `tasks` and `timer` routes support older navigation paths. They are compatibility routes, not additional tabs. New users retain the onboarding/tutorial flow.

Session transition logging is optional: set `EXPO_PUBLIC_DEBUG_SESSION_TRANSITIONS=true` locally when investigating navigation. It is quiet by default.
