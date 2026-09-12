import { describe, it, expect, vi } from "vitest";
import { ImageComposer } from "../image-composer";

// A custom hand palette skips the layer compositor (its canonical blue/red
// layer caches must not leak into a personalized card) and rasterizes through
// the direct renderer instead. That renderer only draws props and arrows when
// the step arrives already prepared: it has no preparer of its own, so an
// unprepared step silently renders as grid + letter + turn numbers. This pins
// the composer to preparing the step before handing it over, exactly as the
// compositor path does.

const prepareSingle = vi.fn(
  async (step: object, _options: Record<string, unknown>) => ({
    ...step,
    _prepared: {
      propPositions: {},
      propAssets: {},
      arrowPositions: {},
      arrowAssets: {},
      arrowMirroring: {},
    },
  })
);

vi.mock("../../../pictograph/shared/services/pictograph-preparer", () => ({
  pictographPreparer: { prepareSingle },
}));

vi.mock("../image-format-converter", () => ({
  canvasToImage: async () => ({ width: 1, height: 1 }),
  imageToBlob: async () => new Blob(),
  blobToImage: async () => ({ width: 1, height: 1 }),
}));

function buildComposer(renderPictograph: ReturnType<typeof vi.fn>) {
  const renderer = {
    initialize: async () => {},
    renderPictograph,
  };
  return new ImageComposer(
    {} as never,
    { get: async () => null, set: async () => {} } as never,
    { deriveKey: () => "key" } as never,
    { get: () => undefined, set: () => {} } as never,
    renderer as never,
    // A compositor is present, so only the palette gate routes to the renderer.
    { compose: vi.fn() } as never
  );
}

describe("ImageComposer custom palette rasterization", () => {
  it("prepares the step before the direct renderer draws it", async () => {
    const renderPictograph = vi.fn(
      async (pictograph: { _prepared?: unknown }) => {
        void pictograph;
        return { width: 300, height: 300 };
      }
    );
    const composer = buildComposer(renderPictograph);
    const step = { id: "step-1", letter: "A", motions: {} };
    const ctx = { drawImage: () => {} } as unknown as CanvasRenderingContext2D;

    // @ts-expect-error private method invoked for unit coverage
    await composer.renderPictographAt(ctx, step, 0, 0, 300, undefined, 0, {
      darkMode: true,
      leftPropType: "fan",
      rightPropType: "fan",
      primaryPropColors: { left: "#00e5ff", right: "#ff2ea6" },
    });

    expect(prepareSingle).toHaveBeenCalledTimes(1);
    expect(prepareSingle.mock.calls[0]?.[0]).toBe(step);
    expect(prepareSingle.mock.calls[0]?.[1]).toMatchObject({
      themeMode: "dark",
      leftPropType: "fan",
      rightPropType: "fan",
    });

    expect(renderPictograph).toHaveBeenCalledTimes(1);
    expect(renderPictograph.mock.calls[0]?.[0]._prepared).toBeDefined();
  });
});
