# LifeRPG handoff (after Round 74, phone checks in section 7)

Read this whole file before doing anything. It is the working agreement for this
repo. Follow it exactly; when something here conflicts with your own habits,
this file wins. When something is unclear, ask Soon Teck before changing code.
How to deliver a round (patch, bundle zip, SQL, the exact commands and the
reply) is in section 4.2, with a full worked example. Use that exact format.

---

## 1. Where things stand (checked 27 Oct 2026)

| What | State |
|---|---|
| Working branch | `feature/next` (pushed to GitHub `soonteckng/LifeRPG`) |
| Latest delivered round | Round 74 on the pushed R73 tree at `bc4a972f4fbc92c0c2de6c5470e4980cf7b179c3`. Done-only receipt, measured map entrance, fade to app and finished-trail copy. Prepared locally; Soon Teck applies, pushes and publishes. |
| `main` | Many rounds behind `feature/next`. Never commit to `main`. |
| Code health | Round 74: **1,741 tests passed**, zero failures/skips, with isolated PGlite and external networking blocked. Typecheck, full Expo lint and diff checks pass. Return-screen layout checked in 16 size/font/state cases. Native inputs unchanged. Evidence: `docs/round74-session-return.md`. |
| Native fingerprint | Unchanged since Round 58. In a clean Linux checkout it's `de0355adda848fb7ff4453b91b284c71253e25c9`; the installed preview APK's runtime (computed on Soon Teck's Windows repo) is `4f07392040ace293bbe1cdb4176b5b7840d9e9b3`. Both stay the same as long as no native or config input changes. Compare like with like. |
| Supabase project | `msuelivxpsfizkddjjfg` (https://msuelivxpsfizkddjjfg.supabase.co) |
| Round 58 SQL | Applied (some of it by hand in the SQL Editor, so it isn't all in `list_migrations`). |
| SQL | **Round 66 daily trail SQL is applied live** (confirmed 26 Oct: `trail_rules()` = 30-minute finds, 4 stops, +50 bonus; `trail_day()` exists). Nothing pending. The old Round 64 file must never be run. |
| Waiting on the phone | User says the completed-session card is smooth, but wants Done-only dismissal, a calmer map entrance and a fade to app. R74 implements these. Check the short flow in `docs/round74-session-return.md`. Android frame pacing remains unverified. Exact account is **st** (saved username **St**); ownership and reward economics are unchanged. |
| Native work | **Explicitly deferred by Soon Teck until November 2026, after his Expo quota resets.** In particular, combining the countdown and protection notifications is NOT implemented in Round 69. Preserve this in every Claude handoff; see section 10. |

Note: `20261024140100_round58_dev_protection.sql` was run in the SQL Editor, so it
does **not** show in `list_migrations`. That's expected; the live functions match the file.

---

## 2. The product in one paragraph

LifeRPG (name not final) is an Android-first Expo app for students (16–24): you
run focus sessions (routines or study subjects), your focused time grows a
character, and you earn rewards. Two equal halves: **Routines** and **Study**.
Tabs: Home · Routines · Study · Squads · Progress. Profile, Settings and Outfits
open from Home. Theme "Mint": true black, mint accent, warm Apple-like polish.
No guilt or punishment mechanics; no ads during focus, auth or recovery.

---

## 3. Standing rules (non-negotiable)

1. **Don't break existing functions.** Every change keeps current behaviour working unless Soon Teck asked to change it.
2. **Ask first** before any database, auth, dependency or build-config change. Explain what and why, then wait for a yes.
3. **No native or config changes.** The installed preview runtime is `4f07392040ace293bbe1cdb4176b5b7840d9e9b3`. Keep native inputs unchanged and compare fingerprints in the same checkout/environment; do not normalize native files, create a clean LF publishing checkout, or override the runtime to force a match. That means JS/TS only: no new native modules, no `app.json`/`app.config` plugin changes, no new packages with native code. Native work goes on the build list (section 10).
4. **Never touch** `.gitignore`, `eas.json`, or `modules/focus-protection-spike/android`.
5. **Never push to `main`.** Work on a branch off `feature/next` (or a PR into it). Soon Teck merges and pushes.
6. **Never run sign-ups or send test emails**, and never put Soon Teck's email address anywhere (code, logs, requests).
7. **Don't test destructive things on the "Soon Teck" account** (reset, delete, wiping data).
8. **Copy style:** warm, short, plain words. **No em dashes (—) in user-facing text.** Use "·" or a new sentence instead.
9. **Haptics on every button and selection** (use the existing `tapHaptic` / `MotionPressable` patterns).
10. **Must work on any Android phone**, not just Samsung: small screens, large font scale (up to 1.8×), slow phones, Reduce Motion.
11. **Quality over speed.** "Dont rush, quality work, without bugs, without errors, and genuinely impressive for users."
12. Keep the app lean: no unnecessary code, no heavy dependencies.
13. **26 Oct decision: defer all native changes until next month (November 2026), when the Expo build quota resets.** Do not try to combine notifications through JS or silently build a new APK. Keep the pending work in section 10 and mention it when handing off to Claude.

### Accounts

- **"Soon Teck"** is the **dev account**. It has hidden Developer tools, has **everything unlocked** (all outfits and so on), and is **protected**: "Reset my rewards" and "Delete account" are refused for it (server-side, in `dev_rewards_v1` and `delete_my_account_v1`, plus the UI lock).
- **"8k"** is the **normal-user account**. It sees exactly what a normal user sees, with nothing unlocked.
- **"st"** (saved username **St**) is the normal account used for the latest Round 71 statistics and Outfits reports. Do not confuse it with the dev account.
- Developer accounts are rows in `liferpg_auth_private.developers`.

### The dev-tools rule (Soon Teck asked for this explicitly)

> "for all the test functions, for the dev account, i need to see it… make sure its actually the function in the real app for normal users, dont make it like have inconsistency, or not in sync"

Every new feature gets a test or preview control under **Settings › Developer**
(`src/components/DeveloperTools.tsx`). That control must call the **same real
code path and screens** normal users get. No fake copies, no separate
simulations. Example: "Give one find" calls the real find roll and the real
`give()` on the server, then shows the real pop-up.

---

## 4. How each round works

Soon Teck sends a list of issues, usually with screenshots. You fix everything
in the list, verify, and hand back the result.

### 4.1 Verify before you hand anything back (all must pass)

```bash
npm ci                                   # once
npx tsc --noEmit                         # no output = pass
npx expo lint --no-cache                 # no output = pass
npm test                                 # node:test, all must pass
npx expo-updates fingerprint:generate --platform android   # compare before/after in the same environment
```

The installed preview APK accepts runtime `4f07392040ace293bbe1cdb4176b5b7840d9e9b3`.
Publish from `C:\Users\soonteck\LifeRPG`, preserving its existing local `.gitignore`
and native files. The earlier instruction to publish from a clean LF checkout was
incorrect: its `de0355...` runtime produces a successful upload that this APK cannot
load. Do not rebuild or change runtime configuration for a JS-only fix.

**SQL tests** use PGlite and are skipped unless `SESSION_SQL_PGLITE_ROOT` points
at a `node_modules` folder that has `@electric-sql/pglite@^0.4.6`:

```bash
mkdir -p /tmp/pglite && cd /tmp/pglite && npm init -y && npm i @electric-sql/pglite@^0.4.6 && cd -
SESSION_SQL_PGLITE_ROOT=/tmp/pglite/node_modules npm test
```

Always run them when you touch SQL.

### 4.2 Hand-off format (use exactly this)

Soon Teck applies, pushes and publishes everything himself, on Windows
(PowerShell), in his own repo at `C:\Users\soonteck\LifeRPG`. You never push.
Every round he gets the same three things, named the same way, plus the exact
commands to copy and paste:

| File | What it is | How you make it |
|---|---|---|
| `round-NN.patch` | The round as one commit | `git format-patch -1 HEAD --stdout > round-NN.patch` |
| `dist-round-NN.zip` | A prebuilt Android bundle, in case his PC crashes while bundling (Hermes on Windows sometimes does) | the `expo export` command below, then zip the *contents* of the output folder |
| `round-NN-<name>.sql` | Only when the round changes the database | a copy of the new file in `supabase/migrations/` |

**Making them (on your side):**

```bash
# 1. One commit for the round, on top of feature/next.
git add -A src tests docs supabase
git commit -m "Round 74: <short summary>" -m "- <what changed, one line each>"

# 2. The patch, then prove it applies cleanly to the commit before it.
git format-patch -1 HEAD --stdout > out/round-74.patch
git branch -f check HEAD~1 && git checkout -q check && git am -q out/round-74.patch \
  && git diff --quiet <your-branch> && echo APPLY_OK; git checkout -q <your-branch> && git branch -D -q check

# 3. The backup bundle.
EXPO_PUBLIC_SUPABASE_URL=https://msuelivxpsfizkddjjfg.supabase.co \
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_SnrSnQ57XXmmqRU5_mZtbA_n7taPkkw \
npx expo export --platform android --clear --output-dir dist74 --dump-assetmap
(cd dist74 && zip -qr ../out/dist-round-74.zip .)
```

Then send him the files (he downloads them to `Downloads`). Don't paste a
patch into the chat.

**The commands you give him (worked example, Round 74):**

```powershell
git am "$HOME\Downloads\round-74.patch"
git push
npx eas-cli update --channel preview --environment preview --platform android --message "Round 74: <short summary>"
```

If Windows crashes during the bundle step:

```powershell
Expand-Archive "$HOME\Downloads\dist-round-74.zip" -DestinationPath dist -Force
npx eas-cli update --channel preview --environment preview --platform android --message "Round 74" --skip-bundler --input-dir dist
```

If the round has SQL, it always comes **after** publishing: "Open
`round-74-<name>.sql`, paste it into the Supabase SQL Editor and run it."
Older installed versions may still call what the SQL changes.

If a patch was built on a commit he doesn't have yet, say which patch goes
first (`git am` the earlier one, then this one).

**Your reply to him (shape, keep it short):**

1. One line: what this round fixes, plus tests / typecheck / lint / fingerprint status, and whether there's SQL.
2. The commands above, in that order.
3. Answers to any direct questions he asked.
4. What changed, grouped by the points he raised, in plain words (no code names).
5. What still needs checking on his phone.

Other notes:

- Migrations that only add or replace functions can go through the Supabase tool (`apply_migration`) after he agrees. Anything with `drop`, `delete` or `alter table`: he runs it in the SQL Editor, and the file goes under `supabase/migrations/`.
- Updates often need the app closed and reopened twice to load. That's normal for expo-updates.
- He replies with screenshots and numbered issues. Fix all of them in one round unless he says otherwise.

---

## 5. Architecture map

Stack: Expo SDK 57, RN 0.86.3, React 19.2, expo-router 57, Reanimated 4.5,
react-native-svg 15, @gorhom/bottom-sheet 5, supabase-js 2. The repo's
`AGENTS.md` says: read the exact versioned Expo docs (v57) before writing Expo code.

| Area | Files |
|---|---|
| Routes | `src/app/_layout.tsx` (stack and modal options), `src/app/(tabs)/*` (Home is `index.tsx`), `src/app/session.tsx`, `outfits.tsx`, `profile.tsx`, `settings*.tsx` |
| Session timer | `src/context/TimerContext.tsx`, `src/services/sessionTimerController.ts`, `sessionService.ts`, `offlineSessionService.ts`, `globalSessionLifecycle.ts`, `src/components/SessionScreen.tsx` |
| Session scene | `src/components/session/SessionBackdrop.tsx` (one scene: dusk → night → morning), `TrailScenes.tsx` (the drawing, palettes, FireGlow, Fireflies) |
| Session result | `SessionResultSheet.tsx`, `LevelUpModal.tsx`, `CompletionDetails.tsx`, `ArrivalBanner.tsx` |
| Protected sessions | `SessionProtectionContext.tsx`, `nativeFocusProtection.ts`, `protectedSessionStart.ts`, `SessionProtectionControl.tsx` (one 5-min break per session) |
| Rewards client | `src/hooks/useRewards.ts` (exports `useRewards` and `rewardsStore`), `src/services/rewardsService.ts`, `rewardsStore.ts`, `rewardCatalog.ts` |
| Rewards UI | `RewardMoments.tsx` (pop-up host; "See it in Outfits" visits and returns), `GlobalRewardListener.tsx`, `rewards/RevealScreens.tsx` (finds card, then the trail; pack screen), `rewards/TodayTrail.tsx` (the map, draws on first layout; accessible host scrolls if large text needs space), `rewards/TrailSheet.tsx` (the map from Home), `rewards/PackArt.tsx` |
| Profile picture | `adventurer/ProfilePicture.tsx` (pet top right, streak top left, level in a drawn pill below the ring: `levelPill(size, level)` gives its size and the extra height), `CharacterMark.tsx` (you, everywhere) |
| Level colours | `utils/adventurerLook.ts` `tierColor` / `levelColors` (= the level-road tier colours), `services/levelPreview.ts` (developer-only preview of another tier) |
| Outfits | `src/app/outfits.tsx` (`outfitsOpening(id)` deep-links to the item's category), `components/adventurer/*` |
| Collection | `components/rewards/RewardCollectionSheet.tsx`: read-only owned decorations, opened from Outfits' header or `?collection=1` / `?show=decor_easel`; same cached inventory, no new request or camp placement |
| Home | `src/app/(tabs)/index.tsx`, `SavedRoutinesCard.tsx` (the Start card and its See all sheet) |
| Developer tools | `src/components/DeveloperTools.tsx`, `services/developerAccess.ts` |
| SQL | `supabase/migrations/*.sql` |
| Tests | `tests/*.test.cjs`, `tests/helpers/*` |

### Rewards rules (current)

- **Stardust:** 1 per 5 focused minutes; spent in Outfits on items you haven't found. A **find** at each stop of today's trail: every 30 eligible focused minutes of the day, up to 4 (120 minutes), then +50 Stardust for the trail's end (Round 66 SQL, live since 26 Oct).
- **Daily supply pack:** opens once you reach your **daily goal** (default 30 min). Tiers climb with days in a row. The dev account can open it any time from Developer › Rewards (the same `open_daily_pack_v1`, with a dev bypass on the server).
- Pets, streak frames and badges are milestones. Frames upgrade on their own (no choosing).
- Server side, everything is in the private schema `liferpg_reward_private`, reached through `SECURITY DEFINER` RPCs in `public`. Each RPC takes `p_expected_owner` and checks it with `liferpg_reward_private.signed_in()`; `EXECUTE` is revoked from `anon`.
- The client store keeps per-owner snapshots with `moments` (small pop-ups) and `reveals` (full screens: expedition or pack). Seen state is kept in AsyncStorage. The pop-up host waits for other sheets (`sheetActivity`) plus `SETTLE_MS = 450` and shows reveals before moments.

### Session flow after Round 59

1. Start runs the walk-away **before** the session starts (Round 62): you walk away from camp at dusk (`WALK_MS` 2400), then the same scene fades to a very dark night (`NIGHT_FADE_MS` 2000), and only then is `startTimer` called, so the walk takes none of the session's time. Tap anywhere skips (the session starts after the quick fade). Back during the walk cancels it and stays on setup. The night stays up until the session shows as started (`launching`, 4 s fallback; a failed start shows setup again). No walk with Reduce Motion, on Retry, or for a session that's already running.
2. Night until the **last 10 focus seconds** (`DAWN_SECONDS`, Round 69), then a linear fade over the remaining focus seconds. Pause or the protected break freezes the light; Resume continues to the focus deadline. A reopened completed session shows morning immediately; early End returns to night. Ordinary timer ticks do not redraw the scene or restart dawn. New sessions and edited routines require 60 seconds to 8 hours; old short sessions, history and pending sync records remain readable and recoverable.
3. The 5-min break asks first ("Take your 5-minute break?" with Start break / Keep focusing).
4. On a fresh finish witnessed inside the timer, the character walks back to camp for 1.8 seconds before the result card. It is presentation only; Reduce Motion, recovered results and early End skip it. A bounded fallback and route/account/background cleanup release the card if the animation is interrupted.
5. On finish, the reward claim starts as soon as the summary arrives (`claimKey`). After Done, `SessionScreen` **holds the exit** and shows the session's return screen **itself** (`components/session/SessionReveal.tsx`: the finds card if anything was found, then today's trail walk). Order: walk back → result card → finds → trail → back to the app. While the claim is still in flight it waits up to 15 s; while the return screen shows there is no time limit (you close it). Continue or Back fades the return into the app; the map stays mounted until the native fade finishes. `RewardMoments` never shows an expedition reveal while on the session route or while the session screen hosts it (`sessionRevealHost` in `services/sessionReturn.ts`, e.g. Outfits opened from the finds card); one that arrives after you left shows on Home as before.
6. Widget/deep-link launches (`routine-start.tsx`) use `router.dismissTo("/session")`, never `replace`: `REPLACE` ignores `dangerouslySingular` and stacked a second session screen. `SessionScreen` also recovers a close whose pop was lost (`LOST_EXIT_MS`), so a hidden, input-locked screen can't freeze the app.
7. The reward claim result is written to the private session record (`sessionTrail("rewards claim")`, share with Settings > Developer > Share session log), plus `result closed`, `reveal shown`, `reveal closed`.
8. Round 74: the receipt closes only through Done, fading the whole result modal for 400 ms (ordinary sheet fades still default to 220 ms). Only its actual dismissal notifies the session screen and acknowledges the result. SessionReveal then waits for measured content before a 520 ms entrance. Finds fade out for 320 ms before a measured map fades in for 520 ms. The final 480 ms fade has no downward translation and acknowledges the map only when hidden. Repeated callbacks, an account/admission change and a replacement running session are fenced. Reduce Motion swaps immediately.
9. Round 69: widget/purple-bar entry explicitly requests one presentation-only slide on the retained session route. Returning from Outfits does not replay it. A motion generation prevents an old close callback from popping or snapping the new entrance. Focus recovery runs on actual route focus, not ordinary timer-id/picker updates.

---

## 6. Testing conventions

- Tests are plain `node:test` files (`tests/*.test.cjs`). Each loads a TS/TSX source with `ts.transpileModule` and a **per-file mock map** keyed by the exact import specifier (for example `'./AppText'`). If you add an import to a component, the tests that load it need that mock, or they fail with "Stripping types is currently unsupported for files under node_modules" or "Unexpected token 'typeof'".
- Shared mocks: `tests/helpers/arrival-banner-mock.cjs` (the result card's banner) and `tests/helpers/rewards-store-mock.cjs` (`set()` and `reset()` to drive pending reveals).
- `tests/helpers/no-external-network.cjs` blocks real network calls in tests. Keep it that way.
- Add tests for every behaviour you add or fix. Prefer behaviour tests (render, press, assert) over source-regex tests.
- Visual check: if you can, render changed screens (react-native-web + Playwright works) and look at them before handing back. Check night really is dark, nothing clips at fontScale 1.8, and nothing overlaps on a 360×640 screen.

---

## 7. Your first task, and the review checklist

**First: check Round 74's short completed-session flow.**
The user reports the completion card itself is smooth. It now closes only
through Done, fades out for 400 ms, and the return waits for the actual map
commit before its 520 ms entrance. Finds > map uses 320 ms out / measured map /
520 ms in. Continue keeps the map mounted during a 480 ms fade into the app,
then acknowledges it and pops. A running timer still minimises by sliding.
Reduce Motion is instant. Finished trails say Trail complete / Finished for
today; later sessions stay at the end. Pending finds and frozen earlier-day
progress remain truthful. See `docs/round74-session-return.md`.

The new ordering tests reproduce the old failures before the fixes, including
production compilation. Browser layout covers 16 small/large/font-1.8 cases;
actual Android frame pacing still needs the phone. Existing Developer receipt
and real return/empty-return controls exercise the same screens. All R73
Collection behaviour and hidden-animation cancellation remain intact.

Chosen rewards, rest-day tokens and camp placement were discussed next. They
are not installed or implemented in R74; the transition round is independent
and new server rules need review/approval. No live Supabase/Auth calls, email
or native/config/dependency changes are part of this round. The notification
merge and every other native change still wait until November 2026.

### Previous Round 71 reports and findings

**Round 71 acceptance reference:** See
`docs/round71-stats-and-outfits.md` for reproductions and the short combined check.

**Latest: Round 71 reports and findings.** Soon Teck tested R69+R70 using **st**:

1. Closing "A good start" glitches. A production-compiled regression proves the
   completed fade was reset to opaque during native dismissal. It now stays
   transparent until reopened; Reduce Motion remains immediate.
2. Progress Today says 6m, category detail 9m 20s. Read-only records reconcile
   6m today plus 3m 20s yesterday. The detail displayed a period total over a
   day-filtered list. It now uses exactly the displayed rows and the matching
   day/range subtitle. Related Profile alias/unassigned-session grouping and
   cached-refresh paths are audited with tests; no historical data or XP repair.
3. Occasional result stutter. Duplicate arrival-layout measurements no longer
   schedule redundant scene commits. React Compiler already caches the SVG;
   don't claim redraw-per-frame or complete native jank elimination. Device
   frame pacing still needs checking.
4. Outfits set chip covers the character. The chips now reserve their own row.
5. Outfits details/Get action too far down, ownership and green dots unclear.
   Details now sit with fixed actions; short/large-text layouts scroll only the
   preview/catalogue while tabs and actions stay reachable. Owned/Wearing and
   locked Preview/Not owned are explicit. Ambiguous rarity/equipped-slot dots
   are removed. Save/purchase/inventory-conflict checks are unchanged.

Exact-account follow-up resolved the earlier item uncertainty: **st owns Field
jacket and Easel**, not Canvas tote. The pack's duplicate Easel gave Stardust.
Easel is camp decoration and currently has no section in Outfits; no inventory
loss, manual grant or new camp editor is claimed. Goal schedule is 30 minutes
from 26 October while profile baseline remains 60, intentionally. The live
account completed another session during diagnosis, so the 6m/9m20 snapshot in
the round note is timestamped, not a forever-current total.

No SQL/auth/email/native/config/dependency changes or publication. **Combining
notifications and all other native work still wait until November 2026.**

### Previous Round 70 reports (history)

**Round 70 addressed additional Round 68 reports.** Soon Teck had not
tested Round 69 yet. Keep its fixes and apply Round 70 after it. See
`docs/round70-background-recovery.md`.

- A 45-minute background session walked back, a pop-up flashed/disappeared and
  another appeared after dismissal. A repeat-find queue race is reproduced and
  fixed: an already-running refresh could requeue an item after its reveal was
  acknowledged. This does not prove every native/modal flash has the same cause;
  phone timing remains unverified.
- A find and the daily pack may both have shown Canvas tote, but Profile looked
  locked/empty. **Do not claim inventory loss or recovery is proven.** Tote is
  Gear → Bags, not a Profile frame/pet/badge, and it does not auto-equip. A common
  duplicate is 5 Stardust; the UI now visibly says Already yours. The exact
  account/item were not confirmed. Only read-only function inspection and an
  aggregate recent-tote check were made; the aggregate had no matching normal
  account events and establishes nothing about the user's specific inventory.
- Progress sometimes updated only on manual refresh. Old Home prefetches could
  be accepted as post-completion reads in Progress and Profile growth. Both are
  fixed with invalidation and stale-response fencing. Account switches cannot
  show the previous owner's Progress history or let their jobs interfere with
  another owner's Profile request. Done cannot revive an invalidated cache.
- Outfits no longer presents unknown inventory as an empty locked collection.
  It shows loading/unavailable feedback and an explicit owner-verified retry,
  reusing the existing five-second request guard. Cached ownership stays visible
  on a failed refresh. A read skipped by a busy failed claim remains retryable.

No database, auth, native, config or dependency changes were made. Native work,
especially combining notifications, **still waits until November 2026**.

Round 69 evidence and limits: `docs/round69-session-polish.md`. The user explicitly
deferred **all native changes to November 2026**. No database/schema, native,
config or dependency changes are part of this round. Do not claim the native
notification duplication has been fixed.

1. **Widget interaction removes the purple-bar slide-up entrance.** Fixed with an explicit entry request for the retained route, stable focus handling and stale-close callback fencing. Check repeated widget → timer → dismiss → purple bar cycles without killing the app. Returning from Outfits should preserve its existing return, without replaying this entrance.
2. **Two ongoing notifications during protected focus.** **Deferred, NOT fixed.** Countdown and protection are separate Android foreground notification owners. Combining them safely needs coordinated native lifecycles and a new installed build in November. See section 10; include this in the Claude handoff.
3. **Done → finds/trail transition looks abrupt.** The result now fades out before the session's return screen begins. Check both no-find and real-find sessions, repeated Done, Back, offline and Reduce Motion. The same saved result and reward claim paths remain in use.
4. **Different widget routine while another session runs looks too plain.** The message uses the app's card, colours, activity detail and pinned Return action. Only that notice was restyled. Small screen and large text were rendered on web; native frame pacing remains unverified.
5. **Dawn should start only in the final 10 seconds; duration must be at least one minute.** Check 1-minute and longer focus, pause/break in the final 10 seconds, background/reopen and Reduce Motion. Just focus, routine editors/play, widget launches and Study share the minimum. Existing sub-minute saved routines need editing before a new start; their data, queued changes and old session recovery are preserved.

### Previous Round 67 reports and Round 68 diagnosis (history)

Round 68 fixes and reproduction evidence are documented in `docs/round68-session-flow.md`.
The production-compiled result gate was reproduced failing before its fix. The
stationary map and squad fixes reduce measured render/subscription work; actual
Android frame pacing remains a phone check. Widget history cleanup and stale-intent
fencing have stack-level regression tests. If a flow still stalls, share the log
immediately using Settings > Developer > Share session log.

Original Round 67 diagnostic request: capture the on-phone session log after issue 2. The version text is selectable, so the long press did not open sharing. Round 68 adds the visible dev-only button instead. Since Round 67 the log records `timer`, `app`, `rewards claim`, `result closed`, `reveal shown`, `reveal closed` and `exit recovered` with times. Read it if the phone issue persists; it shows which step stops. The user explicitly requested a test-based reproduction without waiting for that unavailable log.

1. **Today's trail sheet (Home map button) still stutters when opening.** The 30/120 rules are fine. Round 65 drew the map after the slide (smooth, but the map popped in late, which he disliked). Round 66 drew it on first layout (stutter). Round 67 draws it before the slide with a size guess (`TrailSheet` `initialSize`), then the remembered size (`TodayTrail` `sizeKey`), and delays the refresh 450 ms. Still stutters. Ideas to measure, not guess: how much of the cost is the `ProfilePicture` avatar on the map, the band gradients, `useAnimatedProps` on the walked line, the `AppSheet` Modal + `GestureHandlerRootView` + bottom sheet mount itself (compare with another expanded sheet of similar size), and any `useRewards` subscriber re-render (Home) during the slide. Options: a lighter first frame (static map image of the trail, avatar added after), `renderToHardwareTextureAndroid` on the map while the sheet animates, or keeping the sheet content mounted. He wants it to open smoothly **with** the map already there.

2. **After a session ends, nothing follows the walk back (most important).** What he sees: the character walks back to camp, then nothing. No result card, no Done. Swipe-down no longer closes the session screen; only Back does. After he leaves with Back, the session complete card appears (on Home). He taps Done (1-minute session, nothing found), then it fades to "On your way" (the trail). Expected, all automatic on the session screen: walk back, result card, Done, finds card (if any), trail. A session with no finds still gets its screen ("On your way").
   - The card only appearing once the session route is left points at `GlobalRewardListener`: `shown = visible && introDone && !returnKey`, and `returnKey` is only non-null while `insideSession` (pathname `/session`). So `returnKey` probably stays set after the walk. Check `sessionReturn.begin/finish/completed` (`services/sessionReturn.ts`), the 2,150 ms fallback in the listener's layout effect, `SessionBackdrop`'s `onReturnEnd`, and whether `timer.sessionId`/`presentationScope` change at completion in the real `JournalTimerProvider` (the key is `[scope, sessionId]`). A different key would never be marked completed.
   - Another possibility: the result sheet (an `AppSheet` RN `Modal`) doesn't present over the session route when it becomes visible after the walk. Before Round 66 it opened at completion with no delay.
   - Swipe-down being blocked: `SessionScreen` pan guard includes `rewardsVisible` (from the timer provider, true at completion). With the card hidden he is stuck. Make sure the screen is never left with no way forward.
   - Round 67 moved the finds/trail screen onto the session screen itself (`components/session/SessionReveal.tsx`, shown while `holdForRewards`, after the card's Done). Keep that design, but it only starts after the card, so the card must appear.
   - Tests `tests/round67-after-session.test.cjs` and `tests/global-session-result.test.cjs` pass with mocks, so the bug is in what they don't model: the real timer provider's completion state sequence, real `SessionBackdrop`/reanimated callback, real `AppSheet`. Write a test that uses the real provider's completion shape, reproduce, fix, and keep the existing tests green.

3. **Widget with a *different* session already running.** Round 67 fixed the double session for the same routine. Still broken: a session is running, he taps a widget for a *different* routine. He lands on the running session (correct, only one can run), but then gets the same bug as before: dismissing reveals a second session screen behind it that freezes, or the app shows with the purple bar pinned and freezes. `app/routine-start.tsx` already calls `router.dismissTo("/session")` when a session is open. Check how the Android widget intent enters the app in that state (deep link handling may push or reset the stack differently from the same-routine case), what the stack looks like after (`navigation.getState()`), and whether `routine-start` itself stays mounted under the session. The `SessionScreen` lost-exit recovery (`LOST_EXIT_MS`) only covers a lost pop. Add a stack-level test like the existing StackRouter one in `tests/routine-widget-launch.test.cjs`. Also tell him plainly in the app that a different session is running (warm copy, no em dashes), rather than silently switching.

4. **Small lag when tapping the squad card on Home**, and sometimes animations feel like they drop frames across the app. Profile the squad card press (what mounts: `SquadSheets` player cards with full `ProfilePicture`/`CardCharacter` SVGs, `useRewards`/`useSquads` refreshes) and look for heavy work on press or during sheet opening. Report what you find before large changes.

Codex already reviewed `feature/next` after Round 59 (Rounds 60 and 61 came out of it). Use the list below when he asks for another review, or when a fix touches these areas. Report findings ranked by severity, each with a concrete failure scenario, and fix only after he agrees (crash or data-loss bugs: fix with tests).

### 7.1 Areas Claude flags as most likely to hide bugs

**Session and rewards ordering (newest code, highest risk)**
- `SessionScreen.tsx` hold-for-rewards: the claim fails offline or never resolves (busy stuck?); a reveal arrives *after* the exit; the account switches during the 15 s hold; Done pressed twice; the app is backgrounded during the hold; a `settled-session` exit and a `globalSessionLifecycle` exit both firing.
- `RewardMoments.tsx` `claimKey`: a double claim racing with the app-open claim; idempotency relies on `liferpg_reward_private.claimed_sessions`, so confirm two concurrent `claim_session_rewards_v1` calls can't double-award (row locks or unique constraints).
- Reveals shown inside the session route once no session is open: make sure they never show during a live session, and never over the End or result sheet.

**Intro and scene**
- `SessionScreen` intro state is derived during render (`introSeen`), using the heuristic `duration - timeLeft <= 2` plus `recoveredSession`. Check: a fast tap Start → End; a restore right after start; Reduce Motion toggled mid-intro; unmount and remount mid-intro; break or pause during the intro.
- `SessionBackdrop.tsx`: `endRef` is refreshed in `useEffect` (after layout effects), so a synchronous finish would call the previous `onIntroEnd`. That's harmless on device today (the finish is ~4.4 s later), but confirm. Also check the skip token racing the natural end.
- **Still unconfirmed on a real phone:** the running → break transition stutter, and the timer jumping position. Investigate `SessionScreen` phase layout and animation (timer stage `onLayout`, `introFade`, details/actions motion).

**Timer and offline**
- Midnight crossing during a session (daily goal, pack day, today's trail reset), timezone changes, phone clock changes.
- Offline start → online finish; app killed mid-session; notification "End" arriving late (several tests cover this; don't regress them).

**Rewards server**
- `open_daily_pack_v1` at the day boundary; `last_pack_date` and streak tiers after the dev `reopen_pack`; `local_today()` across timezones.
- `buy_reward_item_v1` with exactly enough Stardust, concurrently twice; `save_avatar_v1` with a stale `p_expected_revision`; equipping an item you don't own.
- `get_player_card_v1`: only squad-mates can read a card (no stats leak to strangers).

**UI edge cases**
- `TodayTrail.tsx` auto-scroll reruns whenever `here.y`/`height`/`viewport` change, so a changing `seconds` prop would yank the user's scroll. It's static in the reveal today; guard it if it ever goes live.
- SVG gradient ids are fixed strings (`arrival-sky`, `fire-glow`, `sky-<light>`). Check two mounted copies don't clash on Android.
- Outfits deep link (`?show=<item>`) seeds a "tried on" draft from `saved` on the first render. If rewards haven't loaded yet, the draft is based on stale data.
- Home header at fontScale 1.8 with a long name and a large Stardust number; the Start card with 0 routines and many subjects.

### 7.2 Supabase advisor findings to review (report, don't change without approval)

- `public.handle_new_user()` is executable by `anon` and `authenticated` as `SECURITY DEFINER`. It's a trigger function (direct calls should error), but consider `revoke execute ... from anon, authenticated`.
- `public.username_sign_in_email_v1(p_username, p_password)` is callable by `anon` by design (username sign-in). Confirm it's rate-limited (`liferpg_auth_private.username_sign_in_failures`) and doesn't reveal whether a username exists.
- 42 `SECURITY DEFINER` RPCs are callable by `authenticated`. That's intended, but each must verify the caller (`auth.uid()` / `p_expected_owner`). Spot-check every one.
- Leaked-password protection is disabled in Auth settings (a dashboard toggle; suggest it to Soon Teck).
- Performance: 13 RLS policies on `profiles`, `subjects`, `tasks`, `daily_progress` and `activity_sessions` use `auth.uid()` instead of `(select auth.uid())`; 10 unindexed foreign keys; `join_attempts` has no primary key. These are low priority and need approval as DB changes.
- 23 private tables have RLS on with no policies. That's intended: they're only reached through definer functions.

---

## 8. On hold (don't start unless asked)

- **Session setup screen redesign** (Soon Teck has put it on hold).
- Guide/tour redesign (waits until UI and features settle).
- AI-generated routine ideas.

---

## 9. Product decisions already made (don't reopen)

- Squads: no join approval (the code is enough); stats are public inside a squad (no share setting); free tier leads 1 squad and joins up to 3.
- Gold is gone. Stardust is the currency.
- Monetisation later: everyone gets the same features; a few ads (never during focus), or a small one-off ad-free purchase.
- Level shows on the profile picture; Stardust shows on Home and opens Outfits (it grows from the chip, like Settings and Profile).
- Protection (allow/block apps) is one global setting.
- The dev account can change its daily goal any time.

---

## 10. Native build list (one future `eas build`, not OTA)

**User decision, 26 Oct: all native work waits until November 2026, after Expo's
build quota resets. Round 69 is JS-only. Do not build or publish for him.**

**Add to the next approved native round: combine the two protected-session
notifications.** `ProtectionService` owns foreground ID `84103` (channel
`liferpg_protection_preview`), while `CountdownNotifications` owns `81741`
(activity name, countdown, Break/End actions). JS cannot safely merge these.
Do not merely give them the same ID: independent updates, cancellation,
`stopForeground(REMOVE)`, break/expiry/repair and process restart can remove or
resurrect the other service's notification. Coordinate one owner/lifecycle,
preserve countdown/name/controls and foreground-service requirements, then test
break, resume, End, finish, permission loss, background and process recovery on
an installed Android build. **Still two notifications until that build.**

Calendar sync (top priority) · app block list · ads and billing · notification
icon · swipe-away notification · 1 s countdown offset · study widget · in-app
Google sign-in sheet · CAPTCHA · lock-screen focus view (`showWhenLocked`) ·
`expo-keep-awake`. Don't implement these in OTA rounds; just add to the list
when something new needs native code.

---

## 11. Round log (recent)

- **R73 (Codex):** read-only Collection for existing owned decorations, contextual reward links and the same real Developer entry. Outfit drafts, inventory ownership/unknown-state handling and guarded retry preserved; no new item, purchase or camp editor. Reproduced three hidden decorative animation repeats, now zero when route-covered/backgrounded; timer/dawn/return callbacks unchanged. Actual TSX web geometry checked at small/large phones and font scale 1.8. Native frame pacing remains a phone check. No SQL/Auth/email/native/config/dependency changes or publication. Native notifications still deferred to November. See `docs/round73-collection.md`.
- **R72 (Codex):** Camp pill/text moved left of the starting portrait, with a width-relative gap. No path, marker, animation, stats, reward, API, SQL, Auth, native/config/dependency change. R71 is "so far ok" on the phone. Recommendations for a simpler, more polished app are discussion only. See `docs/round72-camp-label.md`.
- **R71 (Codex):** matching day/category drilldowns; Profile legacy-category parity and completed-history safeguards; offline-sync cache refresh and honest goal-loading checks; reproduced celebration fade reversal and redundant arrival-layout commits; reserved Outfits chip row, reachable item actions and explicit ownership/preview labels. Live **st** records reconciled read-only. No SQL/auth/email/native/config/dependency changes or publication. Native animation smoothness still requires a phone check. See `docs/round71-stats-and-outfits.md`.
- **R70 (Codex):** fixed a refresh requeuing an already-dismissed find; Progress and Profile growth now reject pre-completion prefetches and stale owner callbacks, retain completion invalidation after Done, and preserve cached history on errors. Outfits explains unavailable inventory with a bounded retry and keeps cached owned items; duplicates visibly say Already yours. No economics, SQL, auth, native/config/dependency changes or publication. Exact reported missing inventory and native/modal frame pacing remain unconfirmed. See `docs/round70-background-recovery.md`.
- **R69 (Codex):** retained widget/dock timer entrance with stale-close fencing; themed different-running-session notice; result modal fades before finds/trail start; dawn only during the final 10 focus seconds and held during pause/break; one-minute minimum for new/edited durations, with old short records/recovery preserved. No SQL/native/config/dependency changes or publication. **Native notification merge explicitly deferred to November 2026.** See `docs/round69-session-polish.md`.
- **R68 (Codex):** visible dev-only Share session log row; production-compiler regression reproduced with real timer provider/controller/backdrop, then fixed by immutable subscribed completion state. Round 67 result/finds/trail design retained. Widget navigation removes stale launcher history and fences superseded intents; a different running routine gets a clear return action. Stationary map skips unused Reanimated registrations and uses an Android hardware layer; squad portraits avoid redraws and extra wallet loads. No SQL/native/config/dependency changes. See `docs/round68-session-flow.md`.
- **R67 (Claude):** widget launch never stacks a second session (`dismissTo`), lost close recovery (no frozen screen); the session return screen (finds, then trail) shows on the session screen after the result card instead of as a global pop-up; Home map sheet draws the map with the sheet (first-open size guess, then the remembered measured size, `TodayTrail` `sizeKey`/`initialSize`), defers its refresh until after the slide, and identical reward replies no longer redraw subscribers; reward-flow events in the session record. SQL unchanged from R66; he ran it after publishing (live since 26 Oct).
- **R66 (Codex):** map paints on first measured layout; shared refresh on opening/reconnect; preserved cached rules and coalesced busy reward checks; frozen per-reveal day and walk endpoints; restored return-to-camp with interruption guards. Proposed SQL replaces pending R64 with four 30-minute stops and excludes developer gifts from the trail. Large-text statistics use full-width rows, and the containing page can scroll without compressing the map. See `docs/round66-trail.md`. No live SQL or publication performed.
- **R65 (Claude):** the level is a long pill drawn in SVG (number exactly centred) right below the picture's ring, never over it; pictures with a level are taller than wide (`levelPill(size, level).room`), so wrappers set only their width. Today's trail fits its space with no scrolling (step from the measured height) and draws after the sheet/screen settles (`afterTransition`); the finds card fades into the trail.
- **R64 (Claude):** today's trail becomes the rewards (SQL `20261025090000_round64_daily_trail.sql`, run AFTER publishing): a find every 20 focused minutes of the day, 6 stops (120 min), +50 Stardust once a day for reaching the end; past it, minutes give Stardust only. The app reads `findSeconds`/`trailSeconds`/`today.trailComplete` from the state and falls back to the old 25-minute rule (`LEGACY_TRAIL`) on an older server. After a session: one card with every find (≈80% of the screen, finds dealt in turn, Stardust counts up), then today's trail where you walk from `fromSeconds` to now; nothing found goes straight to the trail; "See it in Outfits" from the card visits Outfits and comes back to the same card (`RewardMoments` `away`). Home has a map button between the name and Settings opening `TrailSheet`. The level now hangs below the profile picture (the picture draws smaller to make room). Removed the unused `CampScene` and the Round 63 one-line trail.
- **R63 (Claude):** profile picture layout: pet top right (from 32 pt), level always bottom centre (from 36 pt) in a pill sized so the number is never cut off; squad faces bigger (44, hero 48) so pets and levels show; the player card shows the whole character on their picture background; the found page redesigned as an animated reveal (finds dealt one by one with haptics, rare ones glow, Stardust counts up, you walk on along a one-line trail to the next find, full map behind "Map"); `pictureColors` moved to `utils/adventurerLook`.
- **R62 (Claude):** session starts after the walk-away; developer tools can show every reward screen on demand (return screen with a real find roll when no sessions wait, empty return screen, pack reopened automatically, milestones taken back and re-earned automatically); level colours follow the level-road tiers everywhere (`levelColors`), with a developer-only, in-memory level preview (`services/levelPreview.ts`); level number on the Home picture (no extra ring), tier chip left and Stardust right under Settings; level pill moves left of the pet; Outfits' Picture tab renamed Profile, with its chips in a row above the picture; This week and Squad tiles shortened.
- **R60–61 (Codex):** timer rendering and background expiry, Picture responsiveness, developer reward feedback, rewards and Outfits races, squad refresh visibility.
- **R59:** one session scene (dusk → dark night → morning), break confirmation, protection line removed, rewards shown before leaving the session, morning arrival banner on the result card, scrollable trail map, Outfits deep-links to the item's category, Home header split into two rows, Outfits grows from the Stardust chip, Start See all lists routines and study.
- **R58:** trail and camp, supply packs, Stardust on Home, player cards, dev protection SQL, level tiers road.
- **R52–57:** rewards database, new character, Outfits, frames, pop-ups, squads player cards.
