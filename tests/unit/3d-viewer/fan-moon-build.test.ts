import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

import {
  fanAppearanceArtwork,
  fanBuildPreviewOptions,
  parseFanRenderKey,
  resolveFanRenderKey,
  type FanAppearance,
} from "$lib/shared/pictograph/prop/domain/fan-appearance";

const root = process.cwd();
const MOON: FanAppearance = {
  build: "moon",
  frameColor: "black",
  cover: "bare",
};

describe("Moon fan appearance", () => {
  it("keeps Moon as renderer-only fan identity", () => {
    expect(resolveFanRenderKey("fan", MOON)).toBe("fan__moon");
    expect(resolveFanRenderKey("bigfan", MOON)).toBe("bigfan__moon");
    expect(parseFanRenderKey("fan__moon")).toEqual({
      propType: "fan",
      build: "moon",
      frameColor: "black",
      cover: "bare",
    });
  });

  it("uses the measured physical artwork without recoloring the fabric", () => {
    expect(fanAppearanceArtwork("moon")).toBe(
      "/images/props/appearances/fan-moon.svg?v=1"
    );
    const svg = fs.readFileSync(
      path.join(
        root,
        "static",
        "images",
        "props",
        "appearances",
        "fan-moon.svg"
      ),
      "utf8"
    );
    expect(svg).toContain('data-fan-frame=""');
    expect(svg).toContain("two-zone diffusion skin");
  });

  it("credits Lighttoys and exposes a production-sized preview", async () => {
    const option = fanBuildPreviewOptions(MOON).find(
      (entry) => entry.id === "moon"
    );
    expect(option).toEqual({
      id: "moon",
      label: "Moon LED",
      image: "/images/props/build-previews/fan-moon-complete.webp",
      // Each build's photograph frames its fan differently, so the compact
      // rail scales them to one apparent size rather than one box size.
      imageScale: 1.54,
      designCredit: {
        originator: "Lighttoys",
        sourceUrl: "https://www.lighttoys.cz/product/moon-fans-ft/",
      },
    });

    const metadata = await sharp(
      path.join(
        root,
        "static",
        "images",
        "props",
        "build-previews",
        "fan-moon-complete.webp"
      )
    ).metadata();
    expect(metadata.width).toBe(640);
    expect(metadata.height).toBe(240);
    expect(metadata.channels).toBe(3);
  });
});
