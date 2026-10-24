# Round 60: session rendering and responsiveness

Base: `feature/next` at `fe9ef2d68d2a61650a94af022b22abb3bc31f65c`
(Round 59 application code plus the handoff).

## Changes requested

1. Saving overlay: remove elevation from the full-screen scrim and stop mounting
   an invisible completed timer SVG. The centered panel and fade remain.
2. Timer return: retain only the visible landscape (two while crossfading),
   memoise the backdrop across countdown ticks, and avoid refreshing category
   choices when returning to a running or paused timer. Fix the timer snapshot's
   fresh-wrapper render loop. A quick minimise/reopen does not replay the intro.
3. Home level: allow the tier title and header chips to wrap, and let the level
   badge grow for larger text and multi-digit levels.
4. Manual End: retain measured details/action heights and non-interactive End
   spacing while the result opens; do not animate terminal timer relocation.
5. Ideas: an inaccessible empty cell balances an odd final grid row, keeping
   its last card the same width as its neighbours.
6. Outfits: isolate the stage and frame rows with memoisation and stable
   equipment props. Selecting a different frame no longer redraws every sample.
7. Home Stardust opening: the lighter Outfits stage and shared motion observer
   reduce work on the existing grow-from-chip navigation path.
8. Shared performance: all motion consumers share one OS accessibility read and
   listener. Standing avatar breathing and blink work stop on route blur and
   app background, including retained routes.

Session accounting, protection, break limits, reward claims, saved routines,
account isolation, category definitions and navigation destinations keep their
existing rules. No native, dependency, auth, app configuration or SQL changes.

## Verification and limits

- Locked dependencies installed with `npm ci`; package and lock files unchanged.
- Final `tsc --noEmit` and full `expo lint --no-cache`: pass.
- Final standard app suite: 1,390 passed, zero failed/skipped, run serially
  with the external-network guard. Command:
  `node --require ./tests/helpers/no-external-network.cjs --test --test-concurrency=1 tests/*.test.cjs`.
- Extended PGlite run: 1,476 results initially, with seven failures. After the
  test portability/fixture repairs below, the three SQL-source guards pass in
  the standard suite, both offline cases pass in the standard suite, Round 58
  isolated SQL passes 4/4, and the start/stop SQL file passes 13/13. All other
  SQL cases passed in the extended run. These are separate runs, not a claim
  that a single final command ran all 1,488 cases. The 98 additional SQL cases
  account for the difference between standard and complete extended coverage.
- SQL fixtures used the already available PGlite 0.5.8 tool installation,
  outside the repository; no application dependency was added or upgraded.
- Regression cases cover fresh timer wrappers, quick reopen, retained End
  geometry, removed hidden SVGs, visible-light mounting, obsolete fade callbacks,
  frame preview render counts and animation cleanup.
- A 120-consumer motion test performs one native read/listener. All consumers
  update together, and obsolete reads cannot override newer accessibility events.
- Outfits render counters: Look/Clothes/Gear/Pets retain the standing stage;
  two frame selections redraw the main portrait without redrawing its seven
  unchanged frame thumbnails.
- Static RN-web/Chrome layout checks at 360x640, font scales 1.0/1.3/1.8, long
  name, levels 1/100 and 999,999 Stardust: complete tier text, no horizontal
  overflow, every Ideas card 155px including the final odd card. Artwork is
  replaced with dimension-preserving placeholders in that isolated harness.
- Android runtime fingerprint in a clean LF checkout, both before and after the
  application patch: `de0355adda848fb7ff4453b91b284c71253e25c9`.
- Windows CRLF checkouts produce a different fingerprint despite equivalent
  native sources. Publish from a clean LF checkout; do not override the runtime
  version or change native files to force compatibility.
- Physical Android compositing, gesture frame timing and tap latency have not
  been profiled. In particular, removal of the saving rectangle and smooth
  reopening still need installed-phone confirmation. No claim of measured FPS.

## Test portability repairs

Three existing SQL-source assertions assumed LF. Their readers now normalize
CRLF before the same assertions; SQL files are unchanged. The Round 58 general
squad fixture now uses a valid UTC timezone. Dedicated rewards tests retain
invalid-timezone fallback coverage.

The first combined fixture run also encountered resource pressure (one SQL
worker failed and two source-loader file checks returned no extension). These
cases are rerun independently/serially, rather than changing application logic
or weakening assertions to accommodate the test host.

## Backend read-only findings

Recent rewards and squad reads succeeded. The log window also includes older
pack eligibility rejections and an SQL operator diagnostic; these are not
evidence that the reported tab rendering delay comes from the database.
Existing performance advisors remain: 13 auth RLS init-plan warnings, ten
unindexed foreign keys, one missing primary key and one unused index. They are
unchanged and require a separately reviewed database change.

One pre-existing edge case was reproduced in isolated SQL: an invalid stored
profile timezone makes squad `focus_streak` raise SQLSTATE 22023. The live
aggregate check found zero unrecognised profile timezones. A future database
proposal should validate profile zones and provide a safe fallback in squad
streak calculation. Nothing was migrated, corrected or deleted live.

No sign-ups, password resets, transactional emails, production test accounts or
destructive account actions were performed. All automated app tests use the
external-network guard; SQL fixtures run in disposable local PGlite databases.
