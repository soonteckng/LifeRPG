# Round 80: synced celebrations and chosen-reward SQL review

29 October 2026. Base: pushed Round 79, `11ee00e`. This round ships a JS
celebration fix and a review-only SQL proposal. **Do not run the SQL yet.**
The chosen-reward client is not built or enabled in this round. The current
daily packs, finds, XP, inventories and goals continue unchanged.

## Confirmed bug and fix

Round 79 explicitly excluded `syncSummary` from the ordinary receipt's
celebration capture, and its catch-up host never queued encouragement. That
also excluded the daily-goal message. The summary's summed duration cannot
prove either achievement, so removing the exclusion would be incorrect.

The new failing-before-fix regression uses two separate confirmed receipts:
the first proves the first credited session; the later receipt proves the
goal crossing. Daily evidence can now retain both independent receipts, with
the same owner, timezone and credited date. The catch-up host queues that
evidence only when its one map actually finishes fading. The existing global
celebration component and its independent, durable first-session/goal ledgers
then show only unseen achievements. Both may share one celebration.

No cumulative daily counters are summed, no profile goal is guessed, and no
achievement is inferred from an unconfirmed local result. Yesterday's records
stay quiet. Retries with a stored goal crossing still qualify even when the
server's transient `goal_reached_now` flag is false. A previously queued first
receipt can be enriched with the later goal without losing either proof;
stale dismissal callbacks cannot dismiss the enriched request.

The existing summary and one retained map remain. No network call, timer tick,
native code, configuration, dependency or server rule changed for this fix.
Reduce Motion and the current celebration fade remain unchanged.

Developer > No waiting > **Offline sync and celebrations** previews the same
summary, map and combined achievement component, without using real ledgers.
The separate first-session, daily-goal and combined previews remain too.

## Chosen rewards: proposal only

Proposal: `supabase/migrations/20261028185232_round80_chosen_rewards.sql`.
Its CLI-generated filename uses UTC; the work date above uses Kuala Lumpur.

The user agreed to installation time as the rollout instant: that local day's
pack remains available, credits begin the following local day. The migration
records that instant once and freezes existing accounts' current validated
timezone, first eligible date and exact midnight instant. A profile-created
trigger does the same for new accounts using the same global rollout, so they
do not receive a new launch-day window. Changing timezone cannot move the
stored boundary or reopen packs after it. Accepted daily-progress dates still
use the app's existing server rules; old credits are never reinterpreted.

The proposal contains:

- Private, RLS-enabled rollout, account, credit, grant, offer and request tables,
  inaccessible directly to `anon` and `authenticated`.
- One permanent credit per owner/local date, captured when a goal qualifies.
  A later goal edit cannot revoke it. A bounded-by-owner reconciliation fills
  missed qualifying dates; it never replaces the credit ledger with a recount.
  Pre-cutoff, future and pack-awarded dates do not credit.
- Five credits spent per permanent item grant. Excess days bank indefinitely;
  no target, missed days and all-collected states lose nothing.
- Four persistent ordered offers, refilling only acquired/invalid slots in a
  fixed catalogue-ID order. Twenty-four existing items qualify: 12 wearables,
  seven decorations and five backgrounds. Pets, frames, titles and free items
  are excluded. The five pack-only backgrounds intentionally remain chosen/shop
  rewards; their random-find eligibility is not changed.
- Wallet-first serialisation for selecting, claiming, purchasing and granting.
  Revision checks reject stale choices; owner/request UUID records make retries
  replay safely. Buying/finding a target first preserves credits. Grants do not
  auto-equip or automatically pick another item.
- Additive `chosen` state and `chosenGrants` claim fields. Existing pack fields
  keep their shape and meaning. The old pack endpoint remains callable and
  refuses after cutoff with wording the old friendly-error matcher recognises.
  Existing earned items, prices, trail rules, personal streaks and frames stay.
