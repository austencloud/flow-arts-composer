# World-Class Offline-First Architecture for Flow Arts Composer

**Feedback ID:** `HrimAyPGCzzbz1yIazCt`

## Goal

Transform Flow Arts Composer into the gold standard for offline-first web apps - users should never know or care whether they're online.

---

## Current State (What's Already Working)

> Corrected 2026-07-01. An earlier revision of this table claimed a Workbox service
> worker configured in `vite.config.ts`. That was never implemented. There is no
> Workbox and no VitePWA anywhere in the build; the shipped service worker is
> hand-rolled. Full audited offline state and the remaining roadmap:
> `docs/archive/swarm-2026-10-14/reference/offline-persistence-audit-2026-06-30.md`.

| Component               | Status         | Location                                                                                                                                                                                                                                                                                                                                         |
| ----------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Firestore offline cache | ✅ Enabled     | `src/lib/shared/auth/firebase.ts:356-372` - `persistentLocalCache` + `persistentMultipleTabManager()` in production, with a 5s timeout fallback to memory cache                                                                                                                                                                                  |
| Auth persistence        | ✅ Enabled     | `firebase.ts:209-212` - `indexedDBLocalPersistence` with `browserLocalPersistence` fallback                                                                                                                                                                                                                                                      |
| Service worker          | ✅ Hand-rolled | `static/sw.js` (`CACHE_NAME` `tka-v3`). Registered in production only (`src/hooks.client.ts:196-209`). The SW bypasses localhost entirely, and dev boot unregisters all SWs and wipes Cache Storage (`hooks.client.ts:44-83`)                                                                                                                    |
| SW install precache     | ✅ Working     | `/app` shell + build-generated SVG manifest. `scripts/generate-svg-precache-manifest.cjs` writes `static/svg-precache-manifest.json` before `vite build` (roughly 200 assets, ~470 KB: ~190 pictograph SVGs plus six elemental glyph WebPs; output is gitignored). Install is failure-tolerant: a missing manifest or a stray 404 never fails it |
| SW runtime caching      | ✅ Working     | Stale-while-revalidate for `/images/*` and firebasestorage thumbnails; cache-first for `/_app/immutable/` and `/fonts`; dedicated cache-first `tka-3d-assets-v1` for `/models/*.glb`, `/models/*.ktx2`, `/draco/`; network-first for `/sequence/` and `/q/`; SPA navigate fallback serves cached `/app`                                          |
| Dexie IndexedDB         | ✅ Working     | `src/lib/shared/persistence/database/tka-database.ts` (`TKADatabase`) - sequences, pictographs, tab state                                                                                                                                                                                                                                        |
| Settings offline queue  | ✅ Partial     | `src/lib/shared/settings/state/settings-state.svelte.ts:432-483` - localStorage queue, flushed on reconnect                                                                                                                                                                                                                                      |
| Sync status UI          | ✅ Working     | `src/lib/shared/offline/components/NetworkStatusIndicator.svelte` (synced/syncing/pending/error), rendered in `SidebarFooter.svelte` and `BottomNavigation.svelte`; state in `offline/state/sync-status-state.svelte.ts`                                                                                                                         |
| Conflict resolution     | ✅ Working     | `src/lib/shared/offline/services/conflict-resolver.ts` - `_version` tracking wired into `library-repository.ts`. No prompt UI is registered: resolution defaults to server-wins, and the user gets a toast that their offline edit was replaced                                                                                                  |
| Connection quality      | ✅ Detected    | `src/lib/shared/sync/services/network-status-monitor.ts` - Network Information API                                                                                                                                                                                                                                                               |

## Desktop Build (Tauri)

The desktop build bundles every 3D asset, the deck sequences, and the public
gallery index into the installer and serves them through a local URI scheme,
so it runs with no network at all. Details: `docs/reference/desktop-offline-bundle.md`.

## What's Missing

1. **Background Sync API** - `hooks.client.ts:200-204` registers the `tka-sync-queue` tag, but `static/sw.js` has no `sync` listener, so the registration is a no-op. Nothing replays after the tab closes; queued work syncs only while the app is open.
2. **Universal sync engine** - Firestore's SDK queues its own writes and settings have a localStorage queue, but there is no IndexedDB-backed operation queue spanning collections (the `SyncOperation` model below is unbuilt).
3. **SW update notification** - `sw.js` calls `skipWaiting()` + `clients.claim()`; new versions activate silently. No "update available" or "offline ready" UI.
4. **Cold-offline gaps** - a first-install-then-offline session can white-screen (entry JS chunks are not precached), and `/sequence/[id]` / `/q/[code]` return 503 cold-offline. Severity-ranked list in `docs/archive/swarm-2026-10-14/reference/offline-persistence-audit-2026-06-30.md`.

---

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Svelte 5 UI   │────▶│   Sync Engine   │────▶│    Firestore    │
│   (Optimistic)  │     │   (IndexedDB)   │     │    (Cloud)      │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                       │                        │
        ▼                       ▼                        ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│ Rollback Handler│     │ Background Sync │     │ Real-time Sync  │
