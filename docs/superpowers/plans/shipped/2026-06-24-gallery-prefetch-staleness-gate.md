# Gallery Prefetch Staleness Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the app re-downloading the entire `publicSequences` collection on every boot when the local cache is already fresh, and bound the boot-window delay before the gallery prefetch runs.

**Architecture:** A pure-function module decides "is the gallery cache stale enough to re-sync?" from `lastSyncedAt` + a TTL. `GalleryPrefetcher.doPrefetch()` gates its Phase-2 background Firestore sync on that decision (in addition to PR #17's constrained-connection gate). Separately, the root layout's prefetch `requestIdleCallback` gets a `timeout` so it isn't starved during boot.

**Tech Stack:** TypeScript, Svelte 5, Vitest, Dexie (IndexedDB), Firebase Firestore.

**Spec:** `docs/superpowers/specs/2026-06-24-gallery-prefetch-staleness-gate-design.md`

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/features/browse/shared/services/gallery-sync-staleness.ts` (new) | Pure decision: `isGallerySyncStale(lastSyncedAt, now, ttl?)` + `GALLERY_SYNC_TTL_MS`. Zero imports — trivially unit-testable. |
| `tests/unit/gallery-sync-staleness.test.ts` (new) | Unit tests for the pure decision. |
| `src/lib/features/browse/shared/services/gallery-prefetcher.ts` (modify) | Import the pure decision; add private `isSyncStale()`; gate Phase 2. |
| `src/routes/+layout.svelte` (modify) | Add `{ timeout: 2000 }` to the prefetch idle callback. |

**Commit discipline (project rule):** every commit uses an explicit pathspec —
`git commit -m "…" -- <exact paths>`. Never a bare `git commit` (the shared index
may hold other agents' staged work). Only commit the files this plan touches.

---

## Task 1: Pure staleness decision + unit tests

**Files:**
- Create: `src/lib/features/browse/shared/services/gallery-sync-staleness.ts`
- Test: `tests/unit/gallery-sync-staleness.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/gallery-sync-staleness.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  isGallerySyncStale,
  GALLERY_SYNC_TTL_MS,
} from "$lib/features/browse/shared/services/gallery-sync-staleness";

