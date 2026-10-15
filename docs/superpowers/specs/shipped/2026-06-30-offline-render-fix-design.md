# Offline Pictograph Rendering Fix — Design (2026-06-30)

Source: `docs/archive/swarm-2026-10-14/reference/offline-persistence-audit-2026-06-30.md` findings #1 (BLOCKER) and #2 (HIGH).
Goal: make TKA pictographs render **cold-offline**, and make "Download for offline" actually
populate the cache the gallery reads (instead of orphaned blobs that evict the working cache).

## Problem (verified)

1. **Pictograph SVGs are network-only.** Props/grid/arrows/letters/numbers/glyphs are `fetch()`'d at
   runtime from `/images/*` (`prop-svg-loader.ts:106`, `arrow-svg-loader.ts:238`, `glyph-cache.ts:103`,
   `svg-preloader.ts:194`, `GridSvg.svelte:94`). `static/sw.js` has **no `/images/` rule** → they fall
   through to "network only" (`sw.js:109`). The loaders' only persistence is an in-memory `Map` that
   dies on reload. Cold offline → blank pictographs.
2. **"Download for offline" writes orphans.** `offline-cache-orchestrator.ts:103,113` stores
   `thumbnails[0]` keyed by raw URL; the gallery renderer reads by content hash
   (`thumbnail-render-orchestrator.ts:234`, hash from `deriveKey()`). Disjoint keyspaces → never read,
   and the dead blobs share the 100MB LRU and can evict the real hash-keyed cache.

Decisive architecture fact: the render input hash (`thumbnail-key-deriver.ts:112`) depends on per-sequence
data **plus live settings** (prop type, lightMode, auth-gated QR, composition manager) built inline at
`PropAwareThumbnail.svelte:183`. So the hash cannot be cheaply reproduced in the offline orchestrator.
**But** the gallery's Tier-5 local Canvas2D render (`thumbnail-render-orchestrator.ts:289`) writes under
the correct hash and, once #1 caches the SVGs, **works offline**. Therefore #1 makes offline rendering
*correct*; #2 is a *prewarm/perf* optimization on top.

## Fix #1 — durable pictograph assets offline

`static/sw.js` (bump `CACHE_NAME` `tka-v2` → `tka-v3` so existing installs re-run install):

1. **Runtime cache-first** branch for same-origin `/images/*` and `/thumbnails/*.webp`. Every viewed
   SVG / static thumbnail becomes durable (fixes in-memory-`Map` loss + HTTP-cache eviction). Uses the
   existing `cacheFirst` helper (stores in `CACHE_NAME`).
2. **Install precache** of the essential SVG set (~260KB / ~190 files):
   `props/pictograph/*`, `grid/*`, `arrows/*` + `arrow-split-manifest.json`, `letters_trimmed/*`,
   `numbers/*`, `vtg_glyphs/*`. Fed by a build-generated manifest:
   - New `scripts/generate-svg-precache-manifest.cjs` globs those dirs under `static/images/` and writes
     `static/svg-precache-manifest.json` = `{ "assets": ["/images/props/pictograph/staff.svg", ...] }`.
   - Wired into `build` (and `build:fast`) **before** `vite build` so it lands in `build/` and is served
     at `/svg-precache-manifest.json`.
   - `static/svg-precache-manifest.json` is gitignored (deterministic build artifact).
   - SW `install`: `addAll(APP_SHELL_URLS)` plus fetch the manifest and precache its `assets` with
     `Promise.allSettled` (a stray 404 must not fail install).
3. **Self-host Playfair Display** under `static/fonts/` and replace the Google-Fonts `<link>`
   (`app.html:705-710`) with a local `@font-face` so the existing `/fonts` cache-first rule covers it
   (kills the CDN offline gap; audit item #19/#8).

## Fix #2 — cloud-warm prewarm (chosen: cloud-warm only)

Rewrite `OfflineCacheOrchestrator.downloadForOffline()`:
- Remove the URL-keyed `thumbnailCache.set(url, blob)` path entirely (stops the orphan + eviction harm).
- For each cached gallery sequence, drive the **canonical** `ThumbnailRenderOrchestrator.getThumbnail({
  sequence, input })` with `input` built to match the gallery (`variant:"gallery"`, current prop/theme,
  defaults) — but **skip local render**: only warm sequences that resolve from the cloud tier (a network
  fetch that lands in the hash-keyed local cache via `saveCloudBlobToLocal`). Sequences with no cloud
  thumbnail are left to #1's offline local-render net. This is network-only, no render storm, reuses the
  existing primitive (no keyspace replication).
- Keep the adaptive concurrency throttle, tab-hidden/offline pause, and `cancel()`.

Honesty (so #2 is observable; audit #5/#11/#12):
- `getCacheStats().isOfflineReady`: derive from real coverage — gallery cached **and** thumbnails warmed
  (`thumbnailsCached > 0`), not `galleryCount > 0`.
- Drop the hardcoded `propSvgsCached: true`.
- `StorageSection.svelte:111`: stop disabling the button on metadata-only readiness; allow re-run;
  truthful labels.

## Out of scope (tracked in the audit, not this change)

`/sequence` + `/q` SPA-shell routing (#4/#7), entry-chunk install precache (#6), `navigator.storage.persist()`
(#8), grid inline fallback (#14), docs correction (#9), Capacitor `tka-v2` verify (#17). Separate follow-ups.

## Testing / verification

- Unit test `scripts/generate-svg-precache-manifest.cjs` output shape (URLs, includes the manifest json).
- `npm run check` clean; `npm run build:fast` produces `build/svg-precache-manifest.json`.
- Runtime offline simulation (DevTools): load gallery online → go offline → reload → pictographs draw;
  confirm `/images/*` served from Cache Storage and the SVG precache present after install.