│ (on failure)    │     │ (Service Worker)│     │ (onSnapshot)    │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

**Key Principle**: Local-first. Write to IndexedDB immediately, sync to Firestore in background.

---

## Implementation Plan

### Phase 1: Sync Engine Foundation

> Partially shipped since this plan was written: `src/lib/shared/offline/` now
> exists with `NetworkStatusIndicator.svelte`, `network-status-state.svelte.ts`,
> `sync-status-state.svelte.ts`, `conflict-resolver.ts`, and the offline cache
> orchestrator. `NetworkStatusMonitor` lives at
> `src/lib/shared/sync/services/network-status-monitor.ts`. The operation queue
> (`SyncOperation`, `OperationQueue`, `SyncEngine`) remains unbuilt.

**New files to create:**

```
src/lib/shared/offline/
├── domain/
│   └── models/
│       └── SyncOperation.ts          # Operation queue model
├── services/
│   ├── contracts/
│   │   ├── IOperationQueue.ts        # Queue interface
│   │   ├── ISyncEngine.ts            # Engine interface
│   │   └── INetworkStatusMonitor.ts  # Network detection
│   └── implementations/
│       ├── OperationQueue.ts         # IndexedDB-backed queue
│       ├── SyncEngine.ts             # Orchestrates sync
│       └── NetworkStatusMonitor.ts   # Online/offline + quality
├── state/
│   └── network-status-state.svelte.ts  # Reactive network state
└── components/
    ├── SyncStatusIndicator.svelte    # Header sync pill
    └── OfflineBanner.svelte          # "You're offline" toast
```

**Modify existing:**

- `src/lib/shared/persistence/database/tka-database.ts` - Add `syncOperations` table
- Wire the engine through a module-level getter (`src/lib/shared/offline/get-offline-cache-orchestrator.ts` is the precedent). There is no DI container in this codebase; the container references in the original plan are dead.

**SyncOperation model:**

```typescript
interface SyncOperation {
  id: string;
  type: "create" | "update" | "delete";
  collection: string; // 'library', 'feedback', etc.
  documentId: string;
  payload: unknown;
  version: number; // Optimistic locking
  createdAt: number;
  retryCount: number;
  status: "pending" | "in-flight" | "failed";
  previousValue?: unknown; // For rollback
}
```

### Phase 2: Network Status UI

> Largely shipped: `NetworkStatusIndicator.svelte` covers the indicator described
> below (synced/syncing/pending/error cloud states, backed by
> `sync-status-state.svelte.ts` with per-repository pending counts) and renders in
> `SidebarFooter.svelte` and `BottomNavigation.svelte`. Extend it; do not build a
> second indicator.

**SyncStatusIndicator** (header component):

- Cloud icon with status: synced (✓), syncing (↻), offline (✕), error (!)
- Shows pending count on hover/click
- Uses `$derived` for reactive updates

**OfflineBanner** (toast-like):

- Slides in when going offline: "You're offline. Changes will sync when you reconnect."
- Auto-dismisses when back online: "Back online! Syncing X changes..."

**Wire into:**

- `src/lib/shared/modules/ModuleRenderer.svelte` or app layout

### Phase 3: Optimistic Updates

**Pattern for repositories:**

```typescript
async saveSequence(sequence: SequenceData): Promise<LibrarySequence> {
  // 1. Optimistic: update local immediately
  const libSeq = createLibrarySequence(sequence, userId);
  await db.sequences.put(libSeq);

  // 2. Queue for server sync
  await syncEngine.enqueue({
    type: 'create',
    collection: 'library',
    documentId: sequence.id,
    payload: sequence,
    previousValue: null,  // For rollback
  });

  // 3. Return immediately (UI shows new data)
  return libSeq;
}
```

**Rollback on failure:**

- SyncEngine emits `onOperationFailed`
- Repository listens and reverts local change using `previousValue`
- Toast: "Failed to save. Change reverted."

### Phase 4: Service Worker Background Sync

> The original version of this phase prescribed VitePWA registration callbacks
> (`onRegisteredSW`, `onOfflineReady`, `onNeedRefresh`) and a Workbox
> `backgroundSync` runtime rule. That is not the current architecture. The shipped
> SW is hand-rolled (`static/sw.js`); Background Sync means extending that file
> directly.

**Already in place:** `src/hooks.client.ts:196-209` registers `/sw.js` in
production and registers the `tka-sync-queue` sync tag when the API is available.
The tag currently fires into nothing.

**Extend `static/sw.js`** with a `sync` listener that drains the Phase 1 queue:

```javascript
self.addEventListener("sync", (event) => {
  if (event.tag === "tka-sync-queue") {
    event.waitUntil(drainSyncOperations());
  }
});
```

`drainSyncOperations()` opens the `syncOperations` table (IndexedDB is available in
the SW context) and replays pending mutations. This is what lets queued changes
sync after the tab closes instead of waiting for the next app open.

Constraints of the hand-rolled SW:

