# Round 82 (Claude): four fixes, chosen rewards, camp decorations, rest days, launch sweep

30 October 2026. Base: Round 81 (`e268cb6`). Two SQL files, both run in the
SQL Editor **after** publishing and only with Soon Teck's approval:

- `round-82-chosen-rewards.sql`: the reviewed chosen-reward migration
  (`20261028185232_round80_chosen_rewards.sql`).
- `round-82-rest-days.sql` (`20261029120000_round82_rest_days.sql`): replaces one
  read-only function, `liferpg_squad_private.focus_streak`.

## Fixes (reported on the phone after Round 81)

1. **"3 sessions completed offli…" was cut off.**
   - The banner title now wraps to two lines.
   - The summary says "3 offline sessions".
2. **Developer offline sync preview.** After Done the card disappeared and the
   map appeared afterwards. The preview now does what the real catch-up does: the
   map is prepared underneath (walk held) and the card fades straight into it.
3. **No slide-up when reopening a running session from the purple bar.**
   - Not reproducible in tests: a fresh mount does start the entrance.
   - Likely cause: a native-driven slide started in the mount's layout effect,
     before Android attached the view, so it jumped to the end. The entrance
     now starts on the next frame (the screen waits below the edge for that
     frame).
   - **Unconfirmed; check on the phone.**
4. **After an offline session, the next offline session showed "Waiting to
   confirm your saved session state" + Retry and wouldn't start.**
   - Reproduced at controller level (`offline-session-controller` Round 82
     test). A refresh while the connection was flaky published *any* unsynced
     item's pending command as the screen's error, even a finished session put
     away and waiting to upload.
   - The waiting error now describes only the selected record. A failed upload
     of a put-away session no longer blames the screen.
   - The provider reports `syncStatus` idle for a hidden record.
   - A refused start now shows setup at once with a short message, instead of
     staying dark until the 4 s fallback. `startTimer` resolves a boolean.
   - The exact phone state wasn't reproduced end to end. If it recurs, get
     Developer, Share session log.

## Chosen rewards (client)

- `rewardsService`:
  - `parseChosen` (optional `state.chosen`; anything odd hides the feature);
  - `chooseReward`, `acknowledgeChosen`, `chosenLab`.
- `rewardsStore`:
  - unacknowledged grants become an expedition reveal with `chosen`,
    queued after any session return;
  - shown grants are remembered (`shownGrants`) and listed in `toAcknowledge`.
- `RewardMoments` (always mounted) acknowledges shown grants, at most every
  5 s while failing.
- Home: `ChosenRewardCard` replaces `HomePack` once `chosen.enabled` (the day
  after the SQL). `ChosenRewardSheet` shows four offers; tapping the current
  one stops working toward it; "Earn it now" when enough days are saved.
- The finds card says "5 GOAL DAYS · You earned it" for chosen grants.
  "See it in Outfits" stays; nothing is auto-equipped.
- Developer, chosen rewards:
  - choose (test), add a test goal day, get my choice another way, start over;
  - all through `dev_chosen_reward_lab_v1` (rolled back on the server) and
    the real sheet and reward screen.
- Pack-only items' hints now say "A daily goal reward".

## Camp decorations

`session/CampDecorations.tsx`:

- Up to four owned decorations, newest earned first (developers: any owned),
  in fixed spots on the 390 × 844 scene canvas, clear of the tent, fire,
  walker and bottom controls.
- Dimmed at night.
- Drawn in `SessionBackdrop` between the scene and the walker.

## Rest days

The rule is `focusStreakWithRest` in `utils/focusDays.ts`:

- every 7 focus days in a streak earn one;
- you hold at most 2;
- a missed day uses one automatically;
- rested days keep the streak alive but don't count.

Where it applies:

- **Server and app use the same rule.** The SQL function implements it too;
  a PGlite test checks 300 random histories give identical answers.
- **The app's streak read.** `getFocusStreakDetail` reads back only as far
  as a gap rest days could bridge.
- **Home:** "12-day streak · 1 rest". The Today sheet has a rest-day card
  (ready count, "yesterday was a rest day").
- **Longest streak** uses the same bridging.
- **Untouched:** the goal streak (`profiles.streak_count`, used for streak
  frames).
- **Until the SQL runs,** squad streaks don't count rest days.

## Launch readiness

See `docs/launch-readiness.md`:

- privacy policy;
- web deletion link;
- Play permission declarations (including exact alarms);
- SMTP and CAPTCHA;
- final name and listing;
- the November native build;
- a real-device pass.

Copy fixed: two em dashes; the guide now explains the trail, Stardust,
choosing a reward, the camp and rest days.

## Verification

- Full suite (see the commit), typecheck, lint, fingerprint unchanged.
- New tests:
  - `round82-chosen-client`;
  - `round82-rest-days`;
  - Round 82 cases in `offline-session-controller`, `round78-offline-start`,
    `round80-chosen-rewards-sql` and the preview transition tests.
- Visual checks in the web harness: camp decorations (morning and night),
  the reward card states, the choice sheet, "You earned it".
