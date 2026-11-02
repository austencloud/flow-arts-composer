import { Color, type Material, type Mesh, type Object3D } from "three";
import {
  derivePropHandPalette,
  propHandPalette,
  type PropHand,
  type PropHandPalette,
} from "@austencloud/scene-3d/prop-hand-palette";

/**
 * One performer's prop colors, left hand then right, as hex strings.
 *
 * Props are painted per hand, and the hand palettes are global: every
 * performer's left prop wears the same blue. A cast whose performers each
 * have their own colors (the tunnel page's 3D stage) needs one performer's
 * props in its own pair without touching anyone else's. The shared materials
 * cannot be repainted for that, so this swaps each tinted mesh onto a clone
 * painted in the performer's colors and puts the original back when the
 * colors go away.
 */
export interface PerformerPropColors {
  left: string;
  right: string;
}

/** The prop groups PerformerRig mounts under each hand anchor. */
const HAND_GROUPS: ReadonlyArray<{ name: string; hand: PropHand }> = [
  { name: "PERFORMER_PROP_LEFT", hand: "blue" },
  { name: "PERFORMER_PROP_RIGHT", hand: "red" },
];

type PaintChannel = "color" | "emissive";
type PaintableMaterial = Material & {
  color?: Color;
  emissive?: Color;
};

interface TintEntry {
  key: string;
  /** Null when the material wears no hand paint and is left as it is. */
  clone: Material | null;
}

const PALETTE_KEYS = ["main", "dark", "light"] as const;

function paletteKey(palette: PropHandPalette): string {
  return `${palette.main}|${palette.dark}|${palette.light}`;
}

/**
 * Map each hand paint the material wears to the same paint in the target
 * palette. Colors are compared after the same sRGB conversion three applies
 * to the authored hex, so an exact paint matches exactly and a blend of two
 * paints (a rim between main and dark) is left in the hand's own color.
 */
function remapChannel(
  color: Color | undefined,
  from: PropHandPalette,
  to: PropHandPalette
): string | null {
  if (!color) return null;
  const hex = color.getHex();
  for (const key of PALETTE_KEYS) {
    if (new Color(from[key]).getHex() === hex) return to[key];
  }
  return null;
}

export function tintedPropMaterial(
  material: Material,
  from: PropHandPalette,
  to: PropHandPalette
): Material | null {
  const paintable = material as PaintableMaterial;
  const remaps: Array<[PaintChannel, string]> = [];
  for (const channel of ["color", "emissive"] as const) {
    const next = remapChannel(paintable[channel], from, to);
    if (next) remaps.push([channel, next]);
  }
  if (remaps.length === 0) return null;
  const clone = material.clone() as PaintableMaterial;
  for (const [channel, hex] of remaps) clone[channel]?.set(hex);
  return clone;
}

export interface PerformerPropTint {
  /** Paint this performer's props, or restore the shared paint with null. */
  apply(root: Object3D, colors: PerformerPropColors | null): void;
  dispose(): void;
}

export function createPerformerPropTint(): PerformerPropTint {
  const entries = new Map<Material, TintEntry>();
  const originalOf = new Map<Material, Material>();
  let tintedMeshes = new Set<Mesh>();
  const groups = new Map<string, Object3D>();

  function handGroup(root: Object3D, name: string): Object3D | undefined {
    const cached = groups.get(name);
    if (cached && isDescendant(cached, root)) return cached;
    const found = root.getObjectByName(name);
    if (found) groups.set(name, found);
    else groups.delete(name);
    return found;
  }

  function desiredMaterial(
    original: Material,
    from: PropHandPalette,
    to: PropHandPalette,
    key: string
  ): Material {
    let entry = entries.get(original);
    if (!entry || entry.key !== key) {
      if (entry?.clone) {
        originalOf.delete(entry.clone);
        entry.clone.dispose();
      }
      const clone = tintedPropMaterial(original, from, to);
      entry = { key, clone };
      entries.set(original, entry);
      if (clone) originalOf.set(clone, original);
    }
    return entry.clone ?? original;
  }

  function swap(mesh: Mesh, pick: (material: Material) => Material): void {
    const current = mesh.material;
    if (Array.isArray(current)) {
      let changed = false;
      const next = current.map((material) => {
        const chosen = pick(material);
        if (chosen !== material) changed = true;
        return chosen;
      });
      if (changed) mesh.material = next;
    } else if (current) {
      const chosen = pick(current);
      if (chosen !== current) mesh.material = chosen;
    }
  }

  function restoreAll(): void {
    for (const mesh of tintedMeshes) {
      swap(mesh, (material) => originalOf.get(material) ?? material);
    }
    tintedMeshes.clear();
  }

  return {
    apply(root, colors) {
      if (!colors) {
        restoreAll();
        return;
      }
      // Only meshes still on stage need restoring later, so the set is
      // rebuilt each pass and a prop swapped out of the rig is let go.
      const seen = new Set<Mesh>();
      for (const { name, hand } of HAND_GROUPS) {
        const group = handGroup(root, name);
        if (!group) continue;
        const from = propHandPalette(hand);
        const to = derivePropHandPalette(
          hand === "blue" ? colors.left : colors.right
        );
        const key = `${paletteKey(from)}>${paletteKey(to)}`;
        group.traverse((object) => {
          const mesh = object as Mesh;
          if (!mesh.isMesh) return;
          swap(mesh, (material) =>
            desiredMaterial(
              originalOf.get(material) ?? material,
              from,
              to,
              key
            )
          );
          seen.add(mesh);
        });
      }
      tintedMeshes = seen;
    },
    dispose() {
      restoreAll();
      for (const entry of entries.values()) entry.clone?.dispose();
      entries.clear();
      originalOf.clear();
      groups.clear();
    },
  };
}

function isDescendant(object: Object3D, root: Object3D): boolean {
  for (let node: Object3D | null = object; node; node = node.parent) {
    if (node === root) return true;
  }
  return false;
}
