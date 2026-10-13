# JavaScript session reliability: phone checks

Status: **not run**. Record the outcomes below before starting Android native countdown work.

Use an installed LifeRPG development build loading the current JavaScript, with its existing static notification. Record the app/build version, phone model, Android version and notification permission state. Use the agreed separate test environment and test accounts. No live account, build or phone was accessed by the coding agent. Expo Go can preview foreground UI, but does not establish installed-app notification/background behavior.

Before testing offline recovery, sign in online, finish onboarding and allow the profile to load. Start the test session online. Local recovery requires that earlier verified account/profile snapshot; offline first use is not supported.

| Case | Steps | Expected result | Result |
| --- | --- | --- | --- |
| Airplane mode and Force Stop | Start online. Enable airplane mode, Force Stop LifeRPG in Android settings, then reopen while still offline. | The saved account and session appear without waiting for a network response. New sessions and account editing stay unavailable. A restored running countdown follows the saved deadline. | Not run |
| Expiry while offline | Start online, go offline, close/Force Stop, wait past the target and reopen offline. Then reconnect. | Completion is kept locally at zero. No unconfirmed XP is shown. Reconnection confirms one saved session and one reward. Repeat reopening/retry and confirm no second reward. | Not run |
| End with weak then strong signal | Press End before zero on weak signal. If confirmation is uncertain, keep the app open or reopen, then use a strong connection and Retry. Also press End just after zero before the next tick. | A pre-zero stop remains saved; this phone submits no completion while it is pending. Strong signal confirms cancellation on the same session ID. End after zero instead preserves full-target completion. | Not run |
| Signout warning | With no active session, try signout when all work is confirmed. Separately finish offline, reconnect enough to admit the full account but leave completion unconfirmed, and open signout. | Ordinary confirmation remains normal. Unconfirmed work shows the warning. Explicit signout preserves its owner-scoped record. Signing back into the same account resumes confirmation. Active/restoring/busy sessions still block signout. | Not run |
| Account switch | Sign out after observing an unconfirmed finished record, sign into a different test account, then return to the original account. | The second account does not see, upload or celebrate the first account's work. The original account can resume its saved work. | Not run |
| Reboot | Start online and reboot before the target. Reopen after unlocking, once online and once offline. Repeat after the target passed. | The saved timer/finished record remains recoverable and syncs once. Record any wall-clock discrepancy. Native boot/monotonic anchors are not implemented yet. | Not run |

Also check an uncertain Pause/Resume: after confirmation times out, timing controls remain protected, Retry reads the result, and End is available to safely stop. Scheduled completion alerts should clear as soon as End is saved. Any completed server row without a readable receipt should display the kept-result message rather than offer a new completion or reward.

Force Stop and ordinary OS process death are different cases. While Android holds the app force-stopped, do not treat a missing alert as session loss; the acceptance result is recovery after reopening. Reboot/native countdown delivery, exact alarms and native single-writer storage belong to the next native package. Do not mark those native cases passed from JavaScript mocks or these preliminary checks.

For each failure, record the case, time pressed/expired, message shown, connectivity state and whether a reward appeared twice. No credentials or tokens are needed. These outcomes guide the next code fixes; the automated suite cannot supply them.
