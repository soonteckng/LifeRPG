# Round 61: Picture, rewards and background timer recovery

Base: `feature/next`, `0116adce8bba749d7b6cc626e285aa4f5b6df40d` (Round 60).
Scope: application JS/TS and regression tests. No visual redesign, dependencies,
native inputs, SQL, auth settings or database data changed.

## Reported issues

- **Picture tab:** its first press previously mounted the main portrait and
  seven detailed SVG samples together. It now mounts the main portrait and two
  samples, then draws the remaining samples separately with cancellable,
  lower-priority work. Every frame choice is immediately tappable. Row geometry
  and the finished appearance are unchanged. The measured test result is three
  portrait renders in the initial commit instead of eight, not a phone FPS claim.
- **Developer: Check for new finds:** feedback was after the long rewards group,
  often below the viewport. An empty successful claim correctly opened no reveal,
  making the action look silent. Checking, success, empty results and errors now
  appear beside the action. An immediate lock prevents double submission, and
  results are fenced to the current account admission. The action still uses the
  normal claim path and never invents finds.
- **Returning after the deadline:** the independent clock store could notify the
  timer before React committed the matching phase, briefly pairing zero seconds
  with a running session. Clock readings now carry their matching context and
  account scope. Local durable expiry runs before the existing optional offline
  capability refresh. An elapsed active countdown stays out of view while its
  saved completion settles. Server confirmation still controls credit; this does
  not manufacture completion, XP or a receipt.

## Additional reproduced races and performance work

- A refresh started before a rewards mutation could return late and overwrite
  the newer wallet/avatar and offline cache. A per-owner mutation generation now
  rejects that stale response or error. Opening a second rewards consumer during
  a mutation does not send a redundant read.
- An outfit deep link could capture fallback hair/clothes before the actual
  avatar loaded, then save those defaults over the real look. Untouched previews
  now follow the saved avatar. Saving requires a loaded avatar; manual edits made
  against an obsolete saved appearance require an explicit Reset/review. The
  comparison includes editable appearance/equipment values, not unrelated wallet,
  inventory, frame or revision changes. Late save replies cannot navigate after
  the screen unmounts.
- Hidden squad consumers no longer start delayed session-change reads. A delayed
  refresh also rechecks visibility and app foreground state before running. Normal
  visible polling, cached offline data and focus/foreground catch-up remain.

## Backend review boundaries

Only read-only database metadata/function/log queries were used. No sign-ups,
test emails, live mutation tests, migrations or auth-setting changes were run.

In the reviewed last-24-hour request window, the reward claims and reads all
returned 200. Claim origin latency was approximately 162 ms at p95 and rewards
reads approximately 240 ms. These observations do not show a backend outage
explaining the Picture rendering stall.

Live reward claim/save RPCs check the authenticated expected owner; claims
serialize through the owner's locked wallet and unique claimed-session records.
Avatar saving checks the expected revision and item ownership. The reviewed
public reward RPCs refuse anonymous execution, and the private helpers are not
directly executable by authenticated clients. This is a targeted review, not a
claim that the whole app has no security issues.

The existing Supabase advisory about leaked-password protection remains. No auth
configuration was changed. RLS-without-policy and security-definer advisories also
need to be interpreted in the context of private tables and deliberate RPC-only
access; no grants or policies were changed in this round.

## Verification

- TypeScript typecheck and full Expo lint: clean.
- App suite with external network access blocked and one test worker:
  **1,422 passed, 0 failed, 0 skipped** (333 seconds). Round 60's same suite had
  1,390; the 32 additions cover these races and rendering/lifecycle behaviour.
- Includes unchanged offline protection integration, protected break expiry
  online/offline, exact-zero End, failed/delayed completion, durable write delay,
  cold recovery, account/backend transitions, clock/context ordering, rapid
  reward taps, empty claims, real hook/service/store mocked-transport integration,
  stale reward reads, avatar conflicts and hidden squad refreshes.
- Focused Picture tests confirm initial render work falls from eight detailed
  portraits to three, all seven choices respond immediately, and queued artwork
  cancels on exit. This measures render work, not physical tap latency.
- Independent reviews found and corrected the failed-mutation refresh edge case;
  no further concrete regression was found in the reviewed changes.
- Diff whitespace check: clean. Android fingerprint in this same verification
  checkout is unchanged at `49308616e025891eba4e874277a734a7281f16bb` before/after.
  This checkout's native line endings/local ignore state differ from the user's
  publishing checkout; the installed APK's target remains the `4f0739...` runtime
  below. No fingerprint input file changed.
- SQL/native compilation tests were not rerun because no SQL/native inputs
  changed. Database inspection was read-only; no production mutation was used
  for validation.

## Delivery

This is an EAS Update; no APK is needed. Soon Teck applies, pushes and publishes.
Use the original `C:\Users\soonteck\LifeRPG` checkout. The installed preview APK
accepts runtime `4f07392040ace293bbe1cdb4176b5b7840d9e9b3`. Preserve its existing
local `.gitignore` and native inputs. A clean LF publishing checkout computes a
different runtime and uploads an update that this APK cannot load. The incorrect
Round 60 guidance has been corrected in the handoff and Round 60 notes.

Physical Android frame timing, tap latency, compositing and resume behaviour
still require an installed-phone check. No build or update has been published
by this work.
