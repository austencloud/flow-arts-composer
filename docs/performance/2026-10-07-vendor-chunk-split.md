# Vendor split and startup chunk repair

October 7, 2026. Local baseline-to-candidate comparison using production builds and fresh isolated Chromium contexts. The baseline checkout was `8efe4d1b5ca26900464e9daa7f678d6885235d64`; the measured candidate was `fec90004ad59a9265431fdba007116bd80c97885`, including main through `98706205164da1d698beffc53e5a59974a86228d`. No deployment or authenticated session.

Other work landed on main between these builds. Workspace dependencies, including `@tka/render-core`, resolve through a shared `node_modules` junction to the primary checkout, and renderer sources changed during the measurement period. This is not a single-variable experiment: timing differences cannot all be attributed to the chunk changes. The emitted chunk sizes and startup import paths provide direct evidence for the boundary repair.

## What changed

The baseline catch-all `vendor` file was 3,270,163 raw bytes and 912,397 bytes with local gzip compression. Its largest contributors were the backgrounds package, media encoders and the audio inference runtime. They now have separate named chunks:

- `vendor-backgrounds`: `@austencloud/backgrounds`.
- `vendor-media-export`: `mediabunny`, `h264-mp4-encoder`, `gifenc`, `modern-screenshot`.
- `vendor-audio-inference`: `onnxruntime-web`, `@ricky0123/vad-web`.

Shared UI, maps and `pako` remain in the residual vendor bucket. The measured large feature packages justify the split; adding more buckets would need its own evidence. Existing Svelte, Firebase and Three package boundaries remain in place, along with the 20 KB minimum automatic chunk size.

The fresh baseline also exposed a startup regression that source import tests could not detect. Rollup merged `winter-starfield.ts` into a shared chunk that the root layout imports. That introduced a static edge to `vendor-three`, which then reached the entire residual vendor file. The exact starfield module now joins the existing Three bucket. Its only runtime dependency is Three; the scene-config import is type-only.

Two subsequent builds revealed the same failure with different small scene helpers: `CanvasLifecycle.svelte` landed in a shared Italian-translation chunk, then `organic-pond-shape.ts` landed in a shared notification chunk. Both introduced static paths from startup to Three. All three observed modules now join the Three bucket.

A scan of the emitted graph identified ten other small chunks carrying individual scene helpers with runtime imports only from packages already assigned to Three or Svelte. Nine of those helpers also join the Three bucket. Camera preferences stays separate because its module initializes shared state and reads local storage.

The next build repaired the common startup graph but still merged `gltf-decoders.ts` into a chunk shared with the home page. That pure decoder helper also joins Three, for thirteen explicit module boundaries in total. The guard now includes the home and app-shell route nodes and correctly rejects that intermediate build. The list is recorded in `vite.config.ts`. This is a measured candidate set, not a whole-folder rule; emitted sizes are only a selection heuristic because Rollup applies its threshold before final minification. The emitted startup guard remains the acceptance check.

The same scan found `stage-coordinate-frame.ts` merged with 2D pictograph code,
bringing Three and backgrounds into that shared chunk. It now has its own exact
`scene-stage-coordinate-frame` boundary. Keeping it separate avoids adding a
backgrounds dependency to the Three bucket. Its runtime initialization only
reads a scene configuration constant; it does not access browser state.

Installed Rollup 4.57.1 has no per-chunk exemption for `experimentalMinChunkSize`. Manual chunks are removed from automatic merging, which makes explicit boundaries the available narrow fix. The rest of the 3D source tree retains its existing classification.

The source boundary test now covers the newly separated feature dependencies. `npm run verify:boot-chunks` also checks the emitted manifest from the app entry, SvelteKit start entry, root layout, home page and app-shell layout/page. Route node indices are resolved from the same build's generated sources. It rejects any static path to the four heavy feature chunks and fails if the expected entries or buckets disappear. Web App CI runs this guard after its production build. The original common-startup guard rejected the baseline artifact; the expanded guard also rejected the intermediate home-page leak.

