# Round 71: matching statistics, completion motion and Outfits

Prepared 27 October 2026 on Round 70. The verification base is
`bc5899f07f1d2f283f4bf38f53ae5b741eafce0d`; its source tree matches Soon Teck's
`feature/next` at `faacb77` (Round 70). Apply this after Round 70, not after an
older main build. No push or EAS publication is performed by Codex.

## Report and scope

The user tested Rounds 69 and 70 as normal account **st** (saved username **St**):

1. Closing the first-session "A good start" celebration stutters/flashes.
2. Today's Everyday focus says 6 minutes, but its detail says 9m 20s. Audit
   related Progress/Profile statistics rather than changing just the label.
3. Occasional stutter as the session result appears.
4. The set-completion chip overlaps the character in Outfits.
5. Item details and buying require scrolling too far; ownership and green dots
   are unclear, including dots on locked items.

## Statistics: actual records, no data repair

A bounded, read-only lookup of the exact normal account at approximately
03:04 local time on 27 October reconciled both reported numbers:

| Scope at that snapshot | Everyday focus | All categories |
|---|---:|---:|
| 27 October | 360 seconds (6 minutes), four sessions | 360 seconds |
| 26 October | 200 seconds (3m 20s), three sessions | 2,900 seconds |
| Current week to that point | 560 seconds (9m 20s) | 3,260 seconds |
| Current month / lifetime | 560 seconds | 5,960 seconds, nine sessions |

The two Wellbeing sessions contribute 5,400 seconds lifetime. The historic
20-second session predates the one-minute minimum and remains valid history.
The original 99 XP plus 20 banked seconds agrees with 5,960 focused seconds.
Another session completed during this investigation, so these are a dated
reproduction snapshot, not a claim that the live account still has six minutes.
A later read reconciled 6,020 seconds, 10 sessions and 100 XP, with character
level 2 and 0 XP into that level.

The saved goal schedule is 30 minutes from 26 October, while the profile's
initial baseline is 60. Existing daily targets and the schedule are authoritative;
this is intentional and must not be "repaired" by overwriting the profile or
historical daily goals.

### Confirmed client faults

- Progress's category rows and detail session list filtered the selected day,
  but the detail header reused the whole week's/month's category total and
  period subtitle. The detail now sums those same displayed sessions and names
  the same day. Whole-period details still use whole-period rows.
- Profile's category breakdown omitted old, unassigned Everyday focus sessions
  that Progress already included. Both now use the same reporting category.
  Saved subjects and XP are not reassigned.
- Progress did not defensively deduplicate saved session IDs or reject ended
  rows in its pure aggregation. A new completion shifting a paginated boundary
  could repeat an ID. Both protections now match Profile's completed-history
  accounting. The normal history query still requests completed rows.

The regression fixture verifies day, week, month, lifetime, category totals,
session counts, active days and saved daily-target accounting together. Legacy
seconds remain exact. Character and category level curves, XP banking, earned
items, milestones, daily goals and reward amounts are unchanged. Milestone
breadth deliberately still counts saved area IDs: existing tests specify that
rule, and changing it could take an earned badge away.

The related audit also reproduced and fixed:

- Profile's "By subject" rows filtered just the surviving category ID, omitting
  legacy aliases although the category's own totals included them. The breakdown
  now receives the same completed category rows, including valid aliases.
- A failed subject lookup rendered a blank breakdown instead of its existing
  failure message. The current owner/window now shows that honest message;
  outgoing replies remain fenced.
- Dismissed offline results can sync after the temporary session summary has
  gone. Progress, Profile and Home now observe the controller's existing
  cloud-save signal. Counter resets on account re-admission cannot certify an
  older cache merely because a later import reuses its numeric version.
- Several Home components request the same weekly statistics. Matching work
  now shares one in-flight read. Staggered consumers retain or adopt a fresh
  matching result instead of evicting it or issuing duplicate reads. Old
  pre-save replies and outgoing owner callbacks cannot overwrite it.
- Home's weekly calculation froze its validation time at mount, filtering out
  subsequently completed sessions even after fresh data arrived. It now uses
  the current time for fresh results and advances its calendar on focus,
  foreground return and a local minute clock. No minute-by-minute network
  polling was added. Unknown weekly values show Checking/a dash, not zero.
- Cold goal displays substituted the profile's original 60-minute baseline for
  the scheduled 30-minute target while loading or after failure. Home, Today
  details, Settings and the goal editor now distinguish known data from
  Checking/Unavailable. Cached targets are scoped by account and local date,
  including the cache expiring across midnight. Existing reads are reused;
  changing a goal, its cooldown and historical targets are unchanged.

The additional tests exercise stale-response ordering, matching-consumer
coalescing, controller reset, owner changes, cold/failed reads, and Home's
post-mount completion/calendar rollover. They reproduce the faults before the
fixes. Existing tests that assumed a fabricated cold 60-minute goal or zero-week
total now expect honest loading; their interaction assertions remain intact.

Audit scope: completed-history aggregation and day/week/month/lifetime category
views; Home/Profile/streak and level accounting; saved daily-target precedence;
Study subject links and their exact-second breakdown; and existing Study/squad
time formatting and server-authoritative read paths. Isolated tests exercise the
credit/goal/reward SQL reference paths. This is not a claim that every possible
statistic on every account or device has been proven. No server-side totals
needed rewriting for the exact account inspected.

