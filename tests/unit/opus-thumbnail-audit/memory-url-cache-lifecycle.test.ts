/**
 * Audit repro: blob-URL lifecycle in the orchestrator's in-memory tier.
 *
 * MemoryUrlCache (thumbnail-render-orchestrator.ts:96-142) is the only
 * zero-flash tier and the only thing that revokes the blob URLs the renderer
 * and the IndexedDB tier create. It revokes on LRU eviction and on explicit
 * delete — but NOT when a hash is re-set with a different URL, which is exactly
 * what every force-rerender, image-decode repair, and admin cache-clear does.
 *
 * A live blob: URL keeps its Blob alive for the lifetime of the document, so an
 * unrevoked replacement is a permanent retention of one full-size WebP.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import type { ThumbnailRenderInput } from "$lib/shared/browse/services/thumbnail-key-deriver";

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

describe("memory URL cache retention", () => {
  it("DEFECT: re-rendering one key leaks the blob URL it replaces", async () => {
    const orchestrator = await createOrchestrator();

    const first = await orchestrator.getThumbnail({
      sequence: sequence("AB"),
      input: input("AB"),
    });
    // What a force-rerender / decode-error repair / admin cache clear does:
    // same cache key, cache tiers skipped, fresh blob.
    const second = await orchestrator.getThumbnail({
      sequence: sequence("AB"),
      input: input("AB"),
      skipCache: true,
    });

    expect(createdUrls).toEqual(["blob:thumb-1", "blob:thumb-2"]);
    expect(first.url).toBe("blob:thumb-1");
    expect(second.url).toBe("blob:thumb-2");
    // The memory tier now serves the new URL, so nothing can ever reach or
    // revoke the old one again.
    expect(orchestrator.getCached(second.key.hash)).toBe("blob:thumb-2");

    // DEFECT: MemoryUrlCache.set() deletes the displaced entry without
    // revoking it. Should become ["blob:thumb-1"] once set() revokes a
    // replaced blob: URL.
    expect(revokedUrls).toEqual([]);
  });

  it("CONTROL: LRU eviction past 500 entries does revoke", async () => {
    const orchestrator = await createOrchestrator();

    for (let i = 0; i < 501; i++) {
      await orchestrator.getThumbnail({
        sequence: sequence(`SEQ${i}`),
        input: input(`SEQ${i}`),
      });
    }

    expect(createdUrls).toHaveLength(501);
    // Only the single oldest entry is released: the cap is 500 ENTRIES with no
    // byte budget, so steady-state retention is 500 full-size WebP blobs.
    expect(revokedUrls).toEqual(["blob:thumb-1"]);
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

  it("DEFECT: invalidateAllCaches leaks every blob URL it forgets", async () => {
    const orchestrator = await createOrchestrator();
    for (const id of ["AB", "CD", "EF"]) {
      await orchestrator.getThumbnail({
        sequence: sequence(id),
        input: input(id),
      });
    }
    expect(createdUrls).toHaveLength(3);

    // The admin "Clear Cloud Thumbnails" flow. clear() DOES revoke, so this
    // path is clean...
    orchestrator.invalidateAllCaches();
    expect(revokedUrls).toEqual([
      "blob:thumb-1",
      "blob:thumb-2",
      "blob:thumb-3",
    ]);

    // ...but every card that re-renders afterwards goes through the leaking
    // replacement path above, because handleCacheCleared() deliberately keeps
    // the displayed URL alive while the new render populates the same hash.
    for (const id of ["AB", "CD", "EF"]) {
      await orchestrator.getThumbnail({
        sequence: sequence(id),
        input: input(id),
        skipCache: true,
      });
      await orchestrator.getThumbnail({
        sequence: sequence(id),
        input: input(id),
        skipCache: true,
      });
    }
    expect(createdUrls).toHaveLength(9);
    // Three of the six new URLs are unreachable and unrevoked.
    expect(revokedUrls).toHaveLength(3);
  });
});
