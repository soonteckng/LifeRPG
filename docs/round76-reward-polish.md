# Round 76: consistent finds and calmer focus

Base: pushed `origin/feature/next` at
`1efb025b87e6d3c09a2f16481905270e4b51cc29` (Round 75).
One local commit; Soon Teck applies, pushes and publishes it.

## Changes matching the reports

1. **Insufficient Stardust:** Outfits now explains the price, balance and
   shortfall, with one calm **Got it** action. It no longer presents a
   non-purchase as the primary choice beside Not now. Affordable items still
   have Buy / Not now; all normal purchase/ownership checks remain intact.
2. **Get any item or milestone:** ordinary item grants from the developer lab
   now use the shipped animated **You found something** screen, including
   decorations and picture backgrounds. Pets, frames and badges keep their
   milestone screens. Duplicate conversion and pack presentations are unchanged.
3. **Finds into the map:** this was a shared flow, so ordinary users could see
   the same out-then-in gap as Roll a test find. The map now mounts underneath
   the still-opaque finds screen. After its real drawing reports ready, only
   the cover fades away over 620 ms. The same opaque map stays mounted during
   and after the blend. There is no transparent waiting screen or second map
   entrance. Reduce Motion waits for readiness and swaps instantly.
4. **Character and brightness:** the small focus walker uses the measured
   free space between the ring's bottom and the timer area's bottom, with
   14 px minimum gaps. It is smaller and no longer sits on the ring. Missing
   or cramped measurements hide only that small decorative walker; departure
   and return remain visible. A black veil dims scenery by 82% during focus
   and pause, 35% during departure/return and 45% in settled morning. Timer,
   labels and controls remain above it. This does not change phone brightness.

## Reliability and scope

- The crossfade is shared by normal session returns, queued returns and
  developer test finds. Existing result Done-only dismissal and the final
  fade into the app are retained. No extra reward claim, map request, cache
  write, acknowledgement or currency change is introduced.
- Repeated Continue/readiness callbacks cannot restart the fade. During the
  blend, hidden layers are unavailable to touch and accessibility. A bounded
  fallback handles a lost layout or animation callback. Unmounted callbacks
  cannot reopen, close or acknowledge another reveal.
- Character bounds use ancestor-relative native layout, excluding the session
  surface's slide transform. Generation and account/admission fences reject
  stale measurements; unchanged measurements do not commit state. Decorative
  hidden/route-covered animation cancellation and the final-ten-second dawn
  rule remain intact. Measurements run on layout, not countdown ticks.
- Only the insufficient-funds dialog omits a secondary action. Other callers
  keep their confirmation choices. Its button keeps the app's haptic,
  accessibility label/role and stable `outfits-purchase-confirm` test ID.
- No database, SQL, Auth, email, dependency, config, native module or reward
  economy changes. No live network test, SQL execution, EAS publication or APK.
  The R75 developer-lab installation was not rechecked this round; its old
  SQL proposal must not be mistaken for a new R76 migration.

## Verification

- Full isolated suite: **1,773 tests passed**, zero failures/skips, with
  PGlite scenarios enabled and external networking blocked.
- Typecheck and full Expo lint pass. Explicit test lint adds no findings:
  legacy `session.test.cjs` and `sheet-confirmation.test.cjs` retain the same
  12 errors/one warning as the R75 base when separately linted; these files
  are outside Expo's app lint scope. All other edited/new test files pass.
- Both ordinary and production-compiled reward regressions prove readiness
  before fading, no second fade-in, repeated-tap guards and one retained map
  instance. Additional tests cover fallback, Reduce Motion, stale callbacks,
  milestone/item routing, insufficient funds and native measurement fences.
- Browser QA uses actual TSX/RN Web: six purchase/scene cases at 360x640
  (font scales 1 and 1.8) and 412x915; no horizontal overflow, the sole Got it
  action is reachable and the visible walker is inside its free lane. Scene
  compositions use representative measured bands, not a claim about a real
  phone's layout. Sixteen real map layouts cover small/large phones, font
  scale 1.8, normal/finished/pending/earlier progress states.
- Same-environment native fingerprint and all native source inputs match the
  R75 base: `49308616e025891eba4e874277a734a7281f16bb`. This checkout's hash
  differs from the installed Windows preview runtime; publish from Soon
  Teck's existing `C:\Users\soonteck\LifeRPG` repo as documented in HANDOFF.
- Patch application/tree identity and every backup ZIP asset/hash are checked
  in the delivery verification. Android frame pacing and actual native
  measurements still require a phone; browser/component tests do not prove FPS.

## Short phone check (developer account is enough for most)

1. Start test inventory, set zero test Stardust, open a priced locked item.
   Read the amount missing, then Got it. No second visible action or purchase.
2. Get a wearable, a background and a decoration: the animated finds screen
   appears. Get a pet/frame/badge: its milestone screen is retained.
3. Roll a test find, then Continue: the finds blend directly into the map
   without exposing the app. Continue fades to the app. Repeat with Reduce
   Motion; it swaps immediately. Test inventory/stats remain separate.
4. Run one real one-minute session: the small walker clears the ring, scenery
   is very dim and controls stay readable. Walk back, result Done and the
   no-find/real-find return still finish. Check a short screen/large text too;
   a cramped running layout may omit the small background walker.

Chosen rewards/rest-day tokens remain the next separate product increment,
requiring approved server rules. Camp placement is not implemented here.
All native work, especially combining the two ongoing notifications, remains
deferred to **November 2026**. Include this in the next Claude handoff.
