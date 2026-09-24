import { PropType } from "../../pictograph/prop/domain/enums/prop-type";

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
  if (left !== undefined) out.leftPropType = left;
  if (right !== undefined) out.rightPropType = right;

  const nextLeft =
    left ?? current.leftPropType ?? current.propType ?? PropType.STAFF;
  const nextRight =
    right ?? current.rightPropType ?? current.propType ?? nextLeft;

  if (sets(patch, "catDogMode")) {
    if (patch.catDogMode === false) out.rightPropType = nextLeft;
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
  const leftPropType =
    fields.leftPropType ?? fields.propType ?? PropType.STAFF;
  const rightPropType =
    fields.rightPropType ?? fields.propType ?? leftPropType;
  return {
    leftPropType,
    rightPropType,
    propType: leftPropType,
    catDogMode:
      leftPropType !== rightPropType ? true : (fields.catDogMode ?? false),
  };
}
