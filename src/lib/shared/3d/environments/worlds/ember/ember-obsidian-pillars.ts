import {
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Euler,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Quaternion,
  ShaderMaterial,
  Vector3,
  type BufferGeometry,
} from "three";
import type { ObsidianPillarsConfig } from "../../domain/models/scene-configs";
import {
  EMBER_PILLAR_FRAGMENT_SHADER,
  EMBER_PILLAR_VERTEX_SHADER,
} from "./ember-shaders";

/**
 * One obsidian pillar as the ring layout places it. `seed` is what the vein
 * shader hashes, so it has to stay `ringIndex * 100 + index` or every pillar's
 * vein pattern changes.
 */
export interface ObsidianPillarPlacement {
  seed: number;
  x: number;
  z: number;
  scale: number;
  rotY: number;
  height: number;
}

/**
 * Distance from a point to a polyline, in the pillar group's local XZ.
 * A ring is generated from an angle alone, so without this a pillar can land
 * squarely in a corridor the visitor walks down.
 */
function distanceToPolyline(
  x: number,
  z: number,
  points: readonly [number, number][]
): number {
  if (points.length === 0) return Infinity;
  if (points.length === 1) {
    return Math.hypot(x - points[0]![0], z - points[0]![1]);
  }
  let best = Infinity;
  for (let index = 0; index < points.length - 1; index += 1) {
    const [ax, az] = points[index]!;
    const [bx, bz] = points[index + 1]!;
    const dx = bx - ax;
    const dz = bz - az;
    const lengthSq = dx * dx + dz * dz;
    const t =
      lengthSq < 1e-9
        ? 0
        : Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / lengthSq));
    best = Math.min(best, Math.hypot(x - (ax + dx * t), z - (az + dz * t)));
  }
  return best;
}

export function planObsidianPillars(
  config: ObsidianPillarsConfig
): ObsidianPillarPlacement[] {
  if (!config.enabled) return [];
  const placements: ObsidianPillarPlacement[] = [];
  for (const [ringIndex, ring] of config.rings.entries()) {
    for (let index = 0; index < ring.count; index += 1) {
      const angle = (index / ring.count) * Math.PI * 2 + ringIndex * 0.6;
      const seed = ringIndex * 100 + index;
      const radius = ring.radius + Math.sin(seed * 3.7) * ring.radiusJitter;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const blocked = config.keepOut?.some(
        (corridor) =>
          distanceToPolyline(x, z, corridor.points) < corridor.radius
      );
      if (blocked) continue;
      placements.push({
        seed,
        x,
        z,
        scale:
          ring.scaleBase + Math.abs(Math.sin(seed * 2.3) * ring.scaleVariation),
        rotY: angle + Math.sin(seed * 1.7) * 0.5,
        height:
          config.heightRange[0] +
          Math.abs(Math.sin(seed * 1.9)) *
            (config.heightRange[1] - config.heightRange[0]),
      });
    }
  }
  return placements;
}

/** Pillars taller than this grow a secondary shard from the base. */
const SHARD_MIN_HEIGHT = 2.5;
const SHARD_ROTATION = new Euler(0.15, 0, -0.25);
const NO_ROTATION = new Euler(0, 0, 0);

/**
 * One part of a pillar, expressed against a unit-height geometry. `length` is
 * the height the old per-pillar geometry was built at; it rides in the
 * instance matrix as a Y scale and in `aLength` so the shader still sees the
 * old geometry-local position.
 */
interface PillarPart {
  length: number;
  offset: [number, number, number];
  rotation: Euler;
}

type PartKind = "shaft" | "tip" | "shard" | "shardTip";

function partsFor(height: number): Partial<Record<PartKind, PillarPart>> {
  const tipHeight = height * 0.3;
  const parts: Partial<Record<PartKind, PillarPart>> = {
    shaft: {
      length: height,
      offset: [0, height / 2, 0],
      rotation: NO_ROTATION,
    },
    tip: {
      length: tipHeight,
      offset: [0, height + tipHeight / 2 - 0.05, 0],
      rotation: NO_ROTATION,
    },
  };
  if (height > SHARD_MIN_HEIGHT) {
    const shardHeight = height * 0.45;
    parts.shard = {
      length: shardHeight,
      offset: [0.3, shardHeight / 2, 0.15],
      rotation: SHARD_ROTATION,
    };
    parts.shardTip = {
      length: shardHeight * 0.25,
      offset: [0.3, shardHeight + shardHeight * 0.125 - 0.03, 0.15],
      rotation: SHARD_ROTATION,
    };
  }
  return parts;
}

