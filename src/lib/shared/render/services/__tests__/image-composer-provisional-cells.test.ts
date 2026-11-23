import { describe, it, expect, vi } from "vitest";
import { ImageComposer } from "../image-composer";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";

// A cell positioned while the arrow placement data is missing is provisional:
// drawn with default arrow spots. It may sit in the composer's memory cache for
// the life of the page, but it never reaches IndexedDB (the blob cache), and it
// stops being served once the data loads. Custom palettes take the direct
// renderer path, which owns the per-cell caches.

vi.mock("../../../pictograph/shared/services/pictograph-preparer", () => ({
  pictographPreparer: {
    prepareSingle: async (step: object) => ({ ...step, _prepared: {} }),
  },
}));
vi.mock("../image-format-converter", () => ({
  canvasToImage: async () => ({ width: 1, height: 1 }),
  imageToBlob: async () => new Blob(),
  blobToImage: async () => ({ width: 1, height: 1 }),
}));

function setup() {
  const memory = new Map<string, unknown>();
  const memoryCache = {
    get: (k: string) => memory.get(k),
    set: vi.fn((k: string, v: unknown) => void memory.set(k, v)),
  };
  const blobCache = {
    get: vi.fn(async () => null),
    set: vi.fn(async () => {}),
  };
  const renderPictograph = vi.fn(async () => ({ width: 1, height: 1 }));
  const composer = new ImageComposer(
    {} as never,
    blobCache as never,
    { deriveKey: () => "key" } as never,
    memoryCache as never,
    { initialize: async () => {}, renderPictograph } as never,
    { compose: vi.fn() } as never
  );
  const loaded = { value: false };
  composer.setPlacementReadiness(
    async () => {},
    () => loaded.value
  );
  const ctx = { drawImage: () => {} } as unknown as CanvasRenderingContext2D;
  const draw = async () => {
    // @ts-expect-error private method invoked for unit coverage
    await composer.renderPictographAt(
      ctx,
      { id: "s", letter: "A", motions: {} },
      0,
      0,
      300,
      undefined,
      0,
      {
        darkMode: true,
        leftPropType: PropType.FAN,
        rightPropType: PropType.FAN,
        primaryPropColors: { left: "#00e5ff", right: "#ff2ea6" },
      }
    );
    await new Promise((r) => setTimeout(r, 0));
  };
  return { memoryCache, blobCache, renderPictograph, loaded, draw };
}

describe("ImageComposer provisional cells", () => {
  it("a cell prepared unloaded is kept in memory only, never in the blob cache", async () => {
    const t = setup();
    await t.draw();
    expect(t.renderPictograph).toHaveBeenCalledTimes(1);
    expect(t.blobCache.set).not.toHaveBeenCalled();
    expect(t.memoryCache.set).toHaveBeenCalledTimes(1);
    expect(t.memoryCache.set.mock.calls[0]![0]).toMatch(/:provisional$/);

    // Still unloaded: served from memory, no second draw.
    await t.draw();
    expect(t.renderPictograph).toHaveBeenCalledTimes(1);
  });

  it("stops serving the provisional cell once the data loads, then writes both caches", async () => {
    const t = setup();
    await t.draw();
    t.loaded.value = true;
    await t.draw();
    expect(t.renderPictograph).toHaveBeenCalledTimes(2);
    expect(t.blobCache.set).toHaveBeenCalledTimes(1);
    const keys = t.memoryCache.set.mock.calls.map((c) => c[0] as string);
    expect(keys[1]).not.toMatch(/provisional/);

    // The good cell is now served.
    await t.draw();
    expect(t.renderPictograph).toHaveBeenCalledTimes(2);
  });

  it("a cell prepared loaded is written to the blob and memory caches", async () => {
    const t = setup();
    t.loaded.value = true;
    await t.draw();
    expect(t.blobCache.set).toHaveBeenCalledTimes(1);
    expect(t.memoryCache.set.mock.calls[0]![0]).not.toMatch(/provisional/);
  });
});
