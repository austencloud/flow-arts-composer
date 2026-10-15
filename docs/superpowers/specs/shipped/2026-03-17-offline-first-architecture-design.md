---
status: shipped
value: 4
effort: M
remaining: ""
depends_on: ""
plan_path: plans/backlog/2026-03-17-offline-first-architecture.md
tags: []
last_triaged: 2026-05-04
---
# Offline-First Architecture Design

**Date:** 2026-03-17
**Status:** Approved
**Goal:** Make TKA Scribe fully functional offline after a single successful load, optimized for the festival QR code scenario.

> **Status correction (2026-07-01):** The Workbox/VitePWA service worker approach
> this spec describes was never implemented. Offline pictograph rendering shipped
> 2026-06-30 to 2026-07-01 through a different mechanism: the hand-rolled service
> worker at `static/sw.js` precaches a build-generated SVG manifest
> (`scripts/generate-svg-precache-manifest.cjs` writes
> `static/svg-precache-manifest.json`) and serves `/images/*` with
> stale-while-revalidate. The body below is preserved as written for history.
> Audited current state and remaining roadmap:
> `docs/archive/swarm-2026-10-14/reference/offline-persistence-audit-2026-06-30.md`.

---

## Problem

Someone at a festival scans a QR code to check out the app. They have just enough signal to load the page once, then connectivity drops. Currently:

- The browse gallery requires a live Firestore query every time. No cache fallback.
- Prop SVG images are fetched on demand. First-time viewers on slow connections see blank pictographs.
- Thumbnails only cache after being scrolled into view. No proactive prefetching.
- The Workbox config has a catch-all cross-origin NetworkOnly rule that blocks caching of some assets that should be cacheable.

What already works well:

- Font Awesome is bundled locally at `/fonts/css/all.min.css` (not CDN). Already part of the SW precache.
- NetworkStatusIndicator shows offline/syncing/pending/error states with cloud icons.
- syncStatusState tracks Firestore pending writes and auto-syncs on reconnect.
- ConflictResolver handles multi-device version conflicts.
- NetworkStatusMonitor provides connection type (wifi/cellular) and effective speed (2G/3G/4G).
- ThumbnailLocalCache stores thumbnails in IndexedDB with 100 MB LRU.
- Firestore has persistent offline cache in production (IndexedDB + multi-tab manager).

What's missing is **proactive caching** — the app waits for the user to access something before caching it.

---

## User Scenario

1. Person at hotel on wifi scans QR code, opens app. Everything loads fast.
2. App silently caches gallery metadata + prop SVGs in background. Toast shows "Preparing offline mode..."
3. If user stays on wifi, thumbnails prefetch progressively. Settings panel shows "Offline ready" when done.
4. At campground with no signal, person opens app again. Gallery loads from cache, pictographs render, icons show.
5. They browse sequences, view animations, explore the app. Everything works.
6. Back on wifi, app syncs any new public sequences in background.

---

## Architecture

### New Service: OfflineCacheOrchestrator

A single DI service that coordinates proactive caching across three priority-ordered tasks. Registered in the offline container, wired in `offline-container.ts`.

```
OfflineCacheOrchestrator
├── Dependencies (injected):
│   ├── INetworkStatusMonitor (connection quality awareness)
│   └── IThumbnailLocalCache (thumbnail storage)
├── Cache Tasks (priority order):
│   1. Gallery metadata → Dexie `galleryCache` table (NEW table)
│   2. Prop SVGs → Workbox precache (build-time config change)
│   3. Thumbnails → ThumbnailLocalCache (existing IDB)
└── Methods:
    ├── startBackgroundCache()
    ├── downloadForOffline()
    ├── cancel()
    ├── getCacheStats(): Promise<OfflineCacheStats>
    └── clearOfflineCache(): Promise<void>
```

### Interface: IOfflineCacheOrchestrator

```typescript
interface IOfflineCacheOrchestrator {
  /** Start background caching (auto-called after gallery loads) */
  startBackgroundCache(): Promise<void>;

  /** User-triggered "download everything now" */
  downloadForOffline(): Promise<void>;

  /** Cancel in-progress caching */
  cancel(): void;

  /** Get cache stats for settings/debug UI */
  getCacheStats(): Promise<OfflineCacheStats>;

  /** Clear all offline caches (gallery cache + thumbnail prefetch) */
  clearOfflineCache(): Promise<void>;
}

interface OfflineCacheStats {
  gallerySequenceCount: number;
  galleryLastSyncedAt: number | null;
  thumbnailsCached: number;
  thumbnailsSizeBytes: number;
  propSvgsCached: boolean; // Always true after first SW install
  isOfflineReady: boolean;
}
```

