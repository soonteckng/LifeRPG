# Round 74: a calmer session return

Base: `feature/next` at `bc4a972f4fbc92c0c2de6c5470e4980cf7b179c3`
(the pushed Round 73 tree).

The user says the result card is smooth. Keep that card, make Done its only
dismissal action, improve the transition into the map, fade back into the app
after the map, and clearly show when the 120-minute trail is already finished.

## Reproductions before the fixes

- A real AppSheet test observed pan-down enabled on a supposed Done-only
  receipt. The same dismiss callback was reachable from Back, the dim and the
  accessibility handle. The new explicit lock test failed before the fix.
- The actual session/rewards integration test observed the reveal queue already
  empty immediately after Continue, before an exit could finish. The map was
  removed first, exposing the timer, then the ordinary downward close ran.
- Seven readiness/state checks failed in the old implementation, in both
  ordinary and production-compiled controls. SessionReveal started its 260 ms
  entrance before the map existed; TodayTrail had no ready signal; repeated
  finds-card Continue could queue two fades; the finished-day heading still
  said On your way / 1 minute further.

These reproduce concrete ordering problems, not a measurement of every native
frame drop. Android GPU/frame pacing is still a phone check.

## Changes

### Done-only result card

SessionResultSheet opts into AppSheet's new `dismissible={false}`. Native sheet
pan, handle drag, dim taps, Android Back and accessibility escape cannot close
the receipt. The non-working drag handle is hidden. Scrolling is still owned
by the native scroll view, and the fixed native footer remains reachable.
Done keeps the real receipt/celebration/reward acknowledgement path and has a
stable testID. Existing sync/retry and Save as routine actions remain usable.

The result's whole-modal fade is 400 ms. Other sheets keep their previous
default 220 ms fade, ordinary slide, discard guard and keyboard behaviour.
An accidental native close cannot bypass a locked visible receipt; stale
native close events use the latest owner callback. Reduce Motion stays instant.

### Map readiness and entrance

TodayTrail can report readiness after its actual map layout and SVG commit,
then one frame. Cached geometry still draws immediately; unchanged measurements
do not restart an entrance. Unmount/changed layout cancels a pending callback.
No read, reward claim or data update is added.

SessionReveal waits for that signal before its single 520 ms native entrance.
The finds page reports its first layout instead. Within the reward screen,
Continue fades finds out for 320 ms, mounts the map, and only fades it in for
520 ms once ready. Repeated taps and obsolete callbacks are fenced. A 1,200 ms
fallback releases an entrance if a native layout callback is lost. Reduce
Motion changes the page immediately. The return-map walk waits 650 ms so the
map has time to become visible; session time and credit do not change.

### Map to app

A completion exit fades the retained session surface to transparent for 480 ms,
with no downward translation. Its actual map and return host stay mounted
throughout. The reveal is acknowledged only when that native fade finishes;
then the existing anchored navigation pop reveals the app beneath it.

Duplicate completion callbacks settle once. A new widget entrance invalidates
an old motion generation. Another route covering the map, or a changed account
admission, cannot use an old callback to acknowledge a reveal or pop a newer
screen. A failed/cancelled exit restores the visible surface. Running-timer
minimise and early-End exits keep their existing slide. Reduce Motion exits
without timed animation. The established lost-pop recovery remains.

### Finished trail

At the real trail endpoint the heading says Trail complete, with Finished for
today and a short return-tomorrow message. The first session reaching the end
still walks there and can show its actual bonus. On later sessions both path
endpoints are already capped by TodayTrail, so the character stays at the end.
It does not promise more distance. Real Stardust remains visible.

Find counts and awaiting-confirmation states remain separate from distance;
reaching 120 minutes never invents a collected item. Trail length comes from
the existing rules, preserving old cached data. A queued earlier-day snapshot
uses Earlier trail instead of claiming to be today's finished trail. All map,
session history, XP and reward calculations are unchanged.

## Verification

Targeted checks cover native receipt/footer behaviour, ready-before-fade,
production React compilation, duplicate taps, stale frames, a missing-layout
fallback, Reduce Motion, retained map acknowledgement, covered-route recovery,
widget entrance, celebrations, pending finds and frozen day snapshots.
Existing mock additions provide the installed Reanimated get/set/cancellation
API; existing behavioural assertions are preserved.

Actual UI/ItemArt/ProfilePicture/TodayTrail TSX was rendered with React Native
Web in 16 cases: 360 x 640 and 412 x 915, font scales 1 and 1.8, partial trail,
first finish, later finish and pending finds. Continue remains on screen and
there is no horizontal overflow. The browser shell uses fixed initial map
geometry and immediate motion for static layout checks; it does not establish
Android modal/gesture animation performance.

Full suite: **1,741 passed, zero failures/skips**, with isolated PGlite and the
external-network guard (588.8 seconds). Typecheck, full Expo lint, the new test's
lint and diff checks pass. Native fingerprint sources match Round 73 in this
same checkout. Patch and backup-bundle integrity are recorded with delivery.
No live Supabase/Auth call, email, database,
native, dependency or config change, APK build, push or EAS publication.
All native work, especially the two-notification merge, still waits until
November 2026.

## Short phone check

1. Finish one minute. Swipe down, tap the dim and press Back on the result:
   it should stay. Done should fade to the measured map without a pop-in.
2. Continue from the map: it should stay in place while fading to the app.
   Running-timer minimise should still slide down and reopen from the purple
   bar as before.
3. On the next natural find, check finds > Continue > map and an Outfits visit
   and return. An already-finished day should show the finished message and
   a stationary endpoint. No repeated 120-minute test is required solely for
   the text; Developer's existing return/empty-return controls use this real
   screen and its real current daily progress.

The chosen-reward, rest-day-token and decoration-placement ideas remain a
separate product step. None of their server rules or reward economics was
implemented or installed in this transition round.
