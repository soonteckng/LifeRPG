# LifeRPG: merged main checkpoint and next milestone

The agreed checkpoint is merged. PR [#15](https://github.com/soonteckng/LifeRPG/pull/15) merged `feature/session-reliability` into `main` at **`03cbcb1ef65150226c9ece2238d0cb207eb77cfa`**. The merge tree is identical to the tested feature head `4bec5b7`. Main is the stable checkpoint; new offline work starts on `feature/offline-sessions`.

## What changed

- **Session reliability:** Account/backend-scoped persistent journal; serialized and verified writes; corruption quarantine; retention of recent settled records without dropping unsynced work; owner/admission fences; recovery after restarts and lost responses. End is saved before network checks. Unknown Pause/Resume requests remain conservative, and End remains the escape path. Identified server Starts and durable stop proofs prevent a late old Start from resurrecting an ended session.
- **Responsive timer:** Start opens the timer immediately. Pause/Resume use a stable display anchor, and canonical timing still controls completion. Ending at actual expiry completes rather than cancels. Result dismissal and timer dismissal are coordinated, and pending results remain recoverable.
- **Android countdown:** Native notification countdown, finish alerts, permission/settings links and preference handling. Notification identities, leases and nonces fence stale actions. Warm notification actions use the safe controller; cold actions open the restored timer. JavaScript remains the sole journal writer. The existing build accepts a nullable server ID, so offline sessions should not require another native module.
- **Duration and sheets:** Custom duration remembers the user's last edited value, with preset fallback rather than an old session's eight-minute value. Keyboard handling, compact duration editing, result actions and quest-sheet spacing were corrected.
- **Focus areas:** Six consistent categories, free focus resets to Everyday focus, category repair fills missing defaults without replacing IDs, and profile order matches the direction picker. Duplicate Wellbeing presentation combines its earned XP without erasing rows/history. The picker has six cards, haptics and a distinct free-focus starting point.
- **Quests:** Shared refreshed quest state replaces stale lists. One-off/recurring eligibility is respected. Completing a suggestion does not automatically create a new quest; **Save as quest** opens an editable draft with prefilled name/duration, and only explicitly creating it saves it. Free sessions have no Save as quest option. Sheet spacing and guide punctuation were updated.
- **Progress:** Selected-day effort is separate from week/month totals. Goal display uses consistent units. Comparisons use suitable periods and avoid premature negative claims at the start of a week or with too little data. Existing long-term level progression and Quick Start remain in place.
- **Character and celebrations:** Profile entry triggers a greeting, with idle/blink motion and reduced-motion support. First daily session and daily goal achievements appear as a separate moment after dismissing the result; a combined achievement produces one moment. Owner/date-scoped presentation deduplication avoids replay, and dismissal fades. These messages do not award additional XP.
- **Account experience:** Refreshed sign-in, create-account and password screens, fade/slide motion, keyboard-safe fields/errors. First use opens Create account; explicit sign-out prefers Sign in; returning authenticated users restore Home. Cached profile details are scoped to the account and do not authorize server writes.
- **Notifications and daily goals:** One-time invitation after the guide; direct Android app notification/alarm settings through approved IntentLauncher. Goal changes allow 30–480 minutes once every seven days, effective from the next local day, preserving today's goal/history.

Previously approved live category repair, session Start/Stop repair and daily goal migrations are already installed. This merge does not perform a new database migration.

## Validation and limits

- Both checks on the exact PR head passed: TypeScript/lint/Node tests, and PostgreSQL progression/concurrent completion checks. Latest integrated local run reported **863 passing Node tests**, no skips. Typecheck was repeated before merge. Existing native policy/parser tests passed.
- User phone tests passed most online/offline-recovery cases and account isolation. Do not describe every device/race case as proven: reboot recovery, the difficult exact-zero End case and the daily-goal-only/combined celebration still need explicit acceptance checks.
- Latest preview update uses the existing APK7 runtime. The native finish-notification wording change remains batched with the next necessary Android build, as requested. Merging main does not publish to either store.
- Main supports recovering an **online-started** session and saving its pending finish after reconnecting. It does **not yet** provide full offline Start/Pause/Resume. That is the next milestone.
- Supabase warned about bounced transactional emails. Use valid existing test accounts; no fabricated-address sign-up testing. SMTP/delivery readiness remains a launch task.

## Next agreed implementation

**Full offline sessions first**, before routines/widgets. The new branch adds a capability-gated local Start/Pause/Resume/End, a queue of immutable local results, and a separate idempotent server import/finalisation path. A protected server snapshot anchors any online-to-offline timing handoff. Uncertain already-sent server controls cannot be guessed or blindly replayed.

The design distinguishes server-timed and client-reported effort. Limits: eight-hour target, 24-hour session span, 256 intervals, seven-day import age, bounded clock skew and a daily client-reported cap. Original client IDs/payloads remain fixed across retries. Server UUIDs may differ from client IDs. Overlap, revision conflicts, deleted links and concurrent duplicate submissions need database tests. Existing normal completion keeps its timing/reward behaviour. Offline progress is provisional until a durably stored server receipt confirms it.

No live SQL is applied until the concrete proposal and tests are ready and the user approves it directly. Existing accounts only gain offline capability after seeing the installed server policy online. No new native module or Android build is planned for this slice.

Then continue in the settled order:

1. Remembered routines and widget starting, improving existing Quick Start.
2. Optional Quiet and Protected modes; Android first, iOS entitlement request in parallel. Protection/allowlists remain free; device app selections stay local.
3. Continuity, resume unfinished work, basic weekly review, and later a separate partial-session path: 60-second minimum, exact accepted seconds, no linked quest completion and no duplicate reward.
4. Monetisation interest tests after voluntary retention, comparing routines/deeper insights/optional character packs. No room-building yet.

Launch preparation must also add account deletion, privacy/support links and disclosures, delivery readiness and platform-specific release checks. The Gemini publishing note was reviewed against official policies; its contents are reference material, not permission to publish or change live services.
