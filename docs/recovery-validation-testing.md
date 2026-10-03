# Recovery validation visibility

Automated component checks mock React Native layout and scrolling. They verify short-password and confirmation errors appear once under the relevant input, scroll targets update after viewport/error layout changes, server failures appear above submit, and drafts and visibility controls survive errors. Android and iOS keyboard-avoidance properties are checked. These checks do not render a native keyboard or prove pixel visibility on a device.

Local verification: all 152 existing and updated tests passed; `npm run typecheck` and `npm run lint` passed. The required Expo v57 reference and safe-area documentation were read before implementation. No authentication-provider code, Supabase configuration or accounts were changed.

Installed-device checks remain pending. Use a build containing this change on Android and iOS, including a small screen and the largest supported system text setting:

1. Open an existing valid recovery link. Enter matching passwords shorter than eight characters. With the keyboard open, tap Save or use the confirmation keyboard submit key. Verify the error appears directly under New password, automatically scrolls into view, and appears only once.
2. Enter passwords of at least eight characters that differ. Verify the error appears under Confirm new password, scrolls into view, and both values remain intact.
3. Keep the keyboard open and scroll to Save. Verify the entire form and all actions can be reached without dismissing the keyboard. Repeat while focusing each input, rotating the device, and using large text; errors and button labels should wrap without clipping.
4. Toggle both password visibility controls before and after validation. Verify values and toggle state survive, and a focused input retains focus.
5. Exercise a save failure in a controlled test environment (for example, disconnect networking before submitting valid matching values). Verify one server error appears above Save, scrolls into view, both values remain, and retry is enabled. Do not change production account credentials merely to test this layout.
6. Check status-bar/notch, Android navigation-area and iOS home-indicator spacing with the keyboard open and closed. Verify Return to sign in still follows the existing recovery sign-out safeguards.
7. Check request-email validation and request failures: one inline email validation message, one server message near Send, and no duplicate invalid-link message.

No installed Android/iOS device checks were performed for this change.
