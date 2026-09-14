# Performance measurement: deferred export graph and Browse facets

Implementation follow-up, September 8: both narrow changes were integrated into local main in `76e3b1cde2`. The isolated legacy exporter proxy's initial static output after lazy imports is **1,890 B / 823 B gzip**, compared with 109,571 B / 28,990 B gzip before. Regression tests cover encoder import intent/retry and searched-pool caching/filter semantics. The full Svelte check passed with 0 errors and 0 warnings. Production transfer and end-to-end interaction latency remain unmeasured.

Measured September 7, 2026 local time. Raw results are beside this report in `measurements.json`. The original measurement script was machine-specific and is not included; the fixture, algorithm, sampling method, and bundler settings are described below.

## Browse facet counts

### Setup

- Node v24.11.0 on Windows x64, Intel Family 6 Model 189.
- Fixture: the current `static/data/snapshots/public-sequences.json` (568 real public sequence projections), cycled to the 1,518-sequence pool observed in the audit. Copies received unique IDs. Cycling preserves field/value distribution but is not a production trace.
- Candidate set: the 46 starting letters present in the fixture, 3 levels, and 17 sequence lengths: 66 count calls per invalidation.
- Each scenario had 3 warmups and 20 measured samples. The benchmark mirrors the current search and the three candidate filter implementations. It compares today's repeated search-per-count with computing the identical searched base once and retaining the same candidate filters.
- Checksums matched between implementations in every scenario.

| Search          | Current median / p95 | Shared search base median / p95 | Matching aggregate count |
| --------------- | -------------------: | ------------------------------: | -----------------------: |
| none            |      9.03 / 26.44 ms |                 8.27 / 12.59 ms |                    4,554 |
| `a`             |   113.09 / 271.53 ms |                  1.34 / 3.18 ms |                      618 |
| `theta`         |    64.38 / 198.89 ms |                  0.97 / 4.67 ms |                        0 |
| `zzzz-no-match` |    53.11 / 155.87 ms |                 2.00 / 18.49 ms |                        0 |

The machine was concurrently running other repository agents, visible in the long tails and one 143.60 ms no-search outlier. The median gap under every non-empty search remains large enough that the conclusion does not depend on those tails: recomputing the same search 66 times is material at the audited pool size. The no-search path is already single-digit milliseconds at the median, so these results do not justify a wholesale facet index.

**Decision:** optimize now, narrowly. Derive the searched pool once per `allSequences`/search invalidation and pass it to every `getMultiFilteredCount` call. Preserve the existing per-candidate filtering, category exclusion, OR/AND connective semantics, Svelte derived caching, and virtualization. Add equivalence coverage for searched counts with alternative-stacking and connective-bearing filters. Measure again before considering batch indexes for all facets.

This benchmark excludes Svelte scheduling, rendering, GC attribution, slower/mobile CPUs, and the additional catalog facets beyond letters/levels/lengths. It establishes source-computation cost, not end-to-end INP.

## Deferred export graph

### Confirmed import path

Ordinary app boot schedules `composition-root/deferred-registrations.ts` on idle. That module statically imports `get-video-exporter.ts`, which statically imports `video-exporter.ts`, which statically imports `web-codecs-video-encoder.ts`, whose runtime import of `mediabunny` reaches 68 package modules. The separate export worker also imports `mediabunny`, but it is not the only path.

`wasm-video-encoder.ts` dynamically imports `h264-mp4-encoder`, so that fallback is a separate async output and should not be counted as ordinary deferred transfer.

### Bundler proxy

An esbuild browser-targeted, minified, code-split graph was generated from current source. This is fresh graph evidence, not a production build or stale build statistics.

| Entry                               | Initial static output | Initial static gzip | All outputs including dynamic children |
| ----------------------------------- | --------------------: | ------------------: | -------------------------------------: |
| Deferred registrations              |           1,501,599 B |           432,762 B |                            2,920,988 B |
| Legacy `get-video-exporter` subtree |             109,571 B |            28,990 B |                            1,129,175 B |
| Export worker                       |             410,110 B |           107,822 B |                            1,429,714 B |

The isolated legacy exporter result shows the ordinary static cost attributable to that fallback subtree is approximately 109.6 KB minified / 29.0 KB gzip in this proxy, including the tree-shaken `mediabunny` surface. The much larger “all outputs” figure includes the already-dynamic WASM encoder and is not ordinary-visit transfer. Likewise, the worker is export-intent code and is shown only to separate it from the main-thread path.

These are esbuild proxy sizes. Vite/Rollup chunk sharing, existing vendor chunks, HTTP caching, compression choice, and browser evaluation can change actual transferred and parsed bytes. No production transfer or evaluation timing was measured, so the numbers must not be presented as user-visible latency.

**Decision:** a narrow intent-gating change is worthwhile but lower urgency than the searched-facet fix. In `VideoExporter`, replace the eager runtime imports of `WebCodecsVideoEncoder` and `WasmVideoEncoder` with dynamic imports inside `createManualExporter` after choosing the encoder. The support check can use the existing WebCodecs globals without importing the class. This keeps orchestrator registration synchronous and preserves the background-worker path while removing the legacy encoder implementation from ordinary deferred evaluation. Verify WebCodecs and WASM fallback selection plus cancellation/state reset. Re-measure the actual Vite output or browser transfer before claiming a specific byte saving.
