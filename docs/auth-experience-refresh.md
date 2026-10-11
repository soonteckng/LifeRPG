# Account entry and form presentation

The first launch still shows the existing LifeRPG launch animation. An install with no previous account evidence opens Create account. A verified existing account retains the existing Home or offline recovery admission path. Explicit sign-out remembers Sign in for the next launch. Both account forms remain switchable.

`liferpg.auth.entry.v1` is a device presentation preference containing only `sign-in`. It cannot admit an account, bypass password recovery, supply an identity, or erase a session journal. A missing or malformed preference defaults to Create account unless there is pre-existing account evidence. Preference storage failure is best effort and does not change auth proof or sign-out behavior.

Sign-in, account creation, reset-email requests and new-password forms now share a black and charcoal form frame, labeled fields, centered short content, and a bounded fade with a small horizontal movement. Reduce Motion shows the final form directly. The existing password visibility control, duplicate-submission locks, generic email confirmations, provider functions, credential verification and password recovery guards remain intact.

Android's existing `softwareKeyboardLayoutMode: resize` is the only resize mechanism on that platform. The shared frame uses KeyboardAvoidingView padding on iOS and disables automatic ScrollView keyboard inset accumulation. It hides decorative content in a small viewport and reveals the active field or error only as far as necessary. Long forms, large text and server errors remain scrollable. No native configuration or dependency changed.

Checks cover fresh and returning entry, explicit sign-out persistence, missing and malformed credentials, preference storage failure, account and recovery gate priority, duplicate submissions, generic confirmations, draft preservation, minimum field/error scrolling including centered form offsets, and motion preferences. Native keyboard geometry still needs an installed-phone check; mocked layout tests do not establish pixel-level device behavior.

Phone review: with an existing account, reopening should return to Home. After explicit sign-out, reopening should show Sign in. A clean install should show Create account. Switch between both forms and Forgot password, type into every field, and trigger one validation error and one server error. Controls and messages should remain reachable above the keyboard without the previous large spacer.

Primary references consulted before implementation:

- [Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/)
- [React Native KeyboardAvoidingView](https://reactnative.dev/docs/keyboardavoidingview)
- [React Native ScrollView](https://reactnative.dev/docs/scrollview)
- [Apple entering-data guidance](https://developer.apple.com/design/human-interface-guidelines/entering-data)
- [Supabase password authentication](https://supabase.com/docs/guides/auth/passwords)
- [Supabase changelog](https://supabase.com/changelog)

These references informed layout and input behavior. No external app branding, assets or screen design was copied. No live backend operation is required for this presentation change.

## Optional notification invitation after onboarding

Only new-account `prepareFeatureTour` prepares a per-account `pending-guide` notification invitation. Completing that automatic guide and returning to Home changes it to `ready`. Manual guide replay cannot prepare or ready an invitation for an existing account.

The invitation queries device permission only after Home is visible and the guide, active or recovering sessions, rewards and other sheets are absent. It does not request OS permission automatically. Enable notifications is explicit consent; Not now persists the invitation as handled. An already enabled device handles the invitation silently. A denied OS choice is also handled once, with notification settings remaining available later. Expo Go without notification support leaves it ready for an installed build.

Async marker reads and writes, permission results, button callbacks and in-flight actions are fenced to the current verified owner and admission epoch. An optional marker storage failure leaves Settings usable and never blocks account setup. The AppSheet activity registry delays the invitation until another sheet has fully finished closing; it does not change sheet gestures or native motion.

Device review for a new account: complete all six guide steps, return Home, then choose Not now. Relaunch and replay the guide; the invitation should not repeat. On another new account with device notifications disabled, choose Enable and verify the operating system prompt. Existing accounts should not receive the new-user invitation.
