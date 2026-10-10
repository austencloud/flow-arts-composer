import { describe, expect, it, vi } from "vitest";
import { createLazyPublicIndexSyncer } from "#lib/shared/library/services/create-lazy-public-index-syncer.js";
import type { LibrarySequence } from "#lib/shared/library/domain/models/library-sequence.js";
import type { IPublicIndexSyncer } from "#lib/shared/library/services/IPublicIndexSyncer.js";

const sequence = { id: "sequence-1", word: "TEST" } as LibrarySequence;

describe("createLazyPublicIndexSyncer", () => {
  it("loads the concrete syncer only when public-index work is requested", async () => {
    const concrete: IPublicIndexSyncer = {
      syncToPublicIndex: vi.fn().mockResolvedValue(undefined),
      updateThumbnails: vi.fn().mockResolvedValue(undefined),
      removeFromPublicIndex: vi.fn().mockResolvedValue(undefined),
    };
    const load = vi.fn().mockResolvedValue(concrete);
    const syncer = createLazyPublicIndexSyncer(load);

    expect(load).not.toHaveBeenCalled();

    await Promise.all([
      syncer.syncToPublicIndex(sequence, "user-1"),
      syncer.updateThumbnails(sequence.id, ["thumbnail.png"]),
      syncer.removeFromPublicIndex(sequence.id),
    ]);

    expect(load).toHaveBeenCalledTimes(1);
    expect(concrete.syncToPublicIndex).toHaveBeenCalledWith(sequence, "user-1");
    expect(concrete.updateThumbnails).toHaveBeenCalledWith(sequence.id, [
      "thumbnail.png",
    ]);
    expect(concrete.removeFromPublicIndex).toHaveBeenCalledWith(sequence.id);
  });

  it("retries the module load after a transient failure", async () => {
    const concrete: IPublicIndexSyncer = {
      syncToPublicIndex: vi.fn().mockResolvedValue(undefined),
      updateThumbnails: vi.fn().mockResolvedValue(undefined),
      removeFromPublicIndex: vi.fn().mockResolvedValue(undefined),
    };
    const load = vi
      .fn<() => Promise<IPublicIndexSyncer>>()
      .mockRejectedValueOnce(new Error("chunk unavailable"))
      .mockResolvedValueOnce(concrete);
    const syncer = createLazyPublicIndexSyncer(load);

    await expect(syncer.removeFromPublicIndex(sequence.id)).rejects.toThrow(
      "chunk unavailable"
    );
    await expect(
      syncer.removeFromPublicIndex(sequence.id)
    ).resolves.toBeUndefined();

    expect(load).toHaveBeenCalledTimes(2);
  });
});
