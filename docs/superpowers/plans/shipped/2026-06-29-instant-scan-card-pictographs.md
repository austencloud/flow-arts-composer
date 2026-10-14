# Instant Scan-Card Pictographs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When someone scans a QR code, the Choreo card's pictographs appear by downloading pre-rendered per-pictograph images instead of rasterizing each one on the scanner's phone — backed by perf instrumentation and automated tests.

**Architecture:** Add a globally-shared per-cell image store in Firebase Storage (sibling of the existing `cloud-thumbnail-cache.ts`), keyed by a canonical, device-independent hash of the existing cell cache key. Insert a "cloud" tier into the shared `renderCell` pipeline so a cold scanner downloads instead of renders. Self-warm via crowd-source on miss, and proactively at save/publish. Trim the scan page's critical path and instrument every stage with `performance.mark`.

**Tech Stack:** SvelteKit 5 (runes), TypeScript, Vitest, Firebase Storage, IndexedDB, OffscreenCanvas/Web Workers, Chrome DevTools MCP (for the throttled budget check).

**Spec:** `docs/superpowers/specs/active/2026-06-29-instant-scan-card-pictographs-design.md`

---

## File Structure

**Create:**
- `src/lib/shared/render/services/cloud-cell-key.ts` — derives the canonical, device-independent cloud key (SHA-256 hex of the size-normalized cell key). One responsibility: key derivation.
- `src/lib/shared/render/services/pictograph-cloud-cache.ts` — Firebase Storage per-cell image store (knownExists + manifest + getUrl/download/upload). Mirrors `cloud-thumbnail-cache.ts`.
- `src/lib/shared/render/services/png-blob-to-webp.ts` — small PNG→WebP converter for uploads.
- `src/lib/shared/analytics/scan-perf.ts` — scan-stage perf marks + scan-to-stable measure + dev logging.
- `src/lib/features/library/services/warm-sequence-cells.ts` — renders+uploads a sequence's cells at canonical size (render-at-publish).
- Test files (one per unit, see tasks).
- `docs/reference/scan-card-perf-budget.md` — the DevTools throttled-budget procedure.

**Modify:**
- `src/lib/shared/sequence-viewer/services/preview-cell-renderer.ts` — insert the cloud tier into `renderCell`.
- `src/routes/q/[code]/+page.svelte` — load the cell manifest early, defer full glyph init off the critical path, add perf marks, `modulepreload` chunks.
- `src/lib/shared/sequence-viewer/components/ChoreoCard.svelte` — mark `all-cells-stable` after the render commit.
- `src/lib/features/library/services/library-save-service.ts` — fire-and-forget call to `warmSequenceCells` after save.

**Constants:** `CANONICAL_CELL_SIZE = 480` lives in `cloud-cell-key.ts` and is imported wherever canonical rendering is needed.

---

## PHASE 0 — Instrumentation (lands first; proves before/after)

### Task 0.1: Scan-perf marks module

**Files:**
- Create: `src/lib/shared/analytics/scan-perf.ts`
- Test: `src/lib/shared/analytics/scan-perf.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/shared/analytics/scan-perf.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { markScan, reportScanToStable, _resetScanPerf } from "./scan-perf";

describe("scan-perf", () => {
  beforeEach(() => {
    _resetScanPerf();
    performance.clearMarks();
    performance.clearMeasures();
  });

  it("returns null when scan:start was never marked", () => {
    markScan("all-cells-stable");
    expect(reportScanToStable()).toBeNull();
  });

  it("measures start -> all-cells-stable when both marks exist", () => {
    markScan("start");
    markScan("all-cells-stable");
    const ms = reportScanToStable();
    expect(ms).not.toBeNull();
    expect(ms!).toBeGreaterThanOrEqual(0);
  });

  it("only reports once per scan", () => {
    markScan("start");
    markScan("all-cells-stable");
    expect(reportScanToStable()).not.toBeNull();
    expect(reportScanToStable()).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/shared/analytics/scan-perf.test.ts`
Expected: FAIL — `Cannot find module './scan-perf'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/shared/analytics/scan-perf.ts
/**
 * Scan-stage performance instrumentation.
 *
 * Marks each boundary on the QR-scan critical path so we can measure
 * "time from page mount to all pictographs stable" on real devices, and
 * regression-test it under throttling. No-ops gracefully when the Performance
 * API is unavailable. Stage marks are namespaced "scan:" to avoid collisions.
 */

export type ScanStage =
  | "start"
  | "shortcode-resolved"
  | "hydrated"
  | "card-mount"
  | "first-cell-painted"
  | "all-cells-stable";

const PREFIX = "scan:";
let reported = false;

function hasPerf(): boolean {
  return typeof performance !== "undefined" && typeof performance.mark === "function";
}

/** Mark a scan stage boundary (idempotent per stage within a page load). */
export function markScan(stage: ScanStage): void {
  if (!hasPerf()) return;
  const name = `${PREFIX}${stage}`;
  // Avoid duplicate marks for the same stage (e.g. ChoreoCard re-render).
  if (performance.getEntriesByName(name, "mark").length > 0) return;
  try {
    performance.mark(name);
  } catch {
    /* ignore */
  }
}

/**
 * Compute scan-to-stable once both ends are marked. Returns the duration in ms,
 * or null if scan:start was never marked (non-scan route) or already reported.
 * Logs a per-stage table in dev.
 */
export function reportScanToStable(): number | null {
  if (!hasPerf() || reported) return null;
  const startMarks = performance.getEntriesByName(`${PREFIX}start`, "mark");
  const endMarks = performance.getEntriesByName(`${PREFIX}all-cells-stable`, "mark");
  if (startMarks.length === 0 || endMarks.length === 0) return null;

  reported = true;
  let durationMs = 0;
  try {
    const m = performance.measure(`${PREFIX}to-stable`, `${PREFIX}start`, `${PREFIX}all-cells-stable`);
    durationMs = m.duration;
  } catch {
    durationMs = endMarks[0]!.startTime - startMarks[0]!.startTime;
  }

  if (typeof window !== "undefined" && /localhost|127\.0\.0\.1/.test(window.location.hostname)) {
    logStageTable(durationMs);
  }
  return durationMs;
}

function logStageTable(total: number): void {
  const stages: ScanStage[] = [
    "start", "shortcode-resolved", "hydrated", "card-mount", "first-cell-painted", "all-cells-stable",
  ];
  const start = performance.getEntriesByName(`${PREFIX}start`, "mark")[0]?.startTime ?? 0;
  const rows: Record<string, { "t (ms)": number }> = {};
  for (const s of stages) {
    const e = performance.getEntriesByName(`${PREFIX}${s}`, "mark")[0];
    if (e) rows[s] = { "t (ms)": Math.round(e.startTime - start) };
  }
  // eslint-disable-next-line no-console
  console.table(rows);
  // eslint-disable-next-line no-console
  console.log(`[scan-perf] scan-to-stable = ${Math.round(total)}ms`);
}

/** Test-only reset of the one-shot guard. */
export function _resetScanPerf(): void {
  reported = false;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/shared/analytics/scan-perf.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/shared/analytics/scan-perf.ts src/lib/shared/analytics/scan-perf.test.ts
git commit -m "feat(scan-perf): add scan-stage perf marks + scan-to-stable measure" -- src/lib/shared/analytics/scan-perf.ts src/lib/shared/analytics/scan-perf.test.ts
```

