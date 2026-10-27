# Round 75: developer reward and time-based testing

Base: `origin/feature/next` at `98086253ffbec3dcda0d350734552bded2f15829`
(the pushed Round 74 tree). One local commit for Soon Teck to apply and publish.

## What the developer account can test

Settings > Developer now includes **Developer: no waiting** and
**Developer: purchase testing**. The existing server allowlist gates this
entire section. No username or email is used as an authorisation check.

| Control | What actually runs | Time needed |
|---|---|---|
| First session / goal / combined | The shipped `DailyAchievementMoment`, including its close fade | Immediate |
| Walk back, result and trail | The shipped `SessionBackdrop`, preview `SessionResultSheet`, then `ExpeditionReveal` | The short walk animation only |
| Early End / offline saved / rejected result | The shipped result component with its corresponding state | Immediate |
| Completed trail / already completed trail | The shipped return/map, with frozen 120-minute / later-session preview endpoints | Immediate |
| Start with locked items | Owner-verified developer RPC, empty test inventory, 500 test Stardust | One request after SQL approval |
| Unlock all items, On / Off | Developer test inventory ownership override | Immediate |
| Set test Stardust | Zero, exact common/uncommon/rare price, 500 or 5,000 | One request |
| Get any item or milestone | Existing server `give()`, then shipped item/milestone presentation | One request |
| Get a duplicate | Existing `give()` duplicate conversion, then shipped return screen | One request |
| Roll a find | Existing find roll and grant, then shipped return screen | One request |
| Canvas / Leather / Brass / Crystal pack | Existing pack RPC at the selected tier, then shipped `PackReveal` | One request per pack, repeatable |
| Start test collection over | Discard only test state, lock test items again, restore 500 test Stardust | Immediate |
| Return to my real collection | Discard test state; resume real cached inventory and wallet | Immediate |

The existing level-colour preview, level-up/recovered/saving previews,
guide/intro replay and real reward-grant controls remain available. Real
reward grants are now explicitly labelled as real mutations. The old button
that took back earned pets/frames/badges is disabled, and the milestone button
no longer deletes real inventory when it runs out of milestones to grant.

### Test inventory, not a second account

- Only **Outfits and these developer controls** opt into test inventory.
  Home, Profile, ordinary sessions, reward claims, history, XP, goals and squads
  continue using the real account. A banner explains this in Outfits.
- Buying uses the ordinary item selection, price, confirmation, ownership,
  saved-look validation and Outfits controls. A saved test look stays in
  Outfits with a message, rather than returning to a Profile that shows the
  real look.
- Test state exists only in memory, scoped to account ID **and auth admission**.
  It is not written into real reward caches or seen/claim ledgers. Closing
  the app discards it. Account changes cannot inherit or reopen it.
- Starting test mode requires the server's developer check to succeed.
  Until the new SQL is approved and installed, the action explains that the
  Round 75 database update is needed. There is no automatic retry loop.
- Closing the lab invalidates pending replies. Reset/restore synchronously
  discard outfit drafts before a real Save control can accept them; old
  purchase/save callbacks cannot navigate or publish feedback into the new
  inventory scope.
- Previews are unavailable during a real running session and close on an
  account/admission change or backgrounding. They do not claim celebrations,
  create focus sessions, advance streaks, spend real currency, or add squad
  credit. They are **presentation checks**, not proof of a real Android
  background/notification/protection round trip. A one-minute real session
  still checks that integration.

## Database proposal, not installed

`supabase/migrations/20261027152957_round75_developer_reward_lab.sql`
was created with `supabase migration new`. The delivery copy is
`round-75-developer-reward-lab.sql`.

It adds one function, `public.dev_reward_lab_v1`, and changes no existing
function, table, schema, RLS policy or ordinary-user reward rule. Execution is
revoked from PUBLIC/anon, granted to authenticated, and refused unless both
the expected owner and the private developer allowlist match.

