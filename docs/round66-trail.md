# Round 66: today's trail and coming back to camp

Base: `feature/next` at `9eaada662fff8f3a83effef5231bc16908ae119b`, after
Round 65. Round 65's remaining installed-phone testing is still pending.

## What was wrong

1. The map deliberately waited for a 260 ms entrance window plus an idle turn,
   after its surrounding sheet had already appeared. It now draws on its first
   measured layout. Repeated identical layout events do not redraw it, and its
   content remains present while the sheet dismisses. Home reuses the shared,
   deduplicated reward refresh when opening the map or reconnecting.
2. The pending Round 64 SQL had not been installed. Live rules still used a
   25-minute reward bank carried between days, and the client displayed a legacy
   six-stop/150-minute trail. Round 66 proposes four daily stops at 30, 60, 90
   and 120 minutes, retaining the planned 50 Stardust end bonus.
3. Today's minutes, reward countdown and find count came from different old
   calculations. Developer gifts could fill the find count; an old reward bank
   could leave eight minutes to a find independently of today's effort. A reward
   claim could also be dropped while another mutation was busy, and parsing a
   cached state could lose the configured trail rules. The client now coalesces
   pending claim triggers, preserves cached rules and freezes each reveal's
   current-day walk endpoints. The SQL proposal uses the same local-day session
   records for time, real session finds and the next eligible stop.
4. The timer scene had departure and daylight changes but no return walk. A
   fresh completion now walks towards camp, facing forward, before its result
   card appears. This is presentation only: timing, journal persistence, server
   confirmation, XP and rewards continue independently. The trail then walks
   from the claim's previous position to its saved new position.

## Race and boundary protection

- Return presentations are keyed by backend, owner, admission and session.
  Early End, recovered results and already-completed reopenings skip the walk.
  Reduce Motion swaps instantly. Backgrounding, leaving the route and account
  changes release an interrupted presentation. An interrupted native callback
  cannot finish another session's walk. A bounded fallback always releases the
  result even if the animation callback never arrives.
- Walking and end-celebration callbacks are keyed/cancelled when trail data
  changes. SVG gradient IDs are unique between mounted maps. Four-stop trails
  keep all four landscape zones and every stop in the drawing. On small screens
  with large text, full-width statistics and a scrollable containing page preserve
  the map's minimum readable height. Continue remains outside the scrolling area.
- Cached/wire trail geometry is bounded, so corrupt data cannot request billions
  of map nodes. A cached completion flag is accepted only with valid rules.
- A retained session summary does not suppress a later legitimate XP/import
  trigger. Busy triggers are coalesced; failed HTTP requests do not spin in a
  retry loop. A successful 50-session batch with pending finds can reserve one
  additional batch per distinct pending state, including the warm-cache case.
- Per-reveal positions and map bonuses belong to the current credited day.
  Mixed historical claims still keep their full currency total, but yesterday's
  distance or bonus is not shown as today's new walk or today's bonus.
- Saved effort that has reached an unclaimed stop says "Find ready" while
  confirmation is pending. It does not pretend an item was already awarded or
  skip directly to the following stop's countdown.

## SQL proposal and installation order

Publish the app update first, then review/run
`round-66-daily-trail.sql` in the Supabase SQL Editor. Its source is
`supabase/migrations/20261025090001_round66_daily_trail.sql`.

**This replaces the pending Round 64 SQL. Do not apply the old Round 64 proposal
after Round 66.** The new SQL works directly on the current old rewards schema,
and also preserves data if Round 64 was already installed. Until Round 66 SQL
is installed, the app truthfully follows the old server rules.

The proposal preserves inventory, currency, sessions, XP, historical claims and
the stored legacy reward bank. The bank is retained but no longer drives the
daily trail. Existing session finds are grandfathered into the day's four-stop
cap: an old find already earned at 25 minutes occupies stop one, so the next
eligible find is at 60 minutes. No item is taken back or paid twice. Developer
gifts and pack/milestone duplicates do not fill daily trail stops. The end bonus
is not retroactively repaid for an already-finished day.

Only sessions eligible for the wallet's existing `rewards_since` cutoff enter
the reward trail. Older sessions remain in history and XP, but cannot create a
permanently pending find that the claim function is forbidden to award.

Local calendar-day boundaries use the next local midnight, including 23-hour
and 25-hour daylight-saving days. Late imports, duplicate requests, cross-account
refusals and the claim batch limit are covered by isolated database tests. The
owner wallet lock serializes claims; PGlite duplicate-call tests are not a
multi-connection Postgres load test.

The Supabase CLI generated the migration file. Its generated timestamp preceded
Round 64's future-dated filename, so the same file was moved to the next version
after Round 64. An ordering test prevents the older proposal from overwriting
Round 66 when migrations run in filename order.

No live SQL, auth changes, sign-ups, test emails, destructive account tests,
native changes, dependency changes, builds, EAS updates or pushes were performed.

## Delivery and phone checks

Deliver one commit as `round-66.patch`, the contents of the Android export as
`dist-round-66.zip`, and the SQL proposal as `round-66-daily-trail.sql`.
Publish from the original `C:\Users\soonteck\LifeRPG`, preserving its local
`.gitignore` and native inputs. Installed preview runtime:
`4f07392040ace293bbe1cdb4176b5b7840d9e9b3`. Do not publish from a clean LF copy,
override the runtime or rebuild for these JS changes.

Phone checks still needed: opening Home's map without an empty-map pause; two
one-minute sessions moving the character and reducing the next-find time;
return-to-camp before the result; the found card followed by a visible trail
walk; and Reduce Motion. At three eligible minutes today the new rule should
show 27 minutes to the first find. Actual Android frame pacing remains unmeasured.

## Verification

- Full app suite: 1,575 passed, zero failures/skips, with isolated PGlite enabled
  and the external-network blocker loaded.
- After the final race/cutoff/layout corrections: 73 focused tests passed,
  including all 15 Round 66 SQL tests, zero failures/skips. The last row-sizing
  adjustment also passed all nine map tests and targeted lint.
- Typecheck and full Expo lint passed. No app dependencies were reinstalled or
  changed; the existing lockfile-matched installation was reused.
- Browser layout approximation: 36 combinations of Home sheet / result trail,
  360x640 / 390x844, font scales 1 / 1.3 / 1.8, and normal / pending / grandfathered
  counts. Map drawing stays at least 260 pixels tall, all stops fit its drawing,
  and Continue remains on-screen. The containing page scrolls at large text.
  This is not an Android animation or gesture measurement.
- Android fingerprint before/after in the verification checkout:
  `49308616e025891eba4e874277a734a7281f16bb`, unchanged. No native/config/lockfile
  inputs changed. The original publishing repo retains its installed runtime
  `4f07392040ace293bbe1cdb4176b5b7840d9e9b3`.
- A local Android Hermes export succeeded with one Metro worker. The initial
  concurrent attempt exhausted Windows process memory; it was stopped and the
  interrupted checks rerun successfully. No APK or EAS update was produced.
