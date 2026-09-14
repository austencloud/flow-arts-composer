# Startup performance: second implementation pass

Continuation of [the startup audit](2026-09-08-startup-audit.md). The baseline
for this pass is the first pass's production build at `4eeaea16d0`; subsequent
baseline commits only changed documentation. No production deployment is involved.

## Changes

- Keep the sequence viewer's URL and native QR intake mounted, but load its
  orchestrator and shared viewer shell only when a sequence enters the overlay.
  `SequenceViewerDrawerContent` composes the existing owners; it does not create
  another viewer implementation. The chunk is retained for reopening. Loading and
  retry states remain inside the drawer. A failed chunk releases the native scan
  cover and settles native readiness as failed, making retry and dismissal usable.
- Prepare pictograph arrows and props concurrently. Both consume the same motion
  snapshot; neither needs the other's result. Publication still awaits both.
- Recheck transformed SVG caches after shared fetches resolve. Previously a batch
  of cards shared one download but could each recolor and parse the same artwork.
  Props retain each caller's position and rotation. Cache keys continue to separate
  hand colors, themes and fan appearance.
- Load the arrow split manifest alongside the base arrow SVG. Transform and cache
  the complete result without another asynchronous gap, so concurrent cards share
  the split artwork as well as the base SVG.
- Add opt-in `pictograph:prepare-arrows` and `pictograph:prepare-props` spans for
  separating the remaining preparation costs. They use the existing bounded boot
  profiler and carry no sequence contents.

The workspace resize settling guard remains. Earlier evidence showed that removing
it could present the wrong grid layout and move an option under the pointer.

## Measurement conditions

Local production preview over HTTPS, guest contexts, 1280×900 desktop and
390×844 mobile at DPR 1, no CPU or network throttling. Each initial sample uses a
new isolated application context. These are local browser observations on a shared
machine, not field percentiles or mobile hardware benchmarks. HTTP/browser process
warmth and server startup affect timing; do not combine different viewports into
one speedup figure.

The same [observation script](2026-09-08-startup-observer.js) runs before application
scripts for before and after. It observes SVG presence, ancestor visibility and
hit testing. This is a useful readiness proxy, not an actual painted-frame
guarantee. Its own layout reads add overhead. Script resource totals use requests
starting in the first ten seconds; shared chunks overlap, and manifest closure
sizes must not be presented as bytes saved on the network.

## Results

The produced viewer host's static closure fell from 232 chunks (13,509,234
uncompressed JS bytes) to 62 (6,752,488 bytes). Most of those chunks are shared
with other features; this is a boundary check, not a claim of 6.8 MB saved.
The heavy content is a separate dynamic chunk, absent from initial Construct's
resource list and fetched once on the first viewer open.

Both viewport samples recorded the same first-ten-second script totals:

| Metric                   |    Before |     After |
| ------------------------ | --------: | --------: |
| JavaScript requests      |       341 |       292 |
| Encoded JavaScript bytes | 3,838,499 | 3,433,836 |

That is 49 fewer requests and 404,663 fewer encoded bytes in this measured window.
The second build corresponds to `b962469cdd`; a later type-only assertion was
erased at compilation. Subsequent merges from main were checked separately.

Individual startup samples, milliseconds since navigation:

| Viewport         | Before: choices usable | After: choices usable |
| ---------------- | ---------------------: | --------------------: |
| Desktop          |                  3,750 |                 2,946 |
| Mobile emulation |                  2,072 |                 2,318 |

These samples do not establish a consistent elapsed-time improvement. They expose
run-to-run noise while the request/byte reduction repeats. Navigation workerStart
was zero in the after samples; a service worker claimed the pages later. Script
requests used HTTP/2. The shared local certificate directory became empty during
other tasks' integrations, so the task generated its own local certificate and
restored HTTPS before measuring. The failed preview attempt is excluded.

First alpha selection in the before samples took 1,018 ms desktop and 951 ms
mobile. The after interaction samples overlapped another page beginning to load,
so their durations are retained with a caveat in the evidence and are not used
to claim an interaction speedup. The batch tests prove eliminated duplicate work;
they do not prove a visible latency reduction under these browser conditions.

## Remaining measured bottleneck

At both tested viewports, Construct uses the swipe layout. All four slide bodies
mount immediately: the visible slide has 16 options and 1,104 SVG descendant
nodes, while the three hidden slides have another 20 options and 1,386 SVG nodes.
`aria-hidden` and `inert` prevent interaction but do not prevent rendering work.
The first desktop baseline spends about 473 ms settling the workspace resize,
then has a roughly 335 ms main-thread task while mounting the options. This is a
strong next profiling target. Grid SVG styling also repeats per instance.

A follow-up should preserve all carousel slide roots for geometry while scheduling
offscreen bodies without introducing blank slides or stalling the first swipe.
Do not remove the resize guard or simply move the stall to navigation. No claim
of complete speed optimization is made here.

## Verification

- SVG batch tests use real shipped SVG fixtures and verify one transform per key,
  independent per-card poses, theme/hand separation, complete split-arrow data,
  and recovery after a failed fetch. The preparer test verifies concurrent work
  without publishing a partial frame.
- `npm run build:fast` passed. No upload or deployment was run. Existing unused
  CSS/import, browser externalization and Cloudflare route-limit warnings remain.
- `npm run check` passed with zero errors and zero warnings after merging main.
- Fifty focused tests passed after the combined merge, including SVG preparation,
  native scan readiness, viewer shell contracts and workspace playback state.
  The profiler's seven tests passed earlier in this pass.
- Production browser inspection confirmed desktop/mobile alpha options with
  complete pictographs, adding A, a direct existing public `?v=` link opening the
  viewer, normal viewer open, close/history cleanup, and cached reopen. The viewer
  chunk was requested once across two opens. Native device handoff and deliberate
  chunk-failure injection were not exercised in a device runtime; their existing
  readiness tests and failure-path review supplement the web checks.
- The direct-link page logged Chrome's blocked-vibration message before any user
  gesture. Construct had no console errors. A later dev-only console logger
  request failed to determine clientAddress during server restart; application
  rendering continued.

Numeric evidence: [second-pass report](2026-09-08-startup-pass-2-evidence.json).