## Measurement method

Both builds use `npm run build:fast` with `ANALYZE=true` and `DIAG_CHUNKS=1`. The analyzer opens a browser only when `ANALYZE_OPEN=true` is also set. The package attribution below comes from the captured client analyzer output, not its earlier server output.

The same Vite production preview on port 4175 and gzip proxy on port 4176 serve both builds. The probe runs `/`, `/create` and `/browse` three times each under loopback and throttled conditions: 1.6 Mbit/s download, 750 Kbit/s upload, 150 ms latency and 4x CPU slowdown. Each fresh context has a 1280 x 900 viewport and an observation window scheduled for 20 seconds. External services are blocked with `LOCAL_ONLY=1`.

Hydration time is the existing `tka:hydrated` mark at the start of the root
layout's `onMount`. It does not mean that feature initialization, remote data
or optional downloads have finished. First contentful paint (FCP) is recorded
separately.

Byte counts describe local JavaScript requests started by the named checkpoint. Unfinished downloads count, so a slow build cannot look smaller merely because requests have not completed. Raw bytes are requested code size, not measured evaluated code. Gzip figures are level-9 estimates from the built files; the proxy uses level 6. Neither is a measurement of deployed transfer size or Brotli compression.

The static manifest graph and browser request graph answer different questions. The landing HTML delays some modulepreloads until after paint, and the exact load-event cutoff varies between runs. At ten seconds, a faster build can have requested more optional code because it has progressed further. Read the timing, request and byte columns together.

## Results

The final production build passed the expanded startup guard. Its combined
common, home and app-shell graph has 47 chunks and no static path to Three,
backgrounds, media export or audio inference. Both server and client chunk
diagnostics report zero cycles.

| Emitted files or static graph  | Baseline raw bytes | Candidate raw bytes | Baseline gzip estimate | Candidate gzip estimate |
| ------------------------------ | -----------------: | ------------------: | ---------------------: | ----------------------: |
| Residual `vendor` file         |          3,270,163 |             851,894 |                912,397 |                 241,071 |
| Root layout                    |          6,510,675 |           1,315,591 |              1,862,919 |                 419,962 |
| `/create`, `/browse` app shell |          6,638,679 |           1,439,881 |              1,897,583 |                 455,062 |
| `/` full static route graph    |          7,035,107 |           2,656,803 |              2,014,874 |                 810,445 |

The app shell's raw static closure is 78.3% smaller, the home's is 62.2%
smaller, and the residual vendor file is 73.9% smaller. These are code-size
comparisons, not measured speedups.

All 18 visits in each build reached the root hydration marker with no page
exceptions or local JavaScript loading failures. The medians below use three
fresh contexts per cell. Times are milliseconds.

| Connection | Route     | Hydration before | Hydration after | FCP before | FCP after | Long tasks in first 3 s before / after |
| ---------- | --------- | ---------------: | --------------: | ---------: | --------: | -------------------------------------: |
| Loopback   | `/`       |              862 |             600 |        292 |       300 |                          1,804 / 1,798 |
| Loopback   | `/create` |            1,165 |           1,665 |        416 |       456 |                            1,209 / 257 |
| Loopback   | `/browse` |              858 |             528 |        304 |       308 |                          1,838 / 1,783 |
| Throttled  | `/`       |           15,289 |           8,598 |      1,180 |       832 |                          1,212 / 1,571 |
| Throttled  | `/create` |           14,814 |           9,761 |        908 |       932 |                              380 / 780 |
| Throttled  | `/browse` |           16,565 |           8,112 |        888 |     1,068 |                              406 / 664 |

Throttled hydration improved by 34% to 51% across the three routes. Loopback
Create was 500 ms slower at the median, and first paint did not improve
consistently. Its individual candidate hydration times were 1,792, 1,665 and
539 ms. The samples and shared-machine conditions do not establish why this
route slowed down. These results support a smaller startup dependency graph
and better throttled hydration, not a universal speedup or full feature readiness.

