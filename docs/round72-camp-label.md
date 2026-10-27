# Round 72: Camp label

Prepared on Round 71 as pushed to `feature/next` at
`20caaf8b2a2bcd8f6cffb09a881c2e1bee28a547`. Its tree matches the verified Round 71
patch. The user says Round 71 is "so far ok"; do not turn that into a claim that
every Android motion case has been verified.

## Change

The teal Camp label was centred exactly on the trail's starting coordinate,
under the portrait. Move the existing pill and its text to the left, leaving
12 points between the pill and the portrait's starting box. The offset follows
the map width and keeps a minimum left inset. The label still denotes the same
starting point; all path, walking, map, stats and reward calculations are unchanged.

This is the only application change. No new feature, component, button,
animation, request, permission or dependency. No test mirrors this three-property
visual edit; existing map/animation tests and manual geometry/visual checks are
used alongside the required full checks.

## Improvements discussed, not implemented

The user wants a simpler, finished app. Keep major feature scope frozen.

1. Measure responsiveness on the installed release app: cold opening, purple-bar
   return, result presentation, first map opening and Outfits. Optimise measured
   work, not speculative blanket memoisation. Existing character motion already
   stops on blur/background.
2. Finish the existing reward loop. Seven decorations can already be earned and
   have art, but currently have no collection view. A read-only view of owned
   decorations could use existing catalogue and ownership data without a camp
   editor or a new database table. This has not been added in Round 72.
3. Consider a faster normal completion: an optional View trail when no item was
   found, keeping the bigger reveal for meaningful rewards/milestones. This is
   a proposed product change, not permission to alter the agreed result flow.
4. Give onboarding a concrete first routine using the existing ideas and editor,
   rather than more preference questions or AI. Guide changes still wait for
   authorisation and settled layouts.
5. Do a consistent small-phone/large-text/offline/loading pass and a small student
   beta before another redesign. Use the existing session log for diagnosis;
   don't add telemetry infrastructure without a concrete need and approval.

More items are content, not a new system: later add one coherent outfit set at a
time. New reward IDs require matching client art/catalogue and approved server
catalogue SQL. They need no native build, but they are not a client-only update.
Do not change rewards or run a migration based on this ideas discussion.

## Verification and boundaries

Static visual/geometry checks cover 27 cases: map widths 260/300/360, heights
260/380/600, at 0/1/7 minutes. The actual portrait, pet and streak frame were
rendered. The minimum label-to-portrait gap is 12 points; Camp stays inside the
map, and the path data matches the R71 parent exactly. This does not establish
native frame pacing.

- Full suite: **1,699 passed, zero failures/skips**, with isolated PGlite and
  external networking blocked. Command:
  `node --wasm-num-compilation-tasks=1 --v8-pool-size=1 --require ./tests/helpers/no-external-network.cjs --test --test-concurrency=1 tests/*.test.cjs`.
- Typecheck, full Expo lint and diff checks pass. Existing dependencies reused.
- Native fingerprint and patch/bundle integrity evidence are saved with the
  delivery files. Publish only from the user's original Windows repo, preserving
  `.gitignore` and native files; do not force or override a runtime match.
No SQL, Auth, live data change or email testing. No APK build, push or EAS
publication. All native work, including combining the countdown/protection
notifications, remains deferred to November 2026.

On the phone, check Camp on the Home map and the post-session trail at zero and
a few minutes. It should remain readable beside the portrait. No long session
or repeated reward testing is needed for this label change.
