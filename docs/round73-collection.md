# Round 73: Collection and hidden session motion

Base: `feature/next` at `ce329f66719675c75e1dbedcd3ca3afbdc338ef9`
(the pushed Round 72 tree). The user approved the proposed bounded round:
make already-earned decorations visible, check measurable interaction costs,
and check the affected layouts. No wider product redesign.

## Existing decorations are now visible

Outfits has a 44-point Collection button in its header. It opens the shared
sheet with the existing owned decorations: art, name, rarity and an explicit
Owned label. There are seven existing catalogue decorations; this round adds
no item, price, reward rule or server catalogue entry.

This is a read-only keepsake collection, not a camp editor. Decorations are not
worn or automatically placed in the scene. There is no Buy, Equip or Save
action in Collection. Opening and closing it preserves an unsaved outfit.

Only a loaded inventory can show an empty count. Cached owned items remain
visible offline and after a refresh error. Unknown inventory shows a calm
loading/unavailable message. Retry reuses Outfits' existing owner-verified
refresh and five-second guard; Collection has no request or subscription of
its own. Ownership changes follow the current account's shared rewards state.

A decoration find, supply pack or small reward moment can now offer View in
Collection. The existing reward dismissal/visit/return paths are preserved.
A new wearable still takes priority over a decoration on a mixed reward card.
Duplicate decorations also have an inventory destination. Developer > Rewards
has Open Collection, opening exactly the normal Outfits sheet, without a grant
or a simulated inventory. Its normal developer-only access gate is unchanged.

## Reproduced performance cost

The existing countdown does not redraw the scene every second, and the static
Home trail already avoids animated-path registrations. Those checks remain;
blanket memoisation and extra network polling are not justified.

One specific cost was reproduced in the real session scene, both uncompiled
and with the production React Compiler: fire glow, fireflies and walking kept
three repeat animations registered when the route was covered, the app was
backgrounded/inactive, or the session's return screen covered its backdrop.
All eight new regression checks failed before the fix.

The backdrop now gates only decorative repeats on actual route focus and app
visibility. The session's own finds/trail screen also disables the covered
backdrop's repeats. FireGlow's new optional active flag defaults to true for
other callers. Dawn, intro, walk-back callbacks, timer deadlines, protection,
rewards, scene styles and animation durations are unchanged.

Measured registered repeat counts:

| State | Before | After |
|---|---:|---:|
| Hidden/backgrounded running scene | 3 | 0 |
| Visible running scene | 3 | 3 |
| Visible paused/completed scene | 1 | 1 |
| Reduce Motion | 0 | 0 |

Blurred scenes cannot restart from an AppState event. Repeated timer ticks do
not register extra repeats. Focusing again resumes the right decorative state,
and unmount removes subscriptions and animations. These are work-count probes,
not measurements of Android CPU use or frame rate. A connected release-build
profile is still required before claiming that every stutter is gone.

## Verification

- Collection behaviour: 13 new tests cover owned/deduplicated catalogue items,
  unknown versus empty inventory, offline/error caches, account changes,
  guarded Retry, haptics/accessibility, responsive layout and hidden content.
- Integration checks cover draft preservation, both deep-link paths, no
  inventory mutation/request from opening, real Developer navigation and
  decoration/duplicate reward links. Existing wearable navigation remains.
  The old Outfits JSX-shape assertion now checks the rendered fixed footer
  and pinned panel instead; the visible-action requirement is preserved and
  independently checked with viewport geometry.
- Scene regression: eight tests in both compilation modes. Existing result,
  dawn, walk-back, widget, map and squad checks pass in targeted runs.
- Full suite: **1,723 passed, zero failures/skips**, using isolated PGlite and
  the no-external-network guard (622.7 seconds). Typecheck, full Expo lint and
  diff checks pass. Native fingerprint inputs match the R72 baseline in this
  same checkout. Patch-application and bundle-integrity evidence is recorded
  in the delivery verification files.
- Visual QA rendered actual Collection/ItemArt/SheetHeader and Outfits TSX via
  React Native Web, using structural page/sheet shells. Twenty-one Collection
  states cover 360 x 640 at font scale 1 and 1.8, and 412 x 915. No horizontal
  overflow. Done stays visible at y545.6-615 with large text; every item is
  reachable by scrolling. All seven large-phone tiles have the same width,
  including the final tile. Outfits' existing Get/Save remain within the small
  viewport. Web geometry does not establish native modal/gesture smoothness.

No live Supabase/Auth call, data change, SQL, email testing, native/config or
dependency change. No APK build, push or EAS publication. Existing locked
dependencies were reused. All native work, especially combining the countdown
and protection notifications, remains deferred until November 2026.

## One short phone check

1. Outfits > the top-right Collection button: confirm Easel/other owned
   decorations show. Open and close it while trying an outfit, including
   offline; the outfit draft should stay. Developer > Open Collection uses
   the same screen, with the developer account's existing full inventory.
2. Run a one-minute session, dismiss to the purple bar, visit Outfits and
   return, then background/reopen. The timer, last-ten-second dawn and
   walk-back > result > Done > finds/trail sequence should behave as before.
3. When a decoration is found or received in a pack, View in Collection should
   open the sheet. Close it and go Back to continue the existing reward flow.
   This route-plus-sheet entrance and Android frame pacing remain device
   checks. No live email test or long repeated reward run is needed.

Do not infer that Round 73 has placed decorations in Camp, added more rewards,
changed the guide, shortened the result flow, or merged native notifications.
