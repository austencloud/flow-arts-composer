import type { PropBuild } from "@austencloud/scene-3d";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import type { EffectType } from "$lib/shared/effects/domain/effects-config";

/**
 * The prop and build an effect needs in order to be the thing it depicts.
 *
 * Setting a day fan on fire used to burn a paper-and-fabric prop from a point
 * that has no wick, because the effect and the build never spoke to each other.
 * Rather than grey the effect out — a dead end that teaches nothing — choosing
 * an effect equips the build that can carry it: fire on a fan puts the real
 * five-wick fire fan in the performer's hand, uncovered, and the emitters land
 * on those wicks because `prop-build-tip-geometry-3d.ts` reads the same build.
 *
 * Prop swaps stay strictly inside one `SCENE_PROP_FAMILIES` family — a club
 * becomes a torch, a staff becomes a fire staff — so the change reads as a
 * build switch and not as the app taking the prop away.
 *
 * Props with no fire build in the catalog (chicken, buugeng, hoop, sword,
 * guitar) return `null` and burn as they are. Real fire hoops and fire buugeng
 * exist; gating them out would encode our missing model as the prop's limit.
 */
export interface PropBuildEquip {
  /** Prop to swap to, when the build lives in a sibling prop type. */
  readonly prop?: PropType;
  /** Build fields to write onto the performer's override. */
  readonly propBuild?: Partial<PropBuild>;
}

/**
 * `flat-grip` remains a supported persisted fan appearance while the shared
 * scene package's current `PropBuild` catalog no longer includes it. Accept it
 * at this compatibility boundary so enabling fire preserves its five-wick
 * build; writes remain restricted to the current package shape.
 */
type EffectPropBuild = Omit<PropBuild, "fanBuild"> & {
  readonly fanBuild: PropBuild["fanBuild"] | "flat-grip";
};

/** Every member of the "Double Staff build" family. */
const DOUBLE_STAFF_FAMILY: ReadonlySet<PropType> = new Set([
  PropType.STAFF,
  PropType.CAPSULE_BATON,
  PropType.FIRE_DOUBLE_STAFF,
]);

/** Every member of the "Club build" family. */
const CLUB_FAMILY: ReadonlySet<PropType> = new Set([
  PropType.CLUB,
  PropType.TORCH,
]);

const BIG_CLUB_FAMILY: ReadonlySet<PropType> = new Set([
  PropType.BIGCLUB,
  PropType.BIGTORCH,
]);

/** Fans, whose build is a field on `PropBuild` rather than a sibling prop. */
const FAN_PROPS: ReadonlySet<PropType> = new Set([
  PropType.FAN,
  PropType.BIGFAN,
]);

/**
 * Props whose 3D mesh reads its wick material from `PropBuild.finish` — the
 * triad/quiad frames, which render the same arms in a fire or a day finish.
 */
const FINISH_PROPS: ReadonlySet<PropType> = new Set([
  PropType.TRIAD,
  PropType.BIGTRIAD,
  PropType.TRIGENG,
  PropType.QUIAD,
]);

/** Drops the fields that already hold the wanted value. */
function changedOnly(
  wanted: Partial<PropBuild>,
  current: EffectPropBuild
): Partial<PropBuild> | null {
  const diff: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(wanted)) {
    if (current[key as keyof PropBuild] !== value) diff[key] = value;
  }
  return Object.keys(diff).length > 0 ? (diff as Partial<PropBuild>) : null;
}

function equipBuild(
  wanted: Partial<PropBuild>,
  current: EffectPropBuild
): PropBuildEquip | null {
  const propBuild = changedOnly(wanted, current);
  return propBuild ? { propBuild } : null;
}

function equipProp(
  family: ReadonlySet<PropType>,
  target: PropType,
  propType: PropType
): PropBuildEquip | null {
  if (!family.has(propType) || propType === target) return null;
  return { prop: target };
}

function fireEquip(
  propType: PropType,
  current: EffectPropBuild
): PropBuildEquip | null {
  // Physical fire builds burn from five wicks. Keep the fan the performer
  // chose and only uncover it; pictograph and day builds still equip DoodleGrip.
  if (FAN_PROPS.has(propType)) {
    if (
      current.fanBuild === "fire" ||
      current.fanBuild === "lotus" ||
      current.fanBuild === "flat-grip"
    ) {
      return equipBuild({ fanCover: "bare" }, current);
    }
    return equipBuild({ fanBuild: "fire", fanCover: "bare" }, current);
  }

  if (FINISH_PROPS.has(propType))
    return equipBuild({ finish: "fire" }, current);

  return (
    equipProp(DOUBLE_STAFF_FAMILY, PropType.FIRE_DOUBLE_STAFF, propType) ??
    equipProp(CLUB_FAMILY, PropType.TORCH, propType) ??
    equipProp(BIG_CLUB_FAMILY, PropType.BIGTORCH, propType)
  );
}

/**
 * What a performer's prop and build must become for `effect` to make sense on
 * `propType`, or `null` when nothing has to change.
 *
 * Turning an effect off returns `null`: the build a performer chose is theirs
 * to keep, and un-equipping it would undo a deliberate choice.
 */
export function buildForEffect(
  propType: PropType,
  effect: EffectType | null,
  current: EffectPropBuild
): PropBuildEquip | null {
  switch (effect) {
    case "fire":
      return fireEquip(propType, current);
    case "led":
      if (FAN_PROPS.has(propType)) {
        return equipBuild({ fanBuild: "moon", fanCover: "bare" }, current);
      }
      return equipProp(DOUBLE_STAFF_FAMILY, PropType.CAPSULE_BATON, propType);
    default:
      // Coal, trails, sparkles and the rest read whatever build is in hand.
      // Nothing in the catalog is a "coal club" or a "sparkle fan".
      return null;
  }
}
