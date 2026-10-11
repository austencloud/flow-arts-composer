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

function source(x: number): SparkleTipSource3D {
  return {
    effect: "sparkles",
    sourceId: 1,
    propIndex: 0,
    tipIndex: 0,
    position: { x, y: 0, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    speed: 0,
    currentStep: 0,
    propColor: "#ffffff",
    params: {
      rate: 60,
      lifetime: 2,
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
    renderer.update([source(0)], 1 / 30);
    const glints = parent.children[0] as InstancedMesh;
    const cores = parent.children[1] as InstancedMesh;
    const firstCount = glints.count;
    renderer.update([source(0.2)], 1 / 30);
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
    expect(Math.min(...movingXs)).toBeLessThan(0.05);
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
