import { describe, expect, it } from "vitest";
import { BufferGeometry, Object3D } from "three";
import { GooRenderer3D } from "$lib/shared/3d/effects/water/goo-renderer-3d";
import type { GooTipSource3D } from "$lib/shared/3d/effects/scene-effects/scene-effect-source-3d";
import { resolveGoo3D } from "$lib/shared/effects/translators/webgl3d-translator";

function source(overrides: Partial<GooTipSource3D> = {}): GooTipSource3D {
  return {
    effect: "goo",
    sourceId: 1,
    propIndex: 0,
    tipIndex: 0,
    position: { x: 1, y: 2, z: 3 },
    velocity: { x: 1, y: 0, z: 0 },
    speed: 3,
    currentStep: 0,
    propColor: "#ffffff",
    params: resolveGoo3D({
      ambientEmission: 1,
      motionEmission: 1,
      intensity: 1,
      palette: "classic",
      customColor: "#3a7fd9",
      clarity: 0,
      surfaceTension: 0.5,
      trackingMode: "both_ends",
      spewStyle: "flow",
    }),
    ...overrides,
  };
}

function renderedPositions(parent: Object3D): Float32Array {
  const geometry = (parent.children[0] as { geometry: BufferGeometry })
    .geometry;
  return geometry.getAttribute("position").array as Float32Array;
}

function visibleVertices(positions: Float32Array): number {
  let count = 0;
  for (let i = 0; i < positions.length; i += 3) {
    if (positions[i] !== 0 || positions[i + 1] !== 0 || positions[i + 2] !== 0)
      count++;
  }
  return count;
}

