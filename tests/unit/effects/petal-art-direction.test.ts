import { describe, expect, it } from "vitest";
import {
  PETAL_PALETTES,
  drawPetalSilhouette,
  resolvePetalOpacity,
  resolvePetalSize,
} from "#lib/shared/effects/domain/petal-palettes.js";
import { getPetalAtlasFrame } from "#lib/shared/3d/effects/petals/petal-texture-atlas.js";
import { PetalPoolRenderer3D } from "#lib/shared/3d/effects/petals/petal-pool-renderer-3d.js";
import {
  NEUTRAL_PETAL_ENVIRONMENT_PROFILE,
  resolveEmberWorldSpan,
  resolvePetalEnvironmentProfile,
  resolvePetalWorldSize,
} from "#lib/shared/3d/effects/petals/petal-world-art-direction.js";
import { DEFAULT_EFFECTS_CONFIG } from "#lib/shared/effects/domain/defaults.js";
import { resolvePetals2D } from "#lib/shared/effects/translators/canvas2d-translator.js";
import { resolvePetals3D } from "#lib/shared/effects/translators/webgl3d-translator.js";
import { Petals2DRenderer } from "#lib/shared/effects/renderers/petals-2d-renderer.js";
import type { EmitterTip } from "#lib/shared/effects/renderers/emitter-tip.js";
import { Object3D } from "three";
import { BackgroundType } from "@austencloud/backgrounds";

function seededRandom(seed = 0x7f4a7c15): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function drawingContext(): CanvasRenderingContext2D {
  const gradient = { addColorStop: () => undefined };
  return {
    globalAlpha: 1,
    globalCompositeOperation: "source-over",
    createRadialGradient: () => gradient,
    createLinearGradient: () => gradient,
    fillRect: () => undefined,
    save: () => undefined,
    restore: () => undefined,
    rotate: () => undefined,
    beginPath: () => undefined,
    closePath: () => undefined,
    moveTo: () => undefined,
    lineTo: () => undefined,
    bezierCurveTo: () => undefined,
    quadraticCurveTo: () => undefined,
    arc: () => undefined,
    fill: () => undefined,
    stroke: () => undefined,
    getTransform: () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }),
    setTransform: () => undefined,
  } as unknown as CanvasRenderingContext2D;
}

