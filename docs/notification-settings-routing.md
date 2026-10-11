# App-specific permission settings

Android supports opening LifeRPG's notification settings using its package id. For Android 12 and later, the Alarms & reminders intent additionally needs a `package:` data URI to open LifeRPG's toggle directly. React Native's existing `Linking.sendIntent` API accepts extras, but cannot pass that URI.

Prepared implementation: use Expo SDK 57's official `expo-intent-launcher` for the Android intents, passing `com.soonteck.liferpg` only in installed LifeRPG builds. Fall back to the application's own settings if the phone does not handle the specific intent. iOS uses its application settings. The operating system controls highlighting and scrolling; the app will open the specific settings page instead of promising to highlight a row in a system list.

Adding this native dependency requires the user's approval under milestone-one rule 4. It changes the native runtime fingerprint and requires a fresh installed Android build; an OTA update cannot add the module to an older build. Expo Go includes IntentLauncher for preview, but notification behavior still needs installed-build testing. There is no custom native code or new permission.

Without this dependency, notification settings can still open directly with the existing API. Alarms & reminders must fall back to app settings, where the user opens that row themselves.

References: [Expo 57 IntentLauncher](https://docs.expo.dev/versions/v57.0.0/sdk/intent-launcher/), [Expo 57 Linking](https://docs.expo.dev/versions/v57.0.0/sdk/linking/), [Android settings intents](https://developer.android.com/reference/android/provider/Settings).
