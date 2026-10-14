# Routines/widget rollout

The user explicitly approved the routine-sync database update on 14 October 2026. The reviewed proposal SHA256 `147BB660F5034ED5BEA730497F92AC262F8F0C1466C866D80DB03B429B49E4BF` was installed as Supabase migration `20261014082431_saved_routines_v1` in project `msuelivxpsfizkddjjfg`.

Preflight confirmed no routine schema or bound/unbound prototype functions existed. Post-install read-only schema/access checks confirmed:

- Both expected-owner-bound public RPCs exist and allow authenticated execution, with anon execution denied.
- The old unbound RPC overloads are absent.
- Both private tables have RLS; authenticated direct SELECT/INSERT is denied.
- The new routine and operation tables are empty immediately after installation.

The proposal adds only routine storage/functions. It contains no DML against existing profiles, sessions, quests, daily progress or goal-change records, and does not replace their functions. Isolated tests verify this separation. No real-account signup, email recovery or fabricated-address mail test was performed.

The proposal retains its reviewed original header/bytes. Its unapplied header describes its preparation state; this rollout record establishes its installation.

Client/native implementation commit: `1a87abb5f5511e0ba7a2aafa9f17bb773d14c5de` on `feature/routines-widget`, draft PR17. It is stacked on frozen offline PR16 at `3960a05772852fa4ee122e2eaa7fb69698581fbe`.

Validation at that code checkpoint: 1,079 integrated Node tests passed, none skipped; TypeScript and full Expo lint passed. Android Hermes export and Android API33/resource compilation passed. All 62 Kotlin policy/parser JVM tests passed separately. The new PostgreSQL17 concurrency job passed replay, capacity, revision-conflict, expected-owner and transaction-isolation checks; progression and offline SQL concurrency jobs also passed. The full GitHub checks remain the release record, not an installed-device result.

One Android preview APK is necessary for the new widget API and persisted cold-End prompt handover. Native runtime compatibility must be recalculated rather than reusing APK7's fingerprint. The focused installed-phone flow is `routines-widget-phone-check.md`. Do not clear app data when updating.

PR16 remains draft for Claude's independent offline review and the remaining release acceptance cases. PR17 also remains draft pending installed widget/notification acceptance. No production-store submission is part of this rollout.

Final notification regression: consuming End retires its nonce and creates a fresh End confirmation shortcut without changing the timer anchor, remaining time, journal or cloud state. This keeps End available after Keep session. Four further native regressions pass, making 66 JVM tests in the final native source. The unfinished build at the earlier checkpoint was cancelled before delivery so this correction is included in the downloadable APK.
