---
status: active
value: 4
effort: M
remaining: "The canonical cloud-cell path remains active inside the complete Sequence Viewer. The separate pre-viewer Choreo Card was retired by product decision on 2026-08-01 because showing the same card twice felt abrasive and repetitive. Remaining performance work is to establish cold and warm complete-viewer readiness baselines, trim that graph, and set replacement budgets without restoring a choreography preview."
depends_on: "internal: complete-viewer readiness budgets are not yet baselined"
plan_path: "docs/superpowers/plans/shipped/2026-06-29-instant-scan-card-pictographs.md"
tags: []
last_triaged: 2026-08-01
---

# Instant Scan-Card Pictographs — Design

**Date:** 2026-06-29
**Status:** Implemented; the pre-viewer card presentation was retired
**Goal:** When the complete Sequence Viewer appears after a QR scan, its Choreo
card uses canonical cloud cells instead of rasterizing every pictograph on the
scanner's phone. Until that viewer is stable, the route shows a neutral loading
gate with no duplicate choreography.

---

## Reconciliation (2026-08-01)

- The separate pre-viewer Choreo Card is retired. Showing a complete card during
  loading and then showing it again inside the Sequence Viewer felt abrasive,
  repetitive, and visually discontinuous when the two layouts differed.
- `/q/[code]` now loads the complete viewer immediately behind a neutral loading
  gate. The first visible choreography belongs to that viewer after it reports
  its own card stable.
- Server preparation is limited to the hydrated sequence and prop configuration.
  It no longer prepares a second card layout or resolves every cloud-cell URL for
  temporary preview markup.
- The per-cell cloud store remains in scope and continues to serve the real card
  inside the viewer. This product decision removes duplicate presentation, not
  the canonical cloud-render pipeline.
- The former cold and warm card-preview budgets are historical. Replacement
  budgets must measure complete-viewer readiness.

---

## Reconciliation (2026-07-30)

- The June 29 implementation landed the performance marks, canonical cloud key,
  Firebase cell store, cloud tier, save warming, scan-route opt-in, and critical
  path changes.
- The production contract then became stricter. Commit `0a6d9afca4` fixed the
  Storage rule and added an admin warm pass. Commit `1031928883` made scan-card
  acquisition cloud-only and required QR creation to verify both card themes
  before minting. Commits `93f134783c`, `d72100928b`, `193bb2241f`, and
  `86ce42d01c` added legacy backfill, warm deduplication, held-step width parity,
  and motion-visibility keys.
- Current scans never crowd-source a personal-preference render. QR creation,
  library saves, and the admin backfill own canonical uploads; scanners only
  download verified assets.
- The declared `first-cell-painted` stage was the one source-level gap found in
  this pass. It now marks the first committed cell on the next animation frame,
  and `all-cells-stable` uses the same frame boundary. Non-scan cards no longer
  create scan marks.
- Eleven focused suites pass 47 tests.
- The shared repository check reports 0 errors and 5 warnings in four unrelated
  files.
- The 2026-07-30 Chrome 150 production-preview run used a 390 × 844 mobile
  viewport, 4× CPU slowdown, and Slow 4G. Cold `scan-to-stable` measured
  14,613.4 ms; warm measured 10,595.5 ms. Both provisional budgets failed.
- Cloud acquisition behaved correctly. The cold run downloaded 11 canonical
  cells with HTTP 200 responses. The warm run used 11 IndexedDB blobs and made
  no cloud-cell requests. Neither run had a failed cell.
- The measured warm critical path spent 4,443.7 ms resolving the short code and
  5,911.4 ms between `card-mount` and `all-cells-stable`. Detailed stage data and
  the next profiling targets are recorded in
  `docs/reference/scan-card-perf-budget.md`.

---

## Problem (evidenced, not assumed)

Traced the full `/q/[code]` scan path with three parallel code explorations.
Findings (file:line):

1. **Every pictograph cell re-renders live on the scanner's device.**
   `ChoreoCard` → `CardGridLayout` → `renderCell()`
   (`src/lib/shared/sequence-viewer/services/preview-cell-renderer.ts`) composes
   each pictograph from SVG parts, rasterizes it via the worker pool
   (`src/lib/shared/render/services/worker-render-pool.ts`), and caches the PNG
   blob in IndexedDB (`pictograph-blob-cache.ts`). The cache is **per-device**.

2. **A scanner's IndexedDB is always empty on first visit**, so every cell
   rasterizes from scratch (~50–200ms per batch on desktop; worse on a phone).
   This cold render is the "took a while to stabilize" the user observed in a
   posted scan video.

