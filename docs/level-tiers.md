# Character growth and tiers

Completed focus awards one character XP per full minute. Exact leftover seconds carry forward. Saved level and within-level XP stay authoritative. The session-credit curve remains `floor(100 × L^1.5)` XP from level L to the next; each level costs more than the previous one. Existing earned levels and balances are preserved.

The tier path now stretches to level 100+ with strictly increasing gaps. Tiers describe progress; they neither cap levels nor award bonus XP. The popup shows level ranges and the next tier's level instead of cumulative XP totals. Profile keeps its existing within-level XP indicator.

| Tier | Character levels |
| --- | --- |
| First steps | 1–2 |
| Spark | 3–5 |
| Momentum | 6–9 |
| Rhythm | 10–14 |
| Flow | 15–20 |
| Dedication | 21–27 |
| Resolve | 28–35 |
| Radiance | 36–44 |
| Harmony | 45–54 |
| Insight | 55–69 |
| Mastery | 70–99 |
| Legacy | 100+ |

Tap Level on Home or Profile for the current tier and every reached/locked stage. This uses loaded Profile data, with no extra fetch during opening. Level 20 is an intermediate step, not the last named tier. Higher tiers represent sustained practice over the long term, with no final level.

The six focus areas are Everyday focus, Learning, Work & projects, Creativity, Everyday life and Wellbeing. The prepared category migration remains pending live because the Supabase write connection failed. Until it runs, pickers reconcile cached duplicate labels while retaining real IDs. Custom areas remain separate. Focus length offers 30/60/Custom, with preference-aware haptics.

The quest list opens at a fixed 66% screen height, so its initial position does not depend on how many quests are loaded. Content scrolls inside this panel. The editor still uses its keyboard-safe fixed height. Daily-goal opening retains its steady fixed snap point and timed motion.

Tour previews use one compact focus-card layout throughout the tour and restore the full prompt under the opaque Home return cover. Reveals use native animated scrolling, deduplicate repeated scroll requests and wait for stable measurements before showing the outline and next dialog. Reduce Motion uses immediate scrolling. Highlight boxes still come from actual card bounds; the dock remains visible.

Pebble (glasses) and Cloud (beanie) complete the 12-look companion catalogue, four rows of three. Existing saved look identifiers remain valid.

Native frame timing and keyboard clearance still require a device check. Component tests and browser previews cannot measure an actual phone keyboard or display-frame performance.