- There is no `BackgroundSyncPlugin`; the queue replay is implemented directly.
  Adopting Workbox would be a separate architecture decision, not a config edit.
- Do not intercept Firestore traffic in the fetch handler. `sw.js` skips non-GET
  requests and all cross-origin hosts except firebasestorage; the Firestore SDK
  manages its own channel. Queue at the repository layer (Phase 1) and drain from
  the `sync` listener.

### Phase 5: Conflict Resolution

> Shipped for sequences: `src/lib/shared/offline/services/conflict-resolver.ts`
> implements the `_version` comparison and user prompt described below, wired into
> `library-repository.ts`.

**Strategy by collection:**
| Collection | Strategy | Rationale |
|------------|----------|-----------|
| `settings` | Last-write-wins | Non-critical |
| `library/sequences` | Client-wins offline, merge online | User's work is precious |
| `feedback` | Server-wins | Admin controls state |
| `gamification` | Server-wins | Prevent manipulation |

**For sequences (most important):**

1. Track `_version` field on each sequence
2. On sync, compare versions
3. If server version > local version AND local has changes: **prompt user**
4. Dialog: "This sequence was updated elsewhere. Keep your changes / Use server version / View diff"

---

## Critical Files to Modify

| File                    | Change                                                                                                    |
| ----------------------- | --------------------------------------------------------------------------------------------------------- |
| `tka-database.ts`       | Add `syncOperations` table                                                                                |
| `library-repository.ts` | Route saves through the sync engine queue                                                                 |
| `static/sw.js`          | Add `sync` listener that drains the operation queue                                                       |
| `hooks.client.ts`       | No registration change needed; the `tka-sync-queue` tag is already registered (`:200-204`)                |
| Layout / nav            | Extend the existing `NetworkStatusIndicator` (pending-count detail) rather than adding a second indicator |

---

## Verification Plan

1. **Offline mutation test:**
   - Go offline (DevTools Network tab)
   - Create/edit a sequence
   - Verify it appears locally
   - Go online
   - Verify syncs to Firestore

2. **Background sync test:**
   - Go offline, make changes
   - Close browser completely
   - Reopen browser (while online)
   - Verify queued changes sync

3. **Conflict resolution test:**
   - Edit sequence on device A
   - Edit same sequence on device B (offline)
   - Bring device B online
   - Verify conflict UI appears

4. **UI indicator test:**
   - Toggle offline/online
   - Verify status indicator updates
   - Verify banner appears/dismisses

### Automated coverage

- **SW strategy logic (unit):** `tests/unit/sw-offline-behavior.test.ts` runs the
  real `static/sw.js` source in a mocked SW scope (`tests/helpers/sw-harness.ts`)
  — install precache, cache-first/SWR/network-first strategies, navigation
  fallbacks, lie-fi timeout, and the update-wait/`SKIP_WAITING` message flow.
- **SW runtime (real browser):** `node scripts/offline-sw-e2e.mjs` drives real
  Chromium against a production `vite preview` build, registers the actual SW,
  cuts the network (`context.setOffline`), and asserts the `/app` shell + a
  render-critical pictograph SVG are served from cache. Serves over HTTPS on the
  fake host `tka.test` (mapped to `127.0.0.1`) because `sw.js` bypasses
  `localhost` by design and a SW needs a secure context on a non-localhost host.
  Prereq: `npm run build:fast` first; needs the mkcert dev cert (`.cert/`) and
  Playwright Chromium. **Local / non-blocking** — not a CI gate yet (cert absent
  in CI); CI wiring is the known next step.
- **Deploy artifact + live origin:** `npm run verify:offline` (build artifact)
  and the daily `offline-kit-prod-check` workflow (live tkaflowarts.com).

---

## Confirmed Decisions

- **Conflict resolution**: User decides via dialog (diff view, choose local/server/merge)
- **First repository**: Library (sequences) - most important user data

## Phased Rollout

| Phase | Scope                                     | Duration     |
| ----- | ----------------------------------------- | ------------ |
| 1     | Sync engine + operation queue             | 3-4 sessions |
| 2     | Network status UI                         | 1-2 sessions |
| 3     | Optimistic updates for LibraryRepository  | 2-3 sessions |
| 4     | Service worker Background Sync            | 1-2 sessions |
| 5     | Conflict resolution dialog (user decides) | 2-3 sessions |

**Total estimate:** 10-15 focused sessions

---

## Sources

- [MDN: Offline and background operation](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Offline_and_background_operation)
- [Firebase: Firestore offline persistence](https://firebase.google.com/docs/firestore/manage-data/enable-offline)
- [LogRocket: Offline-first frontend apps 2025](https://blog.logrocket.com/offline-first-frontend-apps-2025-indexeddb-sqlite/)
- [Workbox: Background Sync](https://developer.chrome.com/docs/workbox/modules/workbox-background-sync/) (not the current architecture; the shipped SW is hand-rolled)
- [@vite-pwa/sveltekit](https://vite-pwa-org.netlify.app/frameworks/sveltekit.html) (not used; reference only if Workbox adoption is ever revisited)
