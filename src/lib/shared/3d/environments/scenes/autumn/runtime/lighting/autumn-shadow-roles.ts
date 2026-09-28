/**
 * Which authored Autumn objects take part in the shadow pass.
 *
 * Enabling shadows on a 380K-triangle environment is only affordable if the
 * caster set is deliberate. A caster costs a second depth rasterisation every
 * frame, so the list is limited to things whose silhouette actually lands
 * inside the clearing-sized shadow camera and reads at performance distance:
 * the logs, boulders, ferns and the owl.
 *
 * The near belt and the new middle/far depth groves are excluded on purpose.
 * They begin outside the clearing-sized shadow camera and continue beyond the
 * fog horizon, so casting from them would pay large depth passes for geometry
 * that can never darken a visible performance-space pixel.
 *
 * Grass is excluded from BOTH roles here because the wind pass in
 * createAutumnMaterialRuntime owns those meshes and sets them to receive-only
 * after this pass runs.
 *
 * One consequence of the asset pipeline is worth knowing: the optimizer's
 * GPU-instancing pass collapses every repeated asset (ferns, saplings, the
 * small procedural fungi, birches, snags, the Poly Haven rocks) into unnamed
 * InstancedMesh batches. Those hit the receive-only default rather than the
 * caster list. That is the right outcome anyway - they are small understory and
 * far-belt geometry. Hero B's three hero placements and four saplings collapse
 * into one unnamed InstancedMesh. Casting from that mixed batch produced the
 * disconnected shadow islands found in the walk audit, so it stays receive-only.
 * The individually named Hero A meshes stay receive-only for the same reason:
 * their full crowns project clearing-sized silhouettes that read as unrelated
 * grey ground patches instead of useful contact darkening.
 */

import type { Mesh } from "three";

export interface AutumnShadowRole {
  cast: boolean;
  receive: boolean;
}

const NEITHER: AutumnShadowRole = { cast: false, receive: false };
const RECEIVE_ONLY: AutumnShadowRole = { cast: false, receive: true };
const CAST_AND_RECEIVE: AutumnShadowRole = { cast: true, receive: true };

/** Owned by the Autumn wind pass, or too far out to reach the shadow camera. */
const EXCLUDED_PREFIXES = [
  // Starts beyond the +/-20m shadow camera. Sampling that map on the 1,024m
  // fog apron creates false diagonal seams without receiving any real caster.
  "Autumn_Terrain_Apron",
  "Autumn_Grass_",
  "DistantBirch",
  "DistantLarch",
  "DistantSnag",
  "DistantWillow",
  "MidDepth",
  "FarDepth",
];

/** Ground-ish surfaces that should catch contact darkening but never cast. */
const RECEIVER_PREFIXES = [
  "Autumn_Terrain",
  "Autumn_Depth_Path",
  "Autumn_Cabin_Lane",
  "Autumn_Forest_Trail",
  "Autumn_Shared_Yard",
  "Autumn_Shack_Door_Yard",
  "DistantWoodlandShack",
  "MossPatch",
  "Packed_Performance_Clearing",
  "Pond_Sculpted_Basin",
  "Pond_Floating_Autumn_Leaves",
  "Autumn_Leaf_Drifts",
  "Autumn_Twig_Litter",
];

/** Standing geometry whose silhouette is worth a depth pass. */
const CASTER_PREFIXES = [
  "FallenLog",
  "Fern_",
  "Shore_Boulder",
  "Forest_Boulder",
  "Autumn_Owl",
];

function hasPrefix(name: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => name.startsWith(prefix));
}

/**
 * Resolves the shadow role for one loaded mesh by its authored name.
 *
 * Unknown names receive but do not cast. That is the safe default: a stray
 * object picks up contact darkening from its neighbours without silently
 * adding another full-geometry depth pass.
 */
export function resolveAutumnShadowRole(
  name: string,
  materialNames: readonly string[] = []
): AutumnShadowRole {
  if (!name) return RECEIVE_ONLY;
  if (hasPrefix(name, EXCLUDED_PREFIXES)) return NEITHER;
  if (hasPrefix(name, RECEIVER_PREFIXES)) return RECEIVE_ONLY;
  if (hasPrefix(name, CASTER_PREFIXES)) return CAST_AND_RECEIVE;
  return RECEIVE_ONLY;
}

/** Applies the authored role to one loaded mesh. */
export function configureAutumnShadowMesh(
  mesh: Mesh,
  shadowsOn: boolean
): void {
  const materials = Array.isArray(mesh.material)
    ? mesh.material
    : [mesh.material];
  const role = resolveAutumnShadowRole(
    mesh.name,
    materials.map((material) => material.name)
  );
  mesh.castShadow = shadowsOn && role.cast;
  mesh.receiveShadow = shadowsOn && role.receive;
}
