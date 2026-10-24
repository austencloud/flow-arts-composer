/**
 * Who the jam's people are: which body each one wears, which prop the layout's
 * prop family becomes in the shared performer, the routines they spin, and
 * the glow a fire throws on the grass.
 */

import {
  AdditiveBlending,
  Color,
  Float32BufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  RingGeometry,
} from "three";
import type { PropBuild } from "@austencloud/scene-3d";
import type { JamPropFamily } from "#lib/features/flow-fest-sim/domain/flow-fest-jam-layout.js";
import { buildForEffect } from "#lib/shared/3d/domain/build-for-effect.js";
import type { CharacterId } from "#lib/shared/3d/domain/character-model.js";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import {
  generateFlowFestPerformerPool,
  type FlowFestPerformerSequencePool,
} from "../flow-fest-sim/flow-fest-performer-sequences";

let sequencePool: Promise<FlowFestPerformerSequencePool> | null = null;

/**
 * The six LOOPs the jam's performers spin, generated once. The generator is
 * the slowest thing the loading screen waits for, so the scene starts it on
 * mount, before the set is even built; the people component picks up the
 * same promise. A failure is forgotten so the next visit tries again.
 */
export function jamSequencePool(): Promise<FlowFestPerformerSequencePool> {
  sequencePool ??= generateFlowFestPerformerPool({ count: 6 }).catch(
    (error: unknown) => {
      sequencePool = null;
      throw error;
    }
  );
  return sequencePool;
}

/** Human bodies only; the animal and novelty avatars stay out of a fire jam. */
export const JAM_HUMAN_AVATARS = [
  "ch01",
  "ch07",
  "ch12",
  "ch18",
  "ch21",
  "ch22",
  "ch24",
  "ch41",
  "ch42",
] as const satisfies readonly CharacterId[];

export function jamAvatarFor(id: string): CharacterId {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++)
    h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return JAM_HUMAN_AVATARS[(h >>> 0) % JAM_HUMAN_AVATARS.length]!;
}

/**
 * The shared performer has no dragon staff or rope dart yet. A dragon staff
 * spins like a long staff with weight at the ends and a rope dart swings like
 * a single poi, so those are the stand-ins.
 */
export function jamPropType(family: JamPropFamily, juggler: boolean): PropType {
  if (juggler) return PropType.CLUB;
  switch (family) {
    case "poi":
    case "rope-dart":
      return PropType.POI;
    case "staff":
      return PropType.STAFF;
    case "dragon-staff":
      return PropType.BIGSTAFF;
    case "hoop":
      return PropType.BIGHOOP;
    case "fans":
      return PropType.FAN;
    case "double-staff":
      return PropType.FIRE_DOUBLE_STAFF;
    case "clubs":
      return PropType.CLUB;
  }
}

export interface JamFireProp {
  propType: PropType;
  /** Build fields over the scene default, or null to keep it. */
  propBuild: Partial<PropBuild> | null;
  /** False when there is no fire model for the family: it stays unlit. */
  burns: boolean;
}

/** Fire models: what `buildForEffect` swaps a family to for fire. */
const FIRE_MODELS: ReadonlySet<PropType> = new Set([
  PropType.FIRE_DOUBLE_STAFF,
  PropType.TORCH,
  PropType.BIGTORCH,
]);

/**
 * What a fire performer holds: the fire model for their family, so fire comes
 * off real wicks and never off a plain prop. `buildForEffect` owns the swaps
 * (a staff becomes the fire double staff, clubs become torches, a fan becomes
 * the five-wick fire fan).
 *
 * Gaps, until the catalog has the models: a dragon staff has no fire model of
 * its own and holds the fire double staff, the closest one; a hoop has none
 * and stays unlit. Poi and rope dart keep today's poi.
 */
export function jamFireProp(
  family: JamPropFamily,
  juggler: boolean,
  current: PropBuild
): JamFireProp {
  if (!juggler && (family === "poi" || family === "rope-dart")) {
    return { propType: PropType.POI, propBuild: null, burns: true };
  }
  if (!juggler && family === "dragon-staff") {
    return {
      propType: PropType.FIRE_DOUBLE_STAFF,
      propBuild: null,
      burns: true,
    };
  }
  const base = jamPropType(family, juggler);
  const equip = buildForEffect(base, "fire", current);
  const propType = equip?.prop ?? base;
  const propBuild = equip?.propBuild ?? null;
  const fireFan =
    (propBuild?.fanBuild ?? current.fanBuild) === "fire" &&
    (base === PropType.FAN || base === PropType.BIGFAN);
  return { propType, propBuild, burns: FIRE_MODELS.has(propType) || fireFan };
}

/** Layout yaw (0 faces +x, toward +z) to an avatar facing angle (0 faces +z). */
export function facingFromYaw(yaw: number): number {
  return Math.PI / 2 - yaw;
}

/** Facing toward a point, avatar convention. */
export function facingToward(
  from: { x: number; z: number },
  to: { x: number; z: number }
): number {
  return Math.atan2(to.x - from.x, to.z - from.z);
}

export function turnToward(
  current: number,
  target: number,
  maxStep: number
): number {
  let d = target - current;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return current + Math.sign(d) * Math.min(Math.abs(d), maxStep);
}

/**
 * The light a fire prop throws on the grass round its spinner: an additive
 * disk, bright under the spinner and gone by its edge. With a handful of real
 * point lights on the nearest fires, this is how every other fire still
 * lights the ground.
 */
export function buildFireGroundGlow(capacity: number): {
  mesh: InstancedMesh;
  matrix: Matrix4;
} {
  // Rings rather than a fan, so the falloff curve survives interpolation.
  const geometry = new RingGeometry(0.0001, 1, 28, 8);
  geometry.rotateX(-Math.PI / 2);
  // Radial falloff baked into vertex colour: white at the centre, black at the rim.
  const position = geometry.getAttribute("position");
  const colours = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i++) {
    const r = Math.hypot(position.getX(i), position.getZ(i));
    const v = Math.pow(Math.max(0, 1 - r), 2.2);
    colours.set([v, v, v], i * 3);
  }
  geometry.setAttribute("color", new Float32BufferAttribute(colours, 3));
  const material = new MeshBasicMaterial({
    color: new Color(1.0, 0.45, 0.14),
    vertexColors: true,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
    fog: false,
  });
  const mesh = new InstancedMesh(geometry, material, Math.max(1, capacity));
  mesh.name = "FFJ_FireGroundGlow";
  mesh.count = 0;
  mesh.frustumCulled = false;
  mesh.renderOrder = 3;
  return { mesh, matrix: new Matrix4() };
}
