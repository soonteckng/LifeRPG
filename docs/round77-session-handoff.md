# Round 77: continuous night and one End notice

Base: pushed `feature/next` at
`458e1e442343262f393d2527bcdabd83af643f36` (Round 76).
One commit for Soon Teck to apply, push and publish. No SQL or APK.

## 1. Blink when the timer appears

Round 76 kept a 35% black veil throughout the dusk animation. Once its
completion revealed the timer, removing the intro began another 500 ms
lighting pass toward the running scene's 82% veil. The animation had reached
night but had not yet reached the running scene's final darkness.

The veil now follows the existing dusk shared value: 35% at departure,
continuously reaching 82% before the intro finishes. Hiding the intro leaves
that final darkness unchanged, with the same native night subtree mounted.
There is no new light layer or second handoff fade. Skip and Reduce Motion
join that same final night. The final-ten-second dawn, return walk, measured
character lane and foreground timer/controls retain their existing behavior.

A related reproduced race let an already-queued native intro callback finish
a replacement departure after cancel/restart. The intro effect now cancels
its walk/dusk and fences its callback on cleanup. An old callback cannot
finish a new departure or invoke its parent after unmount.

Evidence: four lighting regressions fail on R76 in both normal and production
compilation; two additional tests reproduce the cancelled-callback race.
The new controlled shared-value tests inspect actual animated style values
across the fade, the retained night instance and the handoff. This proves the
compositing/state fix, not every possible source of Android frame drops.

## 2. Session ended card reappears after Done

The first card retained an outgoing copy for its dismissal animation. On
physical dismissal, the listener cleared that copy only if its captured
candidate was already null. A normally cancelled result still had a candidate,
so the copy survived. Clearing the selected journal record then made the real
provider's summary identity null and `summaryViewed` false. The retained End
copy was interpreted as an unacknowledged notice and reopened on Home. The
second Done worked because its candidate was then null.

The listener now releases the held copy by exact outgoing account/session
identity when the matching dismissal is acknowledged, before clearing the
journal selection. It does not depend on that stale candidate. Another
account, admission or replacement result cannot be cleared by this callback.

Evidence: two real JournalTimerProvider/controller regressions reproduce the
reopen before the fix, with production compilation and an uncompiled control.
Four additional portal cases cover online/offline projection, a neutral
recordless state, Home/refresh, another ended session and an old callback.
All pass after the fix. Existing pending offline completion -> later confirmed
receipt notification remains intentional; no global dismissed-ID blacklist
was added. A cancellation cleared by its server reply before Done still keeps
its unacknowledged card and reachable Done button.

## Verification

- **1,785 tests passed**, zero failures/skips, with PGlite enabled and external
  networking blocked. Includes the real controller/provider, ordinary and
  production-compiled UI, offline/recovery and existing reward transitions.
- Typecheck and full Expo lint pass. Explicit lint of edited/new tests adds
  no findings; `global-session-result.test.cjs` retains its pre-existing
  anonymous-host display-name error and unused-variable warning when
  separately linted, identical to the base.
- Native fingerprint and source inputs match the exact R76 base in the same
  checkout: `49308616e025891eba4e874277a734a7281f16bb`. Installed preview
  runtime remains `4f07392040ace293bbe1cdb4176b5b7840d9e9b3`; publish from the
  original Windows repo, preserving its native inputs and local `.gitignore`.
- One-commit patch application/tree proof and backup export ZIP asset/hash
  verification are recorded in the delivery metadata.
- No layout redesign, new dependency, API request, reward economics, SQL,
  Auth/email, native/config change, live database query, publication or APK.
- Actual phone blink/frame pacing still needs checking. Existing scene
  geometry and the direct finds/map crossfade remain unchanged.
- Browser QA renders the actual scene TSX at 360x640 and 412x915, at four
  controlled dusk/handoff states each. The final before/after handoff
  backgrounds are pixel-identical at both sizes. These are composed scene
  frames, not a recording or FPS measurement from an Android phone.

## Short phone check

1. Start a one-minute session normally: dusk reaches dark, then the timer
   appears without a second background lighting change. Repeat with Skip.
2. End manually and tap Done. Home appears; the ended card stays dismissed.
   Repeat offline, reconnect and reopen the timer through the running bar.
3. Complete one short session: walk back, result, Done and map still work.
   Reduce Motion remains immediate. A second distinct session can show its
   own result; the old result must not suppress it.

## Round 78 handoff, documentation only

`docs/round78-chosen-rewards-spec.md` records the user's approved specification
and six amendments. It intentionally keeps packs on launch day, starts
permanent goal-day credits the next local date, stores ordered offers on the
server, preserves old-client pack payload compatibility and requires a
wallet-first grant lock. The developer's pack bypass cannot earn real credits;
test inventory/credits stay separate. The five pack-only priced backgrounds
remain obtainable as chosen targets or purchases. No reward SQL has been
written or installed. A fixed rollout instant and frozen local-date/timezone
policy still need definition before SQL implementation/review.

The user says Claude's quota is nearly exhausted: **do not send anything to
Claude now**. Preserve the specification and finished SQL for later review
before any live execution. Rest days and camp decorations remain later,
after the repaired session flow is confirmed. All native work, especially
combining the two ongoing notifications, remains deferred to November 2026.