function unitGeometry(kind: PartKind): BufferGeometry {
  switch (kind) {
    case "shaft":
      return new CylinderGeometry(0.25, 0.35, 1, 5, 1);
    case "tip":
      return new ConeGeometry(0.28, 1, 5);
    case "shard":
      return new CylinderGeometry(0.12, 0.18, 1, 4, 1);
    case "shardTip":
      return new ConeGeometry(0.14, 1, 4);
  }
}

const PART_KINDS: PartKind[] = ["shaft", "tip", "shard", "shardTip"];

export interface ObsidianPillarField {
  /** Holds one InstancedMesh per part kind; position it at ground level. */
  object: Group;
  /** The one material every pillar part shares. */
  material: ShaderMaterial;
  meshes: Record<PartKind, InstancedMesh | null>;
  placements: ObsidianPillarPlacement[];
  update(deltaSeconds: number): void;
  dispose(): void;
}

/**
 * The obsidian pillar ring as one InstancedMesh per part (shaft, tip, shard,
 * shard tip) over a single shared ShaderMaterial. Each pillar's vein seed is
 * an `aSeed` instance attribute in place of the old per-pillar `uSeed`.
 */
export function createObsidianPillarField(
  config: ObsidianPillarsConfig
): ObsidianPillarField | null {
  const placements = planObsidianPillars(config);
  if (placements.length === 0) return null;

  const material = new ShaderMaterial({
    side: DoubleSide,
    uniforms: {
      uBaseColor: { value: new Color(config.baseColor) },
      uVeinColor: { value: new Color(config.veinColor) },
      uVeinIntensity: { value: config.veinIntensity },
      uTime: { value: 0 },
      uPulseSpeed: { value: config.pulseSpeed },
      uPulseColor: { value: new Color(config.pulseColor) },
    },
    vertexShader: EMBER_PILLAR_VERTEX_SHADER,
    fragmentShader: EMBER_PILLAR_FRAGMENT_SHADER,
  });

  const root = new Group();
  root.name = "EmberObsidianPillars";

  const pillarMatrix = new Matrix4();
  const partMatrix = new Matrix4();
  const position = new Vector3();
  const rotation = new Quaternion();
  const scale = new Vector3();
  const yAxis = new Euler();

  const meshes = {} as Record<PartKind, InstancedMesh | null>;
  for (const kind of PART_KINDS) {
    const instances = placements
      .map((placement) => ({
        placement,
        part: partsFor(placement.height)[kind],
      }))
      .filter(
        (
          entry
        ): entry is { placement: ObsidianPillarPlacement; part: PillarPart } =>
          entry.part !== undefined
      );
    if (instances.length === 0) {
      meshes[kind] = null;
      continue;
    }
    const geometry = unitGeometry(kind);
    const seeds = new Float32Array(instances.length);
    const lengths = new Float32Array(instances.length);
    const mesh = new InstancedMesh(geometry, material, instances.length);
    mesh.name = `EmberObsidianPillar-${kind}`;
    for (const [index, { placement, part }] of instances.entries()) {
      position.set(placement.x, 0, placement.z);
      yAxis.set(0, placement.rotY, 0);
      rotation.setFromEuler(yAxis);
      scale.setScalar(placement.scale);
      pillarMatrix.compose(position, rotation, scale);
      position.set(...part.offset);
      rotation.setFromEuler(part.rotation);
      scale.set(1, part.length, 1);
      partMatrix.compose(position, rotation, scale);
      mesh.setMatrixAt(index, pillarMatrix.multiply(partMatrix));
      seeds[index] = placement.seed;
      lengths[index] = part.length;
    }
    geometry.setAttribute("aSeed", new InstancedBufferAttribute(seeds, 1));
    geometry.setAttribute("aLength", new InstancedBufferAttribute(lengths, 1));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    root.add(mesh);
    meshes[kind] = mesh;
  }

  return {
    object: root,
    material,
    meshes,
    placements,
    update(deltaSeconds) {
      material.uniforms.uTime!.value += deltaSeconds;
    },
    dispose() {
      for (const mesh of Object.values(meshes)) {
        if (!mesh) continue;
        mesh.geometry.dispose();
        mesh.dispose();
      }
      material.dispose();
      root.clear();
    },
  };
}
