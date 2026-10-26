# Round 70: background rewards and fresh progress

Prepared 27 Oct 2026 on top of Round 69
(`c2bfd40c617f7e9b7004fe3138b32292cb35578c` in this verification checkout).
Apply Round 69 first. Soon Teck was pushing it but had not tested it when he
reported these additional **Round 68** results.

## Reports and diagnostic limits

A 45-minute session finished while the app was in the background. After the
walk back, a pop-up flashed/disappeared, then a pop-up appeared again after
dismissal. A reward and the daily pack may both have shown Canvas tote, while
Profile looked locked/empty. Progress appeared only after a manual refresh on
that occasion.

Three client problems were reproduced rather than inferred. Exact on-phone
modal/frame timing and the user's specific missing-inventory claim are **not
proven resolved**: no Android device or session log was available, and the
username, exact item and whether Gear → Bags was checked remain unanswered.

Canvas tote (`tote`) is a bag under **Outfits → Gear → Bags**. It does not
auto-equip or unlock a pet, frame or full-set badge. Independent session and
pack rolls can select the same item. The server's existing `give` function
grants it once; a common duplicate gives **5 Stardust**. No reward amounts,
rarities, thresholds or unlock rules were changed.

## 1. Dismissed find could pop up again

An existing refresh can already have queued a reward notice when the finds
screen is dismissed. Dismissal removed the moment immediately, but its durable
seen write waited behind that notice. The notice then read the old seen set
and re-added Canvas tote. In the reproduction the persisted seen set already
contained tote, yet the in-memory moments still contained it.

The store now records a pending dismissal in memory before queueing the same
seen write. In-flight notices include those pending acknowledgements, so they
cannot requeue a find that was already shown and closed. The temporary guard
is cleared after the existing acknowledgement runs. Inventory is never changed.

`tests/rewards-store-races.test.cjs` reproduces the old failure at two microtask
orderings and verifies no repeated tote, preservation of an unrelated pet
milestone, unchanged owned items, and normal developer reset/re-earn. Existing
return/pack ordering tests remain passing.

This confirms a repeat-find race, not the exact cause of every first flash of
the session-completion sheet. Round 69's result fade/entry fixes are preserved.

## 2. Progress and Profile accepted pre-completion history

Home prefetches history before either screen opens. After a new session, both
hooks could join that older pending request. Progress accepted its old rows as
fresh; Profile additionally stamped those old rows with the new completion
marker, so revisiting the screen within a minute could keep the stale result.

- Progress invalidates matching-owner cache/prefetch work before focus reads,
  including its first visit after a saved completion. A detached old prefetch
  cannot overwrite the cache or clear a replacement request in its finalizer.
- Progress local data/errors use the full owner-plus-period key, preventing a
  previous owner's same-period history from flashing after an account switch.
- Character reads and generations are scoped by owner and completion. Matching
  requests still coalesce. A late previous-owner prefetch cannot cancel the
  current owner's read or evict its completed cached snapshot. The cache keeps
  at most four account-scoped snapshots.
- Character cache staleness is tracked separately, preserving the original
  data object's identity while a refresh waits. A new completion remains an
  invalidation even if Done clears its temporary summary while Profile is
  blurred. The original Milestones reuse/identity assertion is unchanged.
- Current errors preserve cached history. Outgoing errors and results cannot
  settle a new owner's view. No automatic retry loop or new API was added.

Before-fix tests captured stale history, first-mount invalidation, owner data
leak, old-finalizer interference and completion → Done → refocus. An independent
review also caught cross-owner generation interference and the cleared-summary
case before delivery; both have dedicated production-compiled regressions.

Tests: `round70-progress-refresh.test.cjs`,
`round70-character-refresh.test.cjs`, plus existing Progress, Character and
Milestones tests. Cold-cache controls still prove ordinary prefetch reuse.

## 3. Unknown inventory looked like owning nothing

Outfits used `owned=[]` while the reward state had not loaded, failed, or had
skipped its first read because a claim was busy. It showed locked items and
could stay saying Loading with no Retry even after that claim failed.

Outfits now distinguishes unavailable inventory from an empty known collection:

- Unknown inventory shows a status instead of false locked tiles. Free look
  editing still behaves as before, and saving still waits for the saved avatar.
- A failed refresh retains cached owned items and explains that the cached
  collection is being shown.
- Online users get an explicit retry even in the unknown-but-idle state with
  no error string. It calls the existing `rewards.refresh` read and reuses the
  five-second, single-flight request guard. No polling or sign-in/email workflow
  was introduced. Offline it explains the connection requirement.
- The new button uses MotionPressable haptics, an accessibility role/label/state
  and `outfits-retry-items`. Existing IDs and controls are retained.
- Duplicate session/pack gifts now visibly say **Already yours** next to their
  existing Stardust value. Previously that explanation was screen-reader-only.

The actual Outfits harness verifies unavailable/busy/idle/error transitions,
rapid repeat taps, cooldown, late inventory with tote owned, and cached ownership
after a refresh failure. Its compiled render was independently checked as well.
Rendered session and pack tests require the visible duplicate explanation.

## Database and native boundaries

Only read-only live checks were made: definitions of `give`, `state`,
`claim_session_rewards_v1` and `open_daily_pack_v1`, plus an aggregate search for
normal-account tote events in the preceding 48 hours. That aggregate returned
no matching rows and does **not** establish what the user's exact account owns.
No user emails or Auth records were requested. No mutating rewards RPC,
migration, data repair, sign-up, test email or live Auth flow was run.

There are **no SQL, auth, dependency, native, runtime or build-config changes**.
No economics were changed. Do not grant an item manually based on an unconfirmed
report. If the tote is still locked in Gear after a successful load, identify
the account and inspect its inventory/events read-only before proposing repair.

**All native work remains deferred to November 2026 after the Expo quota reset.**
Combining countdown and protection notifications is still pending, as recorded
in `HANDOFF.md` section 10. Do not build an APK for Round 70.

## Verification

- **Full suite: 1,657 passed, zero failures/skips**, including isolated PGlite.
  It ran with external networking blocked and one test worker:
  `node --wasm-num-compilation-tasks=1 --v8-pool-size=1 --require ./tests/helpers/no-external-network.cjs --test --test-concurrency=1 tests/*.test.cjs`.
  `SESSION_SQL_PGLITE_ROOT` pointed at the existing isolated dependency runtime.
- Typecheck, full Expo lint, new-file lint and diff checks pass. Existing
  lock-matched installed dependencies were reused.
- Same-checkout Android native fingerprint remains
  `49308616e025891eba4e874277a734a7281f16bb`. Publish from the original Windows
  repo, preserving its local `.gitignore` and installed runtime
  `4f07392040ace293bbe1cdb4176b5b7840d9e9b3`; never force a runtime override.
- Local Android export and patch application are checked during packaging.
  Only the export contents belong in `dist-round-70.zip`, with `metadata.json`
  at ZIP root. No EAS publication, push or APK build is performed by the agent.

## Phone follow-up

Apply Round 69 then Round 70 before publishing. On the next normal session,
check background finish → result → finds/trail once, and visit Progress/Profile
without pulling to refresh. If the modal itself still flashes/reappears, capture
the session log when available; do not assume the repeat-find race explains all
native presentation behaviour. For the suspected missing tote, check Gear →
Bags and whether the app shows a loaded collection or the new unavailable state.

Round 69's entrance, last-ten-seconds dawn, one-minute minimum and Android
animation frame pacing still require installed-phone acceptance.
