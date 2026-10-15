import { describe, expect, it } from "vitest";
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  InstancedMesh,
  MeshPhysicalMaterial,
  Object3D,
  Vector3,
} from "three";
import { GooRenderer3D } from "#lib/shared/3d/effects/water/goo-renderer-3d.js";
import { GooPuddleRenderer3D } from "#lib/shared/3d/effects/water/goo-puddle-renderer-3d.js";
import type { GooTipSource3D } from "#lib/shared/3d/effects/scene-effects/scene-effect-source-3d.js";
import { resolveGoo3D } from "#lib/shared/effects/translators/webgl3d-translator.js";

const STRANDS = 48;
const SUB = 3;
const CAP = 6;
const RINGS = 19 * SUB + 1 + CAP * 2;
const SIDES = 14;

interface StrandView {
  active: boolean;
  attached: boolean;
  sourceId: number;
  count: number;
  pos: Float32Array;
  prev: Float32Array;
  rest: Float32Array;
  vol: Float32Array;
  bulb: number;
}

interface DropView {
  active: boolean;
  satellite: boolean;
  radius: number;
  position: Vector3;
  velocity: Vector3;
  liquid: { gravity: number };
}

function internals(renderer: GooRenderer3D) {
  return renderer as unknown as {
    strands: StrandView[];
    drops: DropView[];
    segmentRadius(strand: StrandView, segment: number): number;
    writeStrands(): void;
  };
}

function sphereRadius(volume: number): number {
  return Math.cbrt((3 * volume) / (4 * Math.PI));
}

/** Lay a rope along `points` with an even thread and a bulb at its end. */
function shapeStrand(
  strand: StrandView,
  points: number[][],
  thread: number,
  bulb: number
): void {
  strand.count = points.length;
  points.forEach((point, node) => {
    strand.pos.set(point, node * 3);
    strand.prev.set(point, node * 3);
  });
  for (let segment = 0; segment < points.length - 1; segment++) {
    const [ax, ay, az] = points[segment]!;
    const [bx, by, bz] = points[segment + 1]!;
    const length = Math.hypot(bx! - ax!, by! - ay!, bz! - az!);
    strand.rest[segment] = length;
    strand.vol[segment] = Math.PI * thread ** 2 * length;
  }
  strand.bulb = (4 / 3) * Math.PI * bulb ** 3;
}

function drawnVertices(geometry: BufferGeometry): Set<number> {
  const index = geometry.getIndex()!;
  const drawn = new Set<number>();
  for (let item = 0; item < geometry.drawRange.count; item++)
    drawn.add(index.getX(item));
  return drawn;
}

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

function ringRadius(
  geometry: BufferGeometry,
  ring: number,
  strand = 0
): number {
  const positions = geometry.getAttribute("position");
  const start = (strand * RINGS + ring) * SIDES;
  const a = new Vector3().fromBufferAttribute(positions, start);
  const b = new Vector3().fromBufferAttribute(positions, start + SIDES / 2);
  return a.distanceTo(b) / 2;
}

function stillTip(viscosity = 0): GooTipSource3D {
  const tip = source({ velocity: { x: 0, y: 0, z: 0 }, speed: 0 });
  tip.params.viscosity = viscosity;
  tip.params.ambientSpawnRate = 60;
  return tip;
}

