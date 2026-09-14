/**
 * Audit: blob-URL lifecycle in the orchestrator's in-memory tier.
 *
 * MemoryUrlCache (thumbnail-render-orchestrator.ts:96-142) is the only
 * zero-flash tier and the only thing that revokes the blob URLs the renderer and
 * the IndexedDB tier create. It revokes on LRU eviction, on `delete()`, and in
 * `clear()` — but NOT when a hash is re-`set()` with a different URL.
 *
 * That gap is LATENT, not a live leak. All three shipped paths that re-render an
 * already-cached hash remove the entry first:
 *
 *  - PropAwareThumbnail.handleImageError (`:298-335`) and `forceRerender`
 *    (`:506-533`) both call `repairThumbnailCaches`, whose first act is a
 *    synchronous `evictHash(hash)` (thumbnail-repair.ts:20) — which revokes;
 *  - handleCacheCleared (`:241-255`) only ever fires from AdminToolbar
 *    (`:214`), five lines after that component calls `invalidateAllCaches()`
 *    (`:209`), which clears and revokes the whole map.
 *
 * So these tests do two things: exercise the class-level gap directly (a
 * replacement no shipped caller performs today), and pin the three protections
 * so the gap stays latent. The retention *cap* is a separate observation: 500
 * entries with no byte budget.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import type { ThumbnailRenderInput } from "$lib/shared/browse/services/thumbnail-key-deriver";
import { repairThumbnailCaches } from "$lib/shared/browse/services/thumbnail-repair";

vi.mock("$lib/shared/analytics/thumbnail-analytics", () => ({
  captureThumbnailRenderFailure: vi.fn(),
}));

vi.mock("$lib/shared/browse/services/cloud-thumbnail-cache", () => ({
  getCachedUrl: () => null,
  getUrl: vi.fn(async () => null),
  upload: vi.fn(async () => null),
  clearMemoryCache: vi.fn(),
  invalidateUrl: vi.fn(),
  markMissing: vi.fn(),
}));

const sequence = (id: string): SequenceData =>
  ({
    id,
    word: id,
    steps: [{ id: `${id}-1`, motions: {} }],
  }) as unknown as SequenceData;

const input = (id: string): ThumbnailRenderInput => ({
  sequenceName: id,
  sequenceId: id,
  leftPropType: PropType.STAFF,
  rightPropType: PropType.STAFF,
  catDogModeEnabled: false,
  lightMode: false,
  variant: "gallery",
  startPositionLayout: "row",
  visibility: { showQRCode: false, showMandala: true },
});

let createdUrls: string[];
let revokedUrls: string[];

async function createOrchestrator() {
  const [{ ThumbnailRenderOrchestrator }, { ThumbnailRenderQueue }] =
    await Promise.all([
      import("$lib/shared/browse/services/thumbnail-render-orchestrator"),
      import("$lib/shared/browse/services/thumbnail-render-queue"),
    ]);
  return new ThumbnailRenderOrchestrator(
    new ThumbnailRenderQueue(),
    {
      render: vi.fn(async () => ({
        blob: new Blob(["rendered"], { type: "image/webp" }),
        qrConsistent: true,
      })),
    } as never,
    { get: vi.fn(async () => null), set: vi.fn(async () => {}) } as never
  );
}

beforeEach(() => {
  vi.resetModules();
  createdUrls = [];
  revokedUrls = [];
  let next = 0;
  vi.spyOn(URL, "createObjectURL").mockImplementation(() => {
    const url = `blob:thumb-${++next}`;
    createdUrls.push(url);
    return url;
  });
  vi.spyOn(URL, "revokeObjectURL").mockImplementation((url: string) => {
    revokedUrls.push(url);
  });
  vi.spyOn(console, "debug").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () => new Response(JSON.stringify({ keys: [] }), { status: 200 })
    )
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("memory URL cache replacement", () => {
  it("LATENT: set() drops the URL it replaces without revoking it", async () => {
    const orchestrator = await createOrchestrator();

    const first = await orchestrator.getThumbnail({
      sequence: sequence("AB"),
      input: input("AB"),
    });
    // Reaching the gap requires re-rendering a hash whose entry is still live.
    // No shipped caller does this — the two repair paths and the admin clear all
    // evict first (see the file header) — so this is the class exercised
    // directly, not a reproduction of a production sequence.
    const second = await orchestrator.getThumbnail({
      sequence: sequence("AB"),
      input: input("AB"),
      skipCache: true,
    });

    expect(createdUrls).toEqual(["blob:thumb-1", "blob:thumb-2"]);
    expect(first.url).toBe("blob:thumb-1");
    expect(second.url).toBe("blob:thumb-2");
    // The map now serves the new URL, so nothing can reach or revoke the old
    // one again.
    expect(orchestrator.getCached(second.key.hash)).toBe("blob:thumb-2");

    // LATENT DEFECT: MemoryUrlCache.set() deletes the displaced entry without
    // revoking it. Should become ["blob:thumb-1"] once set() revokes a replaced
    // blob: URL — at which point the protection stops depending on all three
    // call sites remembering to evict first.
    expect(revokedUrls).toEqual([]);
  });

  it("CONTROL: the shared repair path evicts (and revokes) before the re-render", async () => {
    const orchestrator = await createOrchestrator();
    const first = await orchestrator.getThumbnail({
      sequence: sequence("AB"),
      input: input("AB"),
    });

    // Exactly what handleImageError and forceRerender do before setting
    // skipCacheOnNextRequest, with the real repair owner.
    await repairThumbnailCaches({
      kind: "blob-decode",
      hash: first.key.hash,
      cloudKey: null,
      localCache: null,
      evictHash: (hash) => orchestrator.evictHash(hash),
    });
    expect(revokedUrls).toEqual(["blob:thumb-1"]);

    const second = await orchestrator.getThumbnail({
      sequence: sequence("AB"),
      input: input("AB"),
      skipCache: true,
    });

    // Two URLs created, the first already released: no orphan.
    expect(createdUrls).toEqual(["blob:thumb-1", "blob:thumb-2"]);
    expect(revokedUrls).toEqual(["blob:thumb-1"]);
    expect(orchestrator.getCached(second.key.hash)).toBe("blob:thumb-2");
  });

  it("CONTROL: invalidateAllCaches revokes every URL it forgets", async () => {
    const orchestrator = await createOrchestrator();
    for (const id of ["AB", "CD", "EF"]) {
      await orchestrator.getThumbnail({
        sequence: sequence(id),
        input: input(id),
      });
    }
    expect(createdUrls).toHaveLength(3);

    // AdminToolbar:209 — runs before it dispatches thumbnailCacheCleared, so
    // the cards that re-render on that event have nothing live to displace.
    orchestrator.invalidateAllCaches();

    expect(revokedUrls).toEqual([
      "blob:thumb-1",
      "blob:thumb-2",
      "blob:thumb-3",
    ]);
    for (const id of ["AB", "CD", "EF"]) {
      await orchestrator.getThumbnail({
        sequence: sequence(id),
        input: input(id),
        skipCache: true,
      });
    }
    expect(createdUrls).toHaveLength(6);
    expect(revokedUrls).toHaveLength(3);
  });

  it("CONTROL: evictHash releases the blob it drops", async () => {
    const orchestrator = await createOrchestrator();
    const result = await orchestrator.getThumbnail({
      sequence: sequence("AB"),
      input: input("AB"),
    });

    orchestrator.evictHash(result.key.hash);

    expect(revokedUrls).toEqual(["blob:thumb-1"]);
    expect(orchestrator.getCached(result.key.hash)).toBeNull();
  });

  it("records the retention cap: 500 entries, no byte budget", async () => {
    const orchestrator = await createOrchestrator();

    for (let i = 0; i < 501; i++) {
      await orchestrator.getThumbnail({
        sequence: sequence(`SEQ${i}`),
        input: input(`SEQ${i}`),
      });
    }

    expect(createdUrls).toHaveLength(501);
    // LRU eviction does revoke — but only one entry is released, because the cap
    // counts ENTRIES (MAX_MEMORY_ENTRIES = 500) and never bytes. Steady-state
    // retention is 500 full-size WebP blobs held by live blob: URLs.
    expect(revokedUrls).toEqual(["blob:thumb-1"]);
  });
});
