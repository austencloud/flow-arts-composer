// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SvgImageCache } from "../svg-image-cache";

describe("SvgImageCache accessors", () => {
  let cache: SvgImageCache;
  beforeEach(() => {
    cache = new SvgImageCache();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("setImage stores a drawable retrievable synchronously via entries()", () => {
    const fake = { width: 10, height: 10 } as unknown as ImageBitmap;
    cache.setImage("k1", fake);
    const entries = cache.entries();
    expect(entries.get("k1")).toBe(fake);
  });

  it("getImage returns a setImage-seeded entry without decoding", async () => {
    const fake = { width: 5, height: 5 } as unknown as ImageBitmap;
    cache.setImage("seed-key", fake);
    const got = await cache.getImage("<svg/>", "seed-key");
    expect(got).toBe(fake);
  });

  it("keeps a browser SVG source alive until the cached image is cleared", async () => {
    const revokeObjectUrl = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => {});
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:torch");

    const decoded = vi.fn().mockResolvedValue(undefined);
    class FakeImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      decode = decoded;
      private currentSrc = "";

      set src(value: string) {
        this.currentSrc = value;
        queueMicrotask(() => this.onload?.());
      }

      get src(): string {
        return this.currentSrc;
      }
    }
    vi.stubGlobal("Image", FakeImage);

    const image = await cache.getImage(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 15.5"></svg>',
      "red-torch"
    );

    expect(decoded).toHaveBeenCalledOnce();
    expect(revokeObjectUrl).not.toHaveBeenCalled();
    expect(cache.entries().get("red-torch")).toBe(image);

    cache.clear();

    expect(revokeObjectUrl).toHaveBeenCalledOnce();
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:torch");
  });
});
