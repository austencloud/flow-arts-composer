import { describe, expect, it } from "vitest";
import {
  BufferGeometry,
  InstancedMesh,
  Matrix4,
  MeshPhysicalMaterial,
  Object3D,
  Quaternion,
  Vector3,
} from "three";
import { GooRenderer3D } from "$lib/shared/3d/effects/water/goo-renderer-3d";
import type { GooTipSource3D } from "$lib/shared/3d/effects/scene-effects/scene-effect-source-3d";
import { resolveGoo3D } from "$lib/shared/effects/translators/webgl3d-translator";

const RINGS = 25;
const SIDES = 12;

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

function ringRadius(geometry: BufferGeometry, ring: number): number {
  const positions = geometry.getAttribute("position");
  const a = new Vector3().fromBufferAttribute(positions, ring * SIDES);
  const b = new Vector3().fromBufferAttribute(
    positions,
    ring * SIDES + SIDES / 2
  );
  return a.distanceTo(b) / 2;
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
    const ringStart = 12 * SIDES;
    let centerX = 0;
    let centerY = 0;
    let centerZ = 0;
    for (let side = 0; side < 12; side++) {
      centerX += positions.getX(ringStart + side) / 12;
      centerY += positions.getY(ringStart + side) / 12;
      centerZ += positions.getZ(ringStart + side) / 12;
    }
    const radialDotNormal =
      (positions.getX(ringStart) - centerX) * normals.getX(ringStart) +
      (positions.getY(ringStart) - centerY) * normals.getY(ringStart) +
      (positions.getZ(ringStart) - centerZ) * normals.getZ(ringStart);
    expect(radialDotNormal).toBeGreaterThan(0);
    renderer.dispose();
  });

  it("keeps the tube ring frame continuous as a curve passes through vertical", () => {
    const renderer = new GooRenderer3D();
    const parent = new Object3D();
    renderer.initialize(parent);
    renderer.update([source()], 1 / 15);
    const internal = renderer as unknown as {
      strands: Array<{
        active: boolean;
        tail: Vector3;
        bend: Vector3;
        head: Vector3;
      }>;
      writeStrands(): void;
    };
    const strand = internal.strands.find((candidate) => candidate.active)!;
    strand.tail.set(0, 0, 0);
    strand.bend.set(0.2, 0.3, 0);
    strand.head.set(0, 0.6, 0);
    internal.writeStrands();

    const positions = (
      parent.children[0] as { geometry: BufferGeometry }
    ).geometry.getAttribute("position");
    expect(Array.from(positions.array).every(Number.isFinite)).toBe(true);
    let previous: Vector3 | null = null;
    for (let ring = 1; ring < RINGS - 1; ring++) {
      const start = ring * SIDES;
      const center = new Vector3();
      for (let side = 0; side < SIDES; side++) {
        center.add(new Vector3().fromBufferAttribute(positions, start + side));
      }
      center.divideScalar(SIDES);
      const radial = new Vector3()
        .fromBufferAttribute(positions, start)
        .sub(center)
        .normalize();
      if (previous) expect(radial.dot(previous)).toBeGreaterThan(0.5);
      previous = radial;
    }
    renderer.dispose();
  });

  it("forms a rounded distal bulb wider than the middle neck", () => {
    const renderer = new GooRenderer3D();
    const parent = new Object3D();
    renderer.initialize(parent);
    renderer.update([source()], 1 / 15);
    const internal = renderer as unknown as {
      strands: Array<{
        active: boolean;
        tail: Vector3;
        bend: Vector3;
        head: Vector3;
      }>;
      writeStrands(): void;
    };
    const strand = internal.strands.find((candidate) => candidate.active)!;
    strand.tail.set(0, 0, 0);
    strand.bend.set(0, -0.25, 0);
    strand.head.set(0, -0.5, 0);
    internal.writeStrands();
    const positions = (
      parent.children[0] as { geometry: BufferGeometry }
    ).geometry.getAttribute("position");
    const radiusAt = (ring: number): number => {
      const start = ring * SIDES;
      const center = new Vector3();
      for (let side = 0; side < SIDES; side++) {
        center.add(new Vector3().fromBufferAttribute(positions, start + side));
      }
      center.divideScalar(SIDES);
      return new Vector3()
        .fromBufferAttribute(positions, start)
        .distanceTo(center);
    };
    expect(radiusAt(22)).toBeGreaterThan(radiusAt(12) * 1.3);
    expect(radiusAt(23)).toBeGreaterThan(radiusAt(17) * 0.4);
    expect(radiusAt(24)).toBeLessThan(0.00001);
    renderer.dispose();
  });

  it("keeps HDR reflections and gives Mercury its own metalness", () => {
    const renderer = new GooRenderer3D();
    const parent = new Object3D();
    renderer.initialize(parent);
    const classic = source();
    const mercury = source({
      sourceId: 2,
      position: { x: 5, y: 2, z: 3 },
    });
    mercury.params = resolveGoo3D({ ...mercury.params, palette: "mercury" });
    renderer.update([classic, mercury], 1 / 15);
    const tube = parent.children[0] as {
      geometry: BufferGeometry;
      material: MeshPhysicalMaterial;
    };
    const metalness = tube.geometry.getAttribute("aMetalness");
    expect(metalness.getX(0)).toBeLessThan(0.2);
    expect(metalness.getX(RINGS * SIDES)).toBeGreaterThan(0.8);
    const studio = tube.material.envMap!.image.data as Float32Array;
    expect(studio.some((channel) => channel > 1)).toBe(true);
    renderer.dispose();
  });

  it("keeps one smoothly capped attached body per source", () => {
    const renderer = new GooRenderer3D();
    const parent = new Object3D();
    renderer.initialize(parent);
    const tip = source();
    let observed = false;
    for (let frame = 0; frame < 35; frame++) {
      tip.position.x += 0.012;
      tip.position.z += Math.sin(frame * 0.12) * 0.006;
      renderer.update([tip], 1 / 60);
      const mesh = parent.children[0]!;
      if (!mesh.visible) continue;
      observed = true;
      expect(visibleVertices(renderedPositions(parent))).toBeLessThanOrEqual(
        RINGS * SIDES
      );
    }
    expect(observed).toBe(true);
    renderer.clear();
    renderer.update([tip], 1 / 15);
    const positions = renderedPositions(parent);
    let bodyOffset = -1;
    for (
      let offset = 0;
      offset < positions.length;
      offset += RINGS * SIDES * 3
    ) {
      if (positions[offset] !== 0 || positions[offset + 1] !== 0) {
        bodyOffset = offset;
        break;
      }
    }
    expect(bodyOffset).toBeGreaterThanOrEqual(0);
    for (const ring of [0, RINGS - 1]) {
      const offset = bodyOffset + ring * SIDES * 3;
      for (let side = 1; side < SIDES; side++) {
        const other = offset + side * 3;
        for (let axis = 0; axis < 3; axis++) {
          expect(positions[other + axis]).toBeCloseTo(
            positions[offset + axis]!,
            5
          );
        }
      }
    }
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
      const tip = source({ velocity: { x: 1, y: 0, z: 0 }, speed: 0 });
      tip.params.surfaceTension = tension;
      tip.params.ambientSpawnRate = 60;
      tip.params.worldGravity = 0;
      renderer.update([tip], 1 / 60);
      tip.params.ambientEmission = 0;
      for (let frame = 0; frame < 52; frame++) renderer.update([tip], 1 / 60);
      const visible = parent.children[0]!.visible;
      renderer.dispose();
      return visible;
    }
    expect(remaining(0)).toBe(false);
    expect(remaining(1)).toBe(true);
  });

  it("pinches the neck before handing its full bead to a settling drop", () => {
    const renderer = new GooRenderer3D();
    const parent = new Object3D();
    renderer.initialize(parent);
    const tip = source({ velocity: { x: 1, y: 0, z: 0 }, speed: 0 });
    tip.params.worldGravity = 0;
    tip.params.surfaceTension = 0;
    tip.params.ambientSpawnRate = 60;
    renderer.update([tip], 1 / 60);
    tip.params.ambientEmission = 0;
    for (let frame = 0; frame < 37; frame++) renderer.update([tip], 1 / 60);

    const tube = parent.children[0] as {
      geometry: BufferGeometry;
      visible: boolean;
    };
    const drops = parent.children[1] as InstancedMesh;
    const unpinchedNeck = ringRadius(tube.geometry, 13);
    const earlyBulb = ringRadius(tube.geometry, 17);
    for (let frame = 0; frame < 6; frame++) renderer.update([tip], 1 / 60);
    expect(drops.count).toBe(0);
    expect(ringRadius(tube.geometry, 13)).toBeLessThan(unpinchedNeck * 0.8);
    expect(ringRadius(tube.geometry, 17)).toBeGreaterThan(earlyBulb * 0.8);
    for (let frame = 0; frame < 4 && drops.count === 0; frame++)
      renderer.update([tip], 1 / 60);
    expect(tube.visible).toBe(true);
    expect(drops.count).toBeGreaterThan(0);
    const tipPosition = new Vector3().fromBufferAttribute(
      tube.geometry.getAttribute("position"),
      (RINGS - 1) * SIDES
    );
    const dropMatrix = new Matrix4();
    drops.getMatrixAt(0, dropMatrix);
    const dropPosition = new Vector3().setFromMatrixPosition(dropMatrix);
    expect(dropPosition.distanceTo(tipPosition)).toBeLessThan(0.04);
    const dropSize = new Vector3();
    dropMatrix.decompose(new Vector3(), new Quaternion(), dropSize);
    expect(dropSize.x).toBeGreaterThan(earlyBulb * 0.6);
    const initialStretch = dropSize.y / dropSize.x;
    for (let frame = 0; frame < 4; frame++) renderer.update([tip], 1 / 60);
    drops.getMatrixAt(0, dropMatrix);
    dropMatrix.decompose(new Vector3(), new Quaternion(), dropSize);
    expect(dropSize.y / dropSize.x).toBeLessThan(initialStretch);
    for (let frame = 0; frame < 8; frame++) renderer.update([tip], 1 / 60);
    expect(tube.visible).toBe(false);
    renderer.dispose();
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
    expect(positions.length).toBe(64 * RINGS * SIDES * 3);
    renderer.dispose();
  });
});