/** Vertices a puddle grid actually draws with any liquid on them. */
function wetVertices(geometry: BufferGeometry): number[] {
  const alpha = geometry.getAttribute("aAlpha");
  return [...drawnVertices(geometry)].filter((vertex) => alpha.getX(vertex) > 0);
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
    const heights = wetVertices(puddle.geometry).map(
      (vertex) => positions.array[vertex * 3 + 1]!
    );
    expect(heights.length).toBeGreaterThan(0);
    expect(Math.min(...heights)).toBeGreaterThanOrEqual(-0.7);
    expect(Math.max(...heights)).toBeLessThan(-0.66);
    const before = positions.array.slice();
    for (let frame = 0; frame < 10; frame++) renderer.update([tip], 0);
    expect(positions.array).toEqual(before);
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
    const extent = (renderer: GooPuddleRenderer3D) => {
      const positions = renderer.geometry.getAttribute("position");
      const alpha = renderer.geometry.getAttribute("aAlpha");
      let furthest = -Infinity;
      for (let vertex = 0; vertex < positions.count; vertex++)
        if (alpha.getX(vertex) > 0)
          furthest = Math.max(furthest, positions.getX(vertex));
      return furthest;
    };
    expect(extent(thin)).toBeGreaterThan(extent(thick));
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

  it("turns a full pool toward the color that keeps landing in it", () => {
    const material = new MeshPhysicalMaterial({ vertexColors: true });
    const puddles = new GooPuddleRenderer3D(material);
    const blue = new Color("#2060d0");
    const red = new Color("#c01010");
    for (let i = 0; i < 400; i++)
      puddles.deposit(0, 0, 0, 0.05, 0, 0.5, blue, 0, 1);
    puddles.update(2);
    const colors = puddles.geometry.getAttribute("color");
    const positions = puddles.geometry.getAttribute("position");
    const alpha = puddles.geometry.getAttribute("aAlpha");
    const body = () =>
      [...drawnVertices(puddles.geometry)].filter(
        (vertex) => alpha.getX(vertex) > 0.5
      );
    const mean = () => {
      const vertices = body();
      let red = 0;
      let blue = 0;
      for (const vertex of vertices) {
        red += colors.getX(vertex);
        blue += colors.getZ(vertex);
      }
      return { red: red / vertices.length, blue: blue / vertices.length };
    };
    const before = mean();
    expect(before.blue).toBeGreaterThan(before.red * 3);

    // One red drop shows where it landed before it has mixed in.
    puddles.deposit(0.2, 0, 0, 0.04, 0, 0.5, red, 0, 1);
    puddles.update(0.1);
    const redness = (vertex: number) => colors.getX(vertex) - colors.getZ(vertex);
    const vertices = body();
    const distance = (vertex: number) =>
      Math.hypot(positions.getX(vertex) - 0.2, positions.getZ(vertex));
    const near = vertices.reduce((a, b) => (distance(a) < distance(b) ? a : b));
    const far = vertices.reduce((a, b) => (distance(a) > distance(b) ? a : b));
    expect(redness(near)).toBeGreaterThan(redness(far) + 0.2);

    // Ten seconds of red landing turns most of the pool red.
    for (let frame = 0; frame < 600; frame++) {
      if (frame % 6 === 0)
        puddles.deposit(
          0.1 * Math.sin(frame),
          0.1 * Math.cos(frame),
          0,
          0.04,
          0,
          0.5,
          red,
          0,
          1
        );
      puddles.update(1 / 60);
    }
    const after = mean();
    expect(after.red).toBeGreaterThan(after.blue * 3);
    puddles.dispose();
    material.dispose();
  });

  it("caps the top surface, joins pools as they spread, and fades idle liquid", () => {
    const material = new MeshPhysicalMaterial({ vertexColors: true });
    const puddles = new GooPuddleRenderer3D(material);
    const color = new Color("#4389bb");
    puddles.deposit(1, 2, 0, 0.05, 0, 0.5, color, 0, 1);
    puddles.deposit(1.145, 2, 0, 0.05, 0, 0.5, color, 0, 1);
    puddles.update(1);
    const normals = puddles.geometry.getAttribute("normal");
    const alpha = puddles.geometry.getAttribute("aAlpha");
    const interior = [...drawnVertices(puddles.geometry)].find(
      (vertex) => alpha.getX(vertex) > 0.9
    );
    expect(interior).toBeDefined();
    expect(Number.isFinite(normals.getY(interior!))).toBe(true);
    expect(normals.getY(interior!)).toBeGreaterThan(0.5);
    expect(puddles.geometry.drawRange.count).toBeGreaterThan(0);
    puddles.update(15);
    expect(Math.max(...Array.from(alpha.array as Float32Array))).toBeLessThan(
      1
    );
    expect(
      Math.max(...Array.from(alpha.array as Float32Array))
    ).toBeGreaterThan(0);
    puddles.update(3);
    expect(puddles.mesh.visible).toBe(false);
    puddles.dispose();
    material.dispose();
  });

  it("keeps both lobes and fills the neck as touching pools merge", () => {
    const material = new MeshPhysicalMaterial({ vertexColors: true });
    const puddles = new GooPuddleRenderer3D(material);
    const color = new Color("#4389bb");
    puddles.deposit(0, 0, 0, 0.1, 0, 0.5, color, 0, 1, 0);
    puddles.deposit(0.3, 0, 0, 0.1, 0, 0.5, color, 0, 1, 0);
    puddles.update(0);
    const positions = puddles.geometry.getAttribute("position");
    expect(puddles.geometry.drawRange.count).toBeGreaterThan(0);
    puddles.update(0.8);
    const alpha = puddles.geometry.getAttribute("aAlpha");
    let left = false;
    let right = false;
    let neck = false;
    let highest = 0;
    let neckHeight = 0;
    for (let vertex = 0; vertex < positions.count; vertex++) {
      if (alpha.getX(vertex) <= 0) continue;
      const x = positions.getX(vertex);
      const y = positions.getY(vertex);
      if (x < -0.05) left = true;
      if (x > 0.35) right = true;
      if (x > 0.12 && x < 0.18 && Math.abs(positions.getZ(vertex)) < 0.03) {
        neck = true;
        neckHeight = Math.max(neckHeight, y);
      }
      highest = Math.max(highest, y);
    }
    expect(left && right && neck).toBe(true);
    expect(neckHeight).toBeGreaterThan(0.0015);
    expect(neckHeight).toBeLessThanOrEqual(highest);
    puddles.dispose();
    material.dispose();
  });

  it("opens a neck at contact without flattening either existing lobe", () => {
    const material = new MeshPhysicalMaterial({ vertexColors: true });
    const puddles = new GooPuddleRenderer3D(material);
    const color = new Color("#4389bb");
    puddles.deposit(0, 0, 0, 0.1, 0, 0.5, color, 0, 1, 0);
    puddles.deposit(0.3, 0, 0, 0.1, 0, 0.5, color, 0, 1, 0);
    const sample = (x: number) => {
      const positions = puddles.geometry.getAttribute("position");
      const alpha = puddles.geometry.getAttribute("aAlpha");
      let best = Infinity;
      let result = { height: 0, alpha: 0 };
      for (const vertex of drawnVertices(puddles.geometry)) {
        const distance = Math.hypot(
          positions.getX(vertex) - x,
          positions.getZ(vertex)
        );
        if (distance < best) {
          best = distance;
          result = {
            height: positions.getY(vertex),
            alpha: alpha.getX(vertex),
          };
        }
      }
      return result;
    };
    puddles.update(0.15);
    const beforeLeft = sample(0);
    const beforeRight = sample(0.3);
    // Before contact the gap shows only the faint wet halo.
    const gap = sample(0.15).alpha;
    expect(gap).toBeLessThan(0.3);
    puddles.update(0.25);
    expect(sample(0.15).alpha).toBeGreaterThan(gap + 0.2);
    expect(Math.abs(sample(0).height - beforeLeft.height)).toBeLessThan(0.006);
    expect(Math.abs(sample(0.3).height - beforeRight.height)).toBeLessThan(
      0.006
    );
    puddles.dispose();
    material.dispose();
  });

  it("keeps touching pools on different floors separate and all vertices finite", () => {
    const material = new MeshPhysicalMaterial({ vertexColors: true });
    const puddles = new GooPuddleRenderer3D(material);
    const color = new Color("#4389bb");
    puddles.deposit(0, 0, 0, 0.1, 0, 0.5, color, 0, 1, 0);
    puddles.deposit(0.05, 0, 0.2, 0.1, 0, 0.5, color, 0, 1, 0);
    puddles.update(1);
    const positions = puddles.geometry.getAttribute("position");
    expect(positions.getY(288)).toBeGreaterThan(0.2);
    expect(
      Array.from((positions as BufferAttribute).array).every(Number.isFinite)
    ).toBe(true);
    puddles.dispose();
    material.dispose();
  });

  it("leaves the dry center of a connected U-shaped chain uncovered", () => {
    const material = new MeshPhysicalMaterial({ vertexColors: true });
    const puddles = new GooPuddleRenderer3D(material);
    const color = new Color("#4389bb");
    for (const [x, z] of [
      [-0.3, 0],
      [-0.3, 0.3],
      [-0.3, 0.6],
      [0, 0.6],
      [0.3, 0.6],
      [0.3, 0.3],
      [0.3, 0],
    ])
      puddles.deposit(x!, z!, 0, 0.1, 0, 0.5, color, 0, 1, 0);
    puddles.update(0.8);
    const positions = puddles.geometry.getAttribute("position");
    const alpha = puddles.geometry.getAttribute("aAlpha");
    let dryGap = false;
    let wetArm = false;
    for (let vertex = 0; vertex < positions.count; vertex++) {
      const x = positions.getX(vertex);
      const z = positions.getZ(vertex);
      if (Math.abs(x) < 0.025 && Math.abs(z - 0.15) < 0.025)
        dryGap = alpha.getX(vertex) === 0;
      if (Math.abs(x + 0.3) < 0.025 && Math.abs(z - 0.15) < 0.025)
        wetArm = alpha.getX(vertex) > 0;
    }
    expect(dryGap && wetArm).toBe(true);
    puddles.dispose();
    material.dispose();
  });

  it("keeps a crowded connected puddle within its fixed geometry budget", () => {
    const material = new MeshPhysicalMaterial({ vertexColors: true });
    const puddles = new GooPuddleRenderer3D(material);
    const color = new Color("#4389bb");
    for (let index = 0; index < 64; index++)
      puddles.deposit(index * 0.08, 0, 0, 0.1, 0, 0.5, color, 0, 1, 0);
    for (let frame = 0; frame < 12; frame++)
      puddles.update(frame === 0 ? 0.2 : 1 / 60);
    const positions = puddles.geometry.getAttribute(
      "position"
    ) as BufferAttribute;
    expect(Array.from(positions.array).every(Number.isFinite)).toBe(true);
    expect(positions.count).toBe(96 * 288);
    expect(drawnVertices(puddles.geometry).size).toBeLessThanOrEqual(7000);
    expect(
      [...drawnVertices(puddles.geometry)].every(
        (vertex) => vertex >= 0 && vertex < positions.count
      )
    ).toBe(true);
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
    expect(impacted.geometry.drawRange.count).toBeGreaterThan(0);
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
    for (const vertex of wetVertices(impacted.geometry)) {
      peak = Math.max(peak, Math.abs(moving.getY(vertex) - flat.getY(vertex)));
      // The wave never digs below the floor.
      expect(moving.getY(vertex)).toBeGreaterThan(0);
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

  it("hangs a still tip's liquid into a rope that necks and drips", () => {
    const renderer = new GooRenderer3D();
    const parent = new Object3D();
    renderer.initialize(parent);
    const tip = stillTip();
    const internal = internals(renderer);
    let neck = Infinity;
    let bead = 0;
    let released: DropView | undefined;
    for (let frame = 0; frame < 120 && !released; frame++) {
      const rope = internal.strands.find((strand) => strand.active && strand.attached);
      if (rope && rope.count > 2) {
        neck = Infinity;
        for (let segment = 0; segment < rope.count - 1; segment++)
          neck = Math.min(neck, internal.segmentRadius(rope, segment));
        bead = sphereRadius(rope.bulb);
      }
      renderer.update([tip], 1 / 60);
      released = internal.drops.find((drop) => drop.active && !drop.satellite);
    }
    expect(released).toBeDefined();
    expect(neck).toBeLessThan(bead * 0.5);
    expect(released!.position.y).toBeLessThan(tip.position.y - 0.1);
    const rope = internal.strands.find((strand) => strand.active && strand.attached);
    expect(rope?.sourceId).toBe(tip.sourceId);
    renderer.dispose();
  });

  it("holds thick liquid together longer and draws it farther before it drips", () => {
    const firstDrip = (viscosity: number) => {
      const renderer = new GooRenderer3D();
      renderer.initialize(new Object3D());
      const tip = stillTip(viscosity);
      const internal = internals(renderer);
      let reach = 0;
      let frame = 0;
      for (; frame < 240; frame++) {
        renderer.update([tip], 1 / 60);
        if (internal.drops.some((drop) => drop.active && !drop.satellite)) break;
        const rope = internal.strands.find((strand) => strand.active && strand.attached)!;
        reach = Math.max(reach, tip.position.y - rope.pos[(rope.count - 1) * 3 + 1]!);
      }
      renderer.dispose();
      return { frame, reach };
    };
    const thin = firstDrip(0);
    const thick = firstDrip(1);
    expect(thin.frame).toBeLessThan(240);
    expect(thick.frame).toBeGreaterThan(thin.frame * 1.5);
    expect(thick.reach).toBeGreaterThan(thin.reach);
  });

  it("releases a drop at its rope's speed, then follows the same gravity without drag", () => {
    const renderer = new GooRenderer3D();
    const parent = new Object3D();
    renderer.initialize(parent);
    const tip = stillTip();
    tip.params.worldGravity = -6;
    const internal = internals(renderer);
    let drop: DropView | undefined;
    let ropeSpeed = 0;
    for (let frame = 0; frame < 200 && !drop; frame++) {
      const rope = internal.strands.find((strand) => strand.active && strand.attached);
      if (rope) {
        const o = (rope.count - 1) * 3 + 1;
        ropeSpeed = (rope.pos[o]! - rope.prev[o]!) * 120;
      }
      renderer.update([tip], 1 / 60);
      drop = internal.drops.find((item) => item.active && !item.satellite);
    }
    expect(drop).toBeDefined();
    expect(drop!.liquid.gravity).toBe(-6);
    expect(drop!.velocity.y).toBeLessThan(0);
    expect(Math.abs(drop!.velocity.y - ropeSpeed)).toBeLessThan(1);
    const released = drop!.velocity.y;
    renderer.update([tip], 1 / 60);
    expect(drop!.velocity.y - released).toBeCloseTo(-6 / 60, 5);
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
    const internal = internals(renderer);
    const strand = internal.strands.find((candidate) => candidate.active)!;
    const base = internal.strands.indexOf(strand) * RINGS * SIDES;
    shapeStrand(strand, [[0, 0, 0], [0.2, 0.3, 0], [0, 0.6, 0]], 0.008, 0.012);
    internal.writeStrands();

    const positions = (
      parent.children[0] as { geometry: BufferGeometry }
    ).geometry.getAttribute("position");
    expect(Array.from(positions.array).every(Number.isFinite)).toBe(true);
    let previous: Vector3 | null = null;
    for (let ring = 1; ring < CAP * 2 + 2 * SUB; ring++) {
      const start = base + ring * SIDES;
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

  it("rounds both ends and swells into a distal bulb wider than the thread", () => {
    const renderer = new GooRenderer3D();
    const parent = new Object3D();
    renderer.initialize(parent);
    renderer.update([source()], 1 / 15);
    const internal = internals(renderer);
    const strand = internal.strands.find((candidate) => candidate.active)!;
    const index = internal.strands.indexOf(strand);
    shapeStrand(
      strand,
      [0, 1, 2, 3, 4].map((node) => [0, -0.1 * node, 0]),
      0.006,
      0.02
    );
    internal.writeStrands();
    const geometry = (parent.children[0] as { geometry: BufferGeometry })
      .geometry;
    const end = CAP + 4 * SUB;
    expect(ringRadius(geometry, end, index)).toBeGreaterThan(
      ringRadius(geometry, CAP + 2 * SUB, index) * 2
    );
    expect(ringRadius(geometry, 0, index)).toBeLessThan(0.00001);
    expect(ringRadius(geometry, end + CAP, index)).toBeLessThan(0.00001);
    expect(ringRadius(geometry, RINGS - 1, index)).toBeLessThan(0.00001);
    renderer.dispose();
  });

  it("gives Mercury its own metalness and keeps HDR reflections", () => {
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
    const internal = internals(renderer);
    const metalnessOf = (sourceId: number) => {
      const strand = internal.strands.find(
        (candidate) => candidate.active && candidate.sourceId === sourceId
      )!;
      return tube.geometry
        .getAttribute("aMetalness")
        .getX(internal.strands.indexOf(strand) * RINGS * SIDES);
    };
    expect(metalnessOf(1)).toBeLessThan(0.2);
    expect(metalnessOf(2)).toBeGreaterThan(0.8);
    const studio = tube.material.envMap!.image.data as Float32Array;
    expect(studio.some((channel) => channel > 1)).toBe(true);
    renderer.dispose();
  });

  it("makes Acid glow and Spirit fade as it falls", () => {
    const renderer = new GooRenderer3D();
    const parent = new Object3D();
    renderer.initialize(parent);
    const classic = source();
    const acid = source({ sourceId: 2, position: { x: 5, y: 2, z: 3 } });
    acid.params = resolveGoo3D({ ...acid.params, palette: "acid" });
    renderer.update([classic, acid], 1 / 15);
    const tube = parent.children[0] as { geometry: BufferGeometry };
    const internal = internals(renderer);
    const glowOf = (sourceId: number) => {
      const strand = internal.strands.find(
        (candidate) => candidate.active && candidate.sourceId === sourceId
      )!;
      return tube.geometry
        .getAttribute("aGlow")
        .getX(internal.strands.indexOf(strand) * RINGS * SIDES);
    };
    expect(glowOf(1)).toBe(0);
    expect(glowOf(2)).toBeGreaterThan(0.5);
    renderer.clear();

    const sizes = (palette: "classic" | "spirit") => {
      const tip = source();
      tip.params = resolveGoo3D({ ...tip.params, palette, spewStyle: "mist" });
      renderer.clear();
      renderer.update([tip], 1 / 15);
      renderer.update([tip], 1 / 15);
      const drop = internal.drops.find((candidate) => candidate.active)!;
      const start = drop.radius;
      for (let frame = 0; frame < 20; frame++) renderer.update([], 1 / 60);
      return drop.active ? drop.radius / start : 0;
    };
    expect(sizes("classic")).toBeCloseTo(1, 5);
    expect(sizes("spirit")).toBeLessThan(0.8);
    renderer.dispose();
  });

  it("thins the thread as it stretches while keeping the distal bead", () => {
    const renderer = new GooRenderer3D();
    const parent = new Object3D();
    renderer.initialize(parent);
    renderer.update([source()], 1 / 15);
    const internal = internals(renderer);
    const strand = internal.strands.find((candidate) => candidate.active)!;
    const index = internal.strands.indexOf(strand);
    const points = (spacing: number) =>
      [0, 1, 2, 3, 4].map((node) => [spacing * node, 0, 0]);
    shapeStrand(strand, points(0.05), 0.006, 0.015);
    internal.writeStrands();
    const geometry = (parent.children[0] as { geometry: BufferGeometry })
      .geometry;
    const mid = CAP + 2 * SUB;
    const end = CAP + 4 * SUB;
    const shortThread = ringRadius(geometry, mid, index);
    const shortBead = ringRadius(geometry, end, index);
    // Same liquid, twice the length.
    points(0.1).forEach((point, node) => {
      strand.pos.set(point, node * 3);
      strand.prev.set(point, node * 3);
    });
    strand.rest.fill(0.1, 0, 4);
    internal.writeStrands();
    expect(ringRadius(geometry, mid, index)).toBeLessThan(shortThread * 0.8);
    expect(ringRadius(geometry, end, index)).toBeGreaterThan(shortBead * 0.9);
    renderer.dispose();
  });

  it("keeps one attached rope per source with closed ends", () => {
    const renderer = new GooRenderer3D();
    const parent = new Object3D();
    renderer.initialize(parent);
    const tip = source();
    const internal = internals(renderer);
    let observed = false;
    for (let frame = 0; frame < 35; frame++) {
      tip.position.x += 0.012;
      tip.position.z += Math.sin(frame * 0.12) * 0.006;
      renderer.update([tip], 1 / 60);
      const attached = internal.strands.filter(
        (strand) => strand.active && strand.attached
      );
      expect(attached.length).toBeLessThanOrEqual(1);
      if (attached.length) observed = true;
    }
    expect(observed).toBe(true);
    const geometry = (parent.children[0] as { geometry: BufferGeometry })
      .geometry;
    const positions = geometry.getAttribute("position");
    for (const strand of internal.strands) {
      if (!strand.active) continue;
      const base = internal.strands.indexOf(strand) * RINGS * SIDES;
      for (const ring of [0, RINGS - 1]) {
        const first = new Vector3().fromBufferAttribute(
          positions,
          base + ring * SIDES
        );
        for (let side = 1; side < SIDES; side++) {
          const other = new Vector3().fromBufferAttribute(
            positions,
            base + ring * SIDES + side
          );
          expect(other.distanceTo(first)).toBeLessThan(0.00001);
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

  it("hands a pinched bead to a drop where the rope's end was", () => {
    const renderer = new GooRenderer3D();
    const parent = new Object3D();
    renderer.initialize(parent);
    const tip = stillTip();
    const internal = internals(renderer);
    const end = new Vector3();
    let bead = 0;
    let drop: DropView | undefined;
    for (let frame = 0; frame < 120 && !drop; frame++) {
      const rope = internal.strands.find((strand) => strand.active && strand.attached);
      if (rope) {
        end.fromArray(rope.pos, (rope.count - 1) * 3);
        bead = sphereRadius(rope.bulb);
      }
      renderer.update([tip], 1 / 60);
      drop = internal.drops.find((item) => item.active && !item.satellite);
    }
    expect(drop).toBeDefined();
    // The bead and the thread below the pinch become one drop near the old end.
    const root = new Vector3(tip.position.x, tip.position.y, tip.position.z);
    expect(drop!.position.distanceTo(end)).toBeLessThan(
      drop!.position.distanceTo(root) * 0.5
    );
    expect(drop!.radius).toBeGreaterThan(bead * 0.8);
    const tube = parent.children[0] as { visible: boolean };
    expect(tube.visible).toBe(true);
    expect((parent.children[1] as InstancedMesh).count).toBeGreaterThan(0);
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
    expect(positions.length).toBe(STRANDS * RINGS * SIDES * 3);
    expect(renderer.debugCounts().strands).toBeLessThanOrEqual(STRANDS);
    renderer.dispose();
  });

  it("sprays a strong source upward and leaves a still one to drip", () => {
    const rising = (ambientEmission: number) => {
      const renderer = new GooRenderer3D();
      renderer.initialize(new Object3D());
      const tip = source({ velocity: { x: 0, y: 0, z: 0 }, speed: 0 });
      tip.params = resolveGoo3D({ ...tip.params, ambientEmission, motionEmission: 0 });
      let most = 0;
      for (let frame = 0; frame < 60; frame++) {
        renderer.update([tip], 1 / 60);
        most = Math.max(
          most,
          internals(renderer).drops.filter(
            (drop) => drop.active && drop.velocity.y > 1.5
          ).length
        );
      }
      renderer.dispose();
      return most;
    };
    expect(rising(0)).toBe(0);
    expect(rising(0.9)).toBeGreaterThan(3);
  });

  it("keeps a stray spot on a crowded floor", () => {
    const material = new MeshPhysicalMaterial({ vertexColors: true });
    const puddles = new GooPuddleRenderer3D(material);
    const blue = new Color("#2060d0");
    puddles.deposit(3, 0, 0, 0.03, 0, 0.5, blue, 0, 1);
    let seed = 1;
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let frame = 0; frame < 600; frame++) {
      for (let drop = 0; drop < 8; drop++)
        puddles.deposit(
          (random() - 0.5) * 1.2,
          (random() - 0.5) * 1.2,
          0,
          0.01 + 0.03 * random(),
          0,
          0.5,
          blue,
          0,
          1
        );
      puddles.update(1 / 60);
    }
    const pools = (puddles as unknown as { puddles: { x: number; fade: number }[] })
      .puddles;
    expect(pools.some((pool) => pool.x > 2.5 && pool.fade === 1)).toBe(true);
    puddles.dispose();
    material.dispose();
  });
});
