import { describe, expect, it, vi } from "vitest";
import { Texture } from "three";
import {
  alphaCoverage,
  buildCoveragePreservingMipChain,
  rampedCoverageTarget,
  solveAlphaScale,
  prepareCoveragePreservingAlphaMipmaps,
  type RgbaLevel,
} from "#lib/shared/3d/rendering/alpha-coverage-mipmaps.js";

/**
 * A leaf-card stand-in: opaque green discs scattered on a transparent black
 * ground, the same texel statistics that make real foliage thin out.
 */
function leafTexture(size: number, discs: number, radius: number): RgbaLevel {
  const data = new Uint8ClampedArray(size * size * 4);
  let seed = 7;
  const random = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  const centers = Array.from({ length: discs }, () => [
    random() * size,
    random() * size,
  ]);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = (y * size + x) * 4;
      const inside = centers.some(
        ([cx, cy]) => (x - cx!) ** 2 + (y - cy!) ** 2 <= radius * radius
      );
      data[index + 1] = inside ? 160 : 0;
      data[index + 3] = inside ? 255 : 0;
    }
  }
  return { data, width: size, height: size };
}

describe("coverage-preserving alpha mipmaps", () => {
  it("prepares and reuses foliage mipmaps in a worker without document", () => {
    const level = leafTexture(16, 8, 2);
    const drawImage = vi.fn();
    vi.stubGlobal("document", undefined);
    vi.stubGlobal(
      "OffscreenCanvas",
      class {
        getContext() {
          return { drawImage, getImageData: () => level };
        }
      }
    );
    vi.stubGlobal(
      "ImageData",
      class {
        constructor(
          public data: Uint8ClampedArray,
          public width: number,
          public height: number
        ) {}
      }
    );
    try {
      const texture = new Texture({
        width: 16,
        height: 16,
      } as HTMLImageElement);
      expect(prepareCoveragePreservingAlphaMipmaps(texture, 0.45)).toBe(true);
      expect(texture.mipmaps).toHaveLength(5);
      expect(texture.generateMipmaps).toBe(false);
      expect(prepareCoveragePreservingAlphaMipmaps(texture, 0.45)).toBe(false);
      expect(drawImage).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });
  const alphaTest = 0.48;
  const cutoff = Math.round(alphaTest * 255);

  it("keeps near levels at level 0's coverage where a plain box filter loses it", () => {
    const level0 = leafTexture(128, 40, 3);
    const target = alphaCoverage(level0, cutoff);
    expect(target).toBeGreaterThan(0.05);

    const chain = buildCoveragePreservingMipChain(level0, alphaTest, {
      rampStartLevel: 4,
      rampEndLevel: 7,
    });
    expect(chain[0]).toBe(level0);
    expect(chain.at(-1)?.width).toBe(1);
    expect(chain).toHaveLength(8);

    // Levels below the ramp start track level 0.
    for (const level of chain.slice(1, 5)) {
      const coverage = alphaCoverage(level, cutoff);
      expect(coverage, `${level.width}px level`).toBeGreaterThan(target * 0.8);
      expect(coverage, `${level.width}px level`).toBeLessThan(target * 1.25);
    }
  });

  it("ramps deep levels toward the distant coverage so far crowns stay full", () => {
    const level0 = leafTexture(256, 120, 4);
    const base = alphaCoverage(level0, cutoff);
    expect(base).toBeLessThan(0.6);

    const chain = buildCoveragePreservingMipChain(level0, alphaTest, {
      distantCoverage: 0.8,
      rampStartLevel: 2,
      rampEndLevel: 6,
    });
    const coverages = chain.map((level) => alphaCoverage(level, cutoff));
    expect(coverages[2]).toBeCloseTo(base, 1);
    expect(coverages[4]!).toBeGreaterThan(coverages[2]!);
    expect(coverages[6]!).toBeGreaterThanOrEqual(0.75);
    expect(coverages[7]!).toBeGreaterThanOrEqual(0.75);
    // Monotonic across the ramp: no level thins out again.
    for (let index = 3; index <= 6; index += 1) {
      expect(coverages[index]!).toBeGreaterThanOrEqual(
        coverages[index - 1]! - 0.02
      );
    }
  });

  it("interpolates the ramp target between the start and end levels", () => {
    const ramp = { distantCoverage: 0.8, rampStartLevel: 2, rampEndLevel: 6 };
    expect(rampedCoverageTarget(0, 0.3, ramp)).toBe(0.3);
    expect(rampedCoverageTarget(2, 0.3, ramp)).toBe(0.3);
    expect(rampedCoverageTarget(4, 0.3, ramp)).toBeCloseTo(0.55);
    expect(rampedCoverageTarget(6, 0.3, ramp)).toBeCloseTo(0.8);
    expect(rampedCoverageTarget(9, 0.3, ramp)).toBeCloseTo(0.8);
    // A base already above the distant value is never pulled down.
    expect(rampedCoverageTarget(9, 0.9, ramp)).toBe(0.9);
  });

  it("returns a unit scale when the level already covers enough", () => {
    const opaque: RgbaLevel = {
      data: new Uint8ClampedArray([0, 0, 0, 255, 0, 0, 0, 255]),
      width: 2,
      height: 1,
    };
    expect(solveAlphaScale(opaque, cutoff, 1)).toBe(1);
  });

  it("scales alpha up to recover a target the raw level misses", () => {
    const faint: RgbaLevel = {
      data: new Uint8ClampedArray([
        0, 0, 0, 60, 0, 0, 0, 60, 0, 0, 0, 0, 0, 0, 0, 0,
      ]),
      width: 4,
      height: 1,
    };
    const scale = solveAlphaScale(faint, cutoff, 0.5);
    expect(scale).toBeGreaterThan(2);
    expect(scale).toBeLessThan(2.2);
  });
});
