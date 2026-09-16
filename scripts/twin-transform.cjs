/**
 * Twin Transform — pure geometry for the mirror-swap "twin" of a sequence.
 *
 * A card's twin = hand-swap ∘ vertical-mirror, applied to the FULL
 * loop-executed steps (start position + beats). Both operations are involutions
 * on independent axes (hand vs geometry) so the pair map is an involution:
 * twin(twin(x)) === x.
 *
 * This module is intentionally dependency-free. The caller (enumerate-deck.cjs)
 * injects the engine's vertical-mirror location map and rotation-flip function,
 * and a location->position table built from the CSV. Letter re-derivation and
 * orientation propagation are the caller's job (they need the CSV + the engine
 * orientation calculator), so they are NOT done here — this module only moves
 * hands and derives positions from the resulting location pairs.
 *
 * Mirrors the scripts/apply-reversal-pattern.cjs helper pattern: plain
 * CommonJS, no top-level side effects, module.exports at the bottom.
 */

/**
 * Build a `${leftLoc}|${rightLoc}` -> position lookup from the CSV edges. A
 * position IS the encoding of an ordered (left, right) hand-location pair, so each
 * edge contributes two facts: its start pair -> startPos and end pair -> endPos.
 *
 * @param {Array<{leftStartLoc:string,rightStartLoc:string,startPos:string,leftEndLoc:string,rightEndLoc:string,endPos:string}>} edges
 * @returns {Record<string,string>}
 */
function buildLocationToPositionMap(edges) {
  const map = {};
  for (const e of edges) {
    map[`${e.leftStartLoc}|${e.rightStartLoc}`] = e.startPos;
    map[`${e.leftEndLoc}|${e.rightEndLoc}`] = e.endPos;
  }
  return map;
}

/** Mirror one motion's locations + rotation; preserve everything else. */
function mirrorMotion(motion, mirrorLocationMap, mirrorRotation) {
  return {
    ...motion,
    startLocation:
      mirrorLocationMap[motion.startLocation] ?? motion.startLocation,
    endLocation: mirrorLocationMap[motion.endLocation] ?? motion.endLocation,
    rotationDirection: mirrorRotation(motion.rotationDirection),
  };
}

/**
 * Produce the twin of one step: swap hands, mirror both hands, derive the
 * step's start/end positions from the transformed location pairs. Letter and
 * orientations are carried through unchanged for the caller to recompute.
 * Position is null when the transformed pair is absent from locToPos.
 */
function twinStep(step, { mirrorLocationMap, mirrorRotation, locToPos }) {
  // Hand swap: left takes the old right motion, and right takes the old left.
  const swappedLeftSrc = step.motions.right;
  const swappedRightSrc = step.motions.left;

  const left = {
    ...mirrorMotion(swappedLeftSrc, mirrorLocationMap, mirrorRotation),
    hand: "left",
  };
  const right = {
    ...mirrorMotion(swappedRightSrc, mirrorLocationMap, mirrorRotation),
    hand: "right",
  };

  const startPlacement =
    locToPos[`${left.startLocation}|${right.startLocation}`] ?? null;
  const endPlacement =
    locToPos[`${left.endLocation}|${right.endLocation}`] ?? null;

  return {
    ...step,
    startPlacement,
    endPlacement,
    motions: { left, right },
  };
}

/** Twin every step of a full sequence (start position + beats). */
function twinSequence(fullSteps, deps) {
  return fullSteps.map((s) => twinStep(s, deps));
}

/**
 * True when the twin is geometrically identical to the original (a card that is
 * its own mirror-swap). Compared on the position + per-hand location/motionType
 * across every step — orientation/letter are derived, not identity.
 */
function isSelfTwin(orig, twin) {
  if (orig.length !== twin.length) return false;
  for (let i = 0; i < orig.length; i++) {
    const a = orig[i];
    const b = twin[i];
    if (a.startPlacement !== b.startPlacement) return false;
    if (a.endPlacement !== b.endPlacement) return false;
    for (const hand of ["left", "right"]) {
      const am = a.motions[hand];
      const bm = b.motions[hand];
      if (am.startLocation !== bm.startLocation) return false;
      if (am.endLocation !== bm.endLocation) return false;
      if (am.motionType !== bm.motionType) return false;
    }
  }
  return true;
}

module.exports = {
  buildLocationToPositionMap,
  twinSequence,
  twinStep,
  isSelfTwin,
};
