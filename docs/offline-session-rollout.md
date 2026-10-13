# Offline session rollout

The user directly approved `docs/session-offline-sync.sql` on 13 October 2026. The exact tested proposal (SHA256 `5D161DCB0D91F0EA8AAFE9652DC98645B5FDD26B0F05B661D33CE9997BC1565A`) was installed atomically as Supabase migration `offline_session_sync_v1` in project `msuelivxpsfizkddjjfg`.

Post-install read-only verification confirmed:

- Policy version 1 is enabled; all three public RPCs exist and allow authenticated execution while refusing anon execution.
- The private policy, submission and handoff tables have RLS and no authenticated SELECT/INSERT access.
- The original one-open-session index is intact.
- Start/Stop v2 definitions retain their original guarded hashes.
- Profile/session/daily-row counts and session-earned XP were unchanged by installation.

The proposal file retains its original reviewed bytes. Its header describes its review state when prepared; this rollout record establishes that it is now installed. Reapplying it to an already-installed database aborts safely.

The client passed 963 integrated local tests with isolated SQL execution, TypeScript and Expo lint. All three GitHub checks passed at `d64cc08`, including concurrent PostgreSQL reconciliation.

The existing APK7 Android runtime is `8842e85381bf6895546553864e75094484e6fad8`. The compatible EAS preview update is the delivery route; no Android rebuild or native behaviour change is needed. Windows branch checkout had converted the unchanged local Android source files to CRLF, affecting Expo's byte fingerprint. Restoring the original LF bytes and pinning them in `.gitattributes` restores this exact installed runtime without overriding runtime compatibility.

Installed-phone acceptance remains pending. Open the updated app online once so this installation can cache the owner-scoped policy, then follow `offline-session-acceptance.md`. Keep PR16 draft until those results are recorded. No fabricated email sign-up testing or provisional XP claims are permitted by this flow.