describe("isGallerySyncStale", () => {
  const now = 1_700_000_000_000;

  it("is stale when never synced (null)", () => {
    expect(isGallerySyncStale(null, now)).toBe(true);
  });

  it("is fresh when synced within the TTL", () => {
    expect(isGallerySyncStale(now - 60_000, now)).toBe(false); // 1 min ago
  });

  it("is stale when synced past the TTL", () => {
    expect(isGallerySyncStale(now - (GALLERY_SYNC_TTL_MS + 1), now)).toBe(true);
  });

  it("is stale exactly at the TTL boundary (>=)", () => {
    expect(isGallerySyncStale(now - GALLERY_SYNC_TTL_MS, now)).toBe(true);
  });

  it("honors a custom ttl argument", () => {
    expect(isGallerySyncStale(now - 5_000, now, 10_000)).toBe(false);
    expect(isGallerySyncStale(now - 5_000, now, 4_000)).toBe(true);
  });

  it("exposes a 15-minute default TTL", () => {
    expect(GALLERY_SYNC_TTL_MS).toBe(15 * 60 * 1000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- --run tests/unit/gallery-sync-staleness.test.ts`
Expected: FAIL — cannot resolve module `gallery-sync-staleness` (file not created yet).

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/features/browse/shared/services/gallery-sync-staleness.ts`:

```ts
/**
 * Gallery sync staleness decision.
 *
 * The boot prefetch warms the gallery from IndexedDB instantly, then optionally
 * pulls fresh data from Firestore. Re-pulling the whole publicSequences
 * collection on every boot is wasted bandwidth and Firestore reads when nothing
 * changed since the last sync. This pure function decides whether the cache is
 * old enough that a fresh sync is worth it, so the prefetcher can skip the
 * network when the cache is fresh.
 *
 * Kept dependency-free so it unit-tests without pulling Dexie/Firebase.
 */

/** TTL after which a cached gallery is considered stale enough to re-sync. */
export const GALLERY_SYNC_TTL_MS = 15 * 60 * 1000; // 15 min

/**
 * True when the gallery cache should be re-synced from Firestore: either it was
 * never synced (`lastSyncedAt == null`) or it was synced at least `ttlMs` ago.
 *
 * @param lastSyncedAt epoch ms of the last successful sync, or null if never.
 * @param now epoch ms of the current time.
 * @param ttlMs freshness window; defaults to {@link GALLERY_SYNC_TTL_MS}.
 */
export function isGallerySyncStale(
  lastSyncedAt: number | null,
  now: number,
  ttlMs: number = GALLERY_SYNC_TTL_MS
): boolean {
  if (lastSyncedAt == null) return true;
  return now - lastSyncedAt >= ttlMs;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- --run tests/unit/gallery-sync-staleness.test.ts`
Expected: PASS — 6 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/features/browse/shared/services/gallery-sync-staleness.ts tests/unit/gallery-sync-staleness.test.ts
git commit -m "feat(browse): pure gallery sync staleness decision (15-min TTL)" -- src/lib/features/browse/shared/services/gallery-sync-staleness.ts tests/unit/gallery-sync-staleness.test.ts
```

---

## Task 2: Gate the boot Firestore sync on staleness

**Files:**
- Modify: `src/lib/features/browse/shared/services/gallery-prefetcher.ts`

Context: `doPrefetch({ skipNetworkSync })` runs three phases — Phase 1 warms from
IndexedDB (sets `this._isWarmed`), Phase 2 calls `this.backgroundSync()` when
`!skipNetworkSync`, Phase 3 subscribes to mutation events. `this.offlineCache`
is a `GalleryOfflineCache` whose `getStats()` returns
`{ count, lastSyncedAt: number | null }`.

- [ ] **Step 1: Add the import**

At the top of `gallery-prefetcher.ts`, after the existing `db` import (the last
import line, currently `import { db } from "$lib/shared/persistence/database/tka-database";`),
add:

```ts
import { isGallerySyncStale } from "./gallery-sync-staleness";
```

- [ ] **Step 2: Add the `isSyncStale()` method**

Inside the `GalleryPrefetcher` class, immediately above the existing
`private backgroundSync(): void {` method, add:

```ts
/**
 * True when the cached gallery is stale enough to re-sync from Firestore.
 * Reads the cache's last-sync watermark and compares it to the TTL. Fails
 * safe to true (sync) when the metadata can't be read, so a cache problem
 * degrades to the previous always-sync behavior rather than never syncing.
 */
private async isSyncStale(): Promise<boolean> {
  try {
    const { lastSyncedAt } = await this.offlineCache.getStats();
    return isGallerySyncStale(lastSyncedAt, Date.now());
  } catch {
    return true;
  }
}
```

- [ ] **Step 3: Gate Phase 2 on staleness**

In `doPrefetch(...)`, replace the existing Phase 2 block:

```ts
    // Phase 2: Background Firestore sync (non-blocking). Skipped on a constrained
    // connection so we don't speculatively download the whole gallery over 4G.
    if (!skipNetworkSync) {
      this.backgroundSync();
    }
```

with:

```ts
    // Phase 2: Background Firestore sync (non-blocking). Skipped on a constrained
    // connection so we don't speculatively download the whole gallery over 4G,
    // AND skipped when the cache was synced within the TTL — re-pulling the whole
    // publicSequences collection every boot is wasted bandwidth and Firestore
    // reads when nothing changed since the last sync.
    if (!skipNetworkSync && (await this.isSyncStale())) {
      this.backgroundSync();
    }
```

- [ ] **Step 4: Type-check the change (warm checker)**

Run: `npm run check:fast`
Expected: no new errors in `gallery-prefetcher.ts`. (A pre-existing unrelated
`page-flip` error in a guide file may remain — ignore it.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/features/browse/shared/services/gallery-prefetcher.ts
git commit -m "perf(browse): skip boot gallery sync when cache is fresh (TTL gate)" -- src/lib/features/browse/shared/services/gallery-prefetcher.ts
```

---

## Task 3: Bound the prefetch idle callback

**Files:**
- Modify: `src/routes/+layout.svelte`

Context: the prefetch is scheduled near line 302–306 with a no-timeout
`requestIdleCallback`, which the boot-window main-thread saturation starves for
8–27s. Adding a `timeout` forces it to run within the bound.

- [ ] **Step 1: Add the timeout option**

In `src/routes/+layout.svelte`, find the prefetch scheduling block:

```ts
    if (typeof requestIdleCallback !== "undefined") {
      requestIdleCallback(prefetchBrowseData);
    } else {
      setTimeout(prefetchBrowseData, 0);
    }
```

Change the `requestIdleCallback` line to:

```ts
    if (typeof requestIdleCallback !== "undefined") {
      // timeout bounds the boot-window starvation: during startup the main
      // thread is saturated, so a no-timeout idle callback can be deferred
      // 8-27s. 2s caps how late the gallery warm starts.
      requestIdleCallback(prefetchBrowseData, { timeout: 2000 });
    } else {
      setTimeout(prefetchBrowseData, 0);
    }
```

> Note: leave the glyph-preload `requestIdleCallback` near line 235–236
> unchanged. It is out of scope for this plan.

- [ ] **Step 2: Type-check the change (warm checker)**

Run: `npm run check:fast`
Expected: no new errors in `+layout.svelte`.

- [ ] **Step 3: Commit**

```bash
git add src/routes/+layout.svelte
git commit -m "perf(boot): bound gallery-prefetch idle callback with a 2s timeout" -- src/routes/+layout.svelte
```

---

## Task 4: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Full type check**

Run: `npm run check > /tmp/check.log 2>&1; grep -niE "error" /tmp/check.log`
Expected: no NEW errors referencing `gallery-sync-staleness.ts`,
`gallery-prefetcher.ts`, or `+layout.svelte`. (One pre-existing unrelated
`page-flip` types error in a guide file is acceptable and predates this work.)

- [ ] **Step 2: Full unit-test run**

Run: `npm run test -- --run`
Expected: all suites pass, including `tests/unit/gallery-sync-staleness.test.ts`
(6 passed) and the pre-existing `tests/unit/network-conditions.test.ts`.

- [ ] **Step 3: Runtime verify — fresh cache skips the sync**

With the dev server on `:5173` and Chrome DevTools MCP:
1. Ensure a recent sync exists (`galleryCacheMeta.lastSyncedAt` within 15 min —
   load the app once if needed so it syncs).
2. Reload `https://localhost:5173/` with an `initScript` that timestamps each
   `firestore.googleapis.com` request relative to nav start.
3. Read `galleryCacheMeta.lastSyncedAt` from `TKADatabase` after ~10s.
4. Expected: `lastSyncedAt` does NOT advance (boot sync skipped because fresh);
   no new `publicSequences` Firestore query fires after the prefetch idle
   callback.

- [ ] **Step 4: Runtime verify — stale cache syncs**

1. In the page, set the cache stale:
   ```js
   await new Promise(res => { const r = indexedDB.open('TKADatabase'); r.onsuccess = () => { const db = r.result; const tx = db.transaction('galleryCacheMeta','readwrite'); const s = tx.objectStore('galleryCacheMeta'); const g = s.get('gallery-cache-meta'); g.onsuccess = () => { const m = g.result; m.lastSyncedAt = Date.now() - 20*60*1000; s.put(m); tx.oncomplete = () => { db.close(); res(true); }; }; }; });
   ```
2. Reload, wait ~15s, read `lastSyncedAt`.
3. Expected: `lastSyncedAt` advances to ~now (sync fired because stale).

- [ ] **Step 5: Runtime verify — idle callback is bounded**

Reload with an `initScript` that wraps `requestIdleCallback` and records each
fire time relative to nav start. Expected: the prefetch callback fires within
~2s of boot even with the background animation running (contrast: the unbounded
version was measured firing at 8–27s).

- [ ] **Step 6: Report verification evidence**

Paste the before/after Firestore-request timing + `lastSyncedAt` readings and the
idle-callback fire times into the completion summary. No "should work" claims —
show the runtime output (project verification rule).

---

## Self-Review

**Spec coverage:**
- Defect 1 (full re-download every boot) → Task 1 (decision) + Task 2 (gate). ✓
- Defect 2 (idle starvation) → Task 3. ✓
- Unit tests for the staleness table → Task 1 Step 1 (null / fresh / stale /
  boundary / custom-ttl / default-constant). ✓
- Runtime verification (fresh skips, stale syncs, bounded callback) → Task 4
  Steps 3–5. ✓
- Non-goal: incremental sync — not in any task. ✓ (correctly excluded)
- Non-goal: glyph idle callback untouched — explicit note in Task 3. ✓

**Placeholder scan:** no TBD/TODO/"handle edge cases"; all code blocks complete.

**Type consistency:** `isGallerySyncStale(lastSyncedAt, now, ttlMs?)` and
`GALLERY_SYNC_TTL_MS` are defined in Task 1 and consumed with the same names in
Task 2. `this.offlineCache.getStats()` returns `{ lastSyncedAt }` per the spec
and the verified source (`gallery-offline-cache.ts:121`). `isSyncStale()` (class
method, async) vs `isGallerySyncStale()` (pure fn) named distinctly on purpose.