The function validates a bounded test snapshot, runs the **existing** purchase,
avatar, pack and gift functions inside a PL/pgSQL exception subtransaction,
captures their JSON result, and **unconditionally rolls back the subtransaction**
before returning. Failure/cancellation also rolls back its setup. No test
wallet/inventory/claim/event row is committed. Event sequence numbers may have
harmless gaps, as with any rolled-back PostgreSQL transaction.

Read-only live metadata checks confirmed the expected existing RPC signatures,
that the new RPC is absent, and that reward tables have no custom triggers.
No live data mutation, Auth request, test email, SMTP setup, migration install,
EAS publication or native build was performed.

The proposal contains owner-scoped DELETE statements **inside the block that
always rolls back**. Under HANDOFF section 4.2, Soon Teck reviews and runs this
file in the SQL Editor himself **after approval and after publishing the JS**.
Do not automatically apply it. All existing clients/RPCs remain compatible.

## Verification

- Typecheck and full Expo lint; explicit lint of changed test files.
- Full isolated app/SQL suite: **1,764 Node tests passed**, zero failures/skips, with external networking blocked. Fingerprint `49308616e025891eba4e874277a734a7281f16bb` and every native input match the R74 base in this checkout. Delivery verification records the patch and ZIP checks.
- The SQL file passes 11 Node tests: one contract check, one database parent and nine database scenarios. They cover every catalog item, all four
  pack tiers, duplicates, exact/insufficient funds, already-owned and unsold
  items, avatar validation, invalid inputs, allowlist/owner/anonymous denials,
  and protected real-account reset. Complete row snapshots of the wallet,
  inventory, avatars, events, pack claims, claimed sessions, activity sessions,
  daily progress and profiles match before/after success **and failure**.
- Real rewards-hook integration tests verify test buys/saves never change the
  real cache, Home wallet/look, normal reveals or seen ledger. UI tests use
  the production React compiler as well as the normal loader. They check
  real component selection, Done/dismiss ordering, owner fences, live-session
  exclusions and the reset/restore draft boundary.
- Final presentation review reproduced a missing duplicate-refund amount in
  the new pack preview (10 displayed rather than the real 10 + 5 total).
  The preview now uses the same pack-plus-refunds total as the ordinary flow.
  The affected developer/Outfits tests, typecheck and lint were rerun after
  this final one-line correction; the SQL and normal pack rules are unchanged.
- Actual TSX rendered through React Native Web: Outfits at 360x640 (font 1
  and 1.8) and 412x915, plus developer rows at 360x640 (font 1 and 1.8).
  No horizontal overflow; all 21 new developer row targets are at least 56px.
  The optional wrapped settings-row layout applies only to the new controls.
- Android native frame pacing, gesture handling, real network recovery and
  foreground services are not verified by browser/component previews.

## What remains next

This round makes the **current** time-gated/reward flows testable. It does not
claim that chosen rewards or rest-day tokens already exist. The agreed product
upgrade follows this foundation: choose an item to work toward over five
non-consecutive daily-goal days, keep random finds as bonuses, and review a
Stardust-priced rest-day token with a holding cap of two. Its price and exact
server streak rules still require a concrete proposal and approval. Add matching
no-wait developer controls alongside those real features, not pretend screens
for functionality that has not been implemented.

All native work, especially combining the two protected-session notifications,
remains deferred to **November 2026**. No native/config/dependency changes here.

## Short phone check

1. On the developer account, try all three daily celebrations and the
   walk-back/result/trail sequence. Done appears; no real progress changes.
2. Try early End/offline/rejected results and both finished-trail states.
3. After approved SQL: Start with locked items, then Open test Outfits. A
   locked item has its normal price and purchase confirmation. Buy it, see it
   become Owned, save a test look. Home/Profile still use your real account.
4. Set test balance to zero; try buying. Set the exact price and buy. Toggle
   Unlock all items on/off. Reset test collection to repeat purchases.
5. Grant any pet, frame, badge or decoration; try duplicate and each pack tier.
   These use the real presentations and item rules, with no waiting.
6. Return to the real collection or close the app. Real items, Stardust, saved
   appearance, sessions and stats match their original values. Normal account
   **st** sees no Developer controls or test banner.
