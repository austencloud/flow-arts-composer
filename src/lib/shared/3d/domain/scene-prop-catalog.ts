import type { PropFinish } from "@austencloud/scene-3d";

import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import type { PropBuildPreviewOption } from "$lib/shared/pictograph/prop/domain/fan-appearance";
export {
  fanBuildPreviewOptions,
  fanCoverPreviewOptions,
  fanFramePreviewOptions,
} from "$lib/shared/pictograph/prop/domain/fan-appearance";
export type { PropBuildPreviewOption } from "$lib/shared/pictograph/prop/domain/fan-appearance";

export interface ScenePropVariant {
  id: PropType;
  label: string;
}

export interface ScenePropFamily {
  tileLabel: string;
  controlLabel: string;
  representative: PropType;
  variants: readonly ScenePropVariant[];
}

/**
 * Physical props that the production 3D scene can render and the Prop Studio
 * can review. Keep this catalog shared so a prop cannot appear in the performer
 * inspector without also belonging to the 3D studio's supported surface.
 */
export const SCENE_PROP_FAMILIES: readonly ScenePropFamily[] = [
  {
    tileLabel: "Sword",
    controlLabel: "Weapon",
    representative: PropType.SWORD,
    variants: [{ id: PropType.SWORD, label: "Sword" }],
  },
  {
    tileLabel: "Double Staff",
    controlLabel: "Double Staff build",
    representative: PropType.STAFF,
    variants: [
      { id: PropType.STAFF, label: "Staff" },
      { id: PropType.CAPSULE_BATON, label: "LED Baton" },
      { id: PropType.FIRE_DOUBLE_STAFF, label: "Fire Staff" },
    ],
  },
  {
    tileLabel: "Chicken",
    controlLabel: "Chicken size",
    representative: PropType.CHICKEN,
    variants: [
      { id: PropType.CHICKEN, label: "Chicken" },
      { id: PropType.BIGCHICKEN, label: "Big Chicken" },
    ],
  },
  {
    tileLabel: "Club / Torch",
    controlLabel: "Club build",
    representative: PropType.CLUB,
    variants: [
      { id: PropType.CLUB, label: "Club" },
      { id: PropType.TORCH, label: "Torch" },
    ],
  },
  {
    tileLabel: "Instruments",
    controlLabel: "Instrument",
    representative: PropType.GUITAR,
    variants: [
      { id: PropType.GUITAR, label: "Guitar" },
      { id: PropType.UKULELE, label: "Ukulele" },
    ],
  },
  {
    tileLabel: "Triquetra",
    controlLabel: "Triquetra grip",
    representative: PropType.TRIQUETRA,
    variants: [
      { id: PropType.TRIQUETRA, label: "Triquetra" },
      { id: PropType.TRIQUETRA2, label: "Triquetra 2" },
    ],
  },
  {
    tileLabel: "Triad / Trigeng",
    controlLabel: "Triad form",
    representative: PropType.TRIAD,
    variants: [
      { id: PropType.TRIAD, label: "Triad" },
      { id: PropType.TRIGENG, label: "Trigeng" },
    ],
  },
  {
    tileLabel: "Hoop",
    controlLabel: "Hoop build",
    representative: PropType.MINIHOOP,
    variants: [
      { id: PropType.MINIHOOP, label: "Mini Hoop" },
      { id: PropType.TRIANGLE, label: "Triangle" },
    ],
  },
] as const;

export const SCENE_PROP_REPRESENTATIVES = [
  PropType.CLUB,
  PropType.FAN,
  PropType.TRIAD,
  PropType.MINIHOOP,
  PropType.BUUGENG,
  PropType.TRIQUETRA,
  PropType.CHICKEN,
  PropType.DOUBLESTAR,
  PropType.EIGHTRINGS,
  PropType.SWORD,
  PropType.QUIAD,
  PropType.STAFF,
  PropType.POI,
  PropType.GUITAR,
] as const;

// A family representative (TRIAD, SWORD, STAFF, ...) also names itself as one
// of its own family's variants, so the raw concatenation below repeats it.
// The Set dedupes every such repeat in one place rather than special-casing
// each representative that happens to head a family.
export const SCENE_PROP_TYPES: readonly PropType[] = [
  ...new Set([
    ...SCENE_PROP_REPRESENTATIVES,
    ...SCENE_PROP_FAMILIES.flatMap((family) =>
      family.variants.map((variant) => variant.id)
    ),
  ]),
];

const SCENE_PROP_TYPE_SET = new Set<PropType>(SCENE_PROP_TYPES);

export function isScenePhysicalProp(prop: PropType): boolean {
  return SCENE_PROP_TYPE_SET.has(prop);
}