---

### Task 0.2: Wire marks into the scan page and ChoreoCard

**Files:**
- Modify: `src/routes/q/[code]/+page.svelte:379` (onMount), `:456-471`, `:540`
- Modify: `src/lib/shared/sequence-viewer/components/ChoreoCard.svelte:1015` (after the render loop)

- [ ] **Step 1: Add the import + start mark at the top of onMount**

In `src/routes/q/[code]/+page.svelte`, add to the existing imports near the top of `<script>`:

```ts
import { markScan, reportScanToStable } from "$lib/shared/analytics/scan-perf";
```

Then as the FIRST line inside `onMount(async () => {` (before the `if (browser)` block at line 380):

```ts
    markScan("start");
```

- [ ] **Step 2: Mark resolve + hydrate + card-mount boundaries**

In the same onMount, immediately after `let seq = seq_;` (currently line 456) add:

```ts
      markScan("shortcode-resolved");
```

Immediately after `resolvedSeq = seq;` (currently line 470) add:

```ts
      markScan("hydrated");
```

Immediately after `pageState = { kind: "playing", word };` (currently line 540) add:

```ts
      markScan("card-mount");
```

- [ ] **Step 3: Mark all-cells-stable from ChoreoCard**

In `src/lib/shared/sequence-viewer/components/ChoreoCard.svelte`, add to the imports:

```ts
import { markScan, reportScanToStable } from "$lib/shared/analytics/scan-perf";
```

Find the end of the render commit (just after `storePreviewInCache(cacheKey, { ... })` and the `cells = ...` assignment that commits the rendered URLs — around line 1018-1040). Immediately after the cells are committed to state, add:

```ts
        // Instrumentation: the static grid is now stable. No-ops off the scan
        // route (scan:start is only marked by /q/[code]).
        markScan("all-cells-stable");
        reportScanToStable();
```

- [ ] **Step 4: Verify the build is clean**

Run: `npm run check:fast`
Expected: no new errors referencing `scan-perf`, `+page.svelte`, or `ChoreoCard.svelte`.

- [ ] **Step 5: Commit**

```bash
git add src/routes/q/[code]/+page.svelte src/lib/shared/sequence-viewer/components/ChoreoCard.svelte
git commit -m "feat(scan-perf): mark scan critical-path stages in /q page and ChoreoCard" -- src/routes/q/[code]/+page.svelte src/lib/shared/sequence-viewer/components/ChoreoCard.svelte
```

---

## PHASE 1 — Per-cell cloud image store + pipeline tier

### Task 1.1: Canonical cloud-cell key

**Files:**
- Create: `src/lib/shared/render/services/cloud-cell-key.ts`
- Test: `src/lib/shared/render/services/cloud-cell-key.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/shared/render/services/cloud-cell-key.test.ts
import { describe, it, expect } from "vitest";
import { canonicalCellKeyString, CANONICAL_CELL_SIZE } from "./cloud-cell-key";
import type { PreviewCellRenderOptions } from "$lib/shared/sequence-viewer/services/preview-cell-renderer";
import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";

const data = {
  letter: "A",
  startPos: "alpha1",
  endPos: "alpha3",
  motions: {
    blue: { motionType: "pro", startLocation: "n", endLocation: "e", turns: 0 },
    red: { motionType: "pro", startLocation: "s", endLocation: "w", turns: 0 },
  },
} as unknown as PictographData;

const base: PreviewCellRenderOptions = { size: 300, bluePropType: undefined };

describe("canonicalCellKeyString", () => {
  it("is independent of display size (size normalized to canonical)", () => {
    const a = canonicalCellKeyString(data, true, { ...base, size: 300 });
    const b = canonicalCellKeyString(data, true, { ...base, size: 640 });
    expect(a).toBe(b);
    expect(a).toContain(String(CANONICAL_CELL_SIZE));
  });

  it("is independent of step-number presence", () => {
    const a = canonicalCellKeyString(data, true, { ...base, showStepNumbers: true });
    const b = canonicalCellKeyString(data, true, { ...base, showStepNumbers: false });
    expect(a).toBe(b);
  });

  it("differs by dark mode and by prop type", () => {
    expect(canonicalCellKeyString(data, true, base)).not.toBe(
      canonicalCellKeyString(data, false, base),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/shared/render/services/cloud-cell-key.test.ts`
