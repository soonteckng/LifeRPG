# LifeRPG handoff (after Round 82, phone checks in section 7)

Read this whole file before doing anything. It is the working agreement for this
repo. Follow it exactly; when something here conflicts with your own habits,
this file wins. When something is unclear, ask Soon Teck before changing code.
How to deliver a round (patch, bundle zip, SQL, the exact commands and the
reply) is in section 4.2, with a full worked example. Use that exact format.

---

## 1. Where things stand (checked 30 Oct 2026)

| What | State |
|---|---|
| Working branch | `feature/next` (pushed to GitHub `soonteckng/LifeRPG`) |
| Latest delivered round | Round 85 (Claude) on Round 84: every page follows the awhile mockups (Today with Up next and Later today, Your activities, routine setup, the Focus arch and Break, "You made room.", Your rhythm with History, the Circle with Join). See `docs/round85-mock-layouts.md`. No SQL. Round 84 (Claude) on Round 83: the awhile look (lilac and aubergine on warm paper, Newsreader and Inter), Today as home with no tab bar, squads as a circle (no ranking), Progress renamed Your rhythm with quiet markers, Profile categories by time. See `docs/round84-new-look.md`. No SQL. Round 83 removed the reward layer (`docs/round83-remove-rewards.md`). Do **not** run `round-82-chosen-rewards.sql`; `round-82-rest-days.sql` is still fine. |
| `main` | Many rounds behind `feature/next`. Never commit to `main`. |
| Code health | Round 85: 1,636 tests pass (1,626 at Round 84). Typecheck and lint clean; fingerprint unchanged. |
| Native fingerprint | Unchanged since Round 58. In a clean Linux checkout it's `de0355adda848fb7ff4453b91b284c71253e25c9`; the installed preview APK's runtime (computed on Soon Teck's Windows repo) is `4f07392040ace293bbe1cdb4176b5b7840d9e9b3`. Both stay the same as long as no native or config input changes. Compare like with like. |
| Supabase project | `msuelivxpsfizkddjjfg` (https://msuelivxpsfizkddjjfg.supabase.co) |
| Round 58 SQL | Applied (some of it by hand in the SQL Editor, so it isn't all in `list_migrations`). |
| SQL | Round 66 is live. Rest days (`20261029120000_round82_rest_days.sql`) came with Round 82 for Soon Teck to run after publishing. Chosen rewards will **never** run: Round 83 moved its migration out of `supabase/migrations` to `docs/archive/never-run-round80_chosen_rewards.sql`, so a migration push can't pick it up. The server's reward tables and RPCs are untouched and unused; dropping them is a later SQL step that needs approval. The old R64 file must never run. |
| Waiting on the phone | Round 85: Today's Up next and Later today (Start on each row, Something else), Your activities (+ New, Repeats and Any time, Study), routine setup (Repeats or Any time), a running session in the arch (protected pill, ends-at time, Take a break, the peach break, End session), the finished card (tiles, Back to today, See your rhythm), Your rhythm (this week, History and back) and the Circle (Join on a friend who is focusing). Round 84's checks still apply. Native frame pacing remains unverified. |
| Native work | **Explicitly deferred by Soon Teck until November 2026, after his Expo quota resets.** In particular, combining the countdown and protection notifications is NOT implemented in Round 69. Preserve this in every Claude handoff; see section 10. |

Note: `20261024140100_round58_dev_protection.sql` was run in the SQL Editor, so it
does **not** show in `list_migrations`. That's expected; the live functions match the file.

---

## 2. The product in one paragraph

**New direction (30 Oct 2026):** LifeRPG is becoming **awhile** (working name):
a calm focus app, **not a game**. "Plan it, start it, stay with it." The focus
session is the product; everything else helps you start, shows you showed up,
or keeps you company. For anyone (study, workouts, reading), students first.
The full brief is the "awhile: direction and handover" doc and
`awhile-handover.md` (given to Soon Teck as a file), with nine mockups.

Today (after Round 84): Android-first Expo app in the awhile look (lilac and
aubergine on warm paper; Newsreader titles, Inter text; light only until the
November build can follow the phone's dark setting). You run focus sessions
(routines or study subjects). **No currencies, rewards, character, outfits, XP
or levels** (Round 83 removed them; the server keeps its old tables untouched).
**Today is home and there is no tab bar**: Up next and Later today start
things in one tap; Your activities (with Study inside), the Circle and Your rhythm
open from Today and come back with a "Today" link. Since Round 85 every page
follows the awhile mockups. Squads are a
circle, never ranked. Your rhythm shows time, focus days, the streak and quiet
markers. No guilt or punishment mechanics; no ads during focus, auth or recovery.

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
- **Round 75 developer test inventory:** optional, memory-only and scoped to account/admission; only Developer tools and Outfits use it. Start empty, toggle all-owned, buy with test Stardust, reset and restore. Home/Profile/sessions/stats remain real. No real inventory/currency/claim is committed by the proposed lab RPC. It requires explicit approval and SQL Editor installation after JS publication. See `docs/round75-developer-testing.md`.

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
git commit -m "Round 77: <short summary>" -m "- <what changed, one line each>"

# 2. The patch, then prove it applies cleanly to the commit before it.
git format-patch -1 HEAD --stdout > out/round-77.patch
git branch -f check HEAD~1 && git checkout -q check && git am -q out/round-77.patch \
  && git diff --quiet <your-branch> && echo APPLY_OK; git checkout -q <your-branch> && git branch -D -q check

# 3. The backup bundle.
EXPO_PUBLIC_SUPABASE_URL=https://msuelivxpsfizkddjjfg.supabase.co \
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_SnrSnQ57XXmmqRU5_mZtbA_n7taPkkw \
npx expo export --platform android --clear --output-dir dist77 --dump-assetmap
(cd dist77 && zip -qr ../out/dist-round-77.zip .)
```

Then send him the files (he downloads them to `Downloads`). Don't paste a
patch into the chat.

**The commands you give him (worked example, Round 77):**

```powershell
git am "$HOME\Downloads\round-77.patch"
git push
npx expo-updates fingerprint:generate --platform android
Remove-Item -Recurse -Force dist -ErrorAction SilentlyContinue
npx eas-cli update --channel preview --environment preview --platform android --clear-cache --message "Round 77: <short summary>"
```

**Two traps found in Round 83 and 84 (30 Oct):**
- The fingerprint on his PC must print `4f07392040ace293bbe1cdb4176b5b7840d9e9b3`
  before publishing. It depends on his **local, uncommitted** `.gitignore`
  (Windows line endings, last two lines Unix). If that file is reset (checkout,
  stash, another tool), the hash changes and the phone silently ignores the
  update. `restore-gitignore.cjs` (in the Round 55 outputs) writes it back.
- Always delete `dist` and publish with `--clear-cache`. Round 84 first went out
  with **old code** under the new name (the phone reported the Round 84 update ID
  but drew Round 83), from a stale `dist` or build cache. Use the zip fallback
  only when bundling really crashes, and then only right after `Expand-Archive`
  of **this** round's zip.

If Windows crashes during the bundle step:

```powershell
Remove-Item -Recurse -Force dist -ErrorAction SilentlyContinue
Expand-Archive "$HOME\Downloads\dist-round-77.zip" -DestinationPath dist -Force
npx eas-cli update --channel preview --environment preview --platform android --message "Round 77" --skip-bundler --input-dir dist
```

If the round has SQL, it always comes **after** publishing: "Open
`round-77-<name>.sql`, paste it into the Supabase SQL Editor and run it."
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
| Session result | `SessionResultHost.tsx` (the one result portal, was `GlobalRewardListener`), `SessionResultSheet.tsx`, `CompletionDetails.tsx`, `ArrivalBanner.tsx`, `OfflineSyncHost.tsx` (one card for an offline catch-up) |
| Protected sessions | `SessionProtectionContext.tsx`, `nativeFocusProtection.ts`, `protectedSessionStart.ts`, `SessionProtectionControl.tsx` (one 5-min break per session) |
| Home | `src/app/(tabs)/index.tsx`, `SavedRoutinesCard.tsx` (the Start card and its See all sheet) |
| People | `InitialsAvatar.tsx`: you and squad members as initials on a stable tint (no characters) |
| Developer tools | `src/components/DeveloperTools.tsx` (session log, guide, intro, every result card), `services/developerAccess.ts` |
| SQL | `supabase/migrations/*.sql` |
| Tests | `tests/*.test.cjs`, `tests/helpers/*` |

### Rewards (removed in Round 83)

- The app no longer shows or claims Stardust, finds, today's trail, packs,
  chosen rewards, milestones (pets, frames, badges), camp decorations, the
  character, outfits, XP or levels. The code is deleted, not hidden.
- The server is **untouched**: `liferpg_reward_private` tables and the reward
  RPCs still exist, and session completion may still record XP server-side.
  Nothing in the app reads or calls them. Dropping them is a later SQL step that
  needs Soon Teck's approval.
- **Never run `round-82-chosen-rewards.sql`.** `round-82-rest-days.sql` is fine.
- Still in the app: the focus streak with rest days (`utils/focusDays.ts`, SQL
  `focus_streak`), the daily goal, Progress, Profile's all-time totals and the
  category levels in Profile/Progress (these go in the "Your rhythm" round).

### Session flow after Round 59

1. Start runs the setting-off **before** the session starts (Round 62; since Round 83 nobody walks: the camp shows at dusk with "Settling in" and the activity name): the scene holds at dusk (`WALK_MS` 2400), then the same scene fades to a very dark night (`NIGHT_FADE_MS` 2000), and only then is `startTimer` called, so the walk takes none of the session's time. Tap anywhere skips (the session starts after the quick fade). Back during the walk cancels it and stays on setup. The night stays up until the session shows as started (`launching`, 4 s fallback; a failed start shows setup again). No walk with Reduce Motion, on Retry, or for a session that's already running.
2. Night until the **last 10 focus seconds** (`DAWN_SECONDS`, Round 69), then a linear fade over the remaining focus seconds. Pause or the protected break freezes the light; Resume continues to the focus deadline. A reopened completed session shows morning immediately; early End returns to night. Ordinary timer ticks do not redraw the scene or restart dawn. New sessions and edited routines require 60 seconds to 8 hours; old short sessions, history and pending sync records remain readable and recoverable.
3. The 5-min break asks first ("Take your 5-minute break?" with Start break / Keep focusing).
4. **Round 83:** no walk back. The result card opens as soon as the result is ready.
5. **Round 83:** no reward claim and no return screen. Done on the card closes the session screen (`globalSessionLifecycle` → `minimise`). Historical (Round 67 to 82): after Done, `SessionScreen` held the exit and shows the session's return screen **itself** (`components/session/SessionReveal.tsx`: the finds card if anything was found, then today's trail walk). Order: walk back → result card → finds → trail → back to the app. While the claim is still in flight it waits up to 15 s; while the return screen shows there is no time limit (you close it). Continue or Back fades the return into the app; the map stays mounted until the native fade finishes. `RewardMoments` never shows an expedition reveal while on the session route or while the session screen hosts it (`sessionRevealHost` in `services/sessionReturn.ts`, e.g. Outfits opened from the finds card); one that arrives after you left shows on Home as before.
6. Widget/deep-link launches (`routine-start.tsx`) use `router.dismissTo("/session")`, never `replace`: `REPLACE` ignores `dangerouslySingular` and stacked a second session screen. `SessionScreen` also recovers a close whose pop was lost (`LOST_EXIT_MS`), so a hidden, input-locked screen can't freeze the app.
7. The session log (Settings > Developer > Share session log) records `result done` and `result closed` among the timer events.
8. Round 74: the receipt closes only through Done, fading the whole result modal for 400 ms (ordinary sheet fades still default to 220 ms). Only its actual dismissal notifies the session screen and acknowledges the result. SessionReveal then waits for measured content before a 520 ms entrance. Round 76 replaces the serial finds/map fades: the measured map mounts beneath the opaque finds, then a single 620 ms cover fade reveals that same map, without a second entrance. The final 480 ms fade has no downward translation and acknowledges the map only when hidden. Repeated callbacks, an account/admission change and a replacement running session are fenced. Reduce Motion swaps immediately.
9. Round 76: the focus walker stays inside an ancestor-relative measured lane below the ring and above activity details. Cramped/missing geometry hides the small decorative walker; departure/return remain. Focus scenery has an 82% black veil; departure/return 35%, settled morning 45%. Foreground timer/controls stay clear. No physical brightness setting change.
10. Round 77: the intro veil follows dusk from 35% to the final 82% before revealing the timer; removing intro keeps the same night subtree and starts no second dim. Cancelled/unmounted intro callbacks cannot finish a new departure. A matching Done dismissal clears its held result by exact outgoing identity before the journal selection clears; neutral summaryViewed=false cannot resurrect that End notice.
11. Round 69: widget/purple-bar entry explicitly requests one presentation-only slide on the retained session route. Returning from Outfits does not replay it. A motion generation prevents an old close callback from popping or snapping the new entrance. Focus recovery runs on actual route focus, not ordinary timer-id/picker updates.
12. Round 78: offline saved routines use the same exact draft and `/session` setup as online, then the shared departure before timing starts. Keep an acknowledged End through next-start protection preflight, and do not reopen it during routine setup. Pending completion and confirmed receipt retain separate acknowledgement identities. No protection, transport or recovery-workspace behavior change.

---

## 6. Testing conventions

- Tests are plain `node:test` files (`tests/*.test.cjs`). Each loads a TS/TSX source with `ts.transpileModule` and a **per-file mock map** keyed by the exact import specifier (for example `'./AppText'`). If you add an import to a component, the tests that load it need that mock, or they fail with "Stripping types is currently unsupported for files under node_modules" or "Unexpected token 'typeof'".
- Shared mocks: `tests/helpers/arrival-banner-mock.cjs` (the result card's banner). `tests/helpers/rewards-store-mock.cjs` is now only an inert stand-in that a few older fixtures still pass for a module that no longer exists; don't build new tests on it.
- `tests/helpers/no-external-network.cjs` blocks real network calls in tests. Keep it that way.
- Add tests for every behaviour you add or fix. Prefer behaviour tests (render, press, assert) over source-regex tests.
- Visual check: if you can, render changed screens (react-native-web + Playwright works) and look at them before handing back. Check night really is dark, nothing clips at fontScale 1.8, and nothing overlaps on a 360×640 screen.

---

## 7. Your first task, and the review checklist

**First: Soon Teck's Round 82 phone results.** See `docs/round82-big-round.md` (what to check) and
`docs/launch-readiness.md` (what is left before release). Never mount a Modal (including `AppSheet`)
visible inside another Modal in the same commit, and avoid non-null-asserted property paths inside
closures (`a!.b!.c`): the production React Compiler reads them eagerly as dependencies.

**Round 81 (history): verify developer previews.**
Round 81: the five instant result previews (Offline sync summary, Offline sync
and celebrations, Session ended early, Saved offline result, Session could not
be credited) opened their card *under* the scenery window on Android (nested
Modal created children first). The card now waits for the scenery's `onShow`.
Never mount a Modal (including `AppSheet`) visible inside another Modal in the
same commit. See `docs/round81-preview-windows-and-reward-review.md`, which also
has the chosen-reward SQL review: triggers can't block completion/sign-up, a
distinct `chosen` source, offers alternate kinds. Next: the capability-gated
chosen client and developer controls, publish, then ask for SQL approval.

**Round 80 synced celebrations (still to verify on the phone).**
Use `docs/round80-celebrations-and-reward-proposal.md`. Confirmed first-session
and daily-goal receipts survive batching and use the existing independent
once-per-day ledgers. The celebration follows the single map, never an
unconfirmed local save. Developer > Offline sync and celebrations previews the
same screens without consuming real days. R79 grouping is reported successful;
keep its regression coverage.
Use `docs/round79-offline-sync.md`. Three offline minutes should produce one synced summary and one map. Keep the prior R78 checks below as regression coverage.
Use `docs/round78-session-parity.md`: online/offline manual End -> Done -> app, wait and open another routine; offline saved-routine setup -> shared dusk/night -> full minute; pending offline completion -> Done -> reconnect -> one confirmed receipt/map. Actual-sheet/provider regressions reproduce a specific late-confirmed End/new-start replay, not the precise phone timing with no later action. Keep that distinction and request the existing Share session log if it recurs. R77 lighting, R76 finds/map crossfade and developer test inventory remain intact.

**Chosen rewards are approved direction, not enabled.** The user agreed on 29 Oct
to installation time, that day's pack and credits from the next local day.
`20261028185232_round80_chosen_rewards.sql` is a tested **review-only proposal**.
Do not run it with R80: review first, build/publish the capability-gated chosen
client next, then ask for separate SQL installation approval. R80 changes no
live rewards. Keep the historical spec and **do not send anything to Claude**.
Rest days/camp placement remain later; native notifications wait until November.

**Round 74 transition checks remain relevant:**
The user reports the completion card itself is smooth. It now closes only
through Done, fades out for 400 ms, and the return waits for the actual map
commit before its 520 ms entrance. R76 supersedes the serial finds > map transition with a single
620 ms crossfade after map readiness. Continue keeps the map mounted during a 480 ms fade into the app,
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
are not installed or implemented in R75; the developer-testing round is independent
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
- **Round 83 (30 Oct):** no currencies, rewards, character, outfits, XP or levels. The app has no real users yet, so they are deleted, not hidden. People show as initials.
- **Next (agreed, not built):** the activities database change (reminder only, days of the week, timed, protected; approval first), which also unlocks "ticked off 2 of 3 times" in Your rhythm; Circle's activity and time left for friends, and "Show my sessions here" (database); the streak rule to settle. Done in Round 84: the look, Today as home with no tab bar, no squad rankings. Done in Round 85: the mockup layouts on every page, the arch timer, break and finish, Circle's Join. **November build:** `userInterfaceStyle` to `"automatic"` for dark mode (dark palette planned: deeper aubergine, lifted cards with a faint lilac edge) and the notification accent colour.
- Monetisation later: everyone gets the same features; a few ads (never during focus), or a small one-off ad-free purchase.
- Protection (allow/block apps) is one global setting.
- The dev account can change its daily goal any time.
- **Built in Round 82:** chosen rewards (client + reviewed SQL), camp decorations (fixed spots, newest four), rest days (every 7 streak days, hold 2, used automatically; goal streak and frames unchanged). Earlier note: five banked non-consecutive goal-days for a chosen cosmetic. The R80 review-only proposal records installation time and a frozen next-local-day boundary, preserves the launch-day pack, durable credits, wallet-first grants, four stored offers and old-client payloads. No SQL is installed, no chosen client is built and no Claude message sent. See the R80 review note and historical spec. Rest days and decorations are later.

---

## 10. Native build list (one future `eas build`, not OTA)

**User decision, 26 Oct: all native work waits until November 2026, after Expo's
build quota resets. Round 69 is JS-only. Do not build or publish for him.**

**Add to the next approved native round (Round 84): dark mode and the paper
look's native colours.** Change `userInterfaceStyle` in `app.json` from `"dark"`
to `"automatic"`, then give `constants/theme.ts` a dark palette chosen with
`useColorScheme` (deeper aubergine background, lifted cards with a faint lilac
edge; the scene ink already exists). Also set the `expo-notifications` plugin
colour from `#AAB3FF` to aubergine `#3B2737`, and check the splash and adaptive
icon backgrounds (`#080809`) against the new look. All of these change the
fingerprint, so they belong in the build.

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

- **R85 (Claude):** every page follows the awhile mockups: Today (wordmark, serif Today, lilac Up next from the next reminder or an exam, Later today with Start on each row, Time for yourself today, Your circle); Your activities (+ New, tags, Repeats and Any time, a Study row); routine setup (Make it yours, When: Repeats or Any time); the Focus arch on paper with segments and the peach Break; the finished card (You made room., warm card with today against the goal, streak and this-week tiles, Back to today, See your rhythm); Your rhythm opens on this week (days here with rest days, time by activity) with History for the old charts; the Circle (Here, together., Join starts your own session). No SQL/native/config/dependency change. See `docs/round85-mock-layouts.md`.
- **R84 (Claude):** the awhile look across the app (paper palette, Newsreader and Inter bundled and loaded behind the logo, status bar per screen, light ink over the night scene, app-coloured switches and spinners); Today as home with no tab bar and Today links on each page; a five-tip guide on Today; squads as a circle (`circleOrder`), no ranking anywhere; Progress renamed Your rhythm with "Along the way" quiet markers; Profile categories by time. Dark mode and the notification colour wait for the November build. No SQL.
- **R83 (Claude):** the reward layer comes out for the new direction ("awhile", a calm focus app): Stardust, Outfits, trail and finds, packs and chosen rewards, milestones, XP and levels, celebrations, the character and the walk back are deleted. People are initials (`InitialsAvatar`); the session camp stays with nobody in it; the result card opens straight away; `GlobalRewardListener` is now `SessionResultHost`; the offline catch-up is one summary card. Chosen-rewards migration archived. No SQL. 1,616 tests pass.
- **R82 (Claude):** phone fixes (wrapped offline title, preview card fades into a prepared map, next-frame session entrance, waiting error scoped to the selected record, refused start shows setup at once); chosen rewards client (Home card replaces the pack once enabled, four-offer sheet, "You earned it" reveal, acknowledgement, developer lab controls); camp decorations; rest days (one rule in `utils/focusDays.ts` and SQL `focus_streak`, PGlite equivalence test); guide and launch-readiness list. Two SQL files to run after publishing.
- **R81 (Claude):** nested-Modal fix for the five instant developer result previews (card waits for the scenery window); chosen-reward SQL review fixes (exception-safe triggers, `chosen` source, alternating offers) with failing-first PGlite tests. SQL still not installed; client not built.
- **R80 (Codex):** reproduced missing first/goal celebrations for grouped offline receipts; retain independent confirmed evidence and release it after the single map, with the same durable ledgers and combined message. A no-wait Developer sequence reuses shipped screens. Read-only live reward metadata matches six branch bodies; R75 lab presence confirmed. CLI-created chosen-reward SQL proposal has isolated tests, but is not installed and must wait for review/new client. No live mutation, Auth/email, native/config/dependency change, push, build or publication. Native notifications remain deferred to November. See `docs/round80-celebrations-and-reward-proposal.md`.

- **R79 (Codex):** grouped offline confirmation receipts in a separate backend/owner-scoped presentation cache without changing the journal/schema. One authoritative count/time/XP card, one coordinated rewards catch-up and frozen return; late finds skip an already-seen map. Existing import retry/credit rules and online receipts remain. Map milestones explicitly say total. Developer preview reuses the actual summary and trail. No SQL/Auth/email/native/config/dependency changes, builds, pushes or publication. Native work remains deferred to November. See `docs/round79-offline-sync.md`.

- **R78 (Codex):** removed old offline saved-routine confirmation/direct-start shortcuts; Home/list/grid now prepare the exact shared session setup and departure. Real-provider/actual-sheet tests reproduce a late-confirmed End reappearing when routine setup or protection preflight clears Done. Acknowledgement now survives these steps; settled acknowledged cancellations release on new draft. Pending offline completion -> one confirmed receipt remains covered. 1,804 tests pass, native inputs unchanged. Precise no-further-action phone replay/frame pacing remain unverified. No SQL/Auth/email/native/config/dependency change or publication. Chosen rewards spec remains for a separate round; notifications deferred to November. See `docs/round78-session-parity.md`.
- **R77 (Codex):** dusk reaches the running scene's darkness before timer reveal, with retained night subtree and cancelled callback fencing. Reproduced the End -> Done -> Home duplicate using the real provider/controller and production compiler; release only the exact acknowledged held result. 1,785 tests pass, native fingerprint unchanged. No SQL/Auth/email/native/config/reward-rule change or publication. R78 specification plus six approved amendments recorded for later SQL review; no Claude message. See `docs/round77-session-handoff.md` and `docs/round78-chosen-rewards-spec.md`. Native notifications remain deferred to November.
- **R76 (Codex):** insufficient funds explains the shortfall with one Got it action; ordinary developer gifts use the animated finds screen while milestones remain; finds stay opaque until map readiness, then one 620 ms cover crossfade reveals the retained map (normal and developer flows). Measured walker lane below the ring; much dimmer scenery, clear foreground controls, cramped-layout fallback. 1,773 tests pass; native phone smoothness remains unverified. No SQL/Auth/email/native/config/dependency/economy change. See `docs/round76-reward-polish.md`. Chosen rewards/rest tokens remain next; notifications deferred to November.
- **R75 (Codex):** developer no-wait achievement/result/trail previews using shipped components; memory-only owner/admission-scoped test inventory in Outfits, all-owned toggle, prices/purchases/saved test looks, all items/duplicates and pack tiers. Review-only developer RPC executes existing reward code in an always-rolled-back subtransaction; no live installation or normal reward-economy change. Real milestone take-back disabled; draft/late-callback scope guards. See `docs/round75-developer-testing.md`. Chosen rewards/rest tokens remain next. Native notifications deferred to November.
- **R74 (Codex):** Done-only receipt, measured 520 ms map entrance, calmer finds/map fades, 480 ms fade to app and completed-trail copy. 1,741 tests passed; actual Android frame pacing remains a phone check. No SQL/native/config/dependency change. See `docs/round74-session-return.md`.
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
