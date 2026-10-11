import { stat } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { AUTUMN_MOON_TEXTURE_URL } from "#lib/shared/3d/environments/scenes/autumn/runtime/lighting/autumn-moon.js";

describe("Autumn runtime textures", () => {
  it("keeps four-times sampling headroom for the largest approved 4K moon", async () => {
    const path = resolve("static", AUTUMN_MOON_TEXTURE_URL.slice(1));
    const [metadata, file] = await Promise.all([
      sharp(path).metadata(),
      stat(path),
    ]);
    const projectedDiameter = 2160 * (2.8 / 48);

    expect(metadata.width).toBe(512);
    expect(metadata.height).toBeLessThanOrEqual(512);
    expect((metadata.width ?? 0) / projectedDiameter).toBeGreaterThan(4);
    expect(file.size).toBeLessThan(500_000);
  });
});
