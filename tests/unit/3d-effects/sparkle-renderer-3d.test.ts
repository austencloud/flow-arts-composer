import { afterEach, describe, expect, it, vi } from "vitest";
import {
  Object3D,
  type InstancedBufferAttribute,
  type InstancedMesh,
} from "three";
import { SparkleRenderer3D } from "../../../src/lib/shared/3d/effects/particles/sparkle-renderer-3d";
import { createSparkleTextureAtlas3D } from "../../../src/lib/shared/3d/effects/particles/sparkle-texture-atlas-3d";
import type { SparkleTipSource3D } from "../../../src/lib/shared/3d/effects/scene-effects/scene-effect-source-3d";
import type { Sparkles3DParams } from "../../../src/lib/shared/effects/translators/webgl3d-types";

afterEach(() => vi.restoreAllMocks());

function source(
  x: number,
  rate = 1,
  sourceId = 1,
  lifetime = 2
): SparkleTipSource3D {
  return {
    effect: "sparkles",
    sourceId,
    propIndex: 0,
    tipIndex: 0,
    position: { x, y: 0, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    speed: 0,
    currentStep: 0,
    propColor: "#ffffff",
    params: {
      rate,
      lifetime,
      baseRadius: 0.03,
      worldSpread: 0,
      worldGravity: 0,
      colorMode: "palette",
      color: "#ff0000",
      palette: ["#00ff00"],
    } as Sparkles3DParams,
  };
}

describe("SparkleRenderer3D", () => {
  it("spreads emission along a moving tip and clears both pooled layers", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const renderer = new SparkleRenderer3D();
    const parent = new Object3D();
    renderer.initialize(parent);
    renderer.update([source(0)], 1 / 15);
    const glints = parent.children[0] as InstancedMesh;
    const cores = parent.children[1] as InstancedMesh;
    const firstCount = glints.count;
    renderer.update([source(0.2)], 1 / 15);
    expect(parent.children).toHaveLength(2);
    expect(firstCount).toBeGreaterThan(0);
    expect(glints.count).toBe(firstCount * 2);
    expect(cores.count).toBe(0);
    const centers = glints.geometry.getAttribute(
      "aCenter"
    ) as InstancedBufferAttribute;
    const movingXs = Array.from({ length: firstCount }, (_, i) =>
      centers.getX(i + firstCount)
    );
    expect(Math.min(...movingXs)).toBeGreaterThan(0);
    expect(Math.min(...movingXs)).toBeLessThan(0.03);
    expect(Math.max(...movingXs)).toBeCloseTo(0.2);
    const colors = glints.geometry.getAttribute(
      "aColor"
    ) as InstancedBufferAttribute;
    expect(colors.getX(firstCount)).toBeCloseTo(0);
    expect(colors.getY(firstCount)).toBeCloseTo(1);
    renderer.clear();
    expect(glints.count).toBe(0);
    expect(cores.count).toBe(0);
    renderer.dispose();
    expect(parent.children).toHaveLength(0);
  });

  it("scales a realistic rate smoothly and emits the same count at 30 or 60 fps", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const counts = (rate: number, fps: number) => {
      const renderer = new SparkleRenderer3D();
      const parent = new Object3D();
      renderer.initialize(parent);
      for (let frame = 0; frame < fps; frame++) {
        renderer.update([source(frame / fps, rate, 1, 3)], 1 / fps);
      }
      const count = (parent.children[0] as InstancedMesh).count;
      renderer.dispose();
      return count;
    };
    expect(counts(0.25, 60)).toBe(30);
    expect(counts(0.5, 60)).toBe(60);
    expect(counts(1, 60)).toBe(120);
    expect(counts(1, 30)).toBe(120);
  });

  it("keeps a substantial share of the dense trail as visible star glints", () => {
    let seed = 1;
    vi.spyOn(Math, "random").mockImplementation(() => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    });
    const renderer = new SparkleRenderer3D();
    const parent = new Object3D();
    renderer.initialize(parent);
    for (let frame = 0; frame < 60; frame++) {
      renderer.update([source(frame / 60, 1, 1, 3)], 1 / 60);
    }
    const glints = parent.children[0] as InstancedMesh;
    const cores = parent.children[1] as InstancedMesh;
    expect(glints.count).toBe(120);
    expect(cores.count / glints.count).toBeGreaterThan(0.36);
    expect(cores.count / glints.count).toBeLessThan(0.48);
    renderer.dispose();
  });

  it("keeps a dense multi-tip trail within its pooled capacity", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const renderer = new SparkleRenderer3D();
    const parent = new Object3D();
    renderer.initialize(parent);
    for (let frame = 0; frame < 12; frame++) {
      renderer.update(
        Array.from({ length: 32 }, (_, id) => source(frame / 15, 1, id, 3)),
        1 / 15
      );
    }
    expect((parent.children[0] as InstancedMesh).count).toBe(2048);
    expect((parent.children[1] as InstancedMesh).count).toBeLessThanOrEqual(
      2048
    );
    renderer.dispose();
  });

  it("keeps the glint sharp and its halo transparent at the sprite edge", () => {
    const atlas = createSparkleTextureAtlas3D();
    const pixels = atlas.image.data as Uint8Array;
    const side = atlas.image.width as number;
    const alpha = (x: number, y: number) => pixels[(y * side + x) * 4 + 3];
    expect(alpha(64, 64)).toBeGreaterThan(220);
    expect(alpha(104, 64)).toBeGreaterThan(alpha(104, 90));
    expect(alpha(1, 1)).toBe(0);
    atlas.dispose();
  });
});
