---
status: active
value: null
effort: null
remaining: "Verify print cache reuse, key isolation, failed-build retry, and preview responsiveness in Deck Releaser."
depends_on: ""
plan_path: ""
tags: []
last_triaged: 2026-10-07
work_state: unverified
---
# Deck Releaser print speed and layout

**Date:** 2026-08-11

## Outcome

Repeated print or download actions for the same deck and the same print settings
reuse the prepared PDF. The first front-bearing export still allocates and
finishes one serialized artwork run. Reusing that prepared artifact does not
allocate another run.

The optional How to Read insert is off by default and can be enabled from the
Print panel. Its setting controls the preview, sheet and image counts, PDF/ZIP
contents, and document metadata.

At wide desktop sizes, the print rail is narrower and the preview presents two
Letter sheets side by side. Smaller viewports retain a single sheet column.

## Ownership

- Extend `print-pdf-cache.ts` as the owner of prepared PDF artifacts.
- Reuse `FilterChipBase` for the independent How to Read toggle.
- Reuse `SegmentedControl` for the exactly-one output selector.
- Keep page composition in `PrintPreviewPages.svelte`.

## Cache contract

The artifact key includes the print schema, deck reference and content,
footers, theme, prop types, card size, copies, grouping, output mode, insert
choice, document metadata, and the explicit re-render generation. Any of those
changing produces a cache miss.

Prepared artifacts live in a bounded in-memory LRU and a bounded IndexedDB
store. IndexedDB failure is non-blocking: printing falls back to a fresh build.
Failed builds are never cached, and concurrent requests for one key share the
same in-flight build.

## Preview responsiveness contract

- Cached card images hydrate from persisted PNG blobs into object URLs. Route
  entry does not recreate or retain full-resolution front/back canvases.
- Print-ready canvases are reconstructed only when a PDF cache miss or ZIP
  export needs them. A prepared-PDF cache hit skips reconstruction entirely.
- A cold card render runs at two-card concurrency because card backs still use
  main-thread DOM rasterization. The Vite development worker pool is likewise
  capped at two; the production bundle retains its eight-worker ceiling.
- Below-fold sheets defer image decode and paint. The first two sheets remain
  eager/high priority so the visible preview does not wait on lazy-load
  discovery.
- Module startup must not speculatively import Museum/Three.js. Museum remains
  available through the navigation-intent prefetch path and normal activation.

## Verification

- Unit tests prove cache reuse, key isolation, and retry after a failed build.
- Print-model tests prove metadata with and without the insert.
- Existing PDF/ZIP insertion tests remain green.
- A module-loading performance contract prevents boot-time Museum preloading.
- The focused suite passes 25 tests across PDF caching, print metadata,
  PDF/ZIP insertion, worker limits, and module loading.
- Live Vite compilation covers the Svelte/state wiring. The repository-wide
  fast check still reports pre-existing errors in unrelated modules.
- Chrome DevTools screenshots and measurements cover 1920x1080, 2560x1440,
  3840x2160, 1440x900, 820x1180, 960x412, and 375x667.
- In the comparable authenticated cache-hit trace, retained JS heap fell from
  526 MB to 247 MB and the longest task fell from 2,177 ms to 915 ms after
  removing eager canvas reconstruction. A fresh authenticated tab after the
  final changes rendered six sheets and 54 image elements at roughly 280 MB,
  with no Museum resources and no composition worker started on the cache-hit
  path. A five-second event-loop probe measured 17 ms worst-case scheduling lag.
- Computed cursors are `auto` on the document, preview, paper, print panel, and
  page guides; only interactive card cells use `pointer`. The final viewport
  sweep had no horizontal document overflow and no browser console warnings or
  errors.
