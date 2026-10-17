# Protection and sync follow-up — 17 October 2026

Branch: `feature/protected-breaks`. Based on `a80a11f`, including Claude's six UI commits and the solid lavender running bar. This batch changes behaviour only. No SQL, migration, production data write, permission, dependency, build configuration, email or auth workflow change.

## Recents and partial swipe-up

The foreground tracker previously treated a launcher/System UI resume as an immediate allowed destination. It also required matching activity class names before falling back from a paused launcher to the underlying app. A cancelled gesture can report different class names, leaving that allowed destination stuck.

An already attached cover is now retained for up to one second across consecutive transient launcher/System UI events, using Android elapsed time. More transient resumes cannot extend that deadline. A resumed blocked app is covered immediately. A real allowed app, Phone, Settings or LifeRPG still releases the cover immediately; a settled Home releases it after the bounded grace. Breaks, expiry and End take precedence.

Public event timestamps fence stale pauses; matching activity names are still required for STOPPED events, since an old Recents activity may stop after a newer Home activity has resumed. No hidden APIs, Accessibility service, new permissions or UI changes are introduced.

**Device acceptance is pending.** No phone was attached, and the user deferred USB debugging. Automated event sequences cannot establish what a particular launcher reports or whether Android suppresses an attached overlay during a gesture. In particular, a gesture cancelled after the grace with neither a blocked-app resume nor a transient pause/stop needs a real trace before selecting a further remedy. Do not describe this phone bypass as verified or release-ready yet.

The service includes opt-in local diagnostics for relevant usage events, cover decisions, window visibility and attachment. Logging is off by default and contains package/class names, not account IDs, tokens, session titles or email addresses. The capture helper preserves older logs, saves only events after its own marker and restores the previous logging level.

After installing the native repair build, connect and authorize the phone, start a protected session, and run:

```powershell
.\scripts\capture-protection-events.ps1 -Seconds 30
```

During capture: open a blocked app; partially swipe up and cancel; enter Recents and return; then go fully Home and open an allowed app. Confirm Phone/Settings remain accessible, and End and break still release protection. Do not call emergency numbers. Keep the generated local trace private unless intentionally sharing it for diagnosis.

## Routine changes stuck on “Syncing”

The routine transport depended on the identity of `verifyCurrentOwner`. Verification itself updates Auth state, creating a fresh callback and tearing down the sync effect while its own reply is pending. Local acknowledgement is then correctly refused by the cancelled effect, even though the server may have accepted the operation. Including `pendingCount` in that effect also cancelled the remaining drain as acknowledgements changed the count.

The transport now reads the latest committed verifier through a ref, remaining stable for its account/backend scope. A separate queue wake-up effect starts work without cancelling an existing drain. Account, backend, online admission and unmount boundaries still cancel it; RPCs retain their immutable expected owner and existing duplicate-safe operation IDs. Real failures retain durable pending changes and retry through the existing interval/foreground triggers. No server repair is required.

The existing caption now says “Syncing” only while a sync is busy; a failed or waiting attempt says so. Its element, styles and layout are unchanged. Successful acknowledgements clear the queue and remove the caption.

## Duplicate Wellbeing in Progress

Finding and proposed display-only fix were reported before implementation. The read-only database aggregate matched the reported split exactly:

| Stored subject | Stored colour | Completed time |
| --- | --- | --- |
| `2` — Grooming & Vitality | `#EC4899` | 1 min |
| `3` — Fitness & Health | `#EF4444` | 15 min |

Both legacy titles already normalize to “Wellbeing” in the app. Progress grouped by the original subject ID and retained separate colours, so it rendered two identically named groups. This is not evidence of duplicated sessions or rewards.

Progress now groups recognized focus-area aliases by their existing canonical kind, consistently for period summaries and daily segments/drill-down. The two entries produce one 16-minute Wellbeing group containing all original sessions. A duplicated catalogue kind uses its canonical colour; unrelated single-ID and custom category colours remain unchanged. Session IDs, original subject IDs, history, stored colours and rewards are untouched. No data cleanup or migration has been performed.

## Offline protection status

The Android service, readiness check and protection controller do not need the network. The provider remains mounted across online/local-only transitions, and protection binds to the durable client session ID rather than a server ID.

A transient bridge/storage failure previously published an idle state, which could falsely render “Block apps · not covering apps” while the native lease was still active. The controller now retains only the same session's last confirmed identity and publishes an uncertain `checking` state. The existing row says “Checking protection…”; it does not claim active coverage, interruption or a stopped service without a native reply. Restore waits for that read to settle, while End remains available. A later successful read restores the real status. Account/session changes cannot reuse another scope's confirmed identity.

Regression tests cover offline transitions, a fresh offline protected start, break handling and transient status failures. They cannot establish that a particular phone's reported label was caused solely by a read error; a genuinely stopped service must still report interruption and require Restore.

## Delivery and verification

Local verification on the final source:

- Typecheck and full repository lint passed.
- 1,233 Node app tests passed, zero skipped, with `SESSION_SQL_PGLITE_ROOT` pointing to isolated local SQL fixtures and the outbound-network guard preloaded. This count includes SQL-backed Node cases; it is not the smaller count obtained when that optional fixture runtime is absent.
- 38 protection policy/foreground JVM tests and 68 countdown JVM tests passed separately.
- The real protection policy, runtime and service compile against the installed Android API 33 SDK. This is a framework compilation check, not a full release build or a check of the unchanged Expo bridge on a phone.
- The capture helper passed PowerShell syntax validation; no device capture was run.

No signup, reset-password or transactional email test is run against Supabase. Only the aggregate SELECT above accessed production. Push-triggered CI also rehearses database races in disposable PostgreSQL services, never the hosted project.

Claude's listed screen files are unchanged except functional status conditions in `SessionProtectionControl.tsx`; `SavedRoutinesCard.tsx` changes only its existing caption expression. All StyleSheet declarations and JSX style props are preserved. No visual redesign is included.

No build or EAS Update has been run for this batch. The service change requires a new installed Android build; an OTA update alone cannot repair native gesture behaviour.

```powershell
cd C:\Users\soonteck\LifeRPG
git fetch origin
git switch feature/protected-breaks
git pull --ff-only origin feature/protected-breaks
npx eas-cli build --platform android --profile preview
```

The branch remains separate from `main`; installed-phone gesture acceptance is still a release gate.