**Note:** The orchestrator is a plain DI service. It does NOT expose reactive state (`$state`/`$derived`). Reactive state lives in a separate state factory (`offline-cache-state.svelte.ts`) that wraps the orchestrator, following the project's factory + context pattern.

### State Factory

```typescript
// state/offline-cache-state.svelte.ts
function createOfflineCacheState(orchestrator: IOfflineCacheOrchestrator) {
  let phase = $state<'idle' | 'caching' | 'ready' | 'error'>('idle');
  let progress = $state({ cached: 0, total: 0, currentTask: '' });
  let isOfflineReady = $state(false);

  return {
    get phase() { return phase; },
    get progress() { return progress; },
    get isOfflineReady() { return isOfflineReady; },
    // Methods that update reactive state and delegate to orchestrator
    startBackgroundCache,
    downloadForOffline,
    cancel,
  };
}

// context/offline-cache-context.ts
// Set in app root, consumed by settings panel and progress indicator
```

Only two consumers:
1. **Settings panel**: Shows cache stats, "Download for offline" button, "Clear cache" button.
2. **Toast/progress**: Shows "Preparing offline mode..." during background caching via existing toast system.

---

## Cache Tasks in Detail

### Task 1: Gallery Metadata (Priority: Critical)

**What:** All public sequence metadata from Firestore's `publicSequences` collection.

