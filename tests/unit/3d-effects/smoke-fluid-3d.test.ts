import { describe, expect, it } from "vitest";
import { smokeFluidAtlas } from "#lib/shared/3d/effects/smoke/smoke-fluid-domain-3d.js";
import {
  SMOKE_FLUID_GRIDS,
  SMOKE_FLUID_STEP,
  resolveSmokeFluidOutput3D,
  resolveSmokeFluidStep3D,
} from "#lib/shared/3d/effects/smoke/smoke-fluid-renderer-3d.js";
import { QualityTier } from "#lib/shared/3d/effects/types.js";
import { DEFAULT_EFFECTS_CONFIG } from "#lib/shared/effects/domain/defaults.js";
import type { SmokeIntent } from "#lib/shared/effects/domain/effects-config.js";
import { resolveSmoke3D } from "#lib/shared/effects/translators/webgl3d-translator.js";

const PALETTES = ["incense", "fog", "genie", "cursed", "spirit", "campfire"] as const;

function params(palette: SmokeIntent["palette"], patch: Partial<SmokeIntent> = {}) {
  return resolveSmoke3D({ ...DEFAULT_EFFECTS_CONFIG.smoke, palette, ...patch } as SmokeIntent);
}

describe("smokeFluidAtlas", () => {
  it.each(Object.values(SMOKE_FLUID_GRIDS))("fits every slice of $size in a texture WebGL2 allows", (grid) => {
    const [nx, ny, nz] = grid.size;
    const atlas = smokeFluidAtlas(grid.size);
    expect(atlas.width).toBe(atlas.columns * nx);
    expect(atlas.columns * Math.floor(atlas.height / ny)).toBeGreaterThanOrEqual(nz);
    expect(Math.max(atlas.width, atlas.height)).toBeLessThanOrEqual(4096);
  });
});

describe("SMOKE_FLUID_GRIDS", () => {
  it.each([QualityTier.HIGH, QualityTier.MEDIUM] as const)(
    "tier %s leaves room for a spinning staff whichever way the performer faces",
    (tier) => {
      const { size, cell } = SMOKE_FLUID_GRIDS[tier];
      // Hands at 0.5 m from the body plus a 0.86 m staff, on both sides.
      expect(size[0] * cell).toBeGreaterThan(3.4);
      expect(size[2] * cell).toBeGreaterThan(3.4);
      expect(size[1] * cell).toBeGreaterThan(3.2);
    }
  );
});

describe("resolveSmokeFluidStep3D", () => {
  it.each(PALETTES)("%s keeps every rate a fraction per second", (palette) => {
    const step = resolveSmokeFluidStep3D(params(palette), SMOKE_FLUID_STEP);
    for (const keep of [step.smokeKeep, step.heatKeep, step.airKeep]) {
      expect(keep).toBeGreaterThan(0);
      expect(keep).toBeLessThanOrEqual(1);
    }
    // Stronger swirl than this breaks the eddies into grid-sized grain.
    expect(step.confinement).toBeLessThanOrEqual(1.5);
  });

  it("lets cool fog sink while warm incense carries no weight", () => {
    expect(resolveSmokeFluidStep3D(params("fog"), SMOKE_FLUID_STEP).weight).toBeGreaterThan(5);
    expect(resolveSmokeFluidStep3D(params("incense"), SMOKE_FLUID_STEP).weight).toBe(0);
  });

  it("lifts harder when the rise slider goes up", () => {
    const slow = resolveSmokeFluidStep3D(params("incense", { riseSpeed: 0.2 }), SMOKE_FLUID_STEP);
    const fast = resolveSmokeFluidStep3D(params("incense", { riseSpeed: 1 }), SMOKE_FLUID_STEP);
    expect(fast.lift).toBeGreaterThan(slow.lift);
  });
});

describe("resolveSmokeFluidOutput3D", () => {
  it("gives off more smoke from a moving head than a still one", () => {
    const p = params("incense");
    expect(resolveSmokeFluidOutput3D(p, p.motionReferenceSpeed)).toBeGreaterThan(
      resolveSmokeFluidOutput3D(p, 0)
    );
  });

  it("stops growing past the reference speed", () => {
    const p = params("campfire");
    expect(resolveSmokeFluidOutput3D(p, p.motionReferenceSpeed * 3)).toBeCloseTo(
      resolveSmokeFluidOutput3D(p, p.motionReferenceSpeed)
    );
  });

  it("follows the intensity slider", () => {
    const low = params("incense", { intensity: 0.1 });
    const high = params("incense", { intensity: 1 });
    expect(resolveSmokeFluidOutput3D(high, 1)).toBeGreaterThan(resolveSmokeFluidOutput3D(low, 1));
  });
});