- Durable grant IDs and owner-checked acknowledgement for the future client.
  The future client must quiet matching inventory moments, reuse the finds
  animation, merge session grants into one return and persist acknowledgement.
- A rolled-back developer preview RPC using the same private selection/grant
  rules and earned/test inventory. Its synthetic credits exist only inside the
  rolled-back test transaction. Ordinary developer pack bypass never credits
  real days. The old developer pack preview calls a private legacy pack helper
  so it remains testable after retirement. Ordinary public pack calls cannot
  reach that private bypass.

Existing inventory/event constraints do not admit a `chosen` source. Instead
of altering historical constraints, effort-earned chosen items use the existing
`milestone` source and have their distinct durable identity in `chosen_grants`.
They are not recorded as trail finds or packs. Review this mapping explicitly.

The daily-progress trigger only captures a date; it does not acquire a wallet
lock while completion holds its daily row. Reward processing acquires the wallet
first, then captures/reconciles dates and grants. The first reward read, claim
or selection after qualification grants the selected eligible item. This avoids
an inverse daily-row/wallet lock order with existing completion transactions.

## Read-only live reconciliation

Read-only catalogue/function/column/constraint metadata was queried on 29 Oct.
No auth endpoint, email, user session, purchase, pack, claim, developer RPC or
mutation was invoked. The six exact pre-change function bodies match:

| Live function | Matching branch migration |
|---|---|
| private `state`, public `claim_session_rewards_v1` | Round 66 daily trail |
| public `get_rewards_v1`, `buy_reward_item_v1` | rewards core |
| public `open_daily_pack_v1` | Round 58 rewards cards |
| public `dev_reward_lab_v1` | Round 75 developer reward lab |

The live catalogue has 38 items, the expected 24 eligible targets and five
priced pack-only backgrounds. There was no existing daily-progress trigger.
The earlier handoff uncertainty about the Round 75 lab is resolved: its function
is present and its definition matches. Presence does not mean it was executed.

## Verification and remaining gates

The new celebration test fails on Round 79. It passes with the fix, including
first-only, goal-only, both across receipts, both in one receipt, already-seen,
unconfirmed, older-day, owner/timezone mismatch and stale-callback cases.
Actual catch-up host and global celebration/ledger tests verify ordering.

Fifteen local PGlite scenarios test the proposal (Node reports 17 tests including
the parent and static proposal guard): launch-day packs, fixed
cutoff/new accounts, permanent credits, 5/12-day grants, replay, target switches,
purchase/find ordering, late dates, developer bypass and full rollback, all
collected/new catalogue entry, ownership/permissions, acknowledgement, old reply
shape and wallet-lock order. No external network is available to app tests.
These are isolated SQL tests, **not proof of concurrent multi-connection
Postgres transactions**. Real concurrent select/claim/purchase and midnight/DST
interleaving remain rollout review gates; no live concurrency test is allowed.

Full tests, typecheck, app lint, native fingerprint, patch application and bundle
hash verification are recorded in the delivery's `verification.json`. Android
frame pacing is not verified here.

After SQL review: build the capability-gated Home/choice UI and real developer
controls, handle old-server replies and grant acknowledgements, test it, then
publish that client before separately approving/installing the SQL. Do not
install this proposal with the Round 80 celebration update. Do not message Claude.
Rest-day tokens and camp decorations stay later. All native work, especially the
two ongoing notifications, remains deferred to November 2026.

## Short phone check

1. Install Round 80 by EAS Update. On an ordinary account's first session of a
   new day, finish offline, reconnect, close the single summary and map. The
   unseen first-session celebration should follow once.
2. When a confirmed synced session crosses the day's goal, the goal celebration
   should follow too. If both happened in the batch, both share one message.
3. No long wait required for the visual sequence: Developer > Offline sync and
   celebrations. Existing first-only/goal-only controls test the same components.
   Those previews do not consume real dates or award real minutes.
