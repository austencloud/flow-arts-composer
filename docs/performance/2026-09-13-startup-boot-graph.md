# Startup pass 4: the boot import graph

September 13, 2026. Baseline `c4be1619`. Branch
`claude/startup-performance-1h87b8`. No deployment, no production data, no
authenticated session: every measurement is a locally served production build
in a fresh isolated browser context.

The three 2026-09-08 passes worked on scheduling _inside_ the app — splash
handoff, panel prefetch, CSV coalescing, the viewer chunk boundary, carousel
mounting. This pass looks one level earlier: what the browser must download and
evaluate before any of that scheduling begins.

Two static import edges put **3,491,339 raw bytes / 989,565 gzip** of packages
unrelated to the destination into the boot graph of `/`, `/create` and
`/browse`. Both are removed. Under Slow 4G + 4× CPU, median time to hydration
fell from **9.18 s to 3.69–3.75 s** on all three routes.

## What "boot graph" means here

A SvelteKit route's client entry is `app.js` plus the generated nodes for its
layout and page. Everything reachable from those through **static** imports is
in the document's `modulepreload` set and must be fetched, parsed and evaluated
before the router can render. Dynamic `import()` is the escape hatch and is
excluded by definition — counting it would hide whether the escape hatch works.

Two byte columns appear throughout and must not be added together:

- **raw** — bytes the browser parses and evaluates. This is the CPU cost, and
  it does not shrink when the server compresses.
- **gzip** — bytes on the wire, computed from the built files with `gzip -9`.
  `vite preview` serves uncompressed, so the throttled runs below go through a
  small gzip reverse proxy (`gzip -6`) to keep the transfer component honest.

## Finding 1 — one merged 300-byte module dragged the whole `vendor` chunk onto every route

`classifyChunk()` in `vite.config.ts` names a set of vendor buckets and returns
`"vendor"` for everything else in `node_modules`. On the baseline build that
bucket is a single file: **3,280,762 raw / 917,779 gzip**. Reading its own
export list, it contains zod, bits-ui, date-fns, every `@austencloud/backgrounds`
renderer, mediabunny, `h264-mp4-encoder`, gifenc, pako, `qr-code-styling`,
the Google Maps loader and marker clusterer, `page-flip`, `modern-screenshot`,
`@tanstack/svelte-virtual`, embla, motion, miniplex, idb, mitt,
`@capacitor/push-notifications` and more.

Traversing the baseline manifest, the boot closure of the root layout reaches
it through exactly one edge:

```
nodes/0.js (src/routes/+layout.svelte)
  → chunks/DQO4YWiH.js
      → chunks/QPM0iDsS.js          (the `vendor` bucket)
```

`DQO4YWiH.js` imports exactly one binding from it — `getBackgroundController`.
That symbol is not in the root layout's source graph at all. It arrives because
`background-hold.svelte.ts` (a few hundred bytes: a keyed refcount around
`controller.freeze()` / `unfreeze()`) falls under the `experimentalMinChunkSize:
20_000` floor set by `clientOnlyChunkMergePlugin`, and Rollup merged it into the
root layout's own chunk. Rollup weighs the merged chunk's own bytes, not the
transitive chunks the merge newly reaches, so a 300-byte module carrying one
`vendor` import merges at apparently zero cost.

The consequences were larger than the bytes suggest. `MarketingChrome` uses a
**type-only** import of `BackgroundType` and defers `BackgroundHost` behind two
animation frames precisely so the renderer graph stays off first paint; it also
skips the canvas entirely on a constrained connection. Both guards were dead —
the package was already in the preload set.

**Fix.** `BackgroundHost.svelte` is the only component that mounts the
controller singleton, so it publishes the instance to the hold module
(`registerBackgroundFreezeTarget`) instead of the hold module importing the
package. Semantics are preserved deliberately: a hold taken before the host
mounts is remembered and applied at registration, which is what the package
itself did — its `setBackground()` defers and its `startAnimation()` no-ops
while `frozen`, so a pre-mount hold has always suppressed a later mount.

## Finding 2 — five string constants pulled in the compression stack

`+layout.svelte`'s `afterNavigate` calls `pruneRouteScopedParams`, from
`navigation/services/url-parameter-policy`. That module needs one thing from
the viewer layer: `VIEWER_STATE_PARAM_NAMES`, a five-element string array. It
imported it from `viewer-url-state-codec`, which compresses the `s` blob
through `navigation/services/sequence-codec`, which imports `fflate`.

