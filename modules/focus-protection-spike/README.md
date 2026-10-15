# Android session protection (native format v2)

The folder and Expo module name are retained for binary compatibility. This now serves real sessions rather than a separate feasibility timer. See [session protection and UI repair](../../docs/session-protection-and-ui.md) for current behavior, permissions, safety limits, verification and the combined installed-phone check.

The v1 ten-minute parser is retained for legacy callers. Current v2 leases bind to a stable client session ID and remaining monotonic deadline (up to 480 minutes). Usage Access, overlay access and notifications are opt-in; no Accessibility service, broad package visibility, boot receiver or email/database path is added. Protection can be stopped independently of the session. Calls, Settings, system apps and End remain accessible.

The foreground service survives removal from Recents. Force-stop, reboot, OS eviction or revoked access can interrupt it; restoration is explicit. No break, leaderboard eligibility, verified-focus reward or iOS shield is implemented here. Store approval and device/OEM behavior require separate evidence.

Run Node tests, typecheck, Expo lint and scripts/test-protection-jvm.ps1. The Android build compiles the complete Expo bridge and framework APIs.
