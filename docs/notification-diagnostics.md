# Notification developer diagnostics

These details stay out of normal Settings.

- `getSessionNotifications` deliberately does not evaluate the notification package on Android Expo Go, where the package entry can initialise unavailable push functionality, or on web. Normal Settings shows unavailable functionality and offers no misleading permission action.
- Use an installed Android/iOS development/release build to verify local session alerts. Rebuild when native notification/scheme/bundle configuration changes; web export and OTA JavaScript are not substitutes for native registration.
- Settings reads real permission status and refreshes on foreground return. iOS provisional/ephemeral permission differs from full permission. Android creates a channel before explicitly asking for permission. TimerProvider no longer prompts automatically at login.
- TimerProvider delegates native scheduling to the typed session notification lifecycle service. Android uses trigger.channelId (including the channel-aware immediate trigger); iOS keeps normal immediate/interval triggers. v18 channels select sound/vibration preferences without inheriting the v17 defaults. A new permission grant affects later scheduling; this change does not promise that a denied session alert already scheduled will be recreated.
- Start/resume/active restoration replace both IDs. Pause/end/completion and paused/absent restoration cancel scheduled and dismiss delivered alerts. Shared serialization prevents late work or an old account teardown from racing a new account's scheduling. Background refresh uses the same queue and ongoing channel. Payload/lifecycle/failure tests do not validate delivery or native alarm timing.
- Permission granted is not proof of delivery. Verify foreground/background completion, sound/vibration overrides, battery restrictions, exact-alarm/notification permission behaviour, and phone-settings changes on real builds. Delivery has not been tested in this session.
- Existing reduced-motion platform preferences continue to control animations after the unused Settings Motion row is removed.

Reference: [Expo SDK 57 Notifications](https://docs.expo.dev/versions/v57.0.0/sdk/notifications/).