describe("petal art direction", () => {
  it("keeps intact blossoms rare and supplies three loose silhouettes", () => {
    const sprites = PETAL_PALETTES.blossom.sprites;
    expect(sprites).toHaveLength(16);
    expect(sprites.filter((shape) => shape === "blossom_flower")).toHaveLength(
      1
    );
    expect(
      new Set(sprites.filter((shape) => shape !== "blossom_flower"))
    ).toEqual(
      new Set(["blossom_petal", "blossom_petal_folded", "blossom_petal_curled"])
    );
  });

  it("assigns roughly seventy percent of loose petals to the small tier", () => {
    const rand = seededRandom();
    const sampleCount = 10_000;
    let small = 0;
    for (let index = 0; index < sampleCount; index++) {
      const size = resolvePetalSize(1, 0.5, "blossom_petal", rand);
      if (size < 0.42) small++;
    }
    expect(small / sampleCount).toBeGreaterThan(0.69);
    expect(small / sampleCount).toBeLessThan(0.75);
  });

  it("keeps a whole blossom below the loose-petal accent ceiling", () => {
    const largestFlower = resolvePetalSize(1, 0.5, "blossom_flower", () => 1);
    const values = [1, 1];
    const largestLoosePetal = resolvePetalSize(
      1,
      0.5,
      "blossom_petal",
      () => values.shift() ?? 1
    );
    expect(largestFlower).toBeLessThan(largestLoosePetal);
  });

  it("compensates 3D perspective without restoring the old oversized footprint", () => {
    const values = [0, 0];
    const worldSize = resolvePetalWorldSize(
      0.1,
      0.5,
      "blossom_petal",
      false,
      () => values.shift() ?? 0
    );
    expect(worldSize).toBeGreaterThan(0.04);
    expect(worldSize).toBeLessThan(0.08);
  });

  it("makes motion-born 3D petals easier to read than ambient drift", () => {
    const sample = () => [0, 0];
    const motionValues = sample();
    const ambientValues = sample();
    const motionSize = resolvePetalWorldSize(
      0.1,
      0.5,
      "blossom_petal",
      false,
      () => motionValues.shift() ?? 0
    );
    const ambientSize = resolvePetalWorldSize(
      0.1,
      0.5,
      "blossom_petal",
      true,
      () => ambientValues.shift() ?? 0
    );
    expect(motionSize / ambientSize).toBeGreaterThan(1.4);
    expect(motionSize / ambientSize).toBeLessThan(1.6);
  });

  it("extends the ember halo beyond the ash body without doubling its footprint", () => {
    const radius = 0.08;
    expect(resolveEmberWorldSpan(radius)).toBeGreaterThan(radius * 2);
    expect(resolveEmberWorldSpan(radius)).toBeLessThan(radius * 2.8);
  });

  it("makes ambient particles quieter than motion-born particles", () => {
    expect(resolvePetalOpacity("blossom_petal", true)).toBeLessThan(
      resolvePetalOpacity("blossom_petal", false)
    );
    expect(resolvePetalOpacity("blossom_flower", false)).toBeLessThan(
      resolvePetalOpacity("blossom_petal", false)
    );
  });

  it("trades density for contrast in busy dark environments", () => {
    const forest = resolvePetalEnvironmentProfile(BackgroundType.FOREST);
    expect(forest.motionEmissionScale).toBeLessThan(1);
    expect(forest.ambientEmissionScale).toBeLessThan(
      forest.motionEmissionScale
    );
    expect(forest.minimumSurfaceLuminance).toBeGreaterThan(
      NEUTRAL_PETAL_ENVIRONMENT_PROFILE.minimumSurfaceLuminance
    );
    expect(forest.opacityScale).toBeGreaterThan(1);
  });

  it("gives neutral 3D scenes gentle petal contrast", () => {
    expect(NEUTRAL_PETAL_ENVIRONMENT_PROFILE.contrastStrength).toBeGreaterThan(
      0
    );
    expect(NEUTRAL_PETAL_ENVIRONMENT_PROFILE.contrastStrength).toBeLessThan(
      0.6
    );
    expect(
      NEUTRAL_PETAL_ENVIRONMENT_PROFILE.minimumSurfaceLuminance
    ).toBeGreaterThan(0.1);
  });

  it("uses inverse contrast direction for pale environments", () => {
    const winter = resolvePetalEnvironmentProfile(BackgroundType.WINTER);
    const forest = resolvePetalEnvironmentProfile(BackgroundType.FOREST);
    expect(winter.backdropLuminance).toBeGreaterThan(0.34);
    expect(winter.maximumSurfaceLuminance).toBeLessThan(
      forest.maximumSurfaceLuminance
    );
    expect(winter.contrastStrength).toBeGreaterThan(0.9);
  });

  it("defines a bounded profile for every supported environment", () => {
    for (const backgroundType of Object.values(BackgroundType)) {
      const profile = resolvePetalEnvironmentProfile(backgroundType);
      expect(profile.backdropLuminance).toBeGreaterThanOrEqual(0);
      expect(profile.backdropLuminance).toBeLessThanOrEqual(1);
      expect(profile.contrastStrength).toBeGreaterThan(0);
      expect(profile.contrastStrength).toBeLessThanOrEqual(1);
      expect(profile.ambientEmissionScale).toBeLessThanOrEqual(
        profile.motionEmissionScale
      );
    }
  });

  it("gives Jungle Drift a varied botanical roster", () => {
    const sprites = PETAL_PALETTES.jungle.sprites;
    expect(sprites).toHaveLength(9);
    expect(new Set(sprites)).toEqual(
      new Set(["monstera", "banana", "calathea", "elephant", "palm", "fern"])
    );
  });

  it("keeps Ember Ash smoky but gives its heat enough presence", () => {
    const palette = PETAL_PALETTES.ash;
    expect(palette.sprites.slice(0, 5)).toEqual([
      "ash_flake",
      "ash_flake",
      "ash_flake",
      "ash_cinder",
      "ash_cinder",
    ]);
    expect(palette.emberEdge?.chance).toBeGreaterThanOrEqual(0.4);
    expect(
      palette.tints.every(
        (tint) => Number.parseInt(tint.slice(1), 16) > 0x202020
      )
    ).toBe(true);
  });

  it("keeps both backends sparse, motion-dominant, and short-lived", () => {
    const intent = DEFAULT_EFFECTS_CONFIG.petals;
    const canvas = resolvePetals2D(intent);
    const scene = resolvePetals3D(intent);
    expect(canvas.baseSize).toBe(8);
    expect(canvas.motionSpawnRate).toBeGreaterThan(canvas.ambientSpawnRate);
    expect(scene.motionTipRate * intent.motionEmission).toBeGreaterThan(
      scene.ambientAboveRate * intent.ambientEmission
    );
    expect(scene.ambientAboveRate).toBeLessThanOrEqual(4);
    expect(scene.lifetime).toBeLessThanOrEqual(4.5);
  });

  it("draws every art-directed silhouette and assigns each atlas frame", () => {
    const context = drawingContext();
    const shapes = [
      "blossom_flower",
      "blossom_petal",
      "blossom_petal_folded",
      "blossom_petal_curled",
      "monstera",
      "banana",
      "calathea",
      "elephant",
      "palm",
      "fern",
      "ash_flake",
      "ash_cinder",
      "ginkgo",
    ] as const;
    const frames = shapes.map((shape) => {
      expect(() =>
        drawPetalSilhouette(context, shape, 12, "#ff9fbd")
      ).not.toThrow();
      return getPetalAtlasFrame(shape);
    });
    expect(new Set(frames.map((frame) => `${frame.x}:${frame.y}`)).size).toBe(
      shapes.length
    );
  });

  it("constructs and disposes the pooled 3D owner", () => {
    const parent = new Object3D();
    const renderer = new PetalPoolRenderer3D();
    renderer.initialize(parent);
    renderer.update([], 1 / 60);
    expect(parent.children.length).toBe(2);
    renderer.dispose();
    expect(parent.children).toHaveLength(0);
  });

  it("runs the production 2D renderer through the new silhouette path", () => {
    const renderer = new Petals2DRenderer();
    const context = drawingContext();
    const params = resolvePetals2D({
      ...DEFAULT_EFFECTS_CONFIG.petals,
      ambientEmission: 1,
      motionEmission: 0,
    });
    const emitters: EmitterTip[] = [
      {
        x: 100,
        y: 100,
        propIndex: 0,
        tipIndex: 0,
        end: "A",
        color: "#3a7fd9",
      },
    ];
    expect(() => {
      for (let frame = 0; frame < 90; frame++) {
        renderer.render(context, params, emitters, 1 / 60);
      }
    }).not.toThrow();
    renderer.dispose();
  });
});
