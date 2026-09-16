import { describe, expect, it } from "vitest";
import { InstancedMesh, Mesh, Scene } from "three";
import { DEFAULT_EFFECTS_CONFIG } from "$lib/shared/effects/domain/defaults";
import {
  resolveAnimal3D,
  resolveInk3D,
  resolvePulse3D,
  resolveSilk3D,
} from "$lib/shared/effects/translators/webgl3d-translator";
import { InkRenderer3D } from "$lib/shared/3d/effects/ink/ink-renderer-3d";
import { SilkRenderer3D } from "$lib/shared/3d/effects/silk/silk-renderer-3d";
import { AnimalRenderer3D } from "$lib/shared/3d/effects/animal/animal-renderer-3d";
import { PulseRenderer3D } from "$lib/shared/3d/effects/pulse/pulse-renderer-3d";
import { TipPositionBridge3D } from "$lib/shared/3d/effects/tip-position-bridge-3d";
import { MUSEUM_EXHIBIT_SEQUENCES } from "$lib/features/museum/data/museum-exhibit-sequences";
import {
  getStartPlacementConfigs,
  sequenceToMotionConfigs,
} from "$lib/shared/3d/services/sequence-converter";
import { calculatePropState } from "$lib/shared/3d/services/prop-state-interpolator";
import { Plane } from "@austencloud/scene-3d";
import type {
  AnimalTipSource3D,
  InkTipSource3D,
  PulseTipSource3D,
  SilkTipSource3D,
} from "$lib/shared/3d/effects/scene-effects/scene-effect-source-3d";

const base = {
  sourceId: 1,
  propIndex: 0 as const,
  tipIndex: 1 as const,
  position: { x: 0, y: 0, z: 0 },
  velocity: { x: 2, y: 0.5, z: 0 },
  speed: Math.hypot(2, 0.5),
  currentStep: 0,
  totalSteps: 16,
  seamlesslyLoopable: false,
  propColor: "#3575e2",
};

function visibleInstances(scene: Scene): number {
  return scene.children.reduce(
    (total, child) =>
      total + (child instanceof InstancedMesh ? child.count : 0),
    0
  );
}

function meshAtRenderOrder(scene: Scene, renderOrder: number): InstancedMesh {
  const mesh = scene.children.find(
    (child): child is InstancedMesh =>
      child instanceof InstancedMesh && child.renderOrder === renderOrder
  );
  if (!mesh)
    throw new Error(`Missing instance pool at render order ${renderOrder}`);
  return mesh;
}