## Completion motion: measured faults, bounded claims

The celebration's fade reached opacity zero, then the `visible=false` cleanup
reset it to one while the native modal was still dismissing. That reproduces a
flash, including with production React compilation. It now stays transparent
through dismissal and resets only for the next opening. Reduce Motion keeps its
immediate dismissal.

The result's arrival illustration also set a fresh geometry object for identical
layout events, causing redundant React commits. Unchanged measurements now keep
the existing state. A controlled before/after test covers those commits.

React Compiler already caches the illustration's SVG and animation graphs. This
round does not claim that those were redrawn every frame, or that every dropped
Android frame has been eliminated. The six new motion tests fail against the
original code and pass after the fix, in compiled and uncompiled controls.
Actual installed-phone frame pacing remains unverified.

## Outfits

- The set chip occupies its own flow-layout row above the character, rather
  than floating over the illustration. Large text can wrap in the reserved row.
- A selected item's name, status, rarity and acquisition action sit with the
  fixed Save/Reset controls, not after the entire item grid.
- On short phones or at large font scales, the preview scrolls with the list;
  the tab strip and actions remain reachable. This depends on viewport/font
  scale, not which item is selected.
- Tiles explicitly distinguish **Owned**, **Wearing**, **Preview** and
  **Not owned**. A locked preview retains its lock and never gets an owned
  checkmark. Saving a locked preview remains disabled.
- The former green rarity dot meant **Uncommon**, regardless of ownership.
  Other green dots meant a slot had a draft item, including a locked preview.
  These ambiguous dots are removed; rarity is written in item details and the
  accessibility label. The user's Field jacket is owned, not a missing unlock.
- R70's unknown-inventory status, bounded retry, cached ownership and avatar
  conflict checks are preserved. No purchasing/equipping rule is relaxed.

The actual Outfits TSX and art were rendered with a structurally equivalent
React Native Web page fixture. At 360×640 and font scale 1.8, Get occupies
y481–548 and Save y556–624, with no horizontal overflow. Large text and narrow
screens use scrollable, readable tab pills and flexible two-column tiles.
This verifies static geometry, not Android gesture bars or frame pacing.

### Earlier missing-item report, now identified

Read-only inspection after the user supplied **st** confirmed Field jacket
and Easel in that account. The 26 October pack rolled an already-owned Easel
and awarded its normal duplicate Stardust. No Canvas tote was recorded for this
account. Easel is camp decoration; the current Outfits screen has no decoration
section. Do not call this inventory loss, grant items manually, or silently add
a camp editor as part of this round.

## Boundaries and verification

No SQL, schema, auth, native, config or dependency changes. No live sign-ups, test
emails, real-address email tests, mutating live RPCs or data repair were run.
Local tests block external networking. Supabase reads do not send Auth email.

All native work, especially merging countdown/protection notifications, remains
deferred until November 2026 after the Expo quota reset. This round uses EAS
Update on the existing installed build. Publish from the original Windows repo,
preserving its local `.gitignore` and native files. Never force a runtime match.

- **Full suite: 1,699 passed, zero failures/skips**, including isolated PGlite.
  Command: `node --wasm-num-compilation-tasks=1 --v8-pool-size=1 --require ./tests/helpers/no-external-network.cjs --test --test-concurrency=1 tests/*.test.cjs`.
  `SESSION_SQL_PGLITE_ROOT` points to the existing isolated dependency runtime.
  The final clean run took about 570 seconds. An earlier run identified nine
  stale fixture/layout expectations; all were corrected and the entire suite
  rerun. No financial, reward, ownership or session-credit assertion was removed.
- Typecheck, full Expo lint, new-test lint and diff checks pass. Existing
  lock-matched dependencies were reused.
- The same-checkout native fingerprint remains
  `49308616e025891eba4e874277a734a7281f16bb`, with identical native source hashes
  to the R70 parent. The installed user's Windows runtime stays
  `4f07392040ace293bbe1cdb4176b5b7840d9e9b3`; compare environments like for like.
- Local Android export succeeded with React Compiler enabled. The ZIP has
  `metadata.json` at its root, 49 files and all 46 manifest assets. Every ZIP
  file's SHA-256 matches the exported original. Bundle:
  `_expo/static/js/android/entry-1f85eb385c5659406af42bf760ed26ca.hbc`.
  Patch-application evidence is stored with the delivery files after packaging.
  No EAS publication or APK build is performed by Codex.
- No device was available to verify Android animations. Static geometry and
  compiled lifecycle regressions do not establish native frame pacing.

## One phone pass

1. Close the first-session celebration, then reopen a developer preview where
   available. Check the fade and Reduce Motion, with no closing flash.
2. In Progress, compare a selected day's category total with its session rows;
   switch to Week/Month totals and check their named range. Check Profile after
   an online completion and after an offline result syncs, without manual refresh.
3. Complete a short session inside the timer and another in the background.
   Check walk back, result, Done, finds/trail, with no repeated card.
4. In Outfits, try owned Field jacket and a locked piece. Check status, buying,
   preview/save rules and the set chip. At large text, confirm the tabs, Get and
   Save controls remain reachable without scrolling to the end of the catalogue.
