# Round 78: chosen rewards specification

Status: product direction approved with the user's six amendments on 28 Oct
2026. This is a specification, not an implemented feature or SQL approval.
Round 77 ships the session blink and repeated ended-card fixes independently.
Do not write or install the Round 78 SQL until this specification's remaining
cutoff details are settled. The finished SQL needs separate review before any
live installation. Do not send anything to Claude now; the user will decide
when to request that review.

## Evidence and boundaries

The user relayed Claude's live-database checks: packs are only available for
the current date after its goal is reached, and streak frames use the profile
streak rather than pack-day progression. Those checks are supplied evidence;
Codex did not query the live database while recording this specification.

The branch catalogue and migration sources agree on 24 non-free target items:
12 wearables, seven decorations and five backgrounds. The five priced
backgrounds (`bg_forest`, `bg_meadow`, `bg_night`, `bg_library`, `bg_sunset`)
currently come from packs or the shop, not random trail finds. Intentionally,
after packs retire they remain obtainable through chosen rewards or the shop.
Do not silently add them to the random pool. Earning all 24 exclusively through
chosen rewards would take 120 goal-days; existing ownership, purchases and
trail finds can shorten that. Starter items and milestone rewards are separate.

XP, categories, goals, personal streaks, milestone frames, Stardust purchases,
random trail finds, duplicates and the trail-end bonus retain their existing
rules. No earned item or historical progress is removed. Retire pack-tier
progression, not personal streaks. Rest-day tokens and camp decoration display
come later, after the repaired session flow is confirmed. No new Camp tab,
placement editor, soundscape system or purchasable theme is part of this round.

## 1. Transition from packs

- Use one recorded server rollout instant, not installation, device update or
  first-open time. Derive local launch dates through the existing server
  account-timezone rules. The next local calendar date is the first eligible
  credit date; launch day itself awards no chosen-reward credit.
- Launch day retains its normal current-day pack availability. If already
  opened, it stays opened. An eligible unopened pack can still open that day,
  subject to the normal expiry. Do not fabricate old packs or extend expiry.
- From the first eligible date, stop issuing/opening new ordinary daily packs
  and award goal-day credits instead. A date cannot award both a pack and a
  chosen-reward credit. This exclusivity concerns the daily-goal reward only;
  session XP, Stardust and trail finds still count normally.
- An un-updated app must follow the same server cutoff. Installing an update
  late must not restart the launch-day allowance or backfill earlier dates.

Before SQL, settle the exact rollout timestamp and persist/freeze each owner's
local eligibility boundary at transition. Audit the existing timezone-change
rules and document the resulting policy. A timezone edit must not move an
already-established boundary or reinterpret previously credited dates. Accounts
created after rollout must not receive a fresh pack/credit overlap window.

## 2. Permanent credits and balance

- Record a credit the first time the server confirms an eligible local date's
  daily goal is completed. Keep one permanent row per owner and local date,
  with a database uniqueness constraint. Retrying that date does nothing.
- Do not repeatedly recount mutable `daily_progress.goal_completed` flags as
  the earned balance. Raising a goal or later flag changes must not revoke a
  credit that was already earned. Ordinary goal/reward operations never delete
  or reverse earned credit rows.
- Balance is the count of earned credit rows minus five for each committed
  chosen-item grant. Keep durable grant/spend records so retries can replay
  without spending again. Do not maintain an independent counter that drifts
  from the credit and grant records.
- Days need not be consecutive. Missed days and changing targets remove no
  progress. Credits bank without a target, including when all eligible items
  are owned. Preserve excess credits after a grant.
- Accepted late offline sync can qualify a date on or after the cutoff, once.
  Pre-cutoff dates remain ineligible even when synced afterwards. The server's
  accepted session date and goal rules are authoritative, not a client claim.

## 3. Targets and four stable offers

- Eligible targets are unowned, non-free wearables, backgrounds and
  decorations from the existing catalogue. Shop items are eligible too.
  Pets, frames and badges/titles remain milestones and cannot be targets.
- Store up to four offered item IDs and their slot order per owner on the
  server. Persist the active target there too. Reopening Home, refreshing,
  reconnecting and changing devices must not reshuffle or reroll the offers.
- Seed/refill from a fixed server catalogue order. When an offered item is
  acquired, refill only that slot with another eligible, not-already-offered
  item. Unaffected slots retain their IDs and positions. Show fewer choices
  when fewer remain; do not add a paid or free reroll mechanic.
- With nothing eligible left, show "All collected" and retain banked days for
  future eligible items. Do not invent a currency exchange or new item here.

## 4. Granting and races

- When a target is set and at least five banked credits exist, grant the item
  as soon as the server processes that qualifying state. This applies both
  after a qualifying completion/sync and when selecting with credits saved.
- Grant exactly one selected item, spend exactly five credits, keep any
  remainder, clear the completed target and refill its acquired offer slot.
  Do not automatically select/grant a second item from surplus credits.
- With no target, keep banking and prompt the user to choose on Home.
- If a purchase or random find acquires the target first, clear that target
  and refill the acquired slot without spending any goal-day credits.