describe("GooRenderer3D", () => {
  it("keeps tube geometry finite through movement, retirement, and clearing", () => {
    const renderer = new GooRenderer3D();
    const parent = new Object3D();
    renderer.initialize(parent);
    const tip = source();
    for (let frame = 0; frame < 25; frame++) {
      tip.position.x += 0.02;
      renderer.update([tip], 1 / 60);
      expect(Array.from(renderedPositions(parent)).every(Number.isFinite)).toBe(
        true
      );
    }
    renderer.update([], 1 / 60);
    renderer.clear();
    expect(visibleVertices(renderedPositions(parent))).toBe(0);
    renderer.dispose();
    expect(parent.children).toHaveLength(0);
  });

  it("points tube normals away from the strand center", () => {
    const renderer = new GooRenderer3D();
    const parent = new Object3D();
    renderer.initialize(parent);
    renderer.update([source()], 1 / 15);
    const geometry = (parent.children[0] as { geometry: BufferGeometry })
      .geometry;
    const positions = geometry.getAttribute("position");
    const normals = geometry.getAttribute("normal");
    const ringStart = 6 * 8;
    let centerX = 0;
    let centerY = 0;
    let centerZ = 0;
    for (let side = 0; side < 8; side++) {
      centerX += positions.getX(ringStart + side) / 8;
      centerY += positions.getY(ringStart + side) / 8;
      centerZ += positions.getZ(ringStart + side) / 8;
    }
    const radialDotNormal =
      (positions.getX(ringStart) - centerX) * normals.getX(ringStart) +
      (positions.getY(ringStart) - centerY) * normals.getY(ringStart) +
      (positions.getZ(ringStart) - centerZ) * normals.getZ(ringStart);
    expect(radialDotNormal).toBeGreaterThan(0);
    renderer.dispose();
  });

  it("honors tracked ends and zero emission without leaving stale geometry", () => {
    const renderer = new GooRenderer3D();
    const parent = new Object3D();
    renderer.initialize(parent);
    const tip = source({ tipIndex: 1 });
    tip.params.trackingMode = "left_end";
    renderer.update([tip], 1 / 15);
    expect(visibleVertices(renderedPositions(parent))).toBe(0);
    tip.params.trackingMode = "both_ends";
    renderer.update([tip], 1 / 15);
    expect(visibleVertices(renderedPositions(parent))).toBeGreaterThan(0);
    renderer.clear();
    tip.params.ambientEmission = 0;
    tip.params.motionEmission = 0;
    renderer.update([tip], 1 / 15);
    expect(visibleVertices(renderedPositions(parent))).toBe(0);
    renderer.dispose();
  });

  it("uses mist as detached drops and flow as connected liquid", () => {
    const renderer = new GooRenderer3D();
    const parent = new Object3D();
    renderer.initialize(parent);
    const tip = source();
    tip.params.spewStyle = "mist";
    renderer.update([tip], 1 / 15);
    renderer.update([tip], 1 / 15);
    expect(visibleVertices(renderedPositions(parent))).toBe(0);
    const drops = parent.children[1] as { count: number };
    expect(drops.count).toBeGreaterThan(0);
    renderer.clear();
    tip.params.spewStyle = "flow";
    renderer.update([tip], 1 / 15);
    expect(visibleVertices(renderedPositions(parent))).toBeGreaterThan(0);
    renderer.dispose();
  });

  it("keeps high-tension strands connected longer", () => {
    function remaining(tension: number): boolean {
      const renderer = new GooRenderer3D();
      const parent = new Object3D();
      renderer.initialize(parent);
      const tip = source({ velocity: { x: 0, y: 0, z: 0 }, speed: 0 });
      tip.params.surfaceTension = tension;
      tip.params.ambientSpawnRate = 60;
      renderer.update([tip], 1 / 60);
      tip.params.ambientEmission = 0;
      for (let frame = 0; frame < 17; frame++) renderer.update([tip], 1 / 60);
      const visible = parent.children[0]!.visible;
      renderer.dispose();
      return visible;
    }
    expect(remaining(0)).toBe(false);
    expect(remaining(1)).toBe(true);
  });

  it("never connects separate source positions", () => {
    const renderer = new GooRenderer3D();
    const parent = new Object3D();
    renderer.initialize(parent);
    const left = source();
    const right = source({ sourceId: 2, position: { x: 10, y: 2, z: 3 } });
    renderer.update([left, right], 1 / 15);
    const positions = renderedPositions(parent);
    let nearLeft = false;
    let nearRight = false;
    for (let index = 0; index < positions.length; index += 3) {
      const x = positions[index]!;
      if (x === 0) continue;
      if (x < 2) nearLeft = true;
      if (x > 9) nearRight = true;
      expect(x < 2 || x > 9).toBe(true);
    }
    expect(nearLeft && nearRight).toBe(true);
    renderer.dispose();
  });

  it("does not rebuild hidden geometry during idle or zero-delta frames", () => {
    const renderer = new GooRenderer3D();
    const parent = new Object3D();
    renderer.initialize(parent);
    const mesh = parent.children[0] as {
      geometry: BufferGeometry;
      visible: boolean;
    };
    const attribute = mesh.geometry.getAttribute("position");
    const version = attribute.version;
    renderer.update([], 0);
    renderer.update([], 1 / 60);
    expect(attribute.version).toBe(version);
    expect(mesh.visible).toBe(false);
    renderer.dispose();
  });

  it("detaches a teleported tip and stays within the fixed strand budget", () => {
    const renderer = new GooRenderer3D();
    const parent = new Object3D();
    renderer.initialize(parent);
    const tip = source();
    renderer.update([tip], 1 / 15);
    tip.position.x = 100;
    renderer.update([tip], 1 / 60);
    const positions = renderedPositions(parent);
    for (let index = 0; index < positions.length; index += 3) {
      const x = positions[index]!;
      if (x !== 0) expect(x < 2 || x > 99).toBe(true);
    }
    const crowded = Array.from({ length: 100 }, (_, index) =>
      source({ sourceId: index + 100, position: { x: index, y: 2, z: 3 } })
    );
    for (let frame = 0; frame < 12; frame++) renderer.update(crowded, 1 / 15);
    expect(Array.from(positions).every(Number.isFinite)).toBe(true);
    expect(positions.length).toBe(64 * 13 * 8 * 3);
    renderer.dispose();
  });
});
