import { PropType } from "../../pictograph/prop/domain/enums/prop-type";
import { isContactBallProp } from "../../pictograph/prop/domain/contact-ball-props";

/**
 * A person's own chosen contact ball is Staff: the prop can no longer be
 * picked, so a hand that holds one lands on the standard Staff, big sizes
 * included. Only their own settings pass through here; nothing saved in a
 * sequence, card, shared piece or film does.
 */
export function landOnStaff(propType: PropType): PropType;
export function landOnStaff(propType: PropType | undefined): PropType | undefined;
export function landOnStaff(propType: PropType | undefined): PropType | undefined {
  return isContactBallProp(propType) ? PropType.STAFF : propType;
}

/**
 * The settings fields that describe the performer's prop pair. Every write
 * and every load passes through this module so the store can never hold a
 * contradictory pair: hands that differ mean cat dog is on, cat dog off means
 * the right hand equals the left, and the legacy propType follows the left.
 * Equal hands with cat dog on is valid (the user turned it on and has not
 * picked a different hand yet).
 */
export interface PropPairFields {
  leftPropType?: PropType;
  rightPropType?: PropType;
  propType?: PropType;
  catDogMode?: boolean;
}

export const PROP_PAIR_KEYS = [
  "leftPropType",
  "rightPropType",
  "propType",
  "catDogMode",
] as const;

export function isPropPairKey(key: string): key is keyof PropPairFields {
  return (PROP_PAIR_KEYS as readonly string[]).includes(key);
}

function sets<P extends PropPairFields>(patch: P, key: keyof PropPairFields) {
  return (
    Object.prototype.hasOwnProperty.call(patch, key) && patch[key] !== undefined
  );
}

/** The patch with its pair fields made consistent with the stored pair. */
export function normalizePropPatch<P extends PropPairFields>(
  current: PropPairFields,
  patch: P
): P {
  if (!PROP_PAIR_KEYS.some((key) => sets(patch, key))) {
    return PROP_PAIR_KEYS.some((key) => key in patch)
      ? withoutUndefinedPairKeys({ ...patch })
      : patch;
  }

  const out: P = { ...patch };
  let left = sets(patch, "leftPropType") ? patch.leftPropType : undefined;
  let right = sets(patch, "rightPropType") ? patch.rightPropType : undefined;
  // Legacy single-prop writers mean "both hands".
  if (sets(patch, "propType") && left === undefined && right === undefined) {
    left = patch.propType;
    right = patch.propType;
  }
  const landedLeft = landOnStaff(left);
  const landedRight = landOnStaff(right);
  const landed = landedLeft !== left || landedRight !== right;
  left = landedLeft;
  right = landedRight;
  if (left !== undefined) out.leftPropType = left;
  if (right !== undefined) out.rightPropType = right;

  const nextLeft = landOnStaff(
    left ?? current.leftPropType ?? current.propType ?? PropType.STAFF
  );
  const nextRight = landOnStaff(
    right ?? current.rightPropType ?? current.propType ?? nextLeft
  );

  if (sets(patch, "catDogMode")) {
    if (patch.catDogMode === false) out.rightPropType = nextLeft;
    // A hand that moved to Staff can leave the pair matching: then the flag
    // follows the hands, as the picker does.
    else if (landed && nextLeft === nextRight) out.catDogMode = false;
  } else if (nextLeft !== nextRight) {
    out.catDogMode = true;
  }
  out.propType = nextLeft;

  return withoutUndefinedPairKeys(out);
}

/** An explicit `undefined` on a pair key (e.g. a caller spreading a partial
 * patch) must not survive into the assignment loop in updateSettings, which
 * would overwrite the stored hand with undefined. */
function withoutUndefinedPairKeys<P extends PropPairFields>(out: P): P {
  for (const key of PROP_PAIR_KEYS) {
    if (key in out && out[key] === undefined) delete out[key];
  }
  return out;
}

/** A loaded pair healed to the rule. Differing hands win over a stale flag,
 * matching captureActivePropConfig. */
export function healPropPair(
  fields: PropPairFields
): Required<PropPairFields> {
  const storedLeft = fields.leftPropType ?? fields.propType ?? PropType.STAFF;
  const storedRight = fields.rightPropType ?? fields.propType ?? storedLeft;
  const leftPropType = landOnStaff(storedLeft);
  const rightPropType = landOnStaff(storedRight);
  const moved = leftPropType !== storedLeft || rightPropType !== storedRight;
  return {
    leftPropType,
    rightPropType,
    propType: leftPropType,
    catDogMode:
      leftPropType !== rightPropType
        ? true
        : moved
          ? false
          : (fields.catDogMode ?? false),
  };
}