3. **A pre-rendered whole-card image already exists but is never shown.** Each
   shortcode doc carries `thumbnailUrl` (generated + uploaded on every save —
   `src/lib/features/library/services/library-save-service.ts:103`). The scan
   page fetches it at SSR (`src/routes/q/[code]/+page.server.ts:40`) and uses it
   **only for the OpenGraph meta tag** (`+page.svelte:217`). The scanner stares
   at a pulsing word-glyph loader instead.

4. **Heavy critical path before the card even mounts.** `+page.svelte` onMount
   runs a `Promise.all` that blocks on full glyph-cache init (all 26 letters +
   every turn/element/TnD glyph — needed for the _animator_, not the static
   card), lazy chunk parse (ViewerSplitPane + Orchestrator), and shortcode
   resolve + hydrate, all before `ChoreoCard` renders.

5. **No instrumentation.** No perf marks on this path, no time-to-stable budget,
   no regression test.

**A real per-pictograph image store does not exist.** `static/pictographs/{box,
diamond}/{α,β}/{0-3}-hand.png` is a 16-file stub (start positions, hand variant
only). The cloud thumbnail pipeline (`cloud-thumbnail-cache.ts`, Firebase
Storage WebP + manifest) is **whole-sequence, browse-gallery only** — not wired
into the scan card and not at cell granularity.

---

## Approach (decided)

