---
status: shipped
value: 4
effort: M
remaining: None. Implemented and verified; measurements and limits are recorded in docs/performance/2026-10-07-vendor-chunk-split.md.
depends_on: ""
plan_path: ""
tags:
  - performance
  - build
  - chunking
last_triaged: "2026-10-07"
work_state: complete
---

# Split the catch-all `vendor` chunk — Design

## October 7 implementation

The implementation separates the measured large backgrounds, media-export and
audio-inference packages. Shared UI, maps and `pako` stay in the residual bucket;
the proposed extra splits below remain design history, not outstanding work.
Thirteen exact scene helpers join the existing Three bucket after production
artifacts showed repeated accidental startup merges. Four were observed in
startup chunks; nine others were selected from small emitted chunks with the
same dependency pattern. The 20 KB automatic merge threshold stays in place.
One additional scene-coordinate helper gets a separate exact chunk boundary
after it was found merged with 2D pictograph code, pulling in Three and backgrounds.

The source import test now includes the newly separated packages. An emitted
manifest guard also checks the common, home and app-shell startup graphs in CI, covering accidental
Rollup merges that source tests cannot see. The analyzer opens a browser only
with `ANALYZE_OPEN=true`.

See the [measurement report](../../../performance/2026-10-07-vendor-chunk-split.md)
for package attribution, production graph checks and browser evidence. Browser
byte figures count requested JavaScript, including unfinished requests. They do
not measure parsing or evaluation, and estimated gzip is distinct from transfer.

## Original design, September 13

**Origin:** measured during the 2026-09-13 startup pass
([report](../../../performance/2026-09-13-startup-boot-graph.md)). That pass
removed the two app-side static edges that put `vendor` on every route's
hydration path. The chunk itself is unchanged, and it is still the single
largest download on `/`, `/create` and `/browse`.

## Problem

`classifyChunk()` in `vite.config.ts` names a handful of vendor buckets
(`vendor-svelte`, `vendor-sveltekit`, `vendor-three`, `vendor-firebase`,
`vendor-posthog`, `vendor-dexie`, `vendor-pixi`, `vendor-fabric`, `vendor-pdf`,
`vendor-capacitor-core`) and then returns `"vendor"` for **everything else in
`node_modules`**. On the 2026-09-12 build of `c4be1619` that bucket was a single
3,280,762-byte file (917,779 gzip).

One chunk means all-or-nothing loading. Reading the built chunk's own export
list, `vendor` currently welds together at least:

| Group                | Packages seen in the chunk's exports                                                                                                                                                                                                |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Validation           | `zod` (`object`, `discriminatedUnion`, `toJSONSchema`, `ZodFirstPartyTypeKind`, …)                                                                                                                                                  |
| UI primitives        | `bits-ui` (Dialog, Popover, Menu, Collapsible, Slider, Portal), `@austencloud/sidebar`, `@austencloud/chip-toggle`                                                                                                                  |
| Backgrounds          | `@austencloud/backgrounds` — every renderer: Cosmic, Ocean, Forest, Blossom, Rainbow, Ember, Winter, Autumn, Celestial, Void                                                                                                        |
| Video / image export | `mediabunny` (`Mp4OutputFormat`, `EncodedVideoPacketSource`), `h264-mp4-encoder`, `gifenc`, `modern-screenshot` (`domToBlob`), `pako`                                                                                               |
| Maps                 | `@googlemaps/js-api-loader` (`importLibrary`), `@googlemaps/markerclusterer`                                                                                                                                                        |
| Dates                | `date-fns` (twelve calendar helpers)                                                                                                                                                                                                |
| Misc single-feature  | `page-flip`, `qr-code-styling`, `@tanstack/svelte-virtual`, `embla-carousel-svelte`, `motion`, `miniplex`, `idb`, `mitt`, `eventsource-parser`, `svelte-confetti`, `@capacitor/push-notifications`, `@capgo/capacitor-share-target` |

