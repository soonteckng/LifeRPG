# Round 81: developer previews that open their card, and the chosen-reward SQL review

29 October 2026 (Claude). Base: pushed Round 80, `1560048`.

## 1. "Offline sync summary" previews showed only the scenery

**Reported:** Settings > Developer > "Offline sync summary" and "Offline sync and
celebrations" show the daylight scenery and character, with no summary card and
no Done button.

**Cause (from React Native's Android source, then reproduced in a test):**

- `ReactModalHostView.showOrUpdate()` creates and shows the dialog window as soon
  as the Modal's native view receives its props (`onAfterUpdateTransaction`). It
  does not wait for the parent to be attached.
- Fabric creates a new subtree's native views children first.
- These previews render `<Modal>` (the scenery) containing `SessionResultSheet`,
  whose `AppSheet` is itself a `<Modal>`. When the card is visible on the very
  first commit, its window opens first, then the full-screen scenery window opens
  on top of it. Only the scenery is visible; the card and Done are underneath.
- "Walk back, result and trail" works because the card mounts 1.8 s later, after
  the scenery window already exists.
- The same applies to every preview that shows its card at once: **Session ended
  early, Saved offline result, Session could not be credited** too, not only the
  two sync previews.

**Reproduction:** `tests/round81-dev-preview-windows.test.cjs` models the rule
(each Modal opens its window when first committed visible, children first; the
latest window is on top). All five instant previews put the card under the
scenery on Round 80 (6/6 fail) and above it with the fix (6/6 pass).

**Fix (DeveloperRewardTests only):** the card waits until the scenery Modal
reports `onShow`, with a 400 ms fallback if Android never reports it. The normal
session flow is unchanged: its result card is not nested in another Modal.

Still to confirm on the phone: all five instant previews show their card.

## 2. Chosen-reward SQL review (proposal, still NOT installed)

Reviewed `supabase/migrations/20261028185232_round80_chosen_rewards.sql` against
the live database (read-only). What holds up well:

- permanent per-date credits;
- wallet-first locking, and no session-completion function takes the wallet
  lock, so the trigger cannot deadlock with a reward call;
- replay-safe choices;
- rollback-only developer preview;
- additive state and claim reply fields for old apps;
- a pack refusal message that old apps already display;
- no orphan profiles that would break the backfill of account boundaries.

Three changes, each with a test that fails on the original proposal:

1. **Triggers could block critical writes.** `chosen_goal_confirmed` runs inside
   the session-completion transaction (`daily_progress`), and
   `chosen_profile_created` inside account creation (`profiles`). Any exception
   in them would fail the session's credit or the sign-up. Both now catch errors
   and log a warning. A missed capture is filled in by the next rewards read,
   claim or choice (`chosen_refresh` reconciliation already does this).
2. **Chosen items were stored with source `milestone`.** The live developer
   action `dev_rewards_v1('reearn')` deletes inventory with source `milestone`,
   `streak` or `set`. A chosen item would be removed while its `chosen_grants`
   row stayed, and the `unique (user_id, item_id)` would then make any later
   grant of it fail. The proposal now adds `chosen` to the inventory source and
   event kind checks (additive: every existing row passes) and grants with it.
3. **Offers were the first four ids alphabetically:** beret and three
   backgrounds for every new user, decorations only much later. Offers now take
   turns between kinds in a fixed order (first wearable, first background, first
   decoration, second wearable, ...): `beret, bg_forest, decor_bonsai, book_bag`.
   Still stable across devices, and only the acquired slot refills.

Considered and left as is:

- **A choice can be refused as "changed on another device" if a background
  refresh bumped the revision.** This only happens when the app is out of
  date. The user refreshes and chooses again, so it was left as is.
- **Old apps keep offering a pack button after the cutoff.** It explains itself
  with the "Reach your daily goal" message. Hiding it would mean reporting the
  pack as claimed, which isn't true.

Remaining gates, unchanged:

- Real concurrent multi-connection and midnight/DST interleavings are not proven
  by PGlite tests.
- The chosen-reward client (Home progress, picker, grant presentation,
  acknowledgement, developer controls) is not built yet. Publish it first; the
  SQL is installed only after separate approval.