export function findScenePropFamily(
  prop: PropType
): ScenePropFamily | undefined {
  return SCENE_PROP_FAMILIES.find((family) =>
    family.variants.some((variant) => variant.id === prop)
  );
}

export function findScenePropFamilyByRepresentative(
  prop: PropType
): ScenePropFamily | undefined {
  return SCENE_PROP_FAMILIES.find((family) => family.representative === prop);
}

/* -------------------------------------------------------------------------
   How long a build draws
   -------------------------------------------------------------------------
   Length is a property of a build, so it belongs beside the rest of what the
   catalog knows about one.

   Two of the three Double Staff builds are drawn from authored GLB models
   rather than procedural geometry, and a model draws at the size it was
   authored: the scene package's `Prop3D` hands `length` to every procedural
   component and drops it on the GLTF branch. So every length control in the
   product — the performer's own `staffLengthCm`, a pinned lab length, the
   body-derived hug fit — reaches the plain Staff and stops at the LED Baton
   and the Fire Staff. Anything reporting a prop's size has to say which of
   those two it is looking at.

   The numbers are each model's own `authored_length_m` node extra, written by
   scripts/build-capsule-baton-model.py (0.8636 m, "a 34\" baton, the same
   overall length as the default staff") and
   scripts/build-fire-double-staff-model.py (0.9 m), and confirmed against the
   shipped GLBs' POSITION accessor bounds.

   The table covers the Double Staff family because that is the only family
   whose builds mix procedural and model-backed geometry, so it is the only
   one where the distinction changes a reading. Other model-backed props
   ignore length the same way; they are absent because nothing asks them for
   a length yet.
   ------------------------------------------------------------------------- */

const AUTHORED_MODEL_LENGTH_CM: Partial<Record<PropType, number>> = {
  [PropType.CAPSULE_BATON]: 86.36,
  [PropType.FIRE_DOUBLE_STAFF]: 90,
};

/**
 * The authored length of a model-backed build, or null when the build is
 * procedural and therefore draws whatever length it is handed.
 */
export function scenePropAuthoredLengthCm(prop: PropType): number | null {
  return AUTHORED_MODEL_LENGTH_CM[prop] ?? null;
}

/**
 * The length a build actually draws at, given the length it was asked for.
 * A procedural build honours the request; a model-backed one answers with its
 * authored length no matter what was asked.
 */
export function scenePropDrawnLengthCm(
  prop: PropType,
  requestedCm: number | null
): number | null {
  return scenePropAuthoredLengthCm(prop) ?? requestedCm;
}

/* -------------------------------------------------------------------------
   Build previews
   -------------------------------------------------------------------------
   Every build choice a prop offers — which member of its family, which
   finish, which fan configuration — is pictured by a real render of the real
   3D model, captured through /test/prop-3d-studio/capture. The pictures live
   with the catalog because they answer the same question it does: what is
   this prop, and what builds of it exist. A picker that showed a different
   set of pictures would be a second catalog.
   ------------------------------------------------------------------------- */

const PREVIEW_ROOT = "/images/props/build-previews";

const PROP_PREVIEW_IMAGES: Partial<Record<PropType, string>> = {
  [PropType.STAFF]: "staff.webp",
  [PropType.CAPSULE_BATON]: "capsule-baton.webp",
  [PropType.FIRE_DOUBLE_STAFF]: "fire-double-staff.webp",
  [PropType.CHICKEN]: "chicken.webp",
  [PropType.BIGCHICKEN]: "big-chicken.webp",
  [PropType.CLUB]: "club.webp",
  [PropType.TORCH]: "torch.webp",
  [PropType.GUITAR]: "guitar.webp",
  [PropType.UKULELE]: "ukulele.webp",
  [PropType.TRIQUETRA]: "triquetra.webp",
  [PropType.TRIQUETRA2]: "triquetra-2.webp",
  [PropType.TRIAD]: "triad-fire.webp",
  [PropType.TRIGENG]: "trigeng.webp",
  [PropType.SWORD]: "sword.webp",
};

function previewImage(file: string): string {
  return `${PREVIEW_ROOT}/${file}`;
}

export function propBuildPreviewImage(prop: PropType): string {
  return previewImage(PROP_PREVIEW_IMAGES[prop] ?? "triad-fire.webp");
}

export function finishPreviewOptions(
  prop: PropType
): readonly PropBuildPreviewOption<PropFinish>[] {
  const stem = prop === PropType.QUIAD ? "quiad" : "triad";
  return [
    { id: "fire", label: "Fire", image: previewImage(`${stem}-fire.webp`) },
    { id: "day", label: "Day", image: previewImage(`${stem}-day.webp`) },
  ];
}
