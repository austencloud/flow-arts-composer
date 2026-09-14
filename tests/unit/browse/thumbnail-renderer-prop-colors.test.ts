import { describe, expect, it, vi } from "vitest";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import type { ThumbnailRenderInput } from "$lib/shared/browse/services/thumbnail-key-deriver";
import { ThumbnailRenderer } from "$lib/shared/browse/services/thumbnail-renderer";

const sequence = {
  id: "public-1",
  word: "AB",
  steps: [{ id: "step-1", motions: {} }],
  loopType: "not-loop",
} as unknown as SequenceData;

const input: ThumbnailRenderInput = {
  sequenceName: "AB",
  sequenceId: "public-1",
  leftPropType: PropType.STAFF,
  rightPropType: PropType.STAFF,
  catDogModeEnabled: false,
  lightMode: false,
  variant: "gallery",
};

function rendererWith(compose: ReturnType<typeof vi.fn>) {
  return new ThumbnailRenderer(
    { compose } as never,
    { deriveFromFirstStep: vi.fn() } as never,
    null,
    { detectLOOPType: vi.fn() } as never
  );
}

describe("ThumbnailRenderer primary prop colors", () => {
  it("hands the chosen palette to the composer as a visibility override", async () => {
    const compose = vi.fn(async () => new Blob(["x"], { type: "image/webp" }));
    const palette = { left: "#00ff88", right: "#ff8800" };

    await rendererWith(compose).render(sequence, {
      ...input,
      primaryPropColors: palette,
    });

    expect(compose).toHaveBeenCalledWith(
      sequence,
      expect.objectContaining({
        visibilityOverrides: expect.objectContaining({
          primaryPropColors: palette,
        }),
      }),
      expect.any(Function),
      undefined,
      null
    );
  });

  it("pins the palette to null when none is chosen so the composer never inherits the global setting", async () => {
    const compose = vi.fn(async () => new Blob(["x"], { type: "image/webp" }));

    await rendererWith(compose).render(sequence, input);

    expect(compose).toHaveBeenCalledWith(
      sequence,
      expect.objectContaining({
        visibilityOverrides: expect.objectContaining({
          primaryPropColors: null,
        }),
      }),
      expect.any(Function),
      undefined,
      null
    );
  });

  it("generates gallery QR artwork at the prepared-cache canonical size", async () => {
    const compose = vi.fn(async () => new Blob(["x"], { type: "image/webp" }));
    const generateAsImage = vi.fn(async () => new Image());
    const createImageBitmap = vi.fn(async () => ({ close: vi.fn() }));
    vi.stubGlobal("createImageBitmap", createImageBitmap);

    const renderer = new ThumbnailRenderer(
      { compose } as never,
      { deriveFromFirstStep: vi.fn() } as never,
      null,
      { detectLOOPType: vi.fn() } as never,
      () => ({ generateAsImage }) as never
    );

    await renderer.render(sequence, {
      ...input,
      visibility: { showQRCode: true, showMandala: true },
    });

    expect(generateAsImage).toHaveBeenCalledWith(
      sequence,
      200,
      expect.objectContaining({
        leftPropType: PropType.STAFF,
        rightPropType: PropType.STAFF,
      })
    );
    expect(createImageBitmap).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });
});
