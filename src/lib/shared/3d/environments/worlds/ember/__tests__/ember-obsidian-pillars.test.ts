import { describe, expect, it } from "vitest";
import {
  CylinderGeometry,
  Group,
  Matrix4,
  Mesh,
  ShaderMaterial,
  Vector3,
  type InstancedMesh,
} from "three";
import { createDefaultEmberConfig } from "../../../domain/models/scene-configs/ember-scene-config";
import type { ObsidianPillarsConfig } from "../../../domain/models/scene-configs";
import { createObsidianPillarField } from "../ember-obsidian-pillars";
import { EMBER_PILLAR_FRAGMENT_SHADER } from "../ember-shaders";

function pillarConfig(): ObsidianPillarsConfig {
  const config = createDefaultEmberConfig().obsidianPillars;
  return {
    ...config,
    enabled: true,
    // Low floor so some pillars stay under the shard threshold.
    heightRange: [1.0, 6.0],
    // A corridor through ring 0's first pillar, so keep-out filtering is part
    // of what the seed check covers.
    keepOut: [
      {
        points: [
          [8, -2],
          [8, 2],
        ],
        radius: 1.5,
      },
    ],
  };
}

/** The seeds the old per-pillar materials carried in `uSeed`. */
function oldSeeds(config: ObsidianPillarsConfig): number[] {
  const seeds: number[] = [];
  config.rings.forEach((ring, ringIndex) => {
    for (let i = 0; i < ring.count; i++) {
      const angle = (i / ring.count) * Math.PI * 2 + ringIndex * 0.6;
      const seed = ringIndex * 100 + i;
      const radius = ring.radius + Math.sin(seed * 3.7) * ring.radiusJitter;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const blocked = config.keepOut?.some((corridor) => {
        const [a, b] = [corridor.points[0]!, corridor.points[1]!];
        const dx = b[0] - a[0];
        const dz = b[1] - a[1];
        const t = Math.max(
          0,
          Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz))
        );
        return (
          Math.hypot(x - (a[0] + dx * t), z - (a[1] + dz * t)) < corridor.radius
        );
      });
      if (!blocked) seeds.push(seed);
    }
  });
  return seeds;
}

function seedsOf(mesh: InstancedMesh | null): number[] {
  return Array.from(mesh!.geometry.getAttribute("aSeed").array);
}

describe("obsidian pillar instancing", () => {
  const config = pillarConfig();
  const field = createObsidianPillarField(config)!;
  const expected = oldSeeds(config);
  const tall = field.placements
    .filter((p) => p.height > 2.5)
    .map((p) => p.seed);

  it("keeps one instance per pillar and the keep-out gate", () => {
    const total = config.rings.reduce((sum, ring) => sum + ring.count, 0);
    expect(expected.length).toBeLessThan(total);
    expect(field.meshes.shaft!.count).toBe(expected.length);
    expect(field.meshes.tip!.count).toBe(expected.length);
    expect(field.meshes.shard!.count).toBe(tall.length);
    expect(field.meshes.shardTip!.count).toBe(tall.length);
    expect(tall.length).toBeGreaterThan(0);
    expect(tall.length).toBeLessThan(expected.length);
  });

  it("carries the old per-pillar seeds as an instance attribute", () => {
    expect(seedsOf(field.meshes.shaft)).toEqual(expected);
    expect(seedsOf(field.meshes.tip)).toEqual(expected);
    expect(seedsOf(field.meshes.shard)).toEqual(tall);
    expect(seedsOf(field.meshes.shardTip)).toEqual(tall);
    expect(EMBER_PILLAR_FRAGMENT_SHADER).not.toContain("uSeed");
  });

  it("shares one material across every pillar part", () => {
    const materials = new Set<unknown>();
    field.object.traverse((node) => {
      if ((node as Mesh).isMesh) materials.add((node as Mesh).material);
    });
    expect(materials.size).toBe(1);
    expect([...materials][0]).toBe(field.material);
  });

  it("places shard vertices where the old per-pillar mesh did", () => {
    const placement = field.placements.find((p) => p.height > 2.5)!;
    const index = tall.indexOf(placement.seed);
    const shardHeight = placement.height * 0.45;

    // Rebuild the old scene graph for this one shard.
    const group = new Group();
    group.position.set(placement.x, 0, placement.z);
    group.rotation.y = placement.rotY;
    group.scale.setScalar(placement.scale);
    const oldGeometry = new CylinderGeometry(0.12, 0.18, shardHeight, 4, 1);
    const shard = new Mesh(oldGeometry, new ShaderMaterial());
    shard.position.set(0.3, shardHeight / 2, 0.15);
    shard.rotation.set(0.15, 0, -0.25);
    group.add(shard);
    group.updateMatrixWorld(true);

    const instance = new Matrix4();
    field.meshes.shard!.getMatrixAt(index, instance);
    const unit = field.meshes.shard!.geometry.getAttribute("position");
    const old = oldGeometry.getAttribute("position");
    for (let v = 0; v < old.count; v++) {
      const before = new Vector3()
        .fromBufferAttribute(old, v)
        .applyMatrix4(shard.matrixWorld);
      const after = new Vector3()
        .fromBufferAttribute(unit, v)
        .applyMatrix4(instance);
      expect(after.distanceTo(before)).toBeLessThan(1e-5);
    }
  });

  it("disposes the shared material once", () => {
    let disposed = 0;
    field.material.addEventListener("dispose", () => disposed++);
    field.dispose();
    expect(disposed).toBe(1);
    expect(field.object.children).toHaveLength(0);
  });

  it("builds nothing when disabled", () => {
    expect(createObsidianPillarField({ ...config, enabled: false })).toBeNull();
  });
});