Requested JavaScript at the load event, including unfinished requests:

| Connection | Route     | Requests before / after | Raw bytes before / after | Gzip estimate before / after |
| ---------- | --------- | ----------------------: | -----------------------: | ---------------------------: |
| Loopback   | `/`       |                 19 / 47 |      489,704 / 2,680,036 |            159,094 / 818,738 |
| Loopback   | `/create` |                 39 / 37 |    6,661,809 / 2,410,199 |          1,905,926 / 736,437 |
| Loopback   | `/browse` |                 39 / 37 |    6,661,809 / 2,410,199 |          1,905,926 / 736,437 |
| Throttled  | `/`       |                 53 / 47 |    7,058,547 / 2,680,036 |          2,023,217 / 818,738 |
| Throttled  | `/create` |                 39 / 37 |    6,661,809 / 2,410,199 |          1,905,926 / 736,437 |
| Throttled  | `/browse` |                 39 / 37 |    6,661,809 / 2,410,199 |          1,905,926 / 736,437 |

Requested JavaScript at ten seconds:

| Connection | Route     | Requests before / after | Raw bytes before / after | Gzip estimate before / after |
| ---------- | --------- | ----------------------: | -----------------------: | ---------------------------: |
| Loopback   | `/`       |               176 / 172 |    9,700,301 / 8,564,186 |        2,825,826 / 2,533,253 |
| Loopback   | `/create` |               308 / 308 |  12,667,343 / 11,770,882 |        3,771,888 / 3,549,454 |
| Loopback   | `/browse` |               294 / 296 |  12,173,817 / 11,288,732 |        3,616,998 / 3,398,802 |
| Throttled  | `/`       |                53 / 131 |    7,058,547 / 6,360,752 |        2,023,217 / 1,876,842 |
| Throttled  | `/create` |                39 / 180 |    6,661,809 / 9,810,605 |        1,905,926 / 2,908,952 |
| Throttled  | `/browse` |                39 / 259 |   6,661,809 / 10,838,173 |        1,905,926 / 3,244,734 |

The loopback homepage's load-event count increased while its ten-second byte
count fell. This is consistent with more deferred requests falling before the
load-event checkpoint; the counts alone do not establish the cause.
Throttled Create and Browse request more optional code by ten seconds
after reaching hydration earlier. Those downloads are included even when
unfinished: the final throttled runs still had a median of 107 pending scripts
on Create and 60 on Browse at the end of the observation window.

## Validation

- The production build passed. Server and client chunk diagnostics both report
  zero cycles; the sole incoming Three chunk edge is the deliberate isolated
  `scene-stage-coordinate-frame` chunk.
- All 20 source import boundary tests passed, and all 53 public-page Firebase
  boundaries passed. The expanded emitted startup guard passed the final build
  and rejected the earlier home-page leak.
- The client analyzer has no duplicated module IDs across the checked vendor
  buckets. All 13 scene leaves occur once in Three; the stage-coordinate helper
  occurs once in its own chunk. All 24 emitted `pako` modules remain in residual
  vendor. Background CSS is extracted separately, and `gifenc` emitted no modules.
- A separate browser check imported all four heavy chunks successfully, with
  zero page exceptions or JavaScript HTTP errors. The homepage rendered its
  animated preview. Create and Browse reached their shells but still showed
  loading states three seconds after hydration with external requests blocked.
  This checks startup and module evaluation, not complete feature workflows.

### Integration build

After the timing matrix, main advanced. A separate production build at
`4149037776f7628b3a047bdde4ba1205309c4ebc`, including main through
`8c48b871c0353303492bfb0919798270cc390ddf`, passed with the analyzer disabled.
Both chunk graphs have zero cycles. The startup guard passed with 46 union
chunks, the public Firebase guard passed all 53 pages, and all 20 focused tests
passed. Its app-shell static graph is 1,417,020 raw bytes / 449,173 gzip bytes;
the homepage graph is 2,633,907 / 804,526. The timing tables above still describe
the earlier measured candidate, not this integration artifact.

