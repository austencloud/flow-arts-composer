import type { Material, Mesh, Object3D } from "three";

/**
 * Repairs skinned-character materials left in the scene package's fade render
 * state after the fade has finished.
 *
 * Copied from the Flow Fest sim (flow-fest-avatar-material-repair.ts), which
 * found and named the fault; it lives here so other crowds can use it without
 * importing the sim.
 *
 * `Avatar3D` fades a model by setting `transparent = true` and
 * `depthWrite = false`, then restores an "authored" snapshot it captured the
 * first time it saw each material. When a second instance of the same
 * character clones its materials from a source that was captured mid-fade,
 * that snapshot records the fade state as authored and the model never
 * returns to opaque: the pelvis and thighs sort behind the shirt and vanish.
 *
 * The signature is unambiguous. `GLTFLoader` marks `alphaMode: "BLEND"`
 * materials `transparent` but never clears `depthWrite`, so a fully opaque
 * material that is both transparent and non-depth-writing can only be a fade
 * leftover. Materials that are still fading (opacity below 1) and materials
 * hidden at opacity 0 (hair and eyelash cards) are left alone.
 */
export function isFadeLeftoverMaterial(material: Material): boolean {
  return material.opacity >= 1 && material.transparent && !material.depthWrite;
}

/** Restores every fade-leftover material under `root`; returns the count. */
export function repairFadeLeftoverMaterials(root: Object3D): number {
  let repaired = 0;
  root.traverse((node) => {
    const mesh = node as Mesh;
    if (!mesh.isMesh) return;
    const materials = Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material];
    for (const material of materials) {
      if (!material || !isFadeLeftoverMaterial(material)) continue;
      material.transparent = false;
      material.depthWrite = true;
      material.needsUpdate = true;
      repaired += 1;
    }
  });
  return repaired;
}
