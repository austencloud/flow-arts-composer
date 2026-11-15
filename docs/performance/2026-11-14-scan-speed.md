# Scanned card speed, cold first visit (2026-11-14)

Branch `codex/scan-speed`. Goal: shorten the wait before a scanned card shows
on a phone, on a first visit, without changing what the visitor sees.

## Result

Time from opening `/q/A3G5` until the card's pictures are visible. Five cold
runs each, alternated, on d2 with nothing else running.

| Build                           | Median     | Range       |
| ------------------------------- | ---------- | ----------- |
| Before: local main `66fa969`    | **6.30 s** | 6.27–6.97 s |
| After: `codex/scan-speed`       | **5.41 s** | 5.31–5.47 s |
| Live site (same rig, for scale) | 8.59 s     | 8.40–8.99 s |

The local builds are served from the same machine, so their absolute times
run about 2 s under the live site. Compare before with after, not with live.

Film strips, one frame every 0.5 s, from run 1 of each build:
[before and after](2026-11-14-scan-speed/before-after.jpg),
[live](2026-11-14-scan-speed/live.jpg).

## Rig

Private headless Chrome per run (fresh profile), 392 x 735 at 2.75x,
CPU slowed 4x, network 9 Mbps down / 1.5 up with 165 ms round trips.
Analytics ingest and the scan-record write are blocked so a run records
nothing. A build is served by `wrangler pages dev` behind a local HTTP/2 and
brotli front door that serves the static files from disk, like the edge does.
Scripts: [scan-speed-time.mjs](2026-11-14-scan-speed/scan-speed-time.mjs),
[h2-static-proxy.mjs](2026-11-14-scan-speed/h2-static-proxy.mjs),
[strip.py](2026-11-14-scan-speed/strip.py). The card counts as shown when the
card's picture stack is visible with its images decoded.

## Where the time goes (medians, ms after the scan opens)

| Stage                                  |  Before |   After |
| -------------------------------------- | ------: | ------: |
| First paint (dark page)                |    1060 |    1072 |
| Scan page code running (`scan:start`)  |    3881 |    3756 |
| Viewer code ready                      |    4133 |    3829 |
| Card component mounted                 |    4831 |    4611 |
| Card's cache lookup done               |    5353 |    5010 |
| Card pictures: first request           |    5427 |    3906 |
| Card pictures: last one in             |    5845 |    4406 |
| **Card visible**                       |    6298 |    5413 |
| JavaScript downloaded before the card  | 2436 KB | 2066 KB |
| Main-thread long tasks before the card | 2262 ms | 1652 ms |

- **0 to 1.1 s:** the page arrives and paints dark.
- **1.1 to 3.8 s, "Loading sequence…":** about 680 requests and 2 MB of
  compressed JavaScript download and run before the scan page's own code
  starts. This is now two thirds of the wait.
- **3.8 to 4.6 s:** the viewer mounts; one long main-thread task.
- **4.6 to 5.4 s:** the card waits for the rest of that mount work, then
  decodes and shows its pictures. The pictures themselves are already in.

## What each change bought

1. **three.js off the scan (about 0.3 s, 370 KB).** Since 2026-11-01 the
   tunnel page's 3D cast reached three.js through a small stage-facing
   helper, so every scan downloaded 1.5 MB of 3D code it never ran. The
   helper now lives in `viewer-front-stage.ts`, and
   `scripts/verify-boot-chunks.mjs` fails a build if any lazy vendor chunk
   joins the scan viewer again (it caught the old build). Viewer code is
   ready 0.3 s sooner.
2. **Card pictures start during "Loading sequence…" (about 0.6 s).** The
   scan page already knows the sequence and props, so it derives the card's
   canonical cell hashes and starts those five downloads as soon as it runs
   (`scan-cell-prefetch.ts`). The card's own requests take the bytes from
   there (`pictograph-cloud-cache.ts`), because the cells are served with
   `max-age=0` and the browser cache would not hand them over. Pictures now
   arrive 1.5 s earlier, before the card even mounts. Every run still made
   exactly five cell requests, so the hashes match the card's. Cost: none
   new; the same five small Storage reads (about 3.5 KB each), started
   earlier, and no Firestore reads.

Tried and taken back: skipping the card's IndexedDB lookup on a first visit
(opening the store ahead, then a localStorage "has pictures" flag). It moved
the card by 0.05 to 0.14 s, inside the run-to-run range. The new
`scan:cell-prefetch-start` mark and a temporary "cache ready" mark showed
why: the lookup finishes when the viewer's mount work lets it, not when the
database is ready.

## What is left, and what it would take

- **The 2 MB of code before the scan page runs (about 2.7 s of the wait).**
  Firebase and auth, analytics, and the effect renderers load with the
  viewer. Deferring them is a multi-day refactor across the viewer shell.
- **The viewer's mount work (about 0.8 s).** Same refactor.
- **Show the card's stored picture right away.** A product choice: it would
  put a card on screen at about the 1.5 s mark instead of "Loading
  sequence…", then hand over to the live card. The `?frame=1` prototype on
  `/sequence/[id]` is a start.
- Showing pictures one by one (undoing the whole-card arrival) would buy
  nothing now: all the pictures are in before the card mounts.

## Not verified

- The live site after a ship: nothing here is shipped.
- A real phone: every number is from the throttled headless rig.
- Cards other than A3G5. The prefetch uses the same canonical-cell contract
  the QR warm uses, so mixed-duration and joined cards should match; a
  visitor whose card is not dark (a light-mode setting) gets five wasted
  small requests and the card fetches its own.