`fflate` lands in the `vendor-posthog` bucket alongside web-vitals and
dompurify: **210,577 raw / 71,786 gzip**, in the boot set of every route.

**Fix.** The names move to a dependency-free
`sequence-viewer/services/viewer-url-state-params.ts`. The codec re-exports
them, so no caller changed.

## Static boot closure, before and after

Both builds are `npm run build:fast` on the same checkout and toolchain. Sizes
come from `docs/performance/2026-09-13-boot-closure.mjs`, which walks the
client manifest's static `imports` from each route's generated nodes.

| Route group                         | chunks |         raw |        gzip |
| ----------------------------------- | -----: | ----------: | ----------: |
| `/` (home) — before                 |     36 |   4,493,335 |   1,298,087 |
| `/` (home) — after                  |     32 | **831,891** | **254,848** |
| `/create`, `/browse` shell — before |     31 |   4,384,210 |   1,260,291 |
| `/create`, `/browse` shell — after  |     25 | **653,823** | **201,000** |
| root layout alone — before          |     22 |   4,198,465 |   1,212,733 |
| root layout alone — after           |     17 | **526,988** | **165,469** |

That is 81.5% less raw and 80.4% less gzip on home; 85.1% and 84.0% on the app
shell. `/create` and `/browse` resolve to the same `[...appPath]` nodes, so
their static shells are identical.

The largest remaining chunk in either boot closure is 210,577 raw — nothing over
a quarter of a megabyte survives. Before, one chunk was 3.28 MB.

## Runtime, before and after

`npm run build:fast`, `vite preview` behind the gzip proxy, Chromium 1194
headless, 1280×900 at DPR 1, fresh browser context per run, five repeats per
cell, medians reported. `throttled` is DevTools Slow 4G (1.6 Mbps down, 150 ms
RTT) plus a 4× CPU slowdown; `fast` is loopback with no throttling, which hides
most of what this change affects and is included only to show it costs nothing
there.

`hydrated` is the `tka:hydrated` mark — the root layout's `onMount`, i.e. the
first moment the page is interactive rather than server-rendered markup.

### Slow 4G + 4× CPU

| Route     | hydrated before | hydrated after |    Δ | FCP before | FCP after |
| --------- | --------------: | -------------: | ---: | ---------: | --------: |
| `/`       |        9,180 ms |   **3,754 ms** | −59% |     308 ms |    304 ms |
| `/create` |        9,194 ms |   **3,689 ms** | −60% |     932 ms |    824 ms |
| `/browse` |        9,197 ms |   **3,696 ms** | −60% |     928 ms |    832 ms |

Spread was tight — every one of the fifteen baseline runs landed between 9,118
and 9,271 ms, and every one of the fifteen changed runs between 3,669 and
3,783 ms.

Boot set actually requested before the load event, same condition:

| Route | before                               | after                                |
| ----- | ------------------------------------ | ------------------------------------ |
| `/`   | 21 req, 3,870,217 raw / 1,106,096 gz | 18 req, **473,881 raw / 150,679 gz** |

For `/create` and `/browse` the load event is not a usable boundary: the root
layout's `startAppImports()` fires DI, Firebase, auth and MainApplication as
parallel dynamic imports during layout evaluation, and the load event waits for
that whole wave, so "before load" sweeps in work that was never in the preload
set. Use the static closure table above for those two routes; the hydration
timings measure them directly either way.

Script bytes requested within the first ten seconds also fell, in the same
window, despite more requests completing because the page got further:

| Route     | 10 s before          | 10 s after            |
| --------- | -------------------- | --------------------- |
| `/`       | 71 req, 1,509,197 gz | 131 req, 1,208,459 gz |
| `/create` | 50 req, 1,458,393 gz | 118 req, 1,062,533 gz |
| `/browse` | 49 req, 1,441,010 gz | 89 req, 1,307,862 gz  |

### Unthrottled loopback

Hydration medians moved 682 → 669 ms (`/`), 662 → 589 ms (`/create`), 643 →
595 ms (`/browse`); FCP 284 → 224, 288 → 220, 296 → 220. These are single-digit
to low-double-digit percentages against run-to-run noise of the same order, and
are reported for completeness, not as the result. On loopback the 3.28 MB chunk
arrives in a few milliseconds; only parse cost remains, and this container has
four unthrottled cores.

## Behavioural verification