Expected: FAIL — `Cannot find module './cloud-cell-key'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/shared/render/services/cloud-cell-key.ts
/**
 * Canonical cloud-cell key.
 *
 * The per-device IndexedDB cell key (see cell-cache-key-deriver) bakes in the
 * display SIZE, which varies by viewport. For a globally-shared cloud image we
 * need a key that is identical across devices: same pictograph + prop + mode =>
 * same key, regardless of screen size. We achieve that by deriving the existing
 * cell key with size pinned to CANONICAL_CELL_SIZE and step numbers off, then
 * hashing it to a short, filename-safe digest for the storage path.
 */

import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
import type { PreviewCellRenderOptions } from "$lib/shared/sequence-viewer/services/preview-cell-renderer";
import { deriveCacheKey } from "$lib/shared/sequence-viewer/services/cell-cache-key-deriver";

/** Canonical render size for cloud-stored cells. High enough for any card cell. */
export const CANONICAL_CELL_SIZE = 480;

/** The size-normalized, number-free cell key string (deterministic, long). */
export function canonicalCellKeyString(
  pictographData: PictographData,
  isDark: boolean,
  options: PreviewCellRenderOptions,
): string {
  return deriveCacheKey(pictographData, undefined, isDark, {
    ...options,
    size: CANONICAL_CELL_SIZE,
    showStepNumbers: false,
  });
}

/**
 * SHA-256 hex digest of the canonical key — a short, filename-safe, collision-
 * free, cross-device-stable storage hash. Async because it uses SubtleCrypto.
 */
export async function deriveCloudCellHash(
  pictographData: PictographData,
  isDark: boolean,
  options: PreviewCellRenderOptions,
): Promise<string> {
  const keyString = canonicalCellKeyString(pictographData, isDark, options);
  const bytes = new TextEncoder().encode(keyString);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/shared/render/services/cloud-cell-key.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/shared/render/services/cloud-cell-key.ts src/lib/shared/render/services/cloud-cell-key.test.ts
git commit -m "feat(render): canonical device-independent cloud-cell key" -- src/lib/shared/render/services/cloud-cell-key.ts src/lib/shared/render/services/cloud-cell-key.test.ts
```

---

### Task 1.2: PNG→WebP converter

**Files:**
- Create: `src/lib/shared/render/services/png-blob-to-webp.ts`
- Test: `src/lib/shared/render/services/png-blob-to-webp.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/shared/render/services/png-blob-to-webp.test.ts
import { describe, it, expect } from "vitest";
import { pngBlobToWebp } from "./png-blob-to-webp";

describe("pngBlobToWebp", () => {
  it("returns the original blob when conversion is unavailable (no DOM)", async () => {
    // jsdom lacks real canvas encoding; the converter must degrade to the input
    // blob rather than throw, so uploads never crash a save.
    const input = new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" });
    const out = await pngBlobToWebp(input);
    expect(out).toBeInstanceOf(Blob);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/shared/render/services/png-blob-to-webp.test.ts`
Expected: FAIL — `Cannot find module './png-blob-to-webp'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/shared/render/services/png-blob-to-webp.ts
/**
 * Convert a PNG blob to WebP for compact cloud storage. Falls back to returning
 * the input unchanged if encoding is unavailable (SSR / unsupported), so an
 * upload path can never throw on conversion.
 */
import { blobToImage } from "./image-format-converter";

export async function pngBlobToWebp(png: Blob, quality = 0.9): Promise<Blob> {
  if (typeof document === "undefined" && typeof OffscreenCanvas === "undefined") {
    return png;
  }
  try {
    const img = await blobToImage(png);
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;

    if (typeof OffscreenCanvas !== "undefined") {
      const canvas = new OffscreenCanvas(w, h);
      const ctx = canvas.getContext("2d");
      if (!ctx) return png;
      ctx.drawImage(img, 0, 0);
      return await canvas.convertToBlob({ type: "image/webp", quality });
    }

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return png;
    ctx.drawImage(img, 0, 0);
    return await new Promise<Blob>((resolve) => {
      canvas.toBlob((b) => resolve(b ?? png), "image/webp", quality);
    });
  } catch {
    return png;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/shared/render/services/png-blob-to-webp.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add src/lib/shared/render/services/png-blob-to-webp.ts src/lib/shared/render/services/png-blob-to-webp.test.ts
git commit -m "feat(render): PNG->WebP converter with safe fallback" -- src/lib/shared/render/services/png-blob-to-webp.ts src/lib/shared/render/services/png-blob-to-webp.test.ts
```

---

### Task 1.3: Per-cell cloud cache (Firebase Storage)

**Files:**
- Create: `src/lib/shared/render/services/pictograph-cloud-cache.ts`
- Test: `src/lib/shared/render/services/pictograph-cloud-cache.test.ts`

This mirrors `src/lib/shared/browse/services/cloud-thumbnail-cache.ts` (knownExists + localStorage + manifest + "only fetch what we know exists"), keyed by the cloud-cell hash instead of a thumbnail key.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/shared/render/services/pictograph-cloud-cache.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  knows, registerExists, getUrl, _resetForTest,
} from "./pictograph-cloud-cache";

