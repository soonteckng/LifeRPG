# LifeRPG handoff (from Claude, after Round 59)

Read this whole file before doing anything. It is the working agreement for this
repo. Follow it exactly; when something here conflicts with your own habits,
this file wins. When something is unclear, ask Soon Teck before changing code.

---

## 1. Where things stand (checked 24 Oct 2026)

| What | State |
|---|---|
| Working branch | `feature/next` (pushed to GitHub `soonteckng/LifeRPG`) |
| Latest commit | `3434a24` "Round 59: one session scene, rewards before leaving, Home header room" |
| `main` | 14 rounds behind `feature/next`. Never commit to `main`. |
| Code health | Tree identical to the last verified build: **1,466 tests pass, `tsc` clean, `expo lint` clean** |
| Native fingerprint (Android) | `de0355adda848fb7ff4453b91b284c71253e25c9`, unchanged, so updates ship over the air |
| Supabase project | `msuelivxpsfizkddjjfg` (https://msuelivxpsfizkddjjfg.supabase.co) |
| Supabase health | No Postgres errors in the last 24 h. The only API errors (404 `dev_rewards_v1`, 400 `open_daily_pack_v1`) happened *before* the Round 58 SQL was applied, so they're resolved. |
| Round 58 SQL | Applied. Live functions confirmed: dev reset refused, dev account delete refused, `next_milestones` dev action present, stats-visibility functions and `player_settings` table gone, `liferpg_reward_private.state()` is VOLATILE. |
| Pending SQL | None. Round 59 needed no database change. |

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
3. **No native or config changes.** The Android fingerprint must stay `de0355adda848fb7ff4453b91b284c71253e25c9`. That means JS/TS only: no new native modules, no `app.json`/`app.config` plugin changes, no new packages with native code. Native work goes on the build list (section 10).
4. **Never touch** `.gitignore`, `eas.json`, or `modules/focus-protection-spike/android`.
5. **Never push to `main`.** Work on a branch off `feature/next` (or a PR into it). Soon Teck merges and pushes.
6. **Never run sign-ups or send test emails**, and never put Soon Teck's email address anywhere (code, logs, requests).
7. **Don't test destructive things on the "Soon Teck" account** (reset, delete, wiping data).
8. **Copy style:** warm, short, plain words. **No em dashes (—) in user-facing text.** Use "·" or a new sentence instead.
9. **Haptics on every button and selection** (use the existing `tapHaptic` / `MotionPressable` patterns).
10. **Must work on any Android phone**, not just Samsung: small screens, large font scale (up to 1.8×), slow phones, Reduce Motion.
11. **Quality over speed.** "Dont rush, quality work, without bugs, without errors, and genuinely impressive for users."
12. Keep the app lean: no unnecessary code, no heavy dependencies.

### Accounts

- **"Soon Teck"** is the **dev account**. It has hidden Developer tools, has **everything unlocked** (all outfits and so on), and is **protected**: "Reset my rewards" and "Delete account" are refused for it (server-side, in `dev_rewards_v1` and `delete_my_account_v1`, plus the UI lock).
- **"8k"** is the **normal-user account**. It sees exactly what a normal user sees, with nothing unlocked.
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
npx expo-updates fingerprint:generate --platform android   # hash must equal de0355adda848fb7ff4453b91b284c71253e25c9
```

**SQL tests** use PGlite and are skipped unless `SESSION_SQL_PGLITE_ROOT` points
at a `node_modules` folder that has `@electric-sql/pglite@^0.4.6`:

```bash
mkdir -p /tmp/pglite && cd /tmp/pglite && npm init -y && npm i @electric-sql/pglite@^0.4.6 && cd -
SESSION_SQL_PGLITE_ROOT=/tmp/pglite/node_modules npm test
```

Always run them when you touch SQL.

### 4.2 Hand-off format

- Commit on your branch with a message like `Round 60: <short summary>` and a bullet body.
- Soon Teck applies, pushes and publishes himself. He's on Windows (PowerShell, repo at `C:\Users\soonteck\LifeRPG`). **Always give him the exact copy-paste commands.** If you deliver a patch, give him:
  ```powershell
  git am "$HOME\Downloads\round-60.patch"
  git push
  npx eas-cli update --channel preview --environment preview --platform android --message "Round 60: ..."
  ```
- Fallback when Hermes crashes on Windows during the bundle step: build the bundle yourself and give him a zip:
  ```bash
  EXPO_PUBLIC_SUPABASE_URL=https://msuelivxpsfizkddjjfg.supabase.co \
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_SnrSnQ57XXmmqRU5_mZtbA_n7taPkkw \
  npx expo export --platform android --clear --output-dir dist --dump-assetmap
  # zip dist/ as dist-round-60.zip
  ```
  He then runs:
  ```powershell
  Expand-Archive "$HOME\Downloads\dist-round-60.zip" -DestinationPath dist -Force
  npx eas-cli update --channel preview --environment preview --platform android --message "Round 60" --skip-bundler --input-dir dist
  ```
- **SQL order:** publish the app update first, *then* run the SQL, because older installed versions may still call what the SQL changes or drops. Say this explicitly whenever a round has SQL.
- Migrations that only add or replace functions can be applied with the Supabase tool (`apply_migration`). Anything with `drop` or `delete`: give Soon Teck the SQL to run in the SQL Editor, and add the file under `supabase/migrations/`.
- Updates often need the app closed and reopened twice to load. That's normal for expo-updates.
- Your reply to him: short. What changed (grouped by the issues he raised), what still needs his eyes on a real phone, any SQL with its order, then the commands. Answer his direct questions first.

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
| Rewards UI | `RewardMoments.tsx` (pop-up host), `GlobalRewardListener.tsx`, `rewards/RevealScreens.tsx` (return-to-camp and pack screens), `rewards/TodayTrail.tsx`, `rewards/PackArt.tsx` |
| Outfits | `src/app/outfits.tsx` (`outfitsOpening(id)` deep-links to the item's category), `components/adventurer/*` |
| Home | `src/app/(tabs)/index.tsx`, `SavedRoutinesCard.tsx` (the Start card and its See all sheet) |
| Developer tools | `src/components/DeveloperTools.tsx`, `services/developerAccess.ts` |
| SQL | `supabase/migrations/*.sql` |
| Tests | `tests/*.test.cjs`, `tests/helpers/*` |

### Rewards rules (current)

- **Stardust:** 1 per 5 focused minutes. A **find** (an item roll) every 25 focused minutes. Stops on today's trail are 25 minutes apart.
- **Daily supply pack:** opens once you reach your **daily goal** (default 30 min). Tiers climb with days in a row. The dev account can open it any time from Developer › Rewards (the same `open_daily_pack_v1`, with a dev bypass on the server).
- Pets, streak frames and badges are milestones. Frames upgrade on their own (no choosing).
- Server side, everything is in the private schema `liferpg_reward_private`, reached through `SECURITY DEFINER` RPCs in `public`. Each RPC takes `p_expected_owner` and checks it with `liferpg_reward_private.signed_in()`; `EXECUTE` is revoked from `anon`.
- The client store keeps per-owner snapshots with `moments` (small pop-ups) and `reveals` (full screens: expedition or pack). Seen state is kept in AsyncStorage. The pop-up host waits for other sheets (`sheetActivity`) plus `SETTLE_MS = 450` and shows reveals before moments.

### Session flow after Round 59

1. Start runs the intro: you walk away from camp at dusk (`WALK_MS` 2400), then the same scene fades to a very dark night (`NIGHT_FADE_MS` 2000). The timer fades in after. Tap anywhere skips it. There's no intro on resume, reopen, a recovered session, or with Reduce Motion.
2. Night until 90% (`MORNING_AT`), then one fade into morning (`MORNING_FADE_MS` 2500). A finished session stays in morning behind its card; ending early stays at night.
3. The 5-min break asks first ("Take your 5-minute break?" with Start break / Keep focusing).
4. On finish, the reward claim starts as soon as the summary arrives (`claimKey`). After Done, `SessionScreen` **holds the exit** while reward reveals are pending or busy (15 s fallback), so the order is: card → what you found → back to the app last.

---

## 6. Testing conventions

- Tests are plain `node:test` files (`tests/*.test.cjs`). Each loads a TS/TSX source with `ts.transpileModule` and a **per-file mock map** keyed by the exact import specifier (for example `'./AppText'`). If you add an import to a component, the tests that load it need that mock, or they fail with "Stripping types is currently unsupported for files under node_modules" or "Unexpected token 'typeof'".
- Shared mocks: `tests/helpers/arrival-banner-mock.cjs` (the result card's banner) and `tests/helpers/rewards-store-mock.cjs` (`set()` and `reset()` to drive pending reveals).
- `tests/helpers/no-external-network.cjs` blocks real network calls in tests. Keep it that way.
- Add tests for every behaviour you add or fix. Prefer behaviour tests (render, press, assert) over source-regex tests.
- Visual check: if you can, render changed screens (react-native-web + Playwright works) and look at them before handing back. Check night really is dark, nothing clips at fontScale 1.8, and nothing overlaps on a 360×640 screen.

---

## 7. Your first task: a full review for bugs, edge cases and race conditions

Before new features, audit `feature/next` and report findings **ranked by severity, each with a concrete failure scenario** (inputs/state → wrong result). Fix only after Soon Teck agrees, except clear crash or data-loss bugs, which you fix with tests. Don't refactor working code for style.

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

Calendar sync (top priority) · app block list · ads and billing · notification
icon · swipe-away notification · 1 s countdown offset · study widget · in-app
Google sign-in sheet · CAPTCHA · lock-screen focus view (`showWhenLocked`) ·
`expo-keep-awake`. Don't implement these in OTA rounds; just add to the list
when something new needs native code.

---

## 11. Round log (recent)

- **R59:** one session scene (dusk → dark night → morning), break confirmation, protection line removed, rewards shown before leaving the session, morning arrival banner on the result card, scrollable trail map, Outfits deep-links to the item's category, Home header split into two rows, Outfits grows from the Stardust chip, Start See all lists routines and study.
- **R58:** trail and camp, supply packs, Stardust on Home, player cards, dev protection SQL, level tiers road.
- **R52–57:** rewards database, new character, Outfits, frames, pop-ups, squads player cards.
