import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { PROP_GEOMETRY } = vi.hoisted(() => ({
  PROP_GEOMETRY: {
    staff: { width: 270, height: 83.1 },
    fan: { width: 300, height: 239.4 },
    club: { width: 258.67, height: 34.17 },
    buugeng: { width: 300, height: 155.26 },
  } as Record<string, { width: number; height: number }>,
}));

const { fakeSvgCache } = vi.hoisted(() => {
  const images = new Map<string, HTMLImageElement>();
  const pending = new Map<string, Promise<HTMLImageElement>>();

  return {
    fakeSvgCache: {
      async getImage(_svg: string, key: string): Promise<HTMLImageElement> {
        const cached = images.get(key);
        if (cached) return cached;

        const loading = pending.get(key);
        if (loading) return loading;

        const promise = new Promise<HTMLImageElement>((resolve, reject) => {
          const image = new Image();
          image.onload = () => resolve(image);
          image.onerror = () => reject(new Error("Test image failed to load"));
          image.src = key;
        });
        pending.set(key, promise);

        try {
          const image = await promise;
          images.set(key, image);
          return image;
        } finally {
          pending.delete(key);
        }
      },
      clear(): void {
        images.clear();
        pending.clear();
      },
    },
  };
});

vi.mock("$lib/shared/animation-engine/services/svg-generator", () => {
  const propSvg = async (propType: string) => {
    const dimensions = PROP_GEOMETRY[propType];
    if (!dimensions) throw new Error(`Unknown test prop: ${propType}`);
    return {
      svg: `<svg viewBox="0 0 ${dimensions.width} ${dimensions.height}"></svg>`,
      ...dimensions,
    };
  };

  return {
    generateLeftPropSvg: propSvg,
    generateRightPropSvg: propSvg,
    generatePropSvg: propSvg,
    generateGridSvg: async () => "<svg></svg>",
  };
});

vi.mock("$lib/shared/render/services/svg-image-cache", () => ({
  getSvgImageCache: () => fakeSvgCache,
}));

import { Canvas2DImageLoader } from "../canvas-2d-image-loader";

class ImmediatelyLoadedImage {
  static sourceAssignments = 0;

  width = 0;
  height = 0;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  #src = "";

  set src(value: string) {
    this.#src = value;
    ImmediatelyLoadedImage.sourceAssignments += 1;
    queueMicrotask(() => this.onload?.());
  }

  get src(): string {
    return this.#src;
  }

  decode(): Promise<void> {
    return Promise.resolve();
  }
}

describe("Canvas2DImageLoader prop crossfade snapshots", () => {
  it("keeps the latest primary shade when an older texture finishes last", async () => {
    const loader = new Canvas2DImageLoader();
    const pending: Array<(image: HTMLImageElement) => void> = [];
    vi.spyOn(
      loader as unknown as {
        createPropImageFromSVG: () => Promise<HTMLImageElement>;
      },
      "createPropImageFromSVG"
    ).mockImplementation(() => new Promise((resolve) => pending.push(resolve)));
    const older = loader.loadPerColorPropImages("staff", "staff", true, {
      left: "#111111",
      right: "#222222",
    });
    await vi.waitFor(() => expect(pending).toHaveLength(2));
    const latest = loader.loadPerColorPropImages("staff", "staff", true, {
      left: "#333333",
      right: "#444444",
    });
    await vi.waitFor(() => expect(pending).toHaveLength(4));
    const newestImage = new Image();
    pending[2]!(newestImage);
    pending[3]!(newestImage);
    await latest;
    pending[0]!(new Image());
    pending[1]!(new Image());
    await older;
    expect(loader.getLeftPropImage()).toBe(newestImage);
  });
  it("keeps the latest performer shade when an older texture finishes last", async () => {
    const loader = new Canvas2DImageLoader();
    const pending: Array<(image: HTMLImageElement) => void> = [];
    vi.spyOn(
      loader as unknown as {
        createPropImageFromSVG: () => Promise<HTMLImageElement>;
      },
      "createPropImageFromSVG"
    ).mockImplementation(() => new Promise((resolve) => pending.push(resolve)));
    const older = loader.loadAdditionalLayerPropImages(
      0,
      "staff",
      "staff",
      "#111111",
      "#222222"
    );
    await vi.waitFor(() => expect(pending).toHaveLength(2));
    const latest = loader.loadAdditionalLayerPropImages(
      0,
      "staff",
      "staff",
      "#333333",
      "#444444"
    );
    await vi.waitFor(() => expect(pending).toHaveLength(4));
    const newestImage = new Image();
    pending[2]!(newestImage);
    pending[3]!(newestImage);
    await latest;
    pending[0]!(new Image());
    pending[1]!(new Image());
    await older;
    expect(loader.getAdditionalLayerImages(0).left).toBe(newestImage);
  });
  beforeEach(() => {
    ImmediatelyLoadedImage.sourceAssignments = 0;
    vi.stubGlobal("Image", ImmediatelyLoadedImage);
  });

  afterEach(() => {
    fakeSvgCache.clear();
    vi.unstubAllGlobals();
  });

  it("decodes identical prop sprites once across animation engines", async () => {
    const first = new Canvas2DImageLoader();
    const second = new Canvas2DImageLoader();

    const [firstImages, secondImages] = await Promise.all([
      first.loadPerColorPropImages("staff", "staff"),
      second.loadPerColorPropImages("staff", "staff"),
    ]);

    expect(ImmediatelyLoadedImage.sourceAssignments).toBe(1);
    expect(secondImages.left).toBe(firstImages.left);
    expect(secondImages.right).toBe(firstImages.right);
  });

  it("retains the outgoing image, bounds, and type before loading the target", async () => {
    const loader = new Canvas2DImageLoader();
    const staff = await loader.loadPerColorPropImages("staff", "staff");

    expect(loader.getPreviousLeftProp()).toBeNull();
    expect(loader.getPreviousRightProp()).toBeNull();

    await loader.loadPerColorPropImages("fan", "fan");

    expect(loader.getPreviousLeftProp()).toEqual({
      image: staff.left,
      dimensions: PROP_GEOMETRY.staff,
      propType: "staff",
    });
    expect(loader.getPreviousRightProp()).toEqual({
      image: staff.right,
      dimensions: PROP_GEOMETRY.staff,
      propType: "staff",
    });
    expect(loader.getLeftPropType()).toBe("fan");
    expect(loader.getRightPropType()).toBe("fan");
    expect(loader.getLeftPropDimensions()).toEqual(PROP_GEOMETRY.fan);
    expect(loader.getRightPropDimensions()).toEqual(PROP_GEOMETRY.fan);
  });

  it("keeps per-color outgoing geometry independent and clears it atomically", async () => {
    const loader = new Canvas2DImageLoader();
    await loader.loadPerColorPropImages("staff", "club");
    await loader.loadPerColorPropImages("fan", "buugeng");

    expect(loader.getPreviousLeftProp()?.dimensions).toEqual(
      PROP_GEOMETRY.staff
    );
    expect(loader.getPreviousLeftProp()?.propType).toBe("staff");
    expect(loader.getPreviousRightProp()?.dimensions).toEqual(
      PROP_GEOMETRY.club
    );
    expect(loader.getPreviousRightProp()?.propType).toBe("club");

    loader.clearPreviousLeftProp();
    loader.clearPreviousRightProp();

    expect(loader.getPreviousLeftProp()).toBeNull();
    expect(loader.getPreviousRightProp()).toBeNull();
  });
});
