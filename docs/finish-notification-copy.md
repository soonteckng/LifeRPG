# Finish notification wording

Prepared 13 October 2026.

**Time well spent**

Your session is finished. Open LifeRPG to see your progress.

This acknowledges the completed time without claiming cloud saving, a quest
completion, XP or a daily-goal reward before the server confirms the session.

## Delivery

The Expo notification fallback uses this copy. It can receive JavaScript updates.
The installed Android APK 7 uses the native countdown's finish notification, whose
text is hard-coded in `CountdownNotifications.finished`. Its projection and
preference parsers do not expose finish text to JavaScript. An EAS Update alone
cannot replace APK 7's finish wording. Do not start a second JavaScript scheduler
or change the session title to bypass this boundary; that risks duplicate alerts
or corrupting the session's presentation.

To respect the user's preference for updates unless a new build is necessary,
the native patch below is held for the next required Android build. No native
source, dependency, permission or configuration changes ship in the fade update.

## Patch for the next Android build

In `modules/session-countdown/android/src/main/java/expo/modules/sessioncountdown/CountdownNotifications.kt`:

```diff
     val public = NotificationCompat.Builder(context, channelId(state.preferences)).setSmallIcon(icon())
-      .setContentTitle("Session finished").setContentText("Open LifeRPG to view your progress").build()
+      .setContentTitle("Time well spent").setContentText("Your session is finished. Open LifeRPG to see your progress.").build()
     val builder = NotificationCompat.Builder(context, channelId(state.preferences)).setSmallIcon(icon())
-      .setContentTitle("Session finished")
-      .setContentText("Your timer reached zero. Open LifeRPG to save or view your progress.")
+      .setContentTitle("Time well spent")
+      .setContentText("Your session is finished. Open LifeRPG to see your progress.")
```

When that patch is applied, regenerate the Android runtime fingerprint and test
an installed build's finish alert, including its lock-screen public text. Keep
the existing notification identifiers, channels and one-alert scheduling.

The fallback's real Android and iOS scheduling payload tests assert both strings
alongside the existing trigger, channel and preference behavior. These checks
do not constitute an installed native notification test.