- `npm run check` — **0 errors, 0 warnings**.
- Focused suites, 33 tests: `tests/unit/boot-import-boundary.test.ts` (new, 11),
  `tests/unit/background-hold.test.ts` (4, two of them new),
  `tests/unit/navigation/url-parameter-policy.test.ts` (5),
  `src/lib/shared/navigation/services/url-parameter-policy.test.ts` (6),
  `src/lib/shared/sequence-viewer/services/viewer-url-state-codec.test.ts` (7).
- The boundary test was run against the pre-change tree and **fails there** on
  exactly two assertions — `fflate` reachable from the root layout, and
  `background-hold` importing `@austencloud/backgrounds`. The
  `@austencloud/backgrounds`-from-the-root-layout assertion passes on both
  trees, which is the point: that edge never existed in source, only in the
  merged chunk, and the `background-hold` assertion is what guards it.
- **Live freeze path**, production build, `/create`: the cosmic canvas paints
  and animates (1,780 of 4,096 sampled pixels change per second), the
  page-hidden hold stops it dead (**0** changed pixels over the same interval),
  and showing the page again resumes it (1,785). This exercises the whole new
  seam: BackgroundHost registering at component init, the hold reaching the
  controller, and the release. `tka:background:first-frame` on `/create` moved
  1,298 → 1,270 ms.
- The homepage's marketing canvas does not mount in this container on either
  build — `tka:background:first-frame` is absent from `/` before and after — so
  it is pre-existing environment behaviour, not a regression. The homepage
  hero's own canvas does render, and reached ready 2,271 → 1,710 ms.

## Limitations

- **Create and Browse cannot be measured to task-ready here.** Firestore is
  blocked by the container's egress proxy (`403` on
  `firestore.googleapis.com`), so module activation stalls behind auth:
  `module-chunk:create:start` fires at ~6.6–7.5 s in both builds. It moved
  6,615 ms from 7,492 ms (Create) and 6,032 ms from 6,802 ms (Browse), but that
  is gated by a failing network path and is directional only. Time to first
  usable Construct option — the metric the 2026-09-08 passes used — was not
  reproduced.
- Both `build:fast` runs in the final pair exited non-zero on a post-adapter
  prerender step with `ECONNRESET` from the same blocked Firestore host. The
  client and server bundles and the adapter output were complete; the
  landing critical-CSS step was re-run by hand for both. Earlier runs of the
  same command on the same checkout exited 0, so this is intermittent
  environment egress, not the change. Baseline and changed builds hit it
  identically.
- Five repeats on one shared cloud container is a small sample. No p50/p95 or
  field claim is made. The throttled condition is a DevTools emulation, not a
  phone on a real radio.
- Transfer figures are `gzip`; Cloudflare serves Brotli, which will be smaller
  still. Neither the ratio nor the absolute deployed transfer was measured.
- Total bytes over a whole session are largely unchanged. `vendor` still loads
  on every route — later, in parallel, off the hydration path. The exception is
  a constrained connection, where the guards that were previously dead now
  genuinely prevent the download.

## Not done, deliberately

The `vendor` bucket is still a single 3.3 MB chunk, so one accidental import
can still be expensive and any dependency bump inside it invalidates the whole
file for returning visitors. Splitting it is a build-configuration change with
a real chunk-cycle risk (the 2026-06-16 TDZ outage), so it is specified rather
than attempted here:
[`docs/superpowers/specs/backlog/2026-09-13-vendor-chunk-split-design.md`](../superpowers/specs/backlog/2026-09-13-vendor-chunk-split-design.md).

`MainApplication.svelte` statically reaches zod, bits-ui, fabric, dexie,
`qr-code-styling` and the backgrounds package across a 644-module graph, so
making its own `BackgroundHost` import lazy — the obvious next move — would
save nothing while `vendor` remains one chunk. It becomes worthwhile only after
the split.

## Reproducing

```bash
npm run build:fast
node docs/performance/2026-09-13-boot-closure.mjs
node docs/performance/2026-09-13-boot-closure.mjs --top "home /"

npx vite preview --port 4173 --host 127.0.0.1 &
# preview serves uncompressed; the proxy is what makes the throttled transfer
# figures comparable to the deployed site
node docs/performance/2026-09-13-gzip-preview-proxy.mjs &
BASE=http://127.0.0.1:4174 \
  node docs/performance/2026-09-13-boot-graph-probe.mjs after out.json
```

Numeric evidence: [`2026-09-13-startup-evidence.json`](2026-09-13-startup-evidence.json)
(both runs, every repeat, per-route resource accounting and marks).