- Acquire the owner's existing wallet-row lock first for target selection,
  session reward claims, purchases and grants. Maintain one consistent lock
  order. Under the lock, recheck the current target, eligibility, ownership
  and balance; a stale request must never spend or grant against old state.
- A target grant racing a purchase cannot charge for an already-owned item.
  A purchase/find that wins preserves the credits; a chosen grant that wins
  makes the competing operation see ownership. Normal duplicate-find rules
  still apply. Replayed requests cannot duplicate grants or spends.
- Keep ownership and expected-owner checks server-enforced and account-scoped.
  Invalid or foreign item IDs cannot change offers, credits or inventory.

## 5. Client compatibility and presentation

- Keep the existing rewards reply and `pack` object in the same shape and
  types. `parseRewardsState()` in older clients requires `pack.date`,
  `goalReached`, `claimed`, `tier` and `daysInARow`. Do not remove those fields,
  change their types, or manufacture pack claims merely to hide old UI.
- Keep `open_daily_pack_v1` callable. From the cutoff it refuses rather than
  disappearing. Use clear copy recognised by old `rewardsErrorMessage()`.
  Proposed wording: "Daily packs have been replaced by chosen rewards. Reach
  your daily goal to earn progress in the latest app." The existing friendly
  matcher accepts `Reach your daily goal`; verify this against both old and
  new clients before SQL review instead of relying on unknown error text.
- Return chosen-item grants through a new additive field, separate from the
  existing pack/session fields. Old clients ignore it and still receive valid
  ownership state; new clients acknowledge/present each grant once. A delayed
  claim or stale cached reply must not reopen an acknowledged reward.
- New JS must accept a pre-R78 server reply with no chosen-reward fields,
  since HANDOFF publishes the client before installing SQL. Activate through
  server capability/cutoff state, not the phone clock or app version alone.
- Use the existing animated finds presentation for chosen items, including
  immediate selection grants. Merge safely with the after-session sequence
  when a session triggered it. Do not stack a second result card or duplicate
  a chosen grant as a separate new-item moment.
- Offer "Wear it" where applicable; never auto-equip or overwrite a saved look.
  Home shows target progress, a choose prompt, or the all-collected state.
  Keep Reduce Motion, haptics, accessibility, offline cached views and the
  existing inventory/reward ownership boundaries.

## 6. Developer testing stays separate

The pack RPC's developer-only goal bypass must not apply to real goal-day
credits or chosen grants. The developer account earns real credits only under
ordinary eligibility rules, even though its normal inventory is all-unlocked.

Extend the existing isolated test inventory with test credits, offers and target
state. Base previews on earned/test ownership, not the all-unlocked override.
Provide an empty/seeded reset so every flow remains testable even if the
developer has genuinely earned every item. Real inventory, credits, currency,
claims, history and stats must be unchanged after success, failure or reset.
Use the same real rules/screens, not a copied simulation, with owner/admission
guards and no fake-user signup or test email. Cover each stage without waiting
for real days or long sessions. Separate test credit insertion from ordinary
credit qualification so no preview shortcut leaks into real rewards.

## 7. Required acceptance evidence before rollout

| Scenario | Required result |
|---|---|
| Launch day, pack opened or unopened | Existing pack rules only; zero chosen credit; no fabricated backlog. |
| Next eligible day, goal met repeatedly | Exactly one permanent owner/date credit and no new pack. |
| Goal raised or completion flag later changes | Earned credit and prior spends remain valid and unchanged. |
| No target, 4/5/12 banked credits | Bank safely; selecting at 5 grants once; selecting at 12 leaves seven. |
| Target switch or target purchased/found early | Credits retained; target/only acquired slot reconciled. |
| Concurrent select, claim, purchase and retry | Wallet lock serialises decisions; one grant/spend; no double charge. |
| Reopen, refresh, reconnect or another device | Same remaining offers, slot order, target and balance. |
| All collected, then new eligible catalogue item | Credits retained; legitimate new eligibility can fill vacant offers. |
| Backgrounds formerly supplied by packs | All five remain selectable when unowned and purchasable at existing prices. |
| Old client before/after cutoff | Existing payload parses; pack refusal is readable; other rewards still work. |
| New JS before SQL | Missing capability/fields retain a working legacy rewards flow. |
| Accepted late offline sync and replay | Eligible date credits once; pre-cutoff date never credits. |
| Midnight, DST, timezone change, late app update | One credit per authoritative date; fixed boundary; no overlap/reset. |
| Account switch, foreign owner or stale callback | No cross-account read, grant, balance, selection or presentation. |
| Ordinary developer goal not met | No real credit/grant despite developer pack bypass. |
| Test inventory/reset and failed preview | Same screens/rules; real state unchanged; empty test path remains available. |
| Result/finds/map, immediate grant, Reduce Motion | One acknowledgement/presentation per grant; no auto-equip or blocked exit. |

Before implementation, reconcile the supplied live findings with current
read-only function/catalogue metadata and the branch migrations. Resolve any
differences explicitly. SQL must be reviewed before live execution. All native
work, including merging the two ongoing notifications, still waits until
November 2026; no APK/publication/database change is part of recording this spec.
