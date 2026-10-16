# Combined APK: guide, offline presentation, email guardrails, Android protection preview

14 October 2026. Based on APK9 (`feature/routines-widget`, HEAD `4a2c660`) plus the uncommitted Phase1 guide/Home changes. The owner approved an Android prototype and one combined APK. Current personal XP is preserved; early End still earns nothing. No live SQL/account/email changes are authorized by this document.

## Included client changes

- Five-step distinct guide, mandatory first run and Skip on replay; paused-tap feedback, reduced motion and navigation failure recovery.
- One in-card Home suggestion and Change entry. Offline Home now presents the same entry and keeps routines, cached real area IDs, duration, End confirmation and result behavior. A scoped UI lock rejects duplicate Starts without changing the controller.
- Email syntax is checked before sign-in/signup/recovery. Existing submit locks and recovery cooldown remain. The new email-test helper refuses hosted authentication endpoints; fixture tests use mocks or local capture only. Syntax validation cannot establish that a mailbox exists.
- Android Protection preview under Settings in the approved build. Choose an allow list or system-apps-only preview, explicitly grant permissions, and activate it during a running, confirmed session. Normal sessions and their rewards keep their existing rules.

## Scope and limits

The prototype is an independent cover lease, not a second session-journal writer. It has no reward, session mutation, server eligibility or cloud package-list route. The ten-minute maximum, visible Stop, system exclusions and non-sticky lifecycle are intentional feasibility constraints. Pausing/ending or an account/admission change stops protection; reactivation is explicit.

The prototype module remains disabled in native builds that lack its approved compile-time flag, and its UI is hidden by default. Its manifest permissions still require removal or policy review before store distribution. Permission refusal/revocation and interrupted services do not disable the normal timer.

No production emails were sent for testing, no Supabase project was created, and no database/schema/auth-provider setting was changed. Custom SMTP with a verified sending domain remains a launch-readiness requirement; client validation cannot resolve sender reputation or prove deliverability. See [Supabase SMTP documentation](https://supabase.com/docs/guides/auth/auth-smtp).

## One combined phone test round

Install the new combined APK once; retain app data. First inspect the guide and the online/offline in-card Change entry. Use existing valid accounts for login checks; do not send fabricated-email signup/reset requests to production.

1. Replay the five-step guide: paused taps explain themselves, Next works, Skip exits replay, and the ribbon/card/buttons fit. Check reduced motion and large text. The mandatory-first flow is tested with local fixtures; no new fake production account is needed.
2. Choose a direction online and offline; confirm duration and routines remain. Complete a short offline session, reconnect and confirm one saved result/reward, then dismiss it normally.
3. Start a confirmed three-minute normal session, then open Profile → Settings → Protection preview. Decline permission first: the normal timer must remain usable. Grant the required permissions and choose a supported installed app to cover. System apps are intentionally excluded from this prototype.
4. Start the protection test. Open a covered app and an allowed app. Record detection delay/misses across repeated launches; do not assume the prototype passed from one launch. From the cover, test Back to LifeRPG and Stop protection. The actual session should continue after Stop; only End in LifeRPG ends it.
5. Test dialler access without placing an emergency call; test an ordinary incoming call if convenient. Settings, system UI and the normal session End must remain reachable.
6. Re-enable, then pause or End the normal session. Apps should be released; Resume must not silently reactivate protection. Complete a normal session afterward and confirm the existing XP and cloud result once.
7. Re-enable and revoke a permission or disable the protection notification channel from Settings. Protection must stop with a calm status; the timer remains usable.
8. Test screen off/on, Recents removal and Android Force stop separately. Protection should not restart itself; normal session recovery follows the existing journal. Also check the short session's expiry removes the cover. Device battery and second-manufacturer gates remain to be measured before product blocking is approved.

Report only failed steps and the APK/build identifier. Store shipping, five-minute break segments, leaderboard eligibility, iOS entitlement integration and ads remain separate milestones after these native findings.
