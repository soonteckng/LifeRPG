# Character growth and tiers

Completed focus awards one character XP per full minute. Exact leftover seconds carry forward. The saved level and within-level XP balance stay authoritative.

The existing session-credit curve is unchanged: level `L` needs `floor(100 × L^1.5)` XP to reach the next level. The client uses `requiredCharacterXP()` in Profile, the completion message and the tier overview. Level 1 needs 100 XP; level 2 needs another 282 XP. Tiers describe cumulative practice and never award extra XP.

| Tier | Character levels | Total XP at entry |
| --- | --- | ---: |
| First steps | 1 | 0 |
| Spark | 2 | 100 |
| Momentum | 3–4 | 382 |
| Rhythm | 5–6 | 1,701 |
| Flow | 7–9 | 4,288 |
| Dedication | 10–14 | 11,102 |
| Resolve | 15–19 | 31,993 |
| Radiance | 20+ | 67,128 |

Tap the character level on Home or Profile to open the same tier path. It shows the current tier, the next level's XP requirement, remaining XP to the next tier and every reached or locked tier. The level continues beyond the final named tier. This overview uses loaded Profile data and has no additional network request during its opening animation.

The six focus areas are Everyday focus, Learning, Work & projects, Creativity, Everyday life and Wellbeing. The suggestion chooser uses those same names. The prepared focus-area migration relinks legacy quests and session references, preserves accumulated area XP and removes the duplicated legacy Wellbeing rows. Until that migration runs, pickers reconcile cached duplicate labels while keeping a selected real area ID. Custom area IDs remain separate.

Focus length has 30-minute and 60-minute presets plus Custom. Previously saved shorter durations remain exact custom values. Selection haptics follow the account's haptic preference.

DailyGoalSheet and the quest editor use fixed snap points and timed native sheet motion. This prevents async goal content from changing the opening snap point. The quest editor fills the keyboard-safe parent and reveals the focused custom-minute field after keyboard or content layout changes. The compact quest list reserves an additional 24 points of bottom clearance.

Native smoothness and keyboard positioning still need an Expo Go/device check; component tests and browser layout previews cannot measure native frame timing or an actual phone keyboard.
