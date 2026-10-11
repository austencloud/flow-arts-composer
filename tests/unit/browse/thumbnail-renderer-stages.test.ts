import { describe, expect, it, vi } from "vitest";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import type { ThumbnailRenderInput } from "#lib/shared/browse/services/thumbnail-key-deriver.js";
import { ThumbnailRenderer } from "#lib/shared/browse/services/thumbnail-renderer.js";

const sequence = {
  id: "public-1",
  word: "AB",
  steps: [{ id: "step-1", motions: {} }],
  loopType: "not-loop",
} as unknown as SequenceData;

const input: ThumbnailRenderInput = {
  sequenceName: "AB",
  sequenceId: "public-1",
  leftPropType: PropType.FAN,
  rightPropType: PropType.FAN,
  catDogModeEnabled: false,
  lightMode: false,
  variant: "gallery",
};

describe("ThumbnailRenderer stage reporting", () => {
  it("reports the lazy-load, preparation, composition, and finalize seams", async () => {
    const compose = vi.fn(
      async (
        _sequence: unknown,
        _options: unknown,
        onProgress: (progress: {
          current: number;
          total: number;
          stage: "preparing" | "rendering" | "finalizing";
        }) => void
      ) => {
        onProgress({ current: 1, total: 2, stage: "rendering" });
        onProgress({ current: 2, total: 2, stage: "finalizing" });
        return new Blob(["thumbnail"], { type: "image/webp" });
      }
    );
    const renderer = new ThumbnailRenderer(
      { compose } as never,
      { deriveFromFirstStep: vi.fn() } as never,
      null,
      { detectLOOPType: vi.fn() } as never
    );
    const stages: string[] = [];
    const progress = vi.fn();

    const result = await renderer.render(
      sequence,
      {
        ...input,
        addUserInfo: true,
        userName: "Austen Cloud",
        showCreatorName: true,
        showBirthday: true,
      },
      undefined,
      progress,
      undefined,
      (stage) => stages.push(stage)
    );

    expect(result.blob.type).toBe("image/webp");
    expect(stages).toEqual([
      "sequence_load",
      "loop_and_start",
      "composition",
      "finalize",
    ]);
    expect(progress).toHaveBeenLastCalledWith({
      current: 2,
      total: 2,
      stage: "finalizing",
    });
    expect(compose).toHaveBeenCalledWith(
      sequence,
      expect.not.objectContaining({
        userName: expect.anything(),
        showCreatorName: expect.anything(),
        showBirthday: expect.anything(),
      }),
      expect.any(Function),
      undefined,
      null
    );
  });
});