An isolated browser check of this build allowed up to 30 additional seconds
for the startup loading screens to clear. Create rendered its creation choices;
Browse rendered its navigation but still showed remote sequences loading with
external requests blocked. The homepage rendered its animated preview. All four
heavy chunks imported successfully, with zero page exceptions or JavaScript
HTTP errors. This verifies the visible startup screens and chunk evaluation;
authenticated operations and remote sequence retrieval remain outside the test.

Subsequent main commit `1066719638687c4d63652d16c4336600c2431d42`
contains only staff-grip lab styles and a picker label, with no import changes.
Those changes are covered by the normal local integration checks rather than
another full production timing run.

The [machine-readable evidence](2026-10-07-vendor-chunk-split-evidence.json)
contains build provenance, static closures, all 36 individual browser runs,
medians and validation details. Full analyzer output and raw logs were retained
locally under `E:/tmp/codex-vendor-split-20261007/`. An interrupted intermediate
probe and a final probe started before the preview was ready are excluded from
the comparison; the reported final matrix began after an HTTP 200 readiness check.

## Largest baseline vendor contributors

These are the client analyzer's rendered module bytes before final chunk minification. Gzip is the sum of separately compressed modules, so it is useful for attribution but does not add up to the final chunk's compressed size. The final vendor file size above is the download comparison.

| Package                    | Rendered bytes | Sum of module gzip bytes | Modules |
| -------------------------- | -------------: | -----------------------: | ------: |
| `@austencloud/backgrounds` |      1,170,079 |                  305,580 |     152 |
| `mediabunny`               |      1,157,237 |                  236,379 |      67 |
| `h264-mp4-encoder`         |      1,021,273 |                  295,005 |       2 |
| `onnxruntime-web`          |        410,552 |                  111,661 |       4 |
| `bits-ui`                  |        245,225 |                   71,499 |     417 |
| `pako`                     |        227,405 |                   63,373 |      24 |
| `zod`                      |        192,640 |                   38,237 |      88 |
| `date-fns`                 |        107,660 |                   33,654 |     304 |
| `@datadog/sketches-js`     |         90,235 |                   22,559 |      30 |
| `webrtc-adapter`           |         86,119 |                   22,068 |      10 |
| `linkifyjs`                |         58,632 |                   20,252 |       1 |
| `barcode-detector`         |         58,223 |                   16,593 |       2 |
| `protobufjs`               |         56,729 |                   15,890 |      14 |
| `modern-screenshot`        |         54,576 |                   13,902 |       1 |
| `qr-code-styling`          |         48,674 |                   14,342 |       3 |
| `@ricky0123/vad-web`       |         48,572 |                   13,763 |      29 |
| `embla-carousel`           |         48,013 |                   11,065 |       1 |
| `page-flip`                |         44,083 |                   10,277 |       1 |
| `wavesurfer.js`            |         40,438 |                   11,626 |       1 |
| `@austencloud/sidebar`     |         38,560 |                   11,320 |      20 |

## Limits

These are local measurements on one shared machine, not production field percentiles. The proxy uses HTTP/1.1; deployed connection scheduling may differ. External services and authenticated workflows were not tested. The static preview does not implement `/api/console-log`: the baseline recorded 45 HTTP 404 responses and aborted requests there, and the candidate recorded 47. The candidate also recorded one aborted `/browse/__data.json` request. These are retained in the evidence and are separate from JavaScript loading failures.

## Reproduce

Use the [boot probe](2026-09-13-boot-graph-probe.mjs), [gzip proxy](2026-09-13-gzip-preview-proxy.mjs) and [static closure report](2026-09-13-boot-closure.mjs). After a production build, run `npm run verify:boot-chunks` and `npm run verify:public-firebase`. For the browser comparison set `BASE=http://127.0.0.1:4176`, `LOCAL_ONLY=1`, `REPEATS=3` and `WINDOW_MS=20000`, then run the boot probe with a label and output JSON path. Respect the repository's server and memory limits when starting the preview.
