# Home refresh after reopening and reconnecting

The installed-phone report described a recurring Home refresh warning after an offline test and repeated app launches. The warning comes from Home's data/profile/quest loads; it is independent of the Expo update cache.

## Reproduced cause and change

A child Home-like passive effect can call `reloadProfile` before UserProvider's passive startup effect. That parent effect previously incremented the profile request version and cleared the shared promise after the child's request began. Both server reads could succeed, but the child received `false` because its request had become obsolete. Home treated that result as a genuine failure and retained the warning.

Ownership/version invalidation now runs in the layout phase, before child passive requests. Startup loads share one request, and a successful matching response reports success. Cleanup still invalidates old-account or unmounted replies. Genuine query failures remain visible and clear after a successful retry; no cache or saved session is erased.

Home focus/foreground and quest foreground refreshes also request fresh work. When a pre-reconnection load is still pending, one fresh load follows its result rather than merely sharing the old failure. Existing in-flight sharing prevents duplicate simultaneous reads.

## Verification

Regression tests use the production UserProvider, lifecycle hook, single-flight logic and QuestProvider with synthetic auth/storage/query boundaries. They cover the parent/child mount race, account changes during a late reply, real failure followed by retry, and Home/quest foreground recovery after an older offline request settles. Existing Home tests preserve loaded progress on actual failures and require the warning to clear after success.

Validation on 11 October 2026: all 533 Node tests passed with no failures or skipped tests, typecheck passed, and lint without cache passed without warnings.

The fix is JavaScript only. No native module, dependency, permission or live database change is included. Installed-phone retesting is required. Reconnect, reopen twice, and verify the false warning does not persist once loading succeeds. Then retest the timer controls and result sheets separately; a Home warning does not prove which Expo update the phone loaded, nor does this fix establish native animation performance.