**Where:** New Dexie table `galleryCache` in TKADatabase (separate from user's `sequences` table to avoid data ownership collision).

**Why a separate table:** The existing `sequences` table holds user-owned library data with indexes for `isFavorite`, `author`, `level`. Mixing public gallery data into the same table would pollute library queries, create ambiguity about data ownership, and make `clearAllData()` inadvertently wipe the offline gallery cache.

**Schema addition (DB version 6):**

```typescript
// In DATABASE_CONSTANTS.ts
galleryCache: '++id, word, ownerId, publishedAt'

// In TKADatabase.ts
galleryCache!: EntityTable<GalleryCacheEntry, 'id'>;

// GalleryCacheEntry type — stores PublicSequenceIndex directly, not SequenceData
interface GalleryCacheEntry {
  id: string;                    // Same ID as Firestore doc
  data: PublicSequenceIndex;     // The Firestore doc as-is (includes sourceRef natively)
  cachedAt: number;              // When this entry was cached
}
```

**Why `PublicSequenceIndex` instead of `SequenceData`:** The `PublicSequenceIndex` is the actual Firestore document type. It carries `sourceRef` as a first-class field (no need to pass a separate Map). It's what `PublicSequencesLoader` fetches from Firestore. Storing it directly avoids a lossy conversion to `SequenceData` and back. The mapping from `PublicSequenceIndex` → `SequenceData` (via `mapPublicIndexToSequenceData`) happens at read time, same as the online path.

**Size estimate:** `PublicSequenceIndex` documents include display fields (name, word, tags, thumbnails, metrics) and optional compositional fields (blueSoloProp, redSoloProp, stepPairings). The compositional fields are populated for sequences that have been through the finalization pipeline. Realistically, with ~500-1500 sequences, the total is ~5-15 MB. The 200 MB budget accommodates this comfortably.

**Staleness metadata:** A separate record in the `settings` table with key `gallery-cache-meta` stores `{ lastSyncedAt: number, sequenceCount: number }`. This is checked on app load to show "Last updated [relative time]" on the gallery header when offline.

**How it integrates with PublicSequencesLoader:**

The orchestrator does NOT call `PublicSequencesLoader`. Instead, `PublicSequencesLoader` itself gains a Dexie fallback — a new `GalleryOfflineCache` service injected alongside it:

```
PublicSequencesLoader (modified):
  Online:  Firestore query → pass results to GalleryOfflineCache.persist() → return
  Offline: GalleryOfflineCache.loadCached() → return (with staleness info)
  Failed:  Firestore fails + no cache → error modal (existing)
```

`GalleryOfflineCache` is a thin service:

```typescript
interface IGalleryOfflineCache {
  /** Persist raw Firestore docs to Dexie. Called by PublicSequencesLoader after a successful fetch. */
  persist(docs: PublicSequenceIndex[]): Promise<void>;
  /** Load cached docs and convert to SequenceData[] for gallery consumption. */
  loadCached(): Promise<{ sequences: SequenceData[]; lastSyncedAt: number | null }>;
  clear(): Promise<void>;
  getStats(): Promise<{ count: number; lastSyncedAt: number | null }>;
}
```

`persist()` receives `PublicSequenceIndex[]` directly — the raw Firestore documents. No need for a separate `sourceRefs` Map because `PublicSequenceIndex.sourceRef` is a first-class field. `loadCached()` converts back to `SequenceData[]` via the existing `mapPublicIndexToSequenceData` mapping so the gallery consumer doesn't change.

This keeps `PublicSequencesLoader` focused on Firestore loading while `GalleryOfflineCache` owns the Dexie persistence. The orchestrator coordinates WHEN caching happens (triggering a gallery load to populate the cache), but the actual write is inside `GalleryOfflineCache`.

**Size:** ~5-15 MB depending on gallery size and how many sequences have compositional data.

### Task 2: Prop SVGs (Priority: Critical)

**What:** All 48 SVG files in `static/images/props/pictograph/` (296 KB total).

**Where:** Workbox precache (build-time config change in `vite.config.ts`).

**How:** Add `static/images/props/pictograph/*.svg` to the Workbox precache glob patterns. These are same-origin static assets, tiny (296 KB total), and critical for rendering any pictograph. This is a one-line config change, not a runtime operation. The orchestrator doesn't need to handle this — Workbox does it automatically on SW install.

**Current precache glob (vite.config.ts ~line 612):**
```
'**/*.{js,css,csv,html,ico,png,svg,woff2,woff,webp,webmanifest}'
```

SVGs are already in the glob pattern, but prop SVGs in `static/images/` may be excluded by other rules or not matched. Verify during implementation that these 48 files appear in the generated precache manifest. If they're already included, no change needed.

**Staleness:** Immutable. Cache indefinitely. SW version revisions handle updates.

### Task 3: Thumbnail Prefetch (Priority: Medium)

**What:** Thumbnail images for all gallery sequences.

**Where:** Existing `ThumbnailLocalCache` (IndexedDB, 100 MB budget with LRU eviction).

**How:**
- After gallery metadata is cached (Task 1 completes), the orchestrator iterates through cached sequences and prefetches thumbnails not already in `ThumbnailLocalCache`.
- Uses `requestIdleCallback` to avoid blocking the UI.
- Adapts concurrency to connection quality via `NetworkStatusMonitor`:
  - Wifi/4G (`effectiveType === '4g'`): 10 concurrent fetches
  - 3G: 3 concurrent
  - 2G/slow-2g: 1 at a time
  - Metered (`isMetered === true`): Skip unless user explicitly chose "Download for offline"
  - Offline: Pause, resume on reconnect

**Thumbnail cache key resolution:** The `ThumbnailKeyDeriver` requires prop config and display settings to compute the key. During prefetch, the orchestrator uses a **default key configuration**: the sequence's declared prop type + dark mode (the app default). This means prefetched thumbnails match the default viewing conditions. If a user has a non-default prop or light mode, the thumbnail will be re-rendered on demand (existing behavior via Tier 4 local render fallback).

**Size:** ~50-150 KB per thumbnail. With 500+ gallery sequences, this could reach 50-100 MB. The existing LRU eviction at 100 MB handles overflow gracefully.

---

## Workbox Config Changes

In `vite.config.ts`, two changes:

### 1. Verify prop SVG precaching

The glob pattern `**/*.{js,css,csv,html,ico,png,svg,woff2,woff,webp,webmanifest}` should already include prop SVGs. During implementation, check the generated `sw.js` precache manifest to confirm all 48 prop SVGs appear. If they don't (due to exclusion rules or path patterns), add an explicit include.

### 2. Tighten the cross-origin catch-all

The catch-all rule at line ~753 (`url.origin !== self.location.origin` → NetworkOnly) is correct as a safety net but may be catching resources that earlier rules should handle. During implementation, audit which cross-origin requests are actually made and whether any need caching. The Firebase Storage thumbnails rule (StaleWhileRevalidate, 30 days) at line ~722 should handle the main case. No changes expected, but worth verifying.

**No Font Awesome changes needed.** Font Awesome is already bundled locally at `/fonts/css/all.min.css` and served from the app's own origin. The SW precache glob includes `*.css` and `*.woff2`, so Font Awesome files are already precached.

---

## Trigger Points

| Trigger | Behavior |
|---------|----------|
| Gallery metadata first loaded successfully | Start background thumbnail prefetch |
| Reconnect after offline period | Re-trigger gallery metadata fetch + thumbnail prefetch |
| User taps "Download for offline" | Run all tasks at full speed, show progress toast |
| Connection degrades to 2G | Reduce thumbnail concurrency to 1 |
| Connection lost | Pause thumbnail prefetch, resume on reconnect |
| App goes to background (`visibilitychange`) | Pause thumbnail prefetch (save battery) |
| App returns to foreground | Resume if prefetch was in progress |

**Why lifecycle-based, not timer-based:** The orchestrator triggers after gallery metadata loads successfully (not after an arbitrary 5-second delay). This ensures the app has settled, the DI container is ready, and there's actual data to cache. The `PublicSequencesLoader` completing its first load is the natural trigger.

---

## Gallery Offline Fallback

The key change to `PublicSequencesLoader`:

```
Online flow:  Firestore query → GalleryOfflineCache.persist() → return fresh data
Offline flow: GalleryOfflineCache.loadCached() → return cached data + staleness info
Failed flow:  Firestore fails + no cache → error modal (existing)
Stale flow:   Firestore fails + cache exists → return cached data + "Last updated X ago"
```

The gallery component shows a subtle "Showing cached content" label when serving from Dexie. This uses the existing `networkStatusState.isOnline` check plus the `lastSyncedAt` from cache metadata.

---

## File Structure

```
src/lib/shared/offline/
├── components/
│   └── NetworkStatusIndicator.svelte          (existing, no changes)
├── services/
│   ├── contracts/
│   │   ├── IConflictResolver.ts               (existing)
│   │   ├── IOfflineCacheOrchestrator.ts       (NEW)
│   │   └── IGalleryOfflineCache.ts            (NEW)
│   └── implementations/
│       ├── ConflictResolver.ts                (existing)
│       ├── OfflineCacheOrchestrator.ts        (NEW)
│       └── GalleryOfflineCache.ts             (NEW)
├── domain/
│   └── offline-cache-types.ts                 (NEW - types/interfaces)
├── state/
│   ├── network-status-state.svelte.ts         (existing)
│   ├── sync-status-state.svelte.ts            (existing)
│   └── offline-cache-state.svelte.ts          (NEW - reactive state factory)
└── context/
    └── offline-cache-context.ts               (NEW - context set/get)
```

Modified existing files:
- `PublicSequencesLoader.ts` — Inject `IGalleryOfflineCache`, add offline fallback path
- `TKADatabase.ts` — Add `galleryCache` table (DB version 6)
- `DATABASE_CONSTANTS.ts` — Add `galleryCache` table name + indexes
- `vite.config.ts` — Verify prop SVG precaching (may need no changes)
- `offline-container.ts` (new) — Register OfflineCacheOrchestrator + GalleryOfflineCache
- `container-types.ts` — Add new service types to IAppContainerItems
- `index.ts` (DI composition root) — Wire offline container
- Browse module root (e.g., `BrowseModule.svelte` or the browse layout) — Create offline cache state via factory, set context, trigger `startBackgroundCache()` after first gallery load completes. This is the browse module's responsibility since it owns the gallery lifecycle. The settings panel consumes the context to show stats/controls.

---

## What This Does NOT Include

- **Full sequence step data offline**: Only metadata is cached for the gallery. Full step data is cached per-sequence when a user opens one (existing Firestore offline persistence handles this).
- **Offline sequence creation**: The create module already works offline via local state. No changes needed.
- **Push notifications for sync**: Out of scope. The existing "Back online! Syncing..." toast is sufficient.
- **beforeinstallprompt handling**: Nice-to-have but separate concern. Can be added independently.
- **Background Sync API for writes**: The existing Firestore offline persistence + syncStatusState already handles write queuing. No additional queue service needed.

---

## What `clearOfflineCache()` Does

Explicitly scoped to offline-specific caches only:

| Store | Action | User data affected? |
|-------|--------|---------------------|
| `galleryCache` Dexie table | `.clear()` | No (public gallery data, not user library) |
| `gallery-cache-meta` settings record | `.delete()` | No |
| `ThumbnailLocalCache` (prefetched entries) | `.clear()` | Yes (but regenerated on demand via Tier 4 render) |
| Prop SVGs (Workbox precache) | Not cleared (managed by SW) | No |
| Font Awesome (Workbox precache) | Not cleared (managed by SW) | No |

The user's library (`sequences` table), settings, compositions, and Firestore offline cache are NOT touched.

---

## Storage Budget

| Cache | Storage | Eviction |
|-------|---------|----------|
| Gallery metadata (Dexie `galleryCache`) | ~5-15 MB | Overwritten on refresh |
| Prop SVGs (Workbox precache) | ~300 KB | SW versioned |
| Font Awesome (Workbox precache) | ~130 KB | SW versioned (already cached) |
| Thumbnails (IndexedDB) | up to 100 MB | LRU when full |
| Firestore offline cache | ~10-50 MB | Firebase managed |
| **Total** | **~20-165 MB** | **Well within 200 MB** |

---

## Success Criteria

1. Someone loads the app on wifi, waits 30 seconds, then goes fully offline. The gallery loads with thumbnails and pictographs render correctly.
2. Font Awesome icons display offline (no blank squares). [Already works — locally bundled.]
3. Prop SVGs render offline on first sequence view (no blank pictographs).
4. The app never shows a blank/broken gallery when cached data exists — falls back to Dexie cache with staleness label.
5. Settings panel shows cache stats and provides "Download for offline" / "Clear cache" controls.
6. Thumbnail prefetch adapts to connection quality and pauses when offline or backgrounded.
