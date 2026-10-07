# Tour freeze and feedback fixes

The previous tour opened a native Modal, dimmed the app and hid its entire panel until a target was measured. Its retry/deadline loop only began after the overlay frame existed, and target retries depended on the native callback arriving. Missing frame or target callbacks could therefore leave an indefinite dark input-blocking overlay. Happy-path tests supplied both callbacks and did not catch that failure.

The tour now renders as an absolute overlay in the same root screen. Target and root measurements share a window. The panel stays at the bottom; Next and Close remain visible independently of measurement or fade completion. Android Back dismisses it. A measurement-independent deadline offers Retry highlight; per-request timeouts bound silent target callbacks and errors. Transition deadlines prevent stalled native animation callbacks from blocking progression. A generation guard prevents late callbacks or pending storage reads from reopening a dismissed tour. Dismissal is stored per account without changing onboarding or progression.

While the tour is active, its scroll views temporarily reserve room for the panel and reveal targets above it. Closing removes that reservation and restores the earlier scroll position. Missing highlights never fabricate a successful measurement.

`afterTransition` no longer imports InteractionManager. It waits through the short entrance window and schedules cancellable work with `requestIdleCallback` and a timeout. Older/test runtimes retain the cancellable promise fallback. The installed RN InteractionManager was a deprecated setImmediate stub, so it was not evidence that refresh work waited for real interactions.

Onboarding distinguishes a page transition from a save. Page transitions still block duplicate taps, keyboard Back and selection changes, but retain full button contrast. Actual saving/loading and the unavailable first-page Back keep their disabled feedback.

The two phone-settings actions use concise Alarms & reminders / Notification settings labels, the same fixed 16-point/24-line-height button typography and no automatic font shrink. Their accessibility labels still describe opening settings. Permission behavior is unchanged.

Regression coverage includes absent frame callbacks, silent/throwing target callbacks, stalled routes, interrupted fades, rapid Next taps, account receipts, temporary scroll clearance/restoration, cancelled idle callbacks, transition button contrast and matching action typography. These are simulated native boundaries; physical Expo Go/release checks remain necessary.

The pasted animation advice was assessed against the installed code. Bottom-sheet gestures already use Reanimated worklets, while native-driver opacity/transform animations run on the UI thread. Gesture-driven PanResponder paths still need separate device profiling; this repair does not claim guaranteed 60/120 Hz performance or rewrite the session/wheel gesture guards. The example's direct Haptics call inside a gesture worklet should not be copied as a general thread-safe pattern; JS-side effects need an appropriate scheduler.

References: [native Animated driver](https://reactnative.dev/docs/animated#using-the-native-driver), [requestIdleCallback](https://reactnative.dev/docs/global-requestIdleCallback), [Reanimated performance](https://docs.swmansion.com/react-native-reanimated/docs/guides/performance/), [scheduling JS-side work](https://docs.swmansion.com/react-native-worklets/docs/threading/scheduleOnRN/).
