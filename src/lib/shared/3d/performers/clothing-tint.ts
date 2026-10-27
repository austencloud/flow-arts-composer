/**
 * A tint on each person's clothes, so two people drawn from the same
 * character do not walk about in the same shirt and trousers.
 *
 * The human characters (human-character-roster.ts) draw skin, hair and every
 * garment from one texture atlas and one material, but most split each
 * garment into its own mesh: Ch01_Shirt, Ch01_Pants, Ch07_Suit, Ch41_Coat,
 * Ch42_Shorts. The tint multiplies the colour of those meshes' materials
 * only, never the body, hair or shoes. Three characters (ch12, ch18, ch24)
 * are a single mesh, so their clothes cannot be told from their skin and are
 * left as drawn.
 *
 * The scene package clones every material per performer
 * (cloneSharedSkinnedScene), so a tint on one person never reaches another.
 * A body that does not own its materials must copy them first.
 */

import { Color, type Material, type Mesh, type Object3D } from "three";

/** Garment words in the characters' mesh names. */
const GARMENT =
  /(shirt|pants|trousers|suit|coat|jacket|shorts|skirt|dress|hoodie|sweater)/i;

/** Which garment a mesh is ("shirt", "pants"), or null for skin, hair, shoes. */
export function clothingPart(meshName: string): string | null {
  const match = GARMENT.exec(meshName);
  return match ? match[1]!.toLowerCase() : null;
}

/** FNV-1a, as humanCharacterFor: stable across runs and machines. */
function hash(key: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** How far a garment's colour moves toward its tint hue. */
export const TINT_STRENGTH = { min: 0.18, max: 0.4 } as const;
/** How much lighter or darker a garment gets. */
export const TINT_VALUE = { min: 0.72, max: 1.08 } as const;

/**
 * The colour multiplier for one person's garment: a hue picked from the key,
 * mixed lightly into white, and a lighter or darker shade. Same key and
 * garment, same tint, every time.
 */
export function clothingTint(key: string, part: string): Color {
  const h = hash(`${key}:${part}`);
  const hue = (h & 0x3ff) / 0x400;
  const strength =
    TINT_STRENGTH.min +
    (((h >>> 10) & 0x3ff) / 0x3ff) * (TINT_STRENGTH.max - TINT_STRENGTH.min);
  const value =
    TINT_VALUE.min +
    (((h >>> 20) & 0x3ff) / 0x3ff) * (TINT_VALUE.max - TINT_VALUE.min);
  return new Color(1, 1, 1)
    .lerp(new Color().setHSL(hue, 1, 0.5), strength)
    .multiplyScalar(value);
}

/** Materials already tinted, so a second pass never darkens them twice. */
const tinted = new WeakSet<Material>();

/**
 * Tint the garments of the body under `root` for `key` (a person's id).
 * Returns how many skinned meshes it found, so a caller waiting on a model
 * still loading can try again, and how many garments it tinted.
 */
export function tintClothing(
  root: Object3D,
  key: string
): { skinned: number; garments: number } {
  let skinned = 0;
  let garments = 0;
  root.traverse((node) => {
    const mesh = node as Mesh;
    if (!mesh.isMesh || !(mesh as { isSkinnedMesh?: boolean }).isSkinnedMesh)
      return;
    skinned++;
    const part = clothingPart(mesh.name);
    if (!part) return;
    const tint = clothingTint(key, part);
    const materials = Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material];
    for (const material of materials) {
      const color = (material as Material & { color?: Color }).color;
      if (!color || tinted.has(material)) continue;
      color.multiply(tint);
      tinted.add(material);
      garments++;
    }
  });
  return { skinned, garments };
}
