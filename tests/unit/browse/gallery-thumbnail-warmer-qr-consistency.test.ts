import { describe, expect, it, vi } from "vitest";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import type { ThumbnailResult } from "#lib/shared/browse/services/thumbnail-render-orchestrator.js";
import { startGalleryWarm } from "#lib/shared/browse/services/gallery-thumbnail-warmer.js";

const sequence = {
  id: "public-1",
  word: "AB",
  name: "AB",
  steps: [],
} as unknown as SequenceData;

describe("gallery thumbnail warmer QR consistency", () => {
  it("counts a visible QR-inconsistent fallback as failed, not rendered", async () => {
    const getThumbnail = vi.fn(
      async () =>
        ({
          url: "blob:visible-fallback",
          fromCache: false,
          key: { hash: "qr-key" },
          cacheWriteSkippedReason: "qr_inconsistent",
        }) as ThumbnailResult
    );

    const warm = startGalleryWarm(
      {
        props: [PropType.FAN],
        modes: ["dark"],
        qr: [true],
      },
      () => {},
      {
        orchestrator: { getThumbnail } as never,
        loader: {
          loadSequenceMetadata: vi.fn(async () => [sequence]),
        },
        concurrency: 1,
      }
    );

    const result = await warm.promise;

    expect(result).toMatchObject({
      total: 1,
      done: 1,
      rendered: 0,
      skipped: 0,
      failed: 1,
      failedCombinations: ["AB [public-1] (fan, dark, qr)"],
      finished: true,
    });
  });

  it("lists a thrown combination so the admin can retry it directly", async () => {
    const getThumbnail = vi.fn(async () => {
      throw new Error("render failed");
    });

    const warm = startGalleryWarm(
      {
        props: [PropType.FAN],
        modes: ["dark"],
        qr: [false],
      },
      () => {},
      {
        orchestrator: { getThumbnail } as never,
        loader: {
          loadSequenceMetadata: vi.fn(async () => [sequence]),
        },
        concurrency: 1,
      }
    );

    const result = await warm.promise;

    expect(result).toMatchObject({
      rendered: 0,
      skipped: 0,
      failed: 1,
      failedCombinations: ["AB [public-1] (fan, dark)"],
      finished: true,
    });
  });
});
