# Guided quests: first usable version

Branch: `feature/guided-quests`, based on main `f31fc27a8a49b185ecd1606a012d2572d8db1b7f`.

## Product decisions

LifeRPG offers a manageable next action to people who do not want to organise a quest before beginning. This version develops one direction, **Study and assignments**. Other directions are intentionally absent until useful content exists. Choosing **Just let me focus**, or skipping suggestions, retains the existing Quick Start experience.

The three studying needs are revision, assignments and practice. Three curated work blocks provide a useful starting instruction: Review your notes, Work on an assignment, and Practise questions. Each defaults to 30 minutes, with an optional 10-minute version. Users start once and keep working; individual questions do not need separate app interactions. Preferences save the default study mode. Choose another and Try 10 minutes override only the current Home visit, without saving a new default. Choosing another block also overrides a scheduled quest for that visit. Suggestions remain user-controlled and do not claim to know a deadline, subject, mastery level or learning outcome.

## New users

The existing protected registration/onboarding gate is preserved. Onboarding first offers a direction and immediate studying need. Then it collects the existing name and daily-goal fields required by the onboarding RPC. Character customisation is deferred to Profile; a previously saved badge is preserved. The shared ten-badge catalogue is unchanged. Preferences must load successfully before saving; errors retain the draft and support retry.

The introduction explains suggestions, smaller steps, free focus, saving a quest, character growth and the existing completed-session accounting. Tutorial replay never re-runs registration or rewrites progression.

## Existing users / Home

A dismissible invitation introduces suggestions without sending existing users through onboarding. Settings → Focus suggestions can enable, disable or change the direction at any time.

When enabled, a compact exact-time goal indicator supports the main suggestion card, leaving more space for personal quests. An actionable scheduled quest takes priority and explicitly opens its existing setup for review. Otherwise a starter task starts directly, using its duration and Knowledge where that Life area exists. Missing Knowledge falls back to General; the displayed area matches the recorded area. No Life areas are created or guessed from a title.

An open running/paused session always shows Continue instead. Restoration, unresolved completion and busy actions prevent a new start. Free focus and existing quest management remain available. A failed suggestion Start retains its exact draft for retry.

## Session, completion and history

Start uses the existing session RPC with `task_id = null` and independent `subject_id`. A versioned, validated marker in the existing `notes` field stores template ID, smaller flag and a snapshot of the title/instruction/duration. Unknown IDs, malformed markers and ordinary historical notes are not interpreted as suggestions. No schema migration is required.

TimerContext's synchronous lock protects repeated Starts. The title is used for the notification and completion; the instruction remains visible during the session. Open-session restoration reads the marker. Progress session rows/details display the saved title while chart grouping continues to use the actual recorded Life area.

The existing shared completion popup offers **Save for later**. This explicitly creates a one-time quest through the existing quest service: title, template duration, area and easy difficulty. It does not create a quest automatically, link it retroactively to the completed session, award XP again or schedule recurrence. Users can edit/schedule it in Quests. The existing task schema has no instruction field, so a saved quest retains its title/duration/area rather than a new description field.

Repeated taps are synchronously blocked; a per-account/session local receipt and matching loaded quests prevent ordinary repeated saving. Failed requests refresh quests before retry. The existing insert API does not provide a server idempotency token: an ambiguous response failure can still require checking the quest list before retrying. No stronger guarantee is claimed.

## Storage and account safety

Suggestion preferences and save receipts use existing AsyncStorage with keys containing the account ID. They are local to this installation, not synced to another device. Reads/writes are validated, simultaneous preference writes are blocked, failures preserve the last confirmed value, and a failed read cannot be overwritten silently. UserProvider's existing account-keyed lifetime remains unchanged.

Session metadata uses existing account-owned Supabase session storage and existing RPC validation/RLS. No authentication configuration, secrets, account rows, SQL, reward calculations or remote migrations were changed. Existing XP, historical targets, streak semantics and completion-date attribution remain unchanged.

## Deliberately separate work

Early End still cancels and earns no credit. Crediting actual time for an explicitly finished-early session requires a separately designed/tested backend change. This branch does not implement it. Weekly intentions, review, reminders, other directions and automated personalisation are also deferred.

## Verification and phone acceptance

Automated tests cover catalogue/metadata validation, account isolation, storage failure and retry, duplicate writes, guided Start draft ownership and failure, restoration and completion identity, smaller tasks, explicit selection over a personal quest, skip/selected onboarding and saving once. Existing regression tests remain required.

Phone observation is still required; mocked native tests cannot prove visual quality or gestures:

- Existing account: invitation dismisses; Settings can enable, change and disable suggestions without changing quests or progression.
- New real account: choose revision/assignment/practice or Skip, complete name/goal, finish introduction and reach Home. Tutorial replay preserves data.
- Home: suggestions/quests remain readable on small phones and large text; free focus stays accessible; personal scheduled quests keep their original setup.
- Smaller/alternative task: title, instruction, duration and displayed Life area agree. Starter Start requires no quest editor.
- Minimise/reopen and force-stop/relaunch running/paused suggested sessions; check title, instruction and remaining time.
- Complete while foregrounded/backgrounded: one popup, saved credit once, useful Save for later, ordinary Done dismissal.
- Swipe/back/outside close suggestion sheets and completion using existing motion and keyboard priorities; check Android and iOS.
- Check offline starts and quest saves without losing draft or inventing success.

No new native dependencies are needed. Expo Go remains supported. An EAS Update can deliver this JavaScript/assets change to an installed build with a compatible runtime/channel; this work does not publish an update or build an APK.

Validated locally: **230/230 tests**, TypeScript, full lint and Android/iOS Hermes bundle exports passed. Exports used placeholder public environment values and performed no live authentication or database writes. The focused suggestion suite also verifies that Retry retains its original area if available areas change after failure. Installed-device behavior remains unverified.

## Current guided-flow refinement after phone feedback

- Preferences mean the saved default; the temporary picker says **For this session only. Your default stays in Settings.** The same three work blocks are available there. Shorter/original time choices say **Try 10 minutes / Use 30 minutes**. They do not write preferences. New onboarding and tutorial wording explain this distinction.
- Older saved preferences map the previous microtask IDs to their matching work block. Historical session snapshots retain their original ID, title, instruction and exact duration. No quests, sessions or backend rows are rewritten.
- Choose another uses AppSheet's existing bounded 220ms timing animation instead of its spring tail. Reduced motion, gesture dismissal and keyboard/back priorities remain unchanged. Native smoothness is not proven by mocked tests.
- Preferences use compact radio rows and a pinned, measured safe-area Save footer. Large text can scroll with footer space reserved.
- Home shows one preview quest on compact screens/large text and up to two otherwise. The quest card itself has 24px of bottom margin and 12px of bottom padding, in addition to measured dock/safe-area scroll clearance. View all still exposes the full list. Previous extra scroll padding alone did not address the reported crowded final row.

Verification: **234/234 tests**, TypeScript, full lint and Android/iOS Hermes exports passed locally. Compatibility, non-persisting temporary selection, full-block start/restoration, and compact Home preview clearance have regression coverage. Phone checks remain necessary for animation settling, quest clearance with three-button navigation, and large-font layouts. No new dependencies or backend/reward changes.
