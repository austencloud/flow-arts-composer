import { describe, expect, it, vi } from "vitest";

import {
  seedGalleryFromBundle,
  type GalleryBundle,
  type GallerySeedDependencies,
} from "#lib/shared/desktop/desktop-data-seeder.js";
import type { PublicSequenceIndex } from "#lib/shared/foundation/domain/models/public-sequence-index.js";

const EXPORTED_AT = "2026-09-02T10:00:00.000Z";

function bundle(): GalleryBundle {
  return {
    exportedAt: EXPORTED_AT,
    count: 2,
    sequences: [
      { id: "a", word: "AB" } as unknown as PublicSequenceIndex,
      { id: "b", word: "CD" } as unknown as PublicSequenceIndex,
    ],
  };
}

function deps(
  overrides: Partial<GallerySeedDependencies> = {}
): GallerySeedDependencies & { persist: ReturnType<typeof vi.fn>; writeMarker: ReturnType<typeof vi.fn> } {
  return {
    readBundle: async () => bundle(),
    persist: vi.fn(async () => undefined),
    lastSyncedAt: async () => null,
    readMarker: async () => null,
    writeMarker: vi.fn(async () => undefined),
    ...overrides,
  } as never;
}

describe("seedGalleryFromBundle", () => {
  it("seeds an empty cache on first launch and records the marker", async () => {
    const d = deps();
    await expect(seedGalleryFromBundle(d)).resolves.toBe("seeded");
    expect(d.persist).toHaveBeenCalledWith(bundle().sequences);
    expect(d.writeMarker).toHaveBeenCalledWith(EXPORTED_AT);
  });

  it("does nothing when the same bundle was already applied", async () => {
    const d = deps({ readMarker: async () => EXPORTED_AT });
    await expect(seedGalleryFromBundle(d)).resolves.toBe("skipped");
    expect(d.persist).not.toHaveBeenCalled();
    expect(d.writeMarker).not.toHaveBeenCalled();
  });

  it("keeps a cache that Firestore refreshed after the export", async () => {
    const d = deps({
      lastSyncedAt: async () => Date.parse(EXPORTED_AT) + 60_000,
    });
    await expect(seedGalleryFromBundle(d)).resolves.toBe("skipped");
    expect(d.persist).not.toHaveBeenCalled();
    expect(d.writeMarker).toHaveBeenCalledWith(EXPORTED_AT);
  });

  it("replaces a cache older than the bundle", async () => {
    const d = deps({
      lastSyncedAt: async () => Date.parse(EXPORTED_AT) - 60_000,
    });
    await expect(seedGalleryFromBundle(d)).resolves.toBe("seeded");
    expect(d.persist).toHaveBeenCalledTimes(1);
  });

  it("skips quietly when the build carries no bundle", async () => {
    const d = deps({ readBundle: async () => null });
    await expect(seedGalleryFromBundle(d)).resolves.toBe("skipped");
    expect(d.persist).not.toHaveBeenCalled();
  });
});