Stop rasterizing pictographs on the scanner's phone. Instead, **the
`ChoreoCard` inside the complete viewer assembles its grid by downloading
per-pictograph images** that were rendered once, elsewhere, and stored globally.
There is no separate loading-preview card. (A whole-card static thumbnail was
also rejected: a frozen card desyncs from the live animation canvas. Per-cell
images keep the viewer's card real and the animation independent.)

Generation strategy: **crowd-sourced + render-at-publish (combo).**

- First device to ever render a given pictograph uploads it (self-warming).
- The owner's save/publish proactively renders + uploads every cell, so the
  first scanner of a fresh sequence is already warm.

Storage backend: **Firebase Storage for v1** (decision + rationale below).

---

## Storage backend decision: Firebase Storage (v1), R2 read-mirror later

**Chosen: Firebase Storage**, as a sibling of `cloud-thumbnail-cache.ts`.

Rationale grounded in this repo:

- The combo strategy **requires client-side upload** (both crowd-source and
  render-at-publish upload WebPs from the browser). `cloud-thumbnail-cache`
  already performs authenticated client upload to Firebase Storage. Reuse it.
  R2 has **no client upload path** here — it would need a new signed-URL Worker.
- It is a true sibling of the existing whole-sequence thumbnail cache (same
  `manifest.json` + `knownExists` + localStorage pattern). Maximum reuse, per
  `never-hand-roll.md`.
- The localhost-https CORS script already exists (`npm run storage:cors:apply`,
  memory `reference_firebase_storage_cors_localhost_https`).

Why not R2 now: R2's wins (zero egress, edge CDN) are **scale-cost**
optimizations, not a speed requirement for a handful of small WebPs per scan.
In this codebase R2 is the _server-published bulk_ pattern (daily shortcode
snapshot JSON) — the wrong fit for ad-hoc client writes.

**Migration trigger (documented, not built):** Part 4 instrumentation logs real
field latency + egress. If those numbers justify it, add an R2 **read-mirror**
(server-published from the Firebase bucket, mirroring the snapshot pipeline) and
point reads at the R2 CDN while keeping Firebase as the write target.

---

## Components

### Part 1 — Per-cell cloud image store (core fix)

**New service:** `src/lib/shared/render/services/pictograph-cloud-cache.ts`
(sibling of `cloud-thumbnail-cache.ts`, cell granularity instead of
whole-sequence).

- **Key:** the existing deterministic hash from
  `src/lib/shared/sequence-viewer/services/cell-cache-key-deriver.ts`
  (pictograph identity + prop type + color/view mode), **normalized to one
  canonical render size** (display scales via CSS; viewport size must NOT be in
  the cloud key or every breakpoint forks a new image). Same hash on every
  device → globally reusable: one stored image serves that pictograph across all
  sequences.
- **Storage path:** Firebase Storage `pictograph-cells/{hash}.webp`.
- **Manifest:** `pictograph-cells/manifest.json`, loaded once on scan-page boot
  to pre-populate a `knownExists` set so reads never 404-probe. Mirror
  `cloud-thumbnail-cache`'s manifest + localStorage-persisted `knownExists`
  (7-day TTL) approach exactly.

**New tier in the cell pipeline** (`preview-cell-renderer.ts` /
`src/lib/shared/choreo-card/services/choreo-card-cell-pipeline.ts`). Lookup
order becomes:

1. IndexedDB blob cache (existing, per-device, fastest when warm)
2. **NEW: cloud cell cache** — if `knownExists`, download the WebP (no render)
3. live worker render → store IndexedDB → **upload to cloud** (crowd-source;
   skip upload if already `knownExists`)

A cold scanner (empty IndexedDB) hits tier 2 and downloads — never rasterizes.

### Part 2 — Render-at-publish

In `library-save-service.ts`, immediately after the existing whole-card
`generateAndUploadThumbnail`, add a **background** step:

- For each step in the sequence, derive the canonical cell key for the
  sequence's `intendedProp` + default scan color mode, render via the worker
  pool, and upload any not already in `knownExists`.
- Fire-and-forget — must not block or slow the save success UX.
- Guarantees the first scanner of a freshly-published sequence is warm.

### Part 3 — Critical-path trim (complete viewer)

On `src/routes/q/[code]/+page.svelte`:

- Load the complete Sequence Viewer immediately behind the neutral gate.
- Keep choreography hidden until the viewer reports its own card stable.
- Defer unrelated analytics and application services so they do not compete
  with the viewer's module and render path.
- Do not reintroduce a separate `ChoreoCard`, static thumbnail, or server-built
  cell grid as loading content.

### Part 4 — Instrumentation (lands first; proves before/after)

`performance.mark` / `performance.measure` at each stage boundary in
`+page.svelte` onMount:
`ssr-meta-received → services-init → shortcode-resolve(start/end) →
chunk-load → hydrate → card-mount → first-cell-painted → all-cells-stable`.

- One headline `scan-to-stable` measure.
- Pipe into the existing `src/lib/shared/analytics/runtime-monitor.ts` + a dev
  overlay (console table or on-screen in dev).
- Optionally log `scan-to-stable` + per-stage timings to analytics so real
  field numbers come back from actual scans (the video-poster scenario), and to
  feed the R2 migration-trigger decision.

### Part 5 — Automated tests

- **Unit (Vitest — the CI regression guard):** cell-pipeline tier logic.
  - cloud hit ⇒ worker render is **never** called
  - cloud miss ⇒ render **and** upload are called
  - key determinism: same pictograph + options ⇒ identical key across two
    simulated "devices"; canonical-size normalization holds across viewport
    sizes
  - manifest pre-population seeds `knownExists`
- **End-to-end budget (Chrome DevTools MCP, throttled CPU + network):** load
  `/q/[code]`, read the `scan-to-stable` mark, assert under budget cold and
  warm. Documented manual/periodic procedure (DevTools MCP is not CI).

**Historical provisional card-preview targets (retired 2026-08-01):**

- Warm (cloud images cached/known): `scan-to-stable` < 400ms
- Cold (first-ever scan, images downloaded not rendered): < 1000ms

Complete-viewer readiness needs a new measured baseline before replacement
targets are set.

---

## Original sequencing (historical)

- **Phase 0 — Instrumentation (Part 4).** Land marks + measures first, capture a
  baseline on a throttled profile. Nothing else is provable without this.
- **Phase 1 — Per-cell cloud store + pipeline tier (Part 1).** The biggest win.
  Includes unit tests for the tier logic (Part 5 unit).
- **Phase 2 — Render-at-publish (Part 2).** First-scanner-warm guarantee.
- **Phase 3 — Critical-path trim (Part 3).** Defer animator glyph init, mount
  card first, preload chunks.
- Tests (Part 5) land alongside each phase; the DevTools budget check runs at
  the end of Phase 1 and again after Phase 3.

---

## Out of scope / non-goals

- R2 read-mirror (documented migration trigger only; not built in v1).
- Bulk offline pre-generation of the full pictograph universe (the chosen combo
  self-warms; bulk pre-gen can be a later baseline if field data shows cold-tail
  misses).
- The browse-gallery whole-sequence thumbnail pipeline is unchanged. (The
  gallery's perceived slowness on hard reload is a separate in-memory-cache-loss
  issue, tracked separately; the per-cell store may incidentally help but is not
  scoped to fix the gallery here.)
- The animation canvas render path is unchanged; it remains independent of the
  static pictograph cells.

---

## Reuse / never-hand-roll ledger

- **Cloud cache pattern:** reusing `cloud-thumbnail-cache.ts` structure
  (manifest + knownExists + localStorage + Firebase Storage client upload) as a
  cell-granularity sibling. Not rebuilding upload auth.
- **Cell key:** reusing `cell-cache-key-deriver.ts` (normalized), not inventing
  a new identity scheme.
- **Render path:** reusing `worker-render-pool.ts` + `preview-cell-renderer.ts`,
  inserting a tier — not a new renderer.
- **"Assemble from stored image, fall back to render" precedent:** Tika's
  `InlinePictograph.svelte` already does static-file → IndexedDB → render. Same
  shape, finer key.
- **Instrumentation sink:** reusing `runtime-monitor.ts`.
- **CORS:** existing `npm run storage:cors:apply`.
