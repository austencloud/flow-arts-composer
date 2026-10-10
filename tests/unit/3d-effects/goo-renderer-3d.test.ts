import { describe, expect, it } from "vitest";
import {
  BufferGeometry,
  Color,
  InstancedMesh,
  Matrix4,
  MeshPhysicalMaterial,
  Object3D,
  Quaternion,
  Vector3,
} from "three";
import { GooRenderer3D } from "#lib/shared/3d/effects/water/goo-renderer-3d.js";
import { GooPuddleRenderer3D } from "#lib/shared/3d/effects/water/goo-puddle-renderer-3d.js";
import type { GooTipSource3D } from "#lib/shared/3d/effects/scene-effects/scene-effect-source-3d.js";
import { resolveGoo3D } from "#lib/shared/effects/translators/webgl3d-translator.js";

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
    collisionFloorY: 0,
    propColor: "#ffffff",
    params: resolveGoo3D({
      ambientEmission: 1,
      motionEmission: 1,
      intensity: 1,
      palette: "classic",
      customColor: "#3a7fd9",
      clarity: 0,
      surfaceTension: 0.5,
      viscosity: 0,
      gravity: 1,
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

function ringCenter(geometry: BufferGeometry, ring: number): Vector3 {
  const positions = geometry.getAttribute("position");
  const a = new Vector3().fromBufferAttribute(positions, ring * SIDES);
  const b = new Vector3().fromBufferAttribute(
    positions,
    ring * SIDES + SIDES / 2
  );
  return a.add(b).multiplyScalar(0.5);
}

describe("GooRenderer3D", () => {
  it("lands a falling mist bead once on its own source floor", () => {
    const renderer = new GooRenderer3D();
    const parent = new Object3D();
    renderer.initialize(parent);
    const tip = source({
      position: { x: 1, y: 1.4, z: 3 },
      velocity: { x: 0, y: 0, z: 0 },
      collisionFloorY: -0.7,
    });
    tip.params.spewStyle = "mist";
    tip.params.ambientSpawnRate = 60;
    for (let frame = 0; frame < 4; frame++) renderer.update([tip], 1 / 60);
    tip.params.ambientEmission = 0;
    tip.params.motionEmission = 0;
    for (let frame = 0; frame < 100; frame++) renderer.update([tip], 1 / 60);
    const puddle = parent.children[2] as {
      geometry: BufferGeometry;
      visible: boolean;
    };
    expect(puddle.visible).toBe(true);
    const positions = puddle.geometry.getAttribute("position") as {
      array: Float32Array;
    };
    const nonzero = Array.from({ length: 288 }, (_, index) => [
      positions.array[index * 3]!,
      positions.array[index * 3 + 1]!,
      positions.array[index * 3 + 2]!,
    ]);
    expect(
      Math.min(...nonzero.map((point) => point[1]!))
    ).toBeGreaterThanOrEqual(-0.7);
    expect(Math.max(...nonzero.map((point) => point[1]!))).toBeLessThan(-0.66);
    const before = positions.array.slice(0, 288 * 3);
    for (let frame = 0; frame < 10; frame++) renderer.update([tip], 0);
    expect(positions.array.slice(0, 288 * 3)).toEqual(before);
    expect((parent.children[1] as InstancedMesh).count).toBe(0);
    renderer.clear();
    expect(puddle.visible).toBe(false);
    renderer.dispose();
    expect(parent.children).toHaveLength(0);
  });

  it("keeps stationary zero-gravity mist airborne instead of inventing a landing", () => {
    const renderer = new GooRenderer3D();
    const parent = new Object3D();
    renderer.initialize(parent);
    const tip = source({ velocity: { x: 0, y: 0, z: 0 }, collisionFloorY: 0 });
    tip.params.spewStyle = "mist";
    tip.params.worldGravity = 0;
    tip.params.ambientSpawnRate = 60;
    renderer.update([tip], 1 / 60);
    tip.params.ambientEmission = 0;
    for (let frame = 0; frame < 100; frame++) renderer.update([tip], 1 / 60);
    expect(parent.children[2]!.visible).toBe(false);
    renderer.dispose();
  });

  it("merges nearby deposits with bounded volume and respects viscosity and floor", () => {
    const material = new MeshPhysicalMaterial({ vertexColors: true });
    const thin = new GooPuddleRenderer3D(material);
    const thick = new GooPuddleRenderer3D(material);
    const color = new Color("#4a9dde");
    thin.deposit(1, 2, -1, 0.05, 0, 0.5, color, 0, 1);
    thick.deposit(1, 2, -1, 0.05, 1, 0.5, color, 0, 1);
    for (let i = 0; i < 200; i++) {
      thin.deposit(1.01, 2, -1, 0.05, 0, 0.5, color, 0, 1);
      thick.deposit(1.01, 2, -1, 0.05, 1, 0.5, color, 0, 1);
    }
    thin.update(1);
    thick.update(1);
    const thinX = (
      thin.geometry.getAttribute("position") as { array: Float32Array }
    ).array;
    const thickX = (
      thick.geometry.getAttribute("position") as { array: Float32Array }
    ).array;
    expect(thinX[32 * 3]!).toBeGreaterThan(thickX[32 * 3]!);
    expect(Math.max(...thinX)).toBeLessThan(3);
    expect(Array.from(thinX).every(Number.isFinite)).toBe(true);
    expect(
      Math.min(
        ...Array.from({ length: 288 }, (_, vertex) => thinX[vertex * 3 + 1]!)
      )
    ).toBeGreaterThanOrEqual(-1);
    thin.deposit(1, 2, 1, 0.05, 0, 0.5, color, 0, 1);
    thin.update(0);
    expect(thinX[288 * 3 + 1]!).toBeGreaterThan(1);
    thin.clear();
    expect(thin.mesh.visible).toBe(false);
    thin.dispose();
    thick.dispose();
    material.dispose();
  });

  it("caps the top surface, joins pools as they spread, and fades idle liquid", () => {
    const material = new MeshPhysicalMaterial({ vertexColors: true });
    const puddles = new GooPuddleRenderer3D(material);
    const color = new Color("#4389bb");
    puddles.deposit(1, 2, 0, 0.05, 0, 0.5, color, 0, 1);
    puddles.deposit(1.145, 2, 0, 0.05, 0, 0.5, color, 0, 1);
    puddles.update(1);
    const positions = puddles.geometry.getAttribute("position");
    const normals = puddles.geometry.getAttribute("normal");
    expect(positions.getX(0)).toBeCloseTo(positions.getX(1));
    expect(positions.getZ(0)).toBeCloseTo(positions.getZ(1));
    expect(normals.getY(32)).toBeGreaterThan(0);
    expect(positions.getX(288)).toBe(0);
    const alpha = puddles.geometry.getAttribute("aAlpha");
    puddles.update(15);
    expect(alpha.getX(0)).toBeLessThan(1);
    expect(alpha.getX(0)).toBeGreaterThan(0);
    puddles.update(3);
    expect(puddles.mesh.visible).toBe(false);
    puddles.dispose();
    material.dispose();
  });

  it("moves impact waves outward from the actual landing point and damps thick goo sooner", () => {
    const material = new MeshPhysicalMaterial({ vertexColors: true });
    const color = new Color("#4389bb");
    const still = new GooPuddleRenderer3D(material);
    const thickStill = new GooPuddleRenderer3D(material);
    const thin = new GooPuddleRenderer3D(material);
    const thick = new GooPuddleRenderer3D(material);
    for (const [puddle, viscosity, speed] of [
      [still, 0, 0],
      [thickStill, 1, 0],
      [thin, 0, 4],
      [thick, 1, 4],
    ] as const) {
      puddle.deposit(0, 0, 0, 0.1, viscosity, 0.5, color, 0, 1, 0);
      puddle.deposit(0.035, 0, 0, 0.1, viscosity, 0.5, color, 0, 1, speed);
      puddle.update(0);
    }
    const wave = (moving: GooPuddleRenderer3D, baseline = still) => {
      const positions = moving.geometry.getAttribute("position");
      const flat = baseline.geometry.getAttribute("position");
      let peak = 0;
      let distance = 0;
      for (let vertex = 0; vertex < 288; vertex++) {
        const displacement = Math.abs(
          positions.getY(vertex) - flat.getY(vertex)
        );
        if (displacement > peak) {
          peak = displacement;
          distance = Math.hypot(
            positions.getX(vertex) - 0.035,
            positions.getZ(vertex)
          );
        }
      }
      return { peak, distance };
    };
    const initial = wave(thin);
    expect(initial.peak).toBeGreaterThan(0.001);
    still.update(0.12);
    thickStill.update(0.12);
    thin.update(0.12);
    thick.update(0.12);
    const propagated = wave(thin);
    expect(propagated.distance).toBeGreaterThan(initial.distance + 0.02);
    expect(propagated.peak).toBeGreaterThan(wave(thick, thickStill).peak * 1.5);
    still.update(2);
    thickStill.update(2);
    thin.update(2);
    thick.update(2);
    expect(wave(thin).peak).toBeCloseTo(0, 6);
    expect(wave(thick, thickStill).peak).toBeCloseTo(0, 6);
    thin.clear();
    thin.deposit(0, 0, 0, 0.1, 0, 0.5, color, 0, 1, 0);
    thin.update(0);
    expect(thin.mesh.visible).toBe(true);
    for (const puddle of [still, thickStill, thin, thick]) puddle.dispose();
    material.dispose();
  });

  it("keeps a new impact at its world position when neighboring pools coalesce", () => {
    const material = new MeshPhysicalMaterial({ vertexColors: true });
    const color = new Color("#4389bb");
    const still = new GooPuddleRenderer3D(material);
    const impacted = new GooPuddleRenderer3D(material);
    for (const puddle of [still, impacted]) {
      puddle.deposit(0, 0, 0, 0.1, 0, 0.5, color, 0, 1, 0);
      puddle.deposit(0.28, 0, 0, 0.1, 0, 0.5, color, 0, 1, 0);
      puddle.update(0.7);
    }
    still.deposit(0.28, 0, 0, 0.1, 0, 0.5, color, 0, 1, 0);
    impacted.deposit(0.28, 0, 0, 0.1, 0, 0.5, color, 0, 1, 4);
    still.update(0.05);
    impacted.update(0.05);
    const flat = still.geometry.getAttribute("position");
    const moving = impacted.geometry.getAttribute("position");
    let peakVertex = 0;
    let peak = 0;
    for (let vertex = 0; vertex < 288; vertex++) {
      const displacement = Math.abs(moving.getY(vertex) - flat.getY(vertex));
      if (displacement > peak) {
        peak = displacement;
        peakVertex = vertex;
      }
    }
    expect(peak).toBeGreaterThan(0.001);
    expect(moving.getX(peakVertex)).toBeGreaterThan(0.2);
    expect(moving.getX(288)).toBe(0);
    still.dispose();
    impacted.dispose();
    material.dispose();
  });

  it("shows a small drop ripple on an already grown viscous pool", () => {
    const material = new MeshPhysicalMaterial({ vertexColors: true });
    const color = new Color("#4389bb");
    const still = new GooPuddleRenderer3D(material);
    const impacted = new GooPuddleRenderer3D(material);
    for (const puddle of [still, impacted]) {
      puddle.deposit(0, 0, 0, 0.1, 0.7, 0.7, color, 0, 1, 0);
      puddle.update(0.3);
    }
    still.deposit(0.05, 0, 0, 0.025, 0.7, 0.7, color, 0, 1, 0);
    impacted.deposit(0.05, 0, 0, 0.025, 0.7, 0.7, color, 0, 1, 2);
    still.update(0.12);
    impacted.update(0.12);
    const flat = still.geometry.getAttribute("position");
    const moving = impacted.geometry.getAttribute("position");
    let peak = 0;
    for (let vertex = 0; vertex < 288; vertex++) {
      peak = Math.max(peak, Math.abs(moving.getY(vertex) - flat.getY(vertex)));
      expect(moving.getY(vertex)).toBeGreaterThanOrEqual(0.0015);
    }
    expect(peak).toBeGreaterThan(0.002);
    still.dispose();
    impacted.dispose();
    material.dispose();
  });

  it("keeps upward-launched mist alive until it can fall to the floor", () => {
    const renderer = new GooRenderer3D();
    const parent = new Object3D();
    renderer.initialize(parent);
    const tip = source({
      position: { x: 0.7, y: 1, z: 0.9 },
      velocity: { x: 0, y: 3, z: 0 },
      collisionFloorY: 0,
    });
    tip.params.spewStyle = "mist";
    tip.params.ambientSpawnRate = 60;
    for (let frame = 0; frame < 4; frame++) renderer.update([tip], 1 / 60);
    tip.params.ambientEmission = 0;
    tip.params.motionEmission = 0;
    for (let frame = 0; frame < 220; frame++) renderer.update([tip], 1 / 60);
    expect(parent.children[2]!.visible).toBe(true);
    renderer.dispose();
  });
  it("resolves legacy liquid values and gravity in Earth multiples", () => {
    const legacy = {
      ...source().params,
      viscosity: undefined,
      gravity: undefined,
    } as unknown as Parameters<typeof resolveGoo3D>[0];
    expect(resolveGoo3D(legacy)).toMatchObject({
      viscosity: 0,
      gravity: 1,
      worldGravity: -9.8,
    });
    expect(
      resolveGoo3D({
        ...legacy,
        viscosity: Infinity,
        gravity: -1,
        surfaceTension: NaN,
      })
    ).toMatchObject({
      viscosity: 0,
      gravity: 0,
      surfaceTension: 0.45,
      worldGravity: -0,
    });
    expect(
      resolveGoo3D({ ...legacy, viscosity: 3, gravity: 3, surfaceTension: 3 })
    ).toMatchObject({
      viscosity: 1,
      gravity: 2,
      surfaceTension: 1,
      worldGravity: -19.6,
    });
  });

  it("makes connected liquid resist stretch at high viscosity", () => {
    const reachAfter = (viscosity: number) => {
      const renderer = new GooRenderer3D();
      const parent = new Object3D();
      renderer.initialize(parent);
      const tip = source({ velocity: { x: 2, y: 0, z: 0 }, speed: 0 });
      tip.params.viscosity = viscosity;
      tip.params.worldGravity = 0;
      tip.params.ambientSpawnRate = 60;
      renderer.update([tip], 1 / 60);
      tip.params.ambientEmission = 0;
      const internal = renderer as unknown as {
        strands: Array<{
          active: boolean;
          attached: boolean;
          head: Vector3;
          tail: Vector3;
        }>;
      };
      for (let frame = 0; frame < 20; frame++) renderer.update([tip], 1 / 60);
      const strand = internal.strands.find((item) => item.active)!;
      const result = {
        attached: strand.attached,
        reach: strand.head.distanceTo(strand.tail),
      };
      renderer.dispose();
      return result;
    };
    const thin = reachAfter(0);
    const thick = reachAfter(1);
    expect(thin.attached).toBe(true);
    expect(thick.attached).toBe(true);
    expect(thick.reach).toBeLessThan(thin.reach * 0.8);
  });

  it("releases thick liquid at its damped speed, then follows gravity without drag", () => {
    const renderer = new GooRenderer3D();
    const parent = new Object3D();
    renderer.initialize(parent);
    const tip = source({ velocity: { x: 2, y: 0, z: 0 }, speed: 0 });
    tip.params.viscosity = 1;
    tip.params.worldGravity = -4;
    tip.params.ambientSpawnRate = 60;
    renderer.update([tip], 1 / 60);
    tip.params.ambientEmission = 0;
    const internal = renderer as unknown as {
      strands: Array<{ active: boolean; velocity: Vector3 }>;
      drops: Array<{ active: boolean; velocity: Vector3 }>;
    };
    for (let frame = 0; frame < 20; frame++) renderer.update([tip], 1 / 60);
    const strand = internal.strands.find((item) => item.active)!;
    const attachedSpeed = strand.velocity.x;
    expect(attachedSpeed).toBeLessThan(0.35);
    for (let frame = 0; frame < 7; frame++) renderer.update([], 1 / 60);
    const drop = internal.drops.find((item) => item.active)!;
    expect(drop).toBeDefined();
    expect(drop.velocity.x).toBeCloseTo(attachedSpeed, 5);
    const verticalSpeed = drop.velocity.y;
    renderer.update([], 1 / 60);
    expect(drop.velocity.x).toBeCloseTo(attachedSpeed, 5);
    expect(drop.velocity.y - verticalSpeed).toBeCloseTo(-4 / 60, 5);
    renderer.dispose();
  });

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

  it("thins the shaft under stretch while keeping the distal bead", () => {
    const renderer = new GooRenderer3D();
    const parent = new Object3D();
    renderer.initialize(parent);
    const tip = source();
    tip.params.worldGravity = 0;
    renderer.update([tip], 1 / 15);
    const internal = renderer as unknown as {
      strands: Array<{
        active: boolean;
        tail: Vector3;
        bend: Vector3;
        head: Vector3;
        age: number;
      }>;
      writeStrands(): void;
    };
    const strand = internal.strands.find((candidate) => candidate.active)!;
    strand.age = 0.2;
    strand.tail.set(0, 0, 0);
    strand.bend.set(0.1, 0, 0);
    strand.head.set(0.2, 0, 0);
    internal.writeStrands();
    const geometry = (parent.children[0] as { geometry: BufferGeometry })
      .geometry;
    const shortShaft = ringRadius(geometry, 8);
    const shortBead = ringRadius(geometry, 17);
    strand.bend.set(0.3, 0, 0);
    strand.head.set(0.6, 0, 0);
    internal.writeStrands();
    expect(ringRadius(geometry, 8)).toBeLessThan(shortShaft * 0.8);
    expect(ringRadius(geometry, 17)).toBeGreaterThan(shortBead * 0.9);
    renderer.dispose();
  });

  it("uses the same gravity before and after a bead separates", () => {
    const renderer = new GooRenderer3D();
    const parent = new Object3D();
    renderer.initialize(parent);
    const tip = source({ velocity: { x: 1, y: 0, z: 0 }, speed: 0 });
    tip.params.worldGravity = -6;
    tip.params.surfaceTension = 0;
    tip.params.ambientSpawnRate = 60;
    renderer.update([tip], 1 / 60);
    tip.params.ambientEmission = 0;
    tip.params.motionEmission = 0;
    const internal = renderer as unknown as {
      strands: Array<{ active: boolean; velocity: Vector3; gravity: number }>;
      drops: Array<{ active: boolean; velocity: Vector3; gravity: number }>;
    };
    const strand = internal.strands.find((candidate) => candidate.active)!;
    const initialVelocity = strand.velocity.y;
    renderer.update([tip], 1 / 60);
    expect(strand.velocity.y - initialVelocity).toBeCloseTo(-6 / 60, 5);
    for (
      let frame = 0;
      frame < 60 && !internal.drops.some((drop) => drop.active);
      frame++
    ) {
      renderer.update([tip], 1 / 60);
    }
    const drop = internal.drops.find((candidate) => candidate.active)!;
    expect(drop).toBeDefined();
    expect(drop.gravity).toBe(strand.gravity);
    expect(drop.velocity.y - strand.velocity.y).toBeCloseTo(-6 / 60, 5);
    const releasedVelocity = drop.velocity.y;
    renderer.update([tip], 1 / 60);
    expect(drop.velocity.y - releasedVelocity).toBeCloseTo(-6 / 60, 5);
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
    let previousBulbCenter = ringCenter(tube.geometry, 17);
    for (let frame = 0; frame < 4 && drops.count === 0; frame++) {
      previousBulbCenter = ringCenter(tube.geometry, 17);
      renderer.update([tip], 1 / 60);
    }
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
    expect(dropPosition.distanceTo(previousBulbCenter)).toBeLessThan(0.03);
    const dropSize = new Vector3();
    dropMatrix.decompose(new Vector3(), new Quaternion(), dropSize);
    expect(dropSize.x).toBeGreaterThan(earlyBulb * 0.6);
    expect(ringRadius(tube.geometry, 22)).toBeLessThan(dropSize.x * 0.4);
    const initialStretch = dropSize.y / dropSize.x;
    for (let frame = 0; frame < 4; frame++) renderer.update([tip], 1 / 60);
    drops.getMatrixAt(0, dropMatrix);
    dropMatrix.decompose(new Vector3(), new Quaternion(), dropSize);
    expect(dropSize.y / dropSize.x).toBeLessThan(initialStretch);
    for (let frame = 0; frame < 8; frame++) renderer.update([tip], 1 / 60);
    expect(tube.visible).toBe(false);
    renderer.dispose();
  });

  it("keeps a fully collapsed strand finite through release", () => {
    const renderer = new GooRenderer3D();
    const parent = new Object3D();
    renderer.initialize(parent);
    const tip = source({ velocity: { x: 0, y: 0.6, z: 0 }, speed: 0 });
    tip.params.worldGravity = 0;
    tip.params.ambientSpawnRate = 60;
    renderer.update([tip], 1 / 60);
    tip.params.ambientEmission = 0;
    for (let frame = 0; frame < 60; frame++) renderer.update([tip], 1 / 60);
    expect(Array.from(renderedPositions(parent)).every(Number.isFinite)).toBe(
      true
    );
    expect((parent.children[1] as InstancedMesh).count).toBe(0);
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
