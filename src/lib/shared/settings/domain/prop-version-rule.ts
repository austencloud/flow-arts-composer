import { PropType } from "../../pictograph/prop/domain/enums/prop-type";
import {
  DEFAULT_PROP_LOOK,
  normalizePropLook,
  type PropLook,
} from "../../pictograph/prop/domain/prop-look";
import {
  PROP_PAIR_KEYS,
  type PropPairFields,
} from "./prop-pair-rule";

/**
 * A version belongs to the pick. `propArtwork` is one switch every prop
 * shares, so a Version 2 pick of one prop used to follow the performer onto
 * every prop they chose afterwards. Any write that brings a new prop into the
 * hands and does not name a version resets it to Version 1 instead.
 *
 * Changes that bring no new prop in keep the version: re-picking the prop in
 * hand, swapping the hands, or turning Cat Dog off (the right hand mirrors the
 * left, so nothing new appears). Turning Cat Dog on with a different right
 * prop remembered does bring one in, and resets.
 */
export interface PickVersionFields extends PropPairFields {
  propArtwork?: PropLook;
}

function sets<P extends PickVersionFields>(
  patch: P,
  key: keyof PickVersionFields
) {
  return (
    Object.prototype.hasOwnProperty.call(patch, key) && patch[key] !== undefined
  );
}

/**
 * The props actually in the hands. Same-prop mode puts the left prop in both
 * hands, so a stored right prop that cat dog is not using is not held.
 */
function heldPropSet(fields: PropPairFields): Set<PropType> {
  const left = fields.leftPropType ?? fields.propType ?? PropType.STAFF;
  const right = fields.catDogMode
    ? (fields.rightPropType ?? fields.propType ?? left)
    : left;
  return new Set([left, right]);
}

/**
 * The patch with the pick's version settled. Takes a patch already run through
 * normalizePropPatch, so its pair fields are consistent with the stored pair.
 * An unrelated patch comes back as the same object, and so does one made while
 * the version is already Version 1: there is nothing to reset, and a write
 * would only upload an unchanged setting.
 */
export function withPickVersion<P extends PickVersionFields>(
  current: PickVersionFields,
  patch: P
): P {
  if (sets(patch, "propArtwork")) return patch;
  if (normalizePropLook(current.propArtwork) === DEFAULT_PROP_LOOK) return patch;
  if (!PROP_PAIR_KEYS.some((key) => sets(patch, key))) return patch;

  const before = heldPropSet(current);
  const after = heldPropSet({
    leftPropType: sets(patch, "leftPropType")
      ? patch.leftPropType
      : current.leftPropType,
    rightPropType: sets(patch, "rightPropType")
      ? patch.rightPropType
      : current.rightPropType,
    propType: sets(patch, "propType") ? patch.propType : current.propType,
    catDogMode: sets(patch, "catDogMode")
      ? patch.catDogMode
      : current.catDogMode,
  });

  for (const prop of after) {
    if (!before.has(prop)) return { ...patch, propArtwork: DEFAULT_PROP_LOOK };
  }
  return patch;
}
