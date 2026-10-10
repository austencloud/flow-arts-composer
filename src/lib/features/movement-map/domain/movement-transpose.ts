/**
 * Transposing a movement to the other side of the body.
 *
 * A performer who has described what the right arm does on the right side has
 * already described what the left arm does on the left side. It is the same
 * shoulder, the same elbow, the same path - reflected. Asking someone to
 * describe both is asking them to do the same work twice, which is why the
 * coverage count pairs them.
 *
 * Transposing is two canonical TKA transformations at once. Mirrored reflects
 * the grid positions across the vertical axis; Swapped exchanges the left and
 * right hands. Neither implies the other, so this module composes them rather
 * than pretending "mirror" already meant both.
 *
 * The hand swap is free here, and that is worth stating rather than leaving as
 * a surprise: `HandMotionSignature` records what ONE arm does and never which
 * arm did it. Two hands performing the same motion share a signature already.
 * So at this layer the swap has nothing to act on, and the reflection carries
 * the whole transposition. The colours still swap where a human can see them -
 * a blue observation credits the red twin - but that happens because the two
 * signatures are now one movement, not because a field was rewritten.
 */

import {
  mirrorLocation,
  mirrorOrientation,
  mirrorRotationDirection,
} from "#lib/shared/pictograph/shared/domain/geometry/mirror-vertical.js";
import { signatureKey, type HandMotionSignature } from "./movement-annotation";

/**
 * The same movement performed on the other side of the body.
 *
 * Motion type survives untouched: reflection reverses both the hand's arc and
 * the prop's rotation, so the with/against relationship that separates pro from
 * anti is preserved. Turns are magnitudes and Level 1 has none of them.
 */
export function transposeSignature(
  signature: HandMotionSignature
): HandMotionSignature {
  return {
    motionType: signature.motionType,
    rotationDirection: mirrorRotationDirection(signature.rotationDirection),
    startLocation: mirrorLocation(signature.startLocation),
    endLocation: mirrorLocation(signature.endLocation),
    startOrientation: mirrorOrientation(signature.startOrientation),
    endOrientation: mirrorOrientation(signature.endOrientation),
  };
}

export function transposeKey(signature: HandMotionSignature): string {
  return signatureKey(transposeSignature(signature));
}

/**
 * True when reflecting the movement returns the movement itself.
 *
 * These exist and must not be counted twice: a hand travelling north to south
 * without rotation crosses the axis it would be reflected in, so it is its own
 * transposition and its class holds one member rather than two.
 */
export function isSelfTranspose(signature: HandMotionSignature): boolean {
  return signatureKey(signature) === transposeKey(signature);
}
