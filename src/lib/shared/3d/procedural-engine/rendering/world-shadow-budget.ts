/**
 * Shadow budget for the procedural world.
 *
 * The sun's shadow pass redraws every caster, so the tier sets how many placed
 * models (campground props and the like) may cast, how big the sun's shadow
 * map is, and whether the vegetation batches join the pass. Terrain never
 * casts: hills shading themselves inside a 50 m shadow frustum is rarely
 * visible and was the biggest share of the shadow pass. Everything still
 * receives shadows, so the avatar and props keep landing on the ground.
 */

import { Mesh, type DirectionalLight, type Object3D } from "three";

import { QualityTier } from "../../effects/types";

export interface WorldShadowBudget {
  /** Whether the sun casts at all. */
  sunShadows: boolean;
  /** Width and height of the sun's shadow map, in texels. */
  mapSize: number;
  /** How many placed models may cast; the rest only receive. */
  maxModelCasters: number;
  /** Whether the instanced vegetation batches cast. */
  vegetationCasts: boolean;
}

export const WORLD_SHADOW_BUDGETS: Record<QualityTier, WorldShadowBudget> = {
  [QualityTier.HIGH]: {
    sunShadows: true,
    mapSize: 1024,
    maxModelCasters: 24,
    vegetationCasts: true,
  },
  [QualityTier.MEDIUM]: {
    sunShadows: true,
    mapSize: 512,
    maxModelCasters: 8,
    vegetationCasts: false,
  },
  [QualityTier.LOW]: {
    sunShadows: false,
    mapSize: 512,
    maxModelCasters: 0,
    vegetationCasts: false,
  },
};

export function getWorldShadowBudget(tier: QualityTier): WorldShadowBudget {
  return WORLD_SHADOW_BUDGETS[tier];
}

/**
 * Marks the first `maxCasters` models (and their meshes) as shadow casters and
 * turns casting off for the rest. Models are placed nearest-first around the
 * spawn clearing, so the earliest ones are the ones the player stands beside.
 * Every mesh keeps receiving shadows. Returns how many models cast.
 */
export function applyModelCasterCap(
  models: readonly Object3D[],
  maxCasters: number
): number {
  let casting = 0;
  for (const model of models) {
    const casts = casting < maxCasters;
    if (casts) casting++;
    model.castShadow = casts;
    model.receiveShadow = true;
    model.traverse((child) => {
      if (child instanceof Mesh) {
        child.castShadow = casts;
        child.receiveShadow = true;
      }
    });
  }
  return casting;
}

/**
 * Applies the budget's sun settings. A map that already exists at another size
 * is released so three.js allocates one at the new size on the next frame.
 */
export function applySunShadowBudget(
  sun: DirectionalLight,
  budget: WorldShadowBudget,
  allowed: boolean
): void {
  sun.castShadow = allowed && budget.sunShadows;
  const shadow = sun.shadow;
  if (shadow.mapSize.width === budget.mapSize && shadow.mapSize.height === budget.mapSize) {
    return;
  }
  shadow.mapSize.set(budget.mapSize, budget.mapSize);
  if (shadow.map) {
    shadow.map.dispose();
    shadow.map = null;
  }
}