The landing page needs `bits-ui` and the cosmic renderer. It gets the H.264
encoder, the MP4 muxer, the page-flip book, the Google Maps loader and every
other background system with them. Any route touching any one of these pays for
all of them, and the size makes accidental edges expensive: a single merged
sub-20 KB module was enough to put the whole file on every route's hydration
path until 2026-09-13.

Two properties make this worse than a normal shared bundle:

1. **`experimentalMinChunkSize: 20_000`** (`clientOnlyChunkMergePlugin`) folds
   small automatic chunks into their neighbours. Rollup weighs the merged
   chunk's own bytes, not the transitive chunks the merge newly reaches, so a
   300-byte module carrying one `vendor` import can be merged into a
   boot-critical chunk at apparently zero cost. That is exactly the
   `background-hold.svelte.ts` regression.
2. **A cache-invalidation cost.** Every dependency bump anywhere in the bucket
   rewrites one 3.3 MB hashed file, so returning visitors re-download all of it.

## Non-goals

- Reverting `experimentalMinChunkSize`. It exists because the automatic split
  shattered the launchpad closure into 238 files (202 under 10 KB); that
  measurement still stands. The fix is to make the merge target cheap, not to
  stop merging.
- Re-chunking `vendor-three`. Its boundary is load-bearing for the 2026-06-16
  TDZ outage and must not be disturbed.

## Deliverables

1. **Measure per-package bytes inside `vendor`.** `ANALYZE=true vite build`
   (the `visualizer` plugin already wired in `vite.config.ts`) writes
   `stats.html` with gzip size per module. It is configured with `open: true`,
   so a headless run needs that flipped or a `BROWSER=none` equivalent.
   Record the top twenty in the report; do not
   split on the export-name inventory above, which proves membership but not
   size.
2. **Name the buckets.** Proposed starting split, each keyed on packages a
   single feature area owns:
   - `vendor-backgrounds` — `@austencloud/backgrounds`. Reached only through
     `BackgroundHost.svelte`, which is already dynamic-imported behind two
     animation frames on every surface that mounts it.
   - `vendor-media-export` — `mediabunny`, `h264-mp4-encoder`, `gifenc`,
     `modern-screenshot`, `pako`. Export-only; no boot surface imports them.
   - `vendor-maps` — `@googlemaps/*`. One tab.
   - `vendor-ui` — `bits-ui` and friends: genuinely shared, genuinely wanted
     early. This one should stay near the boot path.
   - `vendor` — the remainder.
3. **Prove acyclicity.** `DIAG_CHUNKS=1 npx vite build` must report
   `CYCLES (0)` and no new edge into `vendor-three`. Every package that
   statically imports `three` stays in `vendor-three`; check the maps and
   media groups for that before splitting them out.
4. **Re-measure with the same harness.** `docs/performance/2026-09-13-boot-graph-probe.mjs`
   against `vite preview`, both the unthrottled and the Slow-4G/4×-CPU
   condition, on `/`, `/create` and `/browse`. Report bytes at the load event
   and at ten seconds, separating transfer from parsed/evaluated JS.
5. **Extend the boundary test.** `tests/unit/boot-import-boundary.test.ts`
   currently guards the root layout's static graph. Add the packages that the
   split makes lazy, so a future static import fails in a unit run rather than
   in a production trace.

## Risks

- **Chunk cycles.** The 2026-06-16 outage is the precedent; `DIAG_CHUNKS` is
  the gate, not a code review.
- **More requests.** Splitting one file into five costs round trips on HTTP/1.1
  and almost nothing on the HTTP/2 the site actually serves. Verify against the
  measured request counts rather than assuming either way.
- **A package that spans groups.** `pako` is used by both compression and image
  paths; if it lands in two buckets Rollup will hoist it back to a shared one.
  Check the visualizer output for duplicated modules after the split.