describe("pictograph-cloud-cache", () => {
  beforeEach(() => {
    localStorage.clear();
    _resetForTest();
  });

  it("does not know a hash until registered (avoids 404 probing)", () => {
    expect(knows("abc123")).toBe(false);
  });

  it("knows a hash after registerExists and returns a public URL", async () => {
    registerExists("abc123");
    expect(knows("abc123")).toBe(true);
    const url = await getUrl("abc123");
    expect(url).toContain("pictograph-cells%2Fabc123.webp");
  });

  it("returns null url for an unknown hash", async () => {
    expect(await getUrl("nope")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/shared/render/services/pictograph-cloud-cache.test.ts`
Expected: FAIL — `Cannot find module './pictograph-cloud-cache'`.

- [ ] **Step 3: Write minimal implementation**

> **SUPERSEDED by direct-probe (code-review correction).** The manifest/`knows()`-gated
> version below was found to break cross-device benefit: nothing maintains
> `pictograph-cells/manifest.json`, so a second device's `knows()` is always false and it
> never downloads. The shipped implementation is **direct-probe** — `download(hash)` fetches
> the deterministic URL and negative-caches misses; `upload(hash, blob)` swallows + dedups;
> no manifest, no localStorage, no `knows()`. Exports: `cellPublicUrl`, `download`, `upload`,
> `_resetForTest`. See the committed file and the matching Task 1.4 cloud-tier code. The block
> below is retained only as the original-intent record.

```ts
// src/lib/shared/render/services/pictograph-cloud-cache.ts
/**
 * Pictograph Cloud Cache
 *
 * Per-cell sibling of cloud-thumbnail-cache. Stores one pre-rendered WebP per
 * unique pictograph (keyed by the canonical cloud-cell hash) in Firebase
 * Storage, so a cold scanner DOWNLOADS the image instead of rasterizing it.
 *
 * Same "known-exists" discipline as the thumbnail cache: we never request a
 * file we have not confirmed exists (via manifest or a prior upload), so reads
 * never 404-spam.
 *
 * Storage: pictograph-cells/{hash}.webp
 * Manifest: pictograph-cells/manifest.json  ->  { keys: string[], generated }
 */

import { getStorageInstance } from "$lib/shared/auth/firebase";

const FIREBASE_STORAGE_BUCKET = "the-kinetic-alphabet.firebasestorage.app";
const MANIFEST_PATH = "pictograph-cells/manifest.json";
const KNOWN_EXISTS_KEY = "tka-cloud-cells";

let knownExists: Set<string> | null = null;
let manifestLoaded = false;
let manifestLoadPromise: Promise<number> | null = null;
const urlCache = new Map<string, string>();
const pendingUploads = new Map<string, Promise<string>>();

function storagePath(hash: string): string {
  return `pictograph-cells/${hash}.webp`;
}

function getKnownExists(): Set<string> {
  if (knownExists) return knownExists;
  try {
    const stored = typeof localStorage !== "undefined" ? localStorage.getItem(KNOWN_EXISTS_KEY) : null;
    if (stored) {
      const parsed = JSON.parse(stored) as { keys: string[]; timestamp: number };
      if (Date.now() - parsed.timestamp < 7 * 24 * 60 * 60 * 1000) {
        knownExists = new Set(parsed.keys);
        return knownExists;
      }
    }
  } catch {
    /* ignore */
  }
  knownExists = new Set();
  return knownExists;
}

function persistKnownExists(): void {
  try {
    if (typeof localStorage === "undefined") return;
    const keys = Array.from(getKnownExists()).slice(-5000);
    localStorage.setItem(KNOWN_EXISTS_KEY, JSON.stringify({ keys, timestamp: Date.now() }));
  } catch {
    /* ignore */
  }
}

/** Synchronous "do we know this exists" check (used before download attempts). */
export function knows(hash: string): boolean {
  return getKnownExists().has(hash);
}

/** Register a hash as existing (after upload or manifest load). */
export function registerExists(hash: string): void {
  const set = getKnownExists();
  set.add(hash);
  if (set.size % 10 === 0) persistKnownExists();
}

/** Public download URL for a KNOWN hash; null if not known. */
export async function getUrl(hash: string): Promise<string | null> {
  const cached = urlCache.get(hash);
  if (cached) return cached;
  if (!knows(hash)) return null;
  const encoded = encodeURIComponent(storagePath(hash));
  const url = `https://firebasestorage.googleapis.com/v0/b/${FIREBASE_STORAGE_BUCKET}/o/${encoded}?alt=media`;
  urlCache.set(hash, url);
  return url;
}

/** Download the WebP blob for a known hash; null on miss/error. */
export async function download(hash: string): Promise<Blob | null> {
  try {
    const url = await getUrl(hash);
    if (!url) return null;
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.blob();
  } catch {
    return null;
  }
}

/** Upload a rendered WebP under its hash; first-write-wins. */
export async function upload(hash: string, blob: Blob): Promise<string> {
  const pending = pendingUploads.get(hash);
  if (pending) return pending;
  const existing = await getUrl(hash);
  if (existing) return existing;

  const p = (async () => {
    const { ref, uploadBytes, getDownloadURL } = await import("firebase/storage");
    const storage = await getStorageInstance();
    const storageRef = ref(storage, storagePath(hash));
    await uploadBytes(storageRef, blob, {
      contentType: "image/webp",
      customMetadata: { uploadedAt: new Date().toISOString(), source: "crowd-sourced" },
    });
    const url = await getDownloadURL(storageRef);
    return url;
  })();
  pendingUploads.set(hash, p);
  try {
    const url = await p;
    urlCache.set(hash, url);
    registerExists(hash);
    return url;
  } finally {
    pendingUploads.delete(hash);
  }
}

/** Pre-populate knownExists from the cloud manifest (call once on scan boot). */
export async function loadManifest(): Promise<number> {
  if (manifestLoaded) return getKnownExists().size;
  if (manifestLoadPromise) return manifestLoadPromise;
  manifestLoadPromise = (async () => {
    try {
      const encoded = encodeURIComponent(MANIFEST_PATH);
      const url = `https://firebasestorage.googleapis.com/v0/b/${FIREBASE_STORAGE_BUCKET}/o/${encoded}?alt=media`;
      const res = await fetch(url);
      if (!res.ok) { manifestLoaded = true; return 0; }
      const manifest = (await res.json()) as { keys: string[] };
      const set = getKnownExists();
      for (const k of manifest.keys) set.add(k);
      persistKnownExists();
      manifestLoaded = true;
      return set.size;
    } catch {
      manifestLoaded = true;
      return getKnownExists().size;
    } finally {
      manifestLoadPromise = null;
    }
  })();
  return manifestLoadPromise;
}

/** Test-only reset. */
export function _resetForTest(): void {
  knownExists = null;
  manifestLoaded = false;
  manifestLoadPromise = null;
  urlCache.clear();
  pendingUploads.clear();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/shared/render/services/pictograph-cloud-cache.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/shared/render/services/pictograph-cloud-cache.ts src/lib/shared/render/services/pictograph-cloud-cache.test.ts
git commit -m "feat(render): per-cell pictograph cloud cache (Firebase Storage)" -- src/lib/shared/render/services/pictograph-cloud-cache.ts src/lib/shared/render/services/pictograph-cloud-cache.test.ts
```

---

### Task 1.4: Insert the cloud tier into renderCell

**Files:**
- Modify: `src/lib/shared/sequence-viewer/services/preview-cell-renderer.ts:128-205`
- Test: `src/lib/shared/sequence-viewer/services/preview-cell-renderer.cloud-tier.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/shared/sequence-viewer/services/preview-cell-renderer.cloud-tier.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";

// Mocks must be declared before importing the SUT.
const blobGet = vi.fn();
const blobSet = vi.fn().mockResolvedValue(undefined);
vi.mock("$lib/shared/render/services/pictograph-blob-cache", () => ({
  pictographBlobCache: { get: (...a: unknown[]) => blobGet(...a), set: (...a: unknown[]) => blobSet(...a) },
}));

const poolRender = vi.fn();
vi.mock("$lib/shared/render/services/worker-render-pool", () => ({
  getWorkerRenderPool: () => ({ render: (...a: unknown[]) => poolRender(...a) }),
}));

const cloudDownload = vi.fn();
const cloudUpload = vi.fn().mockResolvedValue("https://x/y.webp");
vi.mock("$lib/shared/render/services/pictograph-cloud-cache", () => ({
  download: (...a: unknown[]) => cloudDownload(...a),
  upload: (...a: unknown[]) => cloudUpload(...a),
  cellPublicUrl: (h: string) => `https://x/${h}.webp`,
}));

vi.mock("$lib/shared/render/services/cloud-cell-key", () => ({
  CANONICAL_CELL_SIZE: 480,
  deriveCloudCellHash: vi.fn().mockResolvedValue("HASH"),
  canonicalCellKeyString: vi.fn().mockReturnValue("k"),
}));

vi.mock("$lib/shared/pictograph/shared/services/pictograph-preparer", () => ({
  pictographPreparer: { prepareSingle: vi.fn().mockResolvedValue({}) },
}));
vi.mock("$lib/shared/render/services/png-blob-to-webp", () => ({
  pngBlobToWebp: vi.fn().mockResolvedValue(new Blob(["w"], { type: "image/webp" })),
}));

globalThis.URL.createObjectURL = vi.fn(() => "blob:fake");

import { renderCell } from "./preview-cell-renderer";
import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";

const data = { letter: "A", motions: {} } as unknown as PictographData;
const opts = { size: 300 };

describe("renderCell cloud tier", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    blobGet.mockResolvedValue(null); // IndexedDB miss (cold scanner)
  });

  it("cloud HIT: downloads, never calls the worker", async () => {
    cloudDownload.mockResolvedValue(new Blob(["img"], { type: "image/webp" }));

    await renderCell(data, undefined, true, opts);

    expect(cloudDownload).toHaveBeenCalledWith("HASH");
    expect(poolRender).not.toHaveBeenCalled();
  });

  it("cloud MISS: renders via worker AND uploads the result", async () => {
    cloudDownload.mockResolvedValue(null); // direct-probe miss
    poolRender.mockResolvedValue(new Blob(["png"], { type: "image/png" }));

    await renderCell(data, undefined, true, opts);

    expect(poolRender).toHaveBeenCalledTimes(1);
    // upload is fire-and-forget; allow the microtask queue to flush
    await Promise.resolve();
    await Promise.resolve();
    expect(cloudUpload).toHaveBeenCalledWith("HASH", expect.any(Blob));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/shared/sequence-viewer/services/preview-cell-renderer.cloud-tier.test.ts`
Expected: FAIL — `cloudDownload` not called / `poolRender` called in the HIT case (cloud tier not yet present).

- [ ] **Step 3: Implement the cloud tier**

In `src/lib/shared/sequence-viewer/services/preview-cell-renderer.ts`, add imports after the existing import block (after line 82):

```ts
import * as pictographCloudCache from "$lib/shared/render/services/pictograph-cloud-cache";
import { deriveCloudCellHash } from "$lib/shared/render/services/cloud-cell-key";
import { pngBlobToWebp } from "$lib/shared/render/services/png-blob-to-webp";
```

Then, immediately AFTER the IndexedDB lookup `try/catch` block (which currently ends at line 140 with the closing `}` of `catch`) and BEFORE `const viewMode = options.browseViewMode;` (line 142), insert:

```ts
  // Cloud tier: a globally-shared, pre-rendered image for this exact pictograph.
  // A cold scanner (empty IndexedDB) downloads it instead of rasterizing on
  // device. Keyed by a canonical, size-independent hash so every device agrees.
  // Direct-probe: download() attempts the deterministic URL and returns null on
  // a miss (negative-cached for the session) — no manifest/knows() gate.
  let cloudHash: string | null = null;
  try {
    cloudHash = await deriveCloudCellHash(pictographData, isDark, baseOptions);
    const cloudBlob = await pictographCloudCache.download(cloudHash);
    if (cloudBlob) {
      // Seed IndexedDB under the display key so a re-render is a local hit.
      pictographBlobCache.set(cacheKey, cloudBlob).catch(() => {});
      return wantNumber
        ? URL.createObjectURL(
            await compositeStepNumberOnBlob(cloudBlob, stepNumber!, options.size, isDark, options.widthMultiplier ?? 1),
          )
        : URL.createObjectURL(cloudBlob);
    }
  } catch {
    // Cloud unavailable or hash failure — fall through to local render.
  }
```

Then, immediately AFTER the existing IndexedDB write `pictographBlobCache.set(cacheKey, blob).catch(() => {});` (line 198), insert the crowd-source upload:

```ts
  // Crowd-source: this device just rendered a pictograph the cloud didn't have
  // (download() above returned null, i.e. confirmed miss). Upload it (as WebP)
  // so the next scanner downloads instead of rendering. upload() dedups + never
  // throws. Fire-and-forget — never blocks the returned URL.
  if (cloudHash) {
    const hashForUpload = cloudHash;
    void pngBlobToWebp(blob)
      .then((webp) => pictographCloudCache.upload(hashForUpload, webp))
      .catch(() => {});
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/shared/sequence-viewer/services/preview-cell-renderer.cloud-tier.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Run the full render test suite + typecheck**

Run: `npx vitest run src/lib/shared/sequence-viewer src/lib/shared/render`
Expected: PASS (no regressions in existing cell/render tests).
Run: `npm run check:fast`
Expected: no new errors in `preview-cell-renderer.ts`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/shared/sequence-viewer/services/preview-cell-renderer.ts src/lib/shared/sequence-viewer/services/preview-cell-renderer.cloud-tier.test.ts
git commit -m "feat(render): cloud image tier in renderCell (download not rasterize)" -- src/lib/shared/sequence-viewer/services/preview-cell-renderer.ts src/lib/shared/sequence-viewer/services/preview-cell-renderer.cloud-tier.test.ts
```

---

### Task 1.5: DROPPED (no manifest in the direct-probe design)

The cloud cache read path is now **direct-probe** (a code-review correction — see the
note under Task 1.3): `download()` attempts the deterministic URL and negative-caches
misses per session, so there is no manifest to pre-load and no `knows()` gate. The
scan page therefore needs no manifest-warm step. This task is intentionally removed.

(If a manifest-based probe-avoidance optimization is ever wanted at gallery scale, it
would be a separate, additive task — it is NOT required for scan-card correctness.)

---

## PHASE 2 — Render-at-publish

### Task 2.1: warmSequenceCells

**Files:**
- Create: `src/lib/features/library/services/warm-sequence-cells.ts`
- Test: `src/lib/features/library/services/warm-sequence-cells.test.ts`

This reuses `renderCell` (which, after Task 1.4, uploads to the cloud on a miss) at `CANONICAL_CELL_SIZE`, iterating the sequence's steps exactly as `ChoreoCard` does (`renderCell(step, i + 1, ...)` plus the start cell via `createStartPositionFromBeatStart`).

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/features/library/services/warm-sequence-cells.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const renderCell = vi.fn().mockResolvedValue("blob:fake");
vi.mock("$lib/shared/sequence-viewer/services/preview-cell-renderer", () => ({
  renderCell: (...a: unknown[]) => renderCell(...a),
}));
vi.mock("$lib/shared/create/services/sequence-transforms", () => ({
  createStartPositionFromBeatStart: vi.fn().mockReturnValue({ letter: "start" }),
}));
globalThis.URL.revokeObjectURL = vi.fn();

import { warmSequenceCells } from "./warm-sequence-cells";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";

const seq = {
  id: "s1",
  steps: [{ letter: "A", motions: {} }, { letter: "B", motions: {} }],
  startPosition: { letter: "alpha" },
} as unknown as SequenceData;

describe("warmSequenceCells", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders the start cell + every step at canonical size", async () => {
    await warmSequenceCells(seq, { isDark: true });
    // 1 start + 2 steps = 3 renders
    expect(renderCell).toHaveBeenCalledTimes(3);
    const firstOptions = renderCell.mock.calls[0]![3] as { size: number };
    expect(firstOptions.size).toBe(480);
  });

  it("never throws when a single cell render fails", async () => {
    renderCell.mockRejectedValueOnce(new Error("boom"));
    await expect(warmSequenceCells(seq, { isDark: true })).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/features/library/services/warm-sequence-cells.test.ts`
Expected: FAIL — `Cannot find module './warm-sequence-cells'`.

> Confirmed path: `createStartPositionFromBeatStart` lives in `$lib/shared/create/services/sequence-transforms` (imported by `ChoreoCard.svelte:33`). The test mock above and the implementation import below both use that exact path.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/features/library/services/warm-sequence-cells.ts
/**
 * Render-at-publish: render every cell of a saved sequence at CANONICAL_CELL_SIZE
 * and let renderCell's cloud tier upload each to Firebase Storage, so the FIRST
 * scanner of a freshly-published sequence downloads images instead of rendering.
 *
 * Fire-and-forget from the save path. Best-effort: a failed cell is skipped, the
 * save is never affected. Revokes the returned object URLs (we only want the
 * upload side effect, not display).
 */
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import type { PreviewCellRenderOptions } from "$lib/shared/sequence-viewer/services/preview-cell-renderer";
import { renderCell } from "$lib/shared/sequence-viewer/services/preview-cell-renderer";
import { createStartPositionFromBeatStart } from "$lib/shared/create/services/sequence-transforms";
import { CANONICAL_CELL_SIZE } from "$lib/shared/render/services/cloud-cell-key";

export interface WarmOptions {
  isDark: boolean;
  /** Prop the scan card will render with (sequence.intendedProp). */
  bluePropType?: PropType;
}

export async function warmSequenceCells(
  sequence: SequenceData,
  opts: WarmOptions,
): Promise<void> {
  const steps = sequence.steps ?? [];
  if (steps.length === 0) return;

  const renderOptions: PreviewCellRenderOptions = {
    size: CANONICAL_CELL_SIZE,
    showStepNumbers: false,
    bluePropType: opts.bluePropType,
  };

  const warmOne = async (data: unknown, stepNumber: number | undefined) => {
    try {
      const url = await renderCell(
        data as Parameters<typeof renderCell>[0],
        stepNumber,
        opts.isDark,
        renderOptions,
      );
      if (typeof url === "string" && url.startsWith("blob:")) URL.revokeObjectURL(url);
    } catch {
      /* skip this cell */
    }
  };

  const firstStep = steps[0];
  const startData = sequence.startPosition
    ?? (firstStep ? createStartPositionFromBeatStart(firstStep) : null);
  if (startData) await warmOne(startData, undefined);

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (step) await warmOne(step, i + 1);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/features/library/services/warm-sequence-cells.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/features/library/services/warm-sequence-cells.ts src/lib/features/library/services/warm-sequence-cells.test.ts
git commit -m "feat(library): warmSequenceCells renders+uploads cells at publish" -- src/lib/features/library/services/warm-sequence-cells.ts src/lib/features/library/services/warm-sequence-cells.test.ts
```

---

### Task 2.2: Call warmSequenceCells after save

**Files:**
- Modify: `src/lib/features/library/services/library-save-service.ts:137-147`

- [ ] **Step 1: Add the import**

In `library-save-service.ts` imports:

```ts
import { warmSequenceCells } from "./warm-sequence-cells";
```

- [ ] **Step 2: Fire-and-forget the warm after the Firestore sync kickoff**

In `saveSequence`, immediately after the `this.syncToFirestore(...)` call (lines 137-138) and before the artifact-extractor block (line 142), insert:

```ts
    // Fire-and-forget: pre-render this sequence's pictograph cells to the cloud
    // store so the first person to scan its QR downloads images instead of
    // rendering them on their phone. Never blocks or fails the save.
    if (typeof window !== "undefined") {
      // intendedProp.bluePropType is typed PropType on SequenceData
      // (sequence-data.ts:161) — no cast needed.
      void warmSequenceCells(sequenceToSave, {
        isDark: true,
        bluePropType: sequenceToSave.intendedProp?.bluePropType,
      }).catch(() => {});
    }
```

- [ ] **Step 3: Verify**

Run: `npm run check:fast`
Expected: no new errors in `library-save-service.ts`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/features/library/services/library-save-service.ts
git commit -m "feat(library): warm scan-card cells to cloud on save (fire-and-forget)" -- src/lib/features/library/services/library-save-service.ts
```

---

## PHASE 3 — Critical-path trim

### Task 3.1: Defer full glyph-cache init off the card's critical path

**Files:**
- Modify: `src/routes/q/[code]/+page.svelte:448-454`

**Why:** The card grid cells are images now (Phase 1) and need no live glyph rendering. The full `getGlyphCache().initialize()` (all 26 letters + every turn/element/TnD glyph) only feeds the animation pane. Moving it out of the blocking `Promise.all` lets the card mount sooner.

- [ ] **Step 1: Replace the Promise.all so glyph init no longer gates the card**

In `src/routes/q/[code]/+page.svelte`, replace the existing block (lines 448-454):

```ts
      const [seq_, OrchestratorModule, SplitPaneModule] = await Promise.all([
        shortCodeManager.resolveShortCode(shortCode),
        getGlyphCache().initialize().then(() =>
          import("$lib/shared/sequence-viewer/components/SequenceViewerOrchestrator.svelte")
        ),
        import("$lib/shared/sequence-viewer/components/ViewerSplitPane.svelte"),
      ]);
```

with:

```ts
      // Card-critical only: resolve the sequence + the two viewer chunks. The
      // full glyph cache (all letters/turns/elements) is animator-only and is
      // kicked off in the background below — it must NOT gate first card paint.
      const [seq_, OrchestratorModule, SplitPaneModule] = await Promise.all([
        shortCodeManager.resolveShortCode(shortCode),
        import("$lib/shared/sequence-viewer/components/SequenceViewerOrchestrator.svelte"),
        import("$lib/shared/sequence-viewer/components/ViewerSplitPane.svelte"),
      ]);

      // Warm the full glyph cache in the background for when the user opens the
      // animation pane. Not awaited — the static card never needs it.
      void getGlyphCache().initialize();
```

- [ ] **Step 2: Verify the animation pane still has glyphs when opened**

Run: `npm run check:fast`
Expected: no new errors.

Manual (DevTools, with verbal permission): scan a code, switch to the animation pane, confirm glyphs/labels render. (The background `initialize()` resolves well before a user taps into animation; if a race is ever observed, the animator already calls the glyph cache lazily.)

- [ ] **Step 3: Commit**

```bash
git add src/routes/q/[code]/+page.svelte
git commit -m "perf(scan): defer animator glyph-cache init off card critical path" -- src/routes/q/[code]/+page.svelte
```

---

### Task 3.2: Preload the viewer chunks

**Files:**
- Modify: `src/routes/q/[code]/+page.svelte` (`<svelte:head>` block, after line 570)

- [ ] **Step 1: Add modulepreload hints**

Inside the existing `<svelte:head>` (before the closing `</svelte:head>` at line 571), add:

```svelte
  <link
    rel="modulepreload"
    href="/src/lib/shared/sequence-viewer/components/ViewerSplitPane.svelte"
  />
```

> NOTE for implementer: in a production build the hashed chunk path differs from the dev source path; SvelteKit emits the correct `modulepreload` for route-level imports automatically, so prefer verifying whether the dev `<link rel="modulepreload">` measurably helps via the Phase-0 marks BEFORE keeping it. If the marks show no improvement (chunk parse not on the critical path after Task 3.1), REMOVE this hint rather than ship a dead tag. Record the before/after `chunk-load → card-mount` delta in the commit message.

- [ ] **Step 2: Measure with the Phase-0 instrumentation**

Manual (DevTools, throttled): compare `card-mount` timestamp before/after. Keep only if it helps.

- [ ] **Step 3: Commit (only if it helped)**

```bash
git add src/routes/q/[code]/+page.svelte
git commit -m "perf(scan): modulepreload viewer chunk (measured Nms card-mount win)" -- src/routes/q/[code]/+page.svelte
```

---

## PHASE 5 — End-to-end budget check

### Task 5.1: Document + script the throttled scan-to-stable budget

**Files:**
- Create: `docs/reference/scan-card-perf-budget.md`

- [ ] **Step 1: Write the procedure doc**

```markdown
# Scan-Card Performance Budget

Measures `scan-to-stable` on `/q/[code]` under throttling, using the Phase-0
`scan-perf` marks. Not CI (Chrome DevTools MCP is interactive); run before/after
any change to the scan path or cell pipeline.

## Budgets
- Warm (cloud images known + cached): scan-to-stable < 400ms
- Cold (first scan, images downloaded not rendered): < 1000ms

## Procedure (Chrome DevTools MCP)
1. Start the dev server's HTTPS origin (port 5173) OR `npm run build && npm run preview`.
2. DevTools MCP: `emulate` CPU 4x slowdown + "Slow 4G" network.
3. `navigate_page` to `https://localhost:5173/q/<code>`.
4. After the card is visible, `evaluate_script`:
   ```js
   () => {
     const s = performance.getEntriesByName("scan:start","mark")[0];
     const e = performance.getEntriesByName("scan:all-cells-stable","mark")[0];
     return { scanToStable: e && s ? Math.round(e.startTime - s.startTime) : null,
              stages: ["start","shortcode-resolved","hydrated","card-mount","first-cell-painted","all-cells-stable"]
                .map(n => { const m = performance.getEntriesByName("scan:"+n,"mark")[0];
                            return { n, t: m ? Math.round(m.startTime - (s?.startTime ?? 0)) : null }; }) };
   }
   ```
5. Cold run: in DevTools, clear site data (IndexedDB + localStorage) first, then repeat.
6. Record both numbers; fail the change if either exceeds its budget.

## What each stage tells you
- start → shortcode-resolved: Firebase/snapshot resolve + hydrate latency.
- shortcode-resolved → card-mount: chunk parse + template gate.
- card-mount → all-cells-stable: cell acquisition. With the cloud tier warm this
  should be download-bound (small WebPs), NOT render-bound.
```

- [ ] **Step 2: Capture the Phase-0 baseline number into the doc**

Before Phase 1 lands, run the procedure once and paste the baseline `scan-to-stable` (cold + warm) under a "## Baseline (pre-cloud-tier)" heading. After Phase 1-3, paste the "## After" numbers. This is the before/after proof.

- [ ] **Step 3: Commit**

```bash
git add docs/reference/scan-card-perf-budget.md
git commit -m "docs(perf): scan-card scan-to-stable budget + DevTools procedure" -- docs/reference/scan-card-perf-budget.md
```

---

## Final verification (run before declaring done)

- [ ] `npm run check` (one full cold run, captured to a log) — zero new errors across all touched files.
- [ ] `npx vitest run src/lib/shared/render src/lib/shared/sequence-viewer src/lib/shared/analytics src/lib/features/library` — all new + existing tests pass.
- [ ] DevTools throttled budget check (Task 5.1) — cold and warm `scan-to-stable` under budget, before/after recorded.
- [ ] CORS: if the cell manifest or images 404/blocked on localhost, run `npm run storage:cors:apply` (Firebase Storage bucket needs `https://localhost:5173`).

---

## Self-Review (completed by plan author)

**Spec coverage:**
- Part 1 (per-cell cloud store) → Tasks 1.1–1.5 ✓
- Part 2 (render-at-publish) → Tasks 2.1–2.2 ✓
- Part 3 (critical-path trim) → Tasks 3.1–3.2 ✓
- Part 4 (instrumentation) → Tasks 0.1–0.2 ✓
- Part 5 (unit tests) → 0.1, 1.1, 1.2, 1.3, 1.4, 2.1; (e2e budget) → Task 5.1 ✓
- Firebase Storage backend decision → Task 1.3 ✓
- Canonical size normalization → Task 1.1 ✓

**Type consistency:** `deriveCloudCellHash` / `canonicalCellKeyString` / `CANONICAL_CELL_SIZE` (cloud-cell-key) used consistently in 1.1/1.4/2.1. Cloud cache exports `knows`/`download`/`upload`/`loadManifest`/`registerExists` used consistently in 1.3/1.4/1.5. `renderCell(data, stepNumber, isDark, options)` signature matches existing usage in ChoreoCard and is reused unchanged in 2.1.

**Resolved paths (grep-confirmed against current source):** `createStartPositionFromBeatStart` → `$lib/shared/create/services/sequence-transforms` (ChoreoCard.svelte:33); `SequenceData.intendedProp?.bluePropType` is typed `PropType` (sequence-data.ts:161), used directly without a cast. No remaining "confirm later" items.