describe("native 3D full-roster renderers", () => {
  it("renders pressure-reactive Ink segments and releases every pool", () => {
    const scene = new Scene();
    const renderer = new InkRenderer3D();
    renderer.initialize(scene);
    const source: InkTipSource3D = {
      ...base,
      position: { ...base.position },
      velocity: { ...base.velocity },
      effect: "ink",
      params: resolveInk3D(DEFAULT_EFFECTS_CONFIG.ink),
    };
    renderer.update([source], 1 / 60);
    source.position.x = 0.2;
    renderer.update([source], 1 / 60);
    expect(visibleInstances(scene)).toBeGreaterThanOrEqual(2);
    renderer.dispose();
    expect(scene.children).toHaveLength(0);
  });

  it("renders Silk as one continuous anisotropic fabric surface", () => {
    const scene = new Scene();
    const renderer = new SilkRenderer3D();
    renderer.initialize(scene);
    const source: SilkTipSource3D = {
      ...base,
      position: { ...base.position },
      velocity: { ...base.velocity },
      effect: "silk",
      params: resolveSilk3D(DEFAULT_EFFECTS_CONFIG.silk),
    };
    renderer.update([source], 1 / 60);
    source.position.x = 0.2;
    renderer.update([source], 1 / 60);
    source.position = { x: 0.4, y: 0.18, z: 0.08 };
    renderer.update([source], 1 / 60);

    const fabric = scene.children.find(
      (child): child is Mesh =>
        child instanceof Mesh && child.renderOrder === 108
    );
    expect(fabric).toBeDefined();
    expect(
      scene.children.filter((child) => child instanceof Mesh)
    ).toHaveLength(1);
    expect(fabric?.geometry.drawRange.count).toBeGreaterThan(12);
    expect(fabric?.geometry.drawRange.count % 6).toBe(0);
    const positions = fabric!.geometry.getAttribute("position");
    const normals = fabric!.geometry.getAttribute("normal");
    for (let vertex = 0; vertex < 6; vertex++) {
      expect(Number.isFinite(positions.getX(vertex))).toBe(true);
      expect(Number.isFinite(positions.getY(vertex))).toBe(true);
      expect(Number.isFinite(positions.getZ(vertex))).toBe(true);
      expect(
        Math.hypot(
          normals.getX(vertex),
          normals.getY(vertex),
          normals.getZ(vertex)
        )
      ).toBeCloseTo(1, 5);
    }
    const headCenter = {
      x: (positions.getX(0) + positions.getX(1)) * 0.5,
      y: (positions.getY(0) + positions.getY(1)) * 0.5,
      z: (positions.getZ(0) + positions.getZ(1)) * 0.5,
    };
    expect(
      Math.hypot(
        headCenter.x - source.position.x,
        headCenter.y - source.position.y,
        headCenter.z - source.position.z
      )
    ).toBeLessThan(0.025);
    renderer.dispose();
    expect(scene.children).toHaveLength(0);
  });

  it("renders a fixed-length Animal chain immediately at the tracked tip", () => {
    const scene = new Scene();
    const renderer = new AnimalRenderer3D();
    renderer.initialize(scene);
    const source: AnimalTipSource3D = {
      ...base,
      position: { ...base.position },
      velocity: { ...base.velocity },
      effect: "animal",
      params: resolveAnimal3D(DEFAULT_EFFECTS_CONFIG.animal),
    };
    renderer.update([source], 1 / 60);
    const body = meshAtRenderOrder(scene, 111);
    const centers = body.geometry.getAttribute("aCenter");
    const scales = body.geometry.getAttribute("aScale");
    expect(visibleInstances(scene)).toBeGreaterThanOrEqual(
      source.params.segmentCount
    );
    expect(centers.getX(0)).toBeCloseTo(source.position.x, 5);
    expect(centers.getY(0)).toBeCloseTo(source.position.y, 5);
    expect(centers.getZ(0)).toBeCloseTo(source.position.z, 5);
    expect(scales.getX(0)).toBeGreaterThan(0.09);
    renderer.dispose();
    expect(scene.children).toHaveLength(0);
  });

  it("keeps Animal's spine and visible head pinned during sub-threshold tip motion", () => {
    const scene = new Scene();
    const renderer = new AnimalRenderer3D();
    renderer.initialize(scene);
    const source: AnimalTipSource3D = {
      ...base,
      position: { ...base.position },
      velocity: { ...base.velocity },
      effect: "animal",
      params: resolveAnimal3D(DEFAULT_EFFECTS_CONFIG.animal),
    };
    renderer.update([source], 1 / 60);

    // Animal retains path points at 2.8 cm intervals, but its live anchor must
    // still follow every frame. This 1 cm move caught the old visible lag.
    source.position.x = 0.01;
    renderer.update([source], 1 / 60);

    const centers = meshAtRenderOrder(scene, 111).geometry.getAttribute(
      "aCenter"
    );
    const headIndex = source.params.segmentCount;
    expect(centers.getX(0)).toBeCloseTo(source.position.x, 5);
    expect(centers.getY(0)).toBeCloseTo(source.position.y, 5);
    expect(centers.getZ(0)).toBeCloseTo(source.position.z, 5);
    expect(centers.getX(headIndex)).toBeCloseTo(source.position.x, 5);
    expect(centers.getY(headIndex)).toBeCloseTo(source.position.y, 5);
    expect(centers.getZ(headIndex)).toBeCloseTo(source.position.z, 5);
    renderer.dispose();
  });

  it("settles a stopped Animal under its endpoint without idle tail jitter", () => {
    const scene = new Scene();
    const renderer = new AnimalRenderer3D();
    renderer.initialize(scene);
    const source: AnimalTipSource3D = {
      ...base,
      position: { ...base.position },
      velocity: { x: 3, y: 0, z: 0 },
      speed: 3,
      effect: "animal",
      params: resolveAnimal3D(DEFAULT_EFFECTS_CONFIG.animal),
    };

    for (let frame = 0; frame < 24; frame++) {
      source.position.x += 0.05;
      renderer.update([source], 1 / 60);
    }
    source.velocity = { x: 0, y: 0, z: 0 };
    source.speed = 0;
    for (let frame = 0; frame < 120; frame++) {
      renderer.update([source], 1 / 60);
    }

    const centers = meshAtRenderOrder(scene, 111).geometry.getAttribute(
      "aCenter"
    );
    const tailIndex = source.params.segmentCount - 1;
    expect(centers.getX(tailIndex)).toBeCloseTo(source.position.x, 2);
    expect(centers.getZ(tailIndex)).toBeCloseTo(source.position.z, 2);
    expect(centers.getY(tailIndex)).toBeLessThan(
      source.position.y - source.params.bodyLengthWorld * 0.98
    );

    const settledTail = [
      centers.getX(tailIndex),
      centers.getY(tailIndex),
      centers.getZ(tailIndex),
    ];
    renderer.update([source], 1 / 60);
    const idleMovement = Math.hypot(
      centers.getX(tailIndex) - settledTail[0]!,
      centers.getY(tailIndex) - settledTail[1]!,
      centers.getZ(tailIndex) - settledTail[2]!
    );
    expect(idleMovement).toBeLessThan(0.001);
    renderer.dispose();
  });

  it("resets Animal history on a non-looping restart instead of bridging across the stage", () => {
    const scene = new Scene();
    const renderer = new AnimalRenderer3D();
    renderer.initialize(scene);
    const source: AnimalTipSource3D = {
      ...base,
      currentStep: 7,
      position: { ...base.position },
      velocity: { ...base.velocity },
      effect: "animal",
      params: resolveAnimal3D(DEFAULT_EFFECTS_CONFIG.animal),
    };
    renderer.update([source], 1 / 60);
    source.currentStep = 0;
    source.position.x = 10;
    // The bridge reports the teleport as a huge finite-difference velocity.
    // Loop reset must ignore that vector when it seeds the new body.
    source.velocity = { x: 120, y: 0, z: 0 };
    source.speed = 120;
    renderer.update([source], 1 / 60);

    const centers = meshAtRenderOrder(scene, 111).geometry.getAttribute(
      "aCenter"
    );
    expect(centers.getX(0)).toBeCloseTo(10, 5);
    for (let segment = 0; segment < source.params.segmentCount; segment++) {
      expect(centers.getX(segment)).toBeGreaterThan(6);
    }
    expect(centers.getY(source.params.segmentCount - 1)).toBeLessThan(-1);
    renderer.dispose();
  });

  it("keeps Animal body history through a seamless LOOP seam", () => {
    const scene = new Scene();
    const renderer = new AnimalRenderer3D();
    renderer.initialize(scene);
    const source: AnimalTipSource3D = {
      ...base,
      currentStep: 14,
      seamlesslyLoopable: true,
      position: { ...base.position },
      velocity: { x: 1.8, y: 0, z: 0 },
      speed: 1.8,
      effect: "animal",
      params: resolveAnimal3D(DEFAULT_EFFECTS_CONFIG.animal),
    };

    for (let frame = 0; frame < 120; frame++) {
      source.position.x += 0.03;
      source.currentStep = 14 + (frame / 120) * 1.9;
      renderer.update([source], 1 / 60);
    }
    source.position.x += 0.03;
    source.currentStep = 0.1;
    renderer.update([source], 1 / 60);

    const centers = meshAtRenderOrder(scene, 111).geometry.getAttribute(
      "aCenter"
    );
    const tailIndex = source.params.segmentCount - 1;
    expect(centers.getX(0) - centers.getX(tailIndex)).toBeGreaterThan(0.5);
    expect(centers.getY(tailIndex)).toBeGreaterThan(-0.5);
    renderer.dispose();
  });

  it("keeps Animal's tail bounded through the gallery B turn", () => {
    const scene = new Scene();
    const renderer = new AnimalRenderer3D();
    const bridge = new TipPositionBridge3D();
    const sequence = MUSEUM_EXHIBIT_SEQUENCES["gallery-practice-seq"]!;
    const start = getStartPlacementConfigs(sequence, Plane.WALL)!;
    const steps = [start, ...sequenceToMotionConfigs(sequence, Plane.WALL)];
    const source: AnimalTipSource3D = {
      ...base,
      position: { x: 0, y: 0, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
      speed: 0,
      effect: "animal",
      params: resolveAnimal3D(DEFAULT_EFFECTS_CONFIG.animal),
    };
    renderer.initialize(scene);

    let previousTail: [number, number, number] | null = null;
    let maxTailMovement = 0;
    for (let stepIndex = 0; stepIndex <= 2; stepIndex++) {
      const config = steps[stepIndex]!.left!;
      for (let frame = 0; frame <= 60; frame++) {
        const progress = frame / 60;
        const propState = calculatePropState(config, progress);
        const tip = bridge.update(
          0,
          propState,
          propState.worldPosition,
          0.5,
          1 / 60
        ).tips[1]!;
        source.position = { ...tip.position };
        source.velocity = { ...tip.velocity };
        source.speed = tip.speed;
        source.currentStep = stepIndex + progress;
        renderer.update([source], 1 / 60);

        const centers = meshAtRenderOrder(scene, 111).geometry.getAttribute(
          "aCenter"
        );
        const tailIndex = source.params.segmentCount - 1;
        const tail: [number, number, number] = [
          centers.getX(tailIndex),
          centers.getY(tailIndex),
          centers.getZ(tailIndex),
        ];
        if (stepIndex === 2 && previousTail) {
          const movement = Math.hypot(
            tail[0] - previousTail[0],
            tail[1] - previousTail[1],
            tail[2] - previousTail[2]
          );
          maxTailMovement = Math.max(maxTailMovement, movement);
        }
        previousTail = tail;
      }
    }

    expect(maxTailMovement).toBeLessThan(0.2);
    renderer.dispose();
  });

  it("gives dragon and caterpillar distinct instanced anatomy", () => {
    const ornamentCounts = new Map<string, number>();
    for (const creature of ["snake", "dragon", "caterpillar"] as const) {
      const scene = new Scene();
      const renderer = new AnimalRenderer3D();
      renderer.initialize(scene);
      const source: AnimalTipSource3D = {
        ...base,
        position: { ...base.position },
        velocity: { ...base.velocity },
        effect: "animal",
        params: resolveAnimal3D({
          ...DEFAULT_EFFECTS_CONFIG.animal,
          creature,
        }),
      };
      renderer.update([source], 1 / 60);
      ornamentCounts.set(creature, meshAtRenderOrder(scene, 113).count);
      renderer.dispose();
    }

    expect(ornamentCounts.get("snake")).toBe(0);
    expect(ornamentCounts.get("dragon")).toBeGreaterThan(0);
    expect(ornamentCounts.get("caterpillar")).toBeGreaterThan(
      ornamentCounts.get("dragon") ?? 0
    );
  });

  it("renders one Pulse on the first eligible beat and does not retrigger it each frame", () => {
    const scene = new Scene();
    const renderer = new PulseRenderer3D();
    renderer.initialize(scene);
    const source: PulseTipSource3D = {
      ...base,
      position: { ...base.position },
      velocity: { ...base.velocity },
      effect: "pulse",
      params: resolvePulse3D({
        ...DEFAULT_EFFECTS_CONFIG.pulse,
        harmonics: 0,
      }),
    };
    renderer.update([source], 1 / 60);
    const firstCount = visibleInstances(scene);
    renderer.update([source], 1 / 60);
    expect(firstCount).toBeGreaterThan(0);
    expect(visibleInstances(scene)).toBe(firstCount);
    renderer.dispose();
    expect(scene.children).toHaveLength(0);
  });
});
