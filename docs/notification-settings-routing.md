# App-specific permission settings

Android supports opening LifeRPG's notification settings using its package id. For Android 12 and later, the Alarms & reminders intent additionally needs a `package:` data URI to open LifeRPG's toggle directly. React Native's existing `Linking.sendIntent` API accepts extras, but cannot pass that URI.

The user approved Expo SDK 57's official `expo-intent-launcher`, installed at version 57.0.1 with its lockfile. The alarm route loads it only for an installed Android 12 or later build and sends the configured application's package data URI. The existing notification route sends the configured package extra. Missing native modules, unsupported settings activities, missing or malformed package configuration, older Android, iOS, web and Expo Go fall back to the current application's settings. The operating system controls highlighting and scrolling; the app opens the specific settings page instead of promising to highlight a row in a system list.

Approval under milestone-one rule 4 was received on 12 October 2026 in Malaysia, including approval to rebuild Android. This dependency changes the native runtime fingerprint and requires a fresh installed Android build; an OTA update cannot add the module to an older build. Expo Go includes IntentLauncher for preview, but this application deliberately routes the preview to its own app settings. Notification behavior still needs installed-build testing. There is no custom native code or new permission.

Tests execute the package-specific intent and cover alternate configured packages, missing native modules, unsupported activities, platform guards and malformed package fallbacks. These do not establish how every manufacturer's settings page renders. The Android build must complete and be installed before declaring the device path verified.

References: [Expo 57 IntentLauncher](https://docs.expo.dev/versions/v57.0.0/sdk/intent-launcher/), [Expo 57 Linking](https://docs.expo.dev/versions/v57.0.0/sdk/linking/), [Android settings intents](https://developer.android.com/reference/android/provider/Settings).
