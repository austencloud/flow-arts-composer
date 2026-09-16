/**
 * LOOP Detection Validation Script
 *
 * Validates the LOOP detection algorithm against manually labeled sequences.
 * Compares detected LOOP types with ground truth labels from Firebase.
 *
 * Usage: node scripts/validate-loop-detection.cjs
 */

const admin = require("firebase-admin");
const path = require("path");
const fs = require("fs");

// Initialize Firebase Admin — lazily, inside main(). Top-level init made the
// module un-requirable from tests (missing serviceAccountKey.json killed the
// process at import time). The detection functions below are pure and are
// exported for the loop round-trip audit harness.
const serviceAccountPath = path.join(__dirname, "..", "serviceAccountKey.json");
let db;

function initFirebase() {
  try {
    const serviceAccount = require(serviceAccountPath);
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
    }
    db = admin.firestore();
  } catch (error) {
    console.error("Failed to initialize Firebase:", error.message);
    process.exit(1);
  }
}

// LOOP Detection Logic (Ported from LOOPDetectionService)

/**
 * Check if sequence is circular (end position matches start)
 */
function isCircular(sequence) {
  const beats = sequence.fullMetadata?.sequence?.filter((b) => b.beat >= 1);
  if (!beats || beats.length < 2) return false;

  const startPlacement = sequence.fullMetadata?.sequence?.find(
    (b) => b.beat === 0
  );
  const lastBeat = beats[beats.length - 1];

  if (!startPlacement || !lastBeat) return false;

  // Check if last beat's end position matches start position
  const startPos = startPlacement.endPos || startPlacement.sequenceStartPlacement;
  const endPos = lastBeat.endPos;

  // Normalize positions (remove numeric suffix for comparison in some cases)
  return startPos === endPos;
}

/**
 * Rotation maps for 180-degree rotation
 */
const ROTATE_180 = {
  n: "s",
  s: "n",
  e: "w",
  w: "e",
  ne: "sw",
  sw: "ne",
  nw: "se",
  se: "nw",
};

/**
 * Rotation maps for 90-degree CCW rotation
 * (used for quartered LOOPs)
 */
const ROTATE_90_CCW = {
  n: "w",
  w: "s",
  s: "e",
  e: "n",
  ne: "nw",
  nw: "sw",
  sw: "se",
  se: "ne",
};

/**
 * Mirror map (vertical - left/right swap)
 */
const MIRROR_VERTICAL = {
  n: "n",
  s: "s",
  e: "w",
  w: "e",
  ne: "nw",
  nw: "ne",
  se: "sw",
  sw: "se",
};

/**
 * Flip map (horizontal - top/bottom swap)
 */
const FLIP_HORIZONTAL = {
  n: "s",
  s: "n",
  e: "e",
  w: "w",
  ne: "se",
  se: "ne",
  nw: "sw",
  sw: "nw",
};

/**
 * Invert motion type
 */
function invertMotionType(type) {
  if (type === "pro") return "anti";
  if (type === "anti") return "pro";
  return type;
}

/**
 * Extract beat data from raw sequence format
 */
function extractBeats(sequence) {
  const raw = sequence.fullMetadata?.sequence;
  if (!raw) return [];

  return raw
    .filter((b) => b.beat >= 1)
    .map((b) => ({
      beatNumber: b.beat,
      letter: b.letter,
      startPos: b.startPos,
      endPos: b.endPos,
      left: {
        startLoc: b.leftAttributes?.startLoc?.toLowerCase(),
        endLoc: b.leftAttributes?.endLoc?.toLowerCase(),
        motionType: b.leftAttributes?.motionType?.toLowerCase(),
      },
      right: {
        startLoc: b.rightAttributes?.startLoc?.toLowerCase(),
        endLoc: b.rightAttributes?.endLoc?.toLowerCase(),
        motionType: b.rightAttributes?.motionType?.toLowerCase(),
      },
    }));
}

/**
 * Check if two beats show rotation transformation
 */
function isRotated(beat1, beat2) {
  const b1Left = beat1.left;
  const b1Right = beat1.right;
  const b2Left = beat2.left;
  const b2Right = beat2.right;

  if (!b1Left?.endLoc || !b2Left?.endLoc || !b1Right?.endLoc || !b2Right?.endLoc) {
    return false;
  }

  return (
    ROTATE_180[b1Left.startLoc] === b2Left.startLoc &&
    ROTATE_180[b1Left.endLoc] === b2Left.endLoc &&
    ROTATE_180[b1Right.startLoc] === b2Right.startLoc &&
    ROTATE_180[b1Right.endLoc] === b2Right.endLoc
  );
}

/**
 * Check if two beats show swap transformation (blue <-> red)
 *
 * IMPORTANT: Swap is only meaningful when the hands have DIFFERENT characteristics
 * that actually get exchanged. If both hands do the same thing, swap is
 * coincidentally true but not meaningful (it's just symmetric motion).
 */
function isSwapped(beat1, beat2) {
  const b1Left = beat1.left;
  const b1Right = beat1.right;
  const b2Left = beat2.left;
  const b2Right = beat2.right;

  if (!b1Left?.endLoc || !b2Left?.endLoc || !b1Right?.endLoc || !b2Right?.endLoc) {
    return false;
  }

  // First check: Do the hands have DIFFERENT motion types in beat1?
  // If both hands have the same motion type (both pro, both anti, etc.),
  // then swap is coincidental - there's no actual "exchange of roles"
  const handsHaveDifferentRoles = b1Left.motionType !== b1Right.motionType;

  if (!handsHaveDifferentRoles) {
    // Both hands same motion type - swap would be coincidental, not meaningful
    return false;
  }

  // Blue1 becomes Red2, Red1 becomes Blue2
  return (
    b1Left.startLoc === b2Right.startLoc &&
    b1Left.endLoc === b2Right.endLoc &&
    b1Left.motionType === b2Right.motionType &&
    b1Right.startLoc === b2Left.startLoc &&
    b1Right.endLoc === b2Left.endLoc &&
    b1Right.motionType === b2Left.motionType
  );
}

/**
 * Check if two beats are REPEATED (identical positions and motion types)
 * This component is used when the second half is an exact copy of the first half,
 * needed to return to original orientation after an orientation flip.
 */
function isRepeated(beat1, beat2) {
  const b1Left = beat1.left;
  const b1Right = beat1.right;
  const b2Left = beat2.left;
  const b2Right = beat2.right;

  if (!b1Left?.endLoc || !b2Left?.endLoc || !b1Right?.endLoc || !b2Right?.endLoc) {
    return false;
  }

  // Check if positions and motion types are identical
  return (
    b1Left.startLoc === b2Left.startLoc &&
    b1Left.endLoc === b2Left.endLoc &&
    b1Left.motionType === b2Left.motionType &&
    b1Right.startLoc === b2Right.startLoc &&
    b1Right.endLoc === b2Right.endLoc &&
    b1Right.motionType === b2Right.motionType
  );
}

/**
 * Check if two beats show mirror transformation (left/right)
 */
function isMirrored(beat1, beat2) {
  const b1Left = beat1.left;
  const b1Right = beat1.right;
  const b2Left = beat2.left;
  const b2Right = beat2.right;

  if (!b1Left?.endLoc || !b2Left?.endLoc || !b1Right?.endLoc || !b2Right?.endLoc) {
    return false;
  }

  return (
    MIRROR_VERTICAL[b1Left.startLoc] === b2Left.startLoc &&
    MIRROR_VERTICAL[b1Left.endLoc] === b2Left.endLoc &&
    MIRROR_VERTICAL[b1Right.startLoc] === b2Right.startLoc &&
    MIRROR_VERTICAL[b1Right.endLoc] === b2Right.endLoc
  );
}

/**
 * Check if two beats show flip transformation (top/bottom)
 */
function isFlipped(beat1, beat2) {
  const b1Left = beat1.left;
  const b1Right = beat1.right;
  const b2Left = beat2.left;
  const b2Right = beat2.right;

  if (!b1Left?.endLoc || !b2Left?.endLoc || !b1Right?.endLoc || !b2Right?.endLoc) {
    return false;
  }

  return (
    FLIP_HORIZONTAL[b1Left.startLoc] === b2Left.startLoc &&
    FLIP_HORIZONTAL[b1Left.endLoc] === b2Left.endLoc &&
    FLIP_HORIZONTAL[b1Right.startLoc] === b2Right.startLoc &&
    FLIP_HORIZONTAL[b1Right.endLoc] === b2Right.endLoc
  );
}

/**
 * Check if two beats show inversion transformation (pro <-> anti)
 */
function isInverted(beat1, beat2) {
  const b1Left = beat1.left;
  const b1Right = beat1.right;
  const b2Left = beat2.left;
  const b2Right = beat2.right;

  if (!b1Left?.motionType || !b2Left?.motionType) {
    return false;
  }

  // Same positions, inverted motion types
  const positionsMatch =
    b1Left.startLoc === b2Left.startLoc &&
    b1Left.endLoc === b2Left.endLoc &&
    b1Right.startLoc === b2Right.startLoc &&
    b1Right.endLoc === b2Right.endLoc;

  const motionsInverted =
    invertMotionType(b1Left.motionType) === b2Left.motionType &&
    invertMotionType(b1Right.motionType) === b2Right.motionType;

  return positionsMatch && motionsInverted;
}

/**
 * Check combined: rotated then swapped
 *
 * NOTE: Unlike pure SWAP, compound transforms don't require hands to have
 * different motion types per-pair. The position transformation makes swap meaningful.
 * We'll check at aggregate level if swap is meaningful.
 */
function isRotatedThenSwapped(beat1, beat2) {
  const b1Left = beat1.left;
  const b1Right = beat1.right;
  const b2Left = beat2.left;
  const b2Right = beat2.right;

  if (!b1Left?.endLoc || !b2Left?.endLoc || !b1Right?.endLoc || !b2Right?.endLoc) {
    return false;
  }

  // After rotate: blue1 -> rotate(blue1), red1 -> rotate(red1)
  // After swap: new blue = rotated red1, new red = rotated blue1
  return (
    ROTATE_180[b1Right.startLoc] === b2Left.startLoc &&
    ROTATE_180[b1Right.endLoc] === b2Left.endLoc &&
    b1Right.motionType === b2Left.motionType &&
    ROTATE_180[b1Left.startLoc] === b2Right.startLoc &&
    ROTATE_180[b1Left.endLoc] === b2Right.endLoc &&
    b1Left.motionType === b2Right.motionType
  );
}

/**
 * Check combined: mirrored then swapped
 *
 * NOTE: Unlike pure SWAP, compound transforms don't require hands to have
 * different motion types. The position transformation makes swap meaningful.
 */
function isMirroredThenSwapped(beat1, beat2) {
  const b1Left = beat1.left;
  const b1Right = beat1.right;
  const b2Left = beat2.left;
  const b2Right = beat2.right;

  if (!b1Left?.endLoc || !b2Left?.endLoc || !b1Right?.endLoc || !b2Right?.endLoc) {
    return false;
  }

  // After mirror: positions get e↔w swapped
  // After swap: blue becomes red, red becomes blue
  // So: new blue = mirrored old red, new red = mirrored old blue
  return (
    MIRROR_VERTICAL[b1Right.startLoc] === b2Left.startLoc &&
    MIRROR_VERTICAL[b1Right.endLoc] === b2Left.endLoc &&
    b1Right.motionType === b2Left.motionType &&
    MIRROR_VERTICAL[b1Left.startLoc] === b2Right.startLoc &&
    MIRROR_VERTICAL[b1Left.endLoc] === b2Right.endLoc &&
    b1Left.motionType === b2Right.motionType
  );
}

/**
 * Check combined: mirrored then swapped then inverted
 * Positions mirror (e↔w), colors swap (blue↔red), motion types invert (pro↔anti)
 */
function isMirroredSwappedInverted(beat1, beat2) {
  const b1Left = beat1.left;
  const b1Right = beat1.right;
  const b2Left = beat2.left;
  const b2Right = beat2.right;

  if (!b1Left?.endLoc || !b2Left?.endLoc || !b1Right?.endLoc || !b2Right?.endLoc) {
    return false;
  }

  // After mirror: positions get e↔w swapped
  // After swap: blue becomes red, red becomes blue
  // After invert: motion types flip pro↔anti
  // So: new blue = mirrored old red with inverted motion
  //     new red = mirrored old blue with inverted motion
  return (
    MIRROR_VERTICAL[b1Right.startLoc] === b2Left.startLoc &&
    MIRROR_VERTICAL[b1Right.endLoc] === b2Left.endLoc &&
    invertMotionType(b1Right.motionType) === b2Left.motionType &&
    MIRROR_VERTICAL[b1Left.startLoc] === b2Right.startLoc &&
    MIRROR_VERTICAL[b1Left.endLoc] === b2Right.endLoc &&
    invertMotionType(b1Left.motionType) === b2Right.motionType
  );
}

/**
 * Check combined: flipped then inverted
 * Positions flip (n↔s) AND motion types invert (pro↔anti)
 */
function isFlippedThenInverted(beat1, beat2) {
  const b1Left = beat1.left;
  const b1Right = beat1.right;
  const b2Left = beat2.left;
  const b2Right = beat2.right;

  if (!b1Left?.endLoc || !b2Left?.endLoc || !b1Right?.endLoc || !b2Right?.endLoc) {
    return false;
  }

  // Check positions are flipped
  const positionsFlipped =
    FLIP_HORIZONTAL[b1Left.startLoc] === b2Left.startLoc &&
    FLIP_HORIZONTAL[b1Left.endLoc] === b2Left.endLoc &&
    FLIP_HORIZONTAL[b1Right.startLoc] === b2Right.startLoc &&
    FLIP_HORIZONTAL[b1Right.endLoc] === b2Right.endLoc;

  if (!positionsFlipped) {
    return false;
  }

  // Check motion types are inverted
  const motionsInverted =
    invertMotionType(b1Left.motionType) === b2Left.motionType &&
    invertMotionType(b1Right.motionType) === b2Right.motionType;

  return motionsInverted;
}

/**
 * Check pure 90° CCW rotation (no swap)
 * Used for detecting quartered rotation patterns
 */
function isQuarteredRotatedOnly(beat1, beat2) {
  const b1Left = beat1.left;
  const b1Right = beat1.right;
  const b2Left = beat2.left;
  const b2Right = beat2.right;

  if (!b1Left?.endLoc || !b2Left?.endLoc || !b1Right?.endLoc || !b2Right?.endLoc) {
    return false;
  }

  // Pure 90° CCW rotation - colors stay the same
  return (
    ROTATE_90_CCW[b1Left.startLoc] === b2Left.startLoc &&
    ROTATE_90_CCW[b1Left.endLoc] === b2Left.endLoc &&
    b1Left.motionType === b2Left.motionType &&
    ROTATE_90_CCW[b1Right.startLoc] === b2Right.startLoc &&
    ROTATE_90_CCW[b1Right.endLoc] === b2Right.endLoc &&
    b1Right.motionType === b2Right.motionType
  );
}

/**
 * Check quartered: 90° CCW rotation + swap
 * Used for patterns where beat i → beat i+quarterLength follows 90° rotation with color swap
 */
function isQuarteredRotatedSwapped(beat1, beat2) {
  const b1Left = beat1.left;
  const b1Right = beat1.right;
  const b2Left = beat2.left;
  const b2Right = beat2.right;

  if (!b1Left?.endLoc || !b2Left?.endLoc || !b1Right?.endLoc || !b2Right?.endLoc) {
    return false;
  }

  // After 90° CCW rotate: positions rotate
  // After swap: blue becomes red, red becomes blue
  // So: new blue = rotate90ccw(old red), new red = rotate90ccw(old blue)
  return (
    ROTATE_90_CCW[b1Right.startLoc] === b2Left.startLoc &&
    ROTATE_90_CCW[b1Right.endLoc] === b2Left.endLoc &&
    b1Right.motionType === b2Left.motionType &&
    ROTATE_90_CCW[b1Left.startLoc] === b2Right.startLoc &&
    ROTATE_90_CCW[b1Left.endLoc] === b2Right.endLoc &&
    b1Left.motionType === b2Right.motionType
  );
}

/**
 * Detect LOOP type for a sequence using halved comparison
 * (compare first half beats to second half beats)
 */
function detectLOOPType(sequence) {
  const circular = isCircular(sequence);
  const beats = extractBeats(sequence);

  if (!circular || beats.length < 2) {
    return {
      isCircular: circular,
      loopType: null,
      components: [],
      confidence: "accidental",
      details: "Not circular or too short",
    };
  }

  // For halved detection, compare beat i to beat i + halfLength
  const halfLength = Math.floor(beats.length / 2);
  if (beats.length % 2 !== 0) {
    return {
      isCircular: true,
      loopType: null,
      components: [],
      confidence: "accidental",
      details: "Odd number of beats - cannot be halved LOOP",
    };
  }

  // Check each transformation across all beat pairs
  const results = {
    rotated: { matches: 0, total: halfLength },
    swapped: { matches: 0, total: halfLength },
    mirrored: { matches: 0, total: halfLength },
    flipped: { matches: 0, total: halfLength },
    inverted: { matches: 0, total: halfLength },
    repeated: { matches: 0, total: halfLength },
    rotatedSwapped: { matches: 0, total: halfLength },
    mirroredSwapped: { matches: 0, total: halfLength },
    flippedInverted: { matches: 0, total: halfLength },
    mirroredSwappedInverted: { matches: 0, total: halfLength },
  };

  const beatPairDetails = [];

  for (let i = 0; i < halfLength; i++) {
    const beat1 = beats[i];
    const beat2 = beats[i + halfLength];

    const pairResult = {
      pair: `${beat1.beatNumber} <-> ${beat2.beatNumber}`,
      transformations: [],
    };

    if (isRotated(beat1, beat2)) {
      results.rotated.matches++;
      pairResult.transformations.push("ROTATED");
    }
    if (isSwapped(beat1, beat2)) {
      results.swapped.matches++;
      pairResult.transformations.push("SWAPPED");
    }
    if (isMirrored(beat1, beat2)) {
      results.mirrored.matches++;
      pairResult.transformations.push("MIRRORED");
    }
    if (isFlipped(beat1, beat2)) {
      results.flipped.matches++;
      pairResult.transformations.push("FLIPPED");
    }
    if (isInverted(beat1, beat2)) {
      results.inverted.matches++;
      pairResult.transformations.push("INVERTED");
    }
    if (isRotatedThenSwapped(beat1, beat2)) {
      results.rotatedSwapped.matches++;
      pairResult.transformations.push("ROTATED+SWAPPED");
    }
    if (isMirroredThenSwapped(beat1, beat2)) {
      results.mirroredSwapped.matches++;
      pairResult.transformations.push("MIRRORED+SWAPPED");
    }
    if (isFlippedThenInverted(beat1, beat2)) {
      results.flippedInverted.matches++;
      pairResult.transformations.push("FLIPPED+INVERTED");
    }
    if (isMirroredSwappedInverted(beat1, beat2)) {
      results.mirroredSwappedInverted.matches++;
      pairResult.transformations.push("MIRRORED+SWAPPED+INVERTED");
    }
    if (isRepeated(beat1, beat2)) {
      results.repeated.matches++;
      pairResult.transformations.push("REPEATED");
    }

    if (pairResult.transformations.length === 0) {
      pairResult.transformations.push("NONE/COMPLEX");
    }

    beatPairDetails.push(pairResult);
  }

  // Determine detected components (100% match across all beat pairs)
  const detectedComponents = [];

  if (results.rotated.matches === halfLength) {
    detectedComponents.push("rotated");
  }
  if (results.swapped.matches === halfLength) {
    detectedComponents.push("swapped");
  }
  if (results.mirrored.matches === halfLength) {
    detectedComponents.push("mirrored");
  }
  if (results.flipped.matches === halfLength) {
    detectedComponents.push("flipped");
  }
  if (results.inverted.matches === halfLength) {
    detectedComponents.push("inverted");
  }
  if (results.repeated.matches === halfLength) {
    detectedComponents.push("repeated");
  }

  // Check compound types
  if (results.rotatedSwapped.matches === halfLength) {
    // Only report rotated+swapped if swap is meaningful (hands have different roles)
    const swapIsMeaningful = beats.slice(0, halfLength).some((beat) => {
      return beat.left?.motionType !== beat.right?.motionType;
    });

    if (swapIsMeaningful) {
      if (
        !detectedComponents.includes("rotated") ||
        !detectedComponents.includes("swapped")
      ) {
        // Only add if not already detected as separate components
        detectedComponents.push("rotated+swapped");
      }
    }
  }
  if (results.mirroredSwapped.matches === halfLength) {
    // Only report mirrored+swapped if swap is meaningful (hands have different roles)
    // Check if ANY pair has hands with different motion types
    const swapIsMeaningful = beats.slice(0, halfLength).some((beat) => {
      return beat.left?.motionType !== beat.right?.motionType;
    });

    if (swapIsMeaningful) {
      if (
        !detectedComponents.includes("mirrored") ||
        !detectedComponents.includes("swapped")
      ) {
        detectedComponents.push("mirrored+swapped");
      }
    }
  }
  if (results.flippedInverted.matches === halfLength) {
    // Report compound - remove individual "flipped" since compound is more specific
    const flippedIndex = detectedComponents.indexOf("flipped");
    if (flippedIndex !== -1) {
      detectedComponents.splice(flippedIndex, 1);
    }
    detectedComponents.push("flipped+inverted");
  }
  if (results.mirroredSwappedInverted.matches === halfLength) {
    // Only report if swap is meaningful (hands have different roles in at least some pairs)
    const swapIsMeaningful = beats.slice(0, halfLength).some((beat) => {
      return beat.left?.motionType !== beat.right?.motionType;
    });

    if (swapIsMeaningful) {
      // Three-component compound - report as mirrored+swapped+inverted
      // Remove any individual components since the compound is more specific
      [
        "mirrored",
        "swapped",
        "inverted",
        "mirrored+swapped",
        "flipped+inverted",
      ].forEach((c) => {
        const idx = detectedComponents.indexOf(c);
        if (idx !== -1) {
          detectedComponents.splice(idx, 1);
        }
      });
      detectedComponents.push("mirrored+swapped+inverted");
    }
  }

  // Check QUARTERED patterns (90° rotation intervals)
  // Only applicable if sequence length is divisible by 4
  if (beats.length >= 4 && beats.length % 4 === 0) {
    const quarterLength = beats.length / 4;
    let quarteredRotatedSwappedMatches = 0;

    // Check all quarter transitions: Q1→Q2, Q2→Q3, Q3→Q4
    for (let q = 0; q < 3; q++) {
      for (let i = 0; i < quarterLength; i++) {
        const beat1 = beats[q * quarterLength + i];
        const beat2 = beats[(q + 1) * quarterLength + i];
        if (isQuarteredRotatedSwapped(beat1, beat2)) {
          quarteredRotatedSwappedMatches++;
        }
      }
    }

    const totalQuarteredPairs = quarterLength * 3; // 3 quarter transitions

    if (quarteredRotatedSwappedMatches === totalQuarteredPairs) {
      // Check if swap is meaningful
      const swapIsMeaningful = beats.slice(0, quarterLength).some((beat) => {
        return beat.left?.motionType !== beat.right?.motionType;
      });

      if (swapIsMeaningful) {
        // Quartered rotated+swapped detected - this takes precedence over halved rotated
        const rotatedIdx = detectedComponents.indexOf("rotated");
        if (rotatedIdx !== -1) {
          detectedComponents.splice(rotatedIdx, 1);
        }
        if (!detectedComponents.includes("rotated+swapped")) {
          detectedComponents.push("rotated+swapped");
        }
        // Add note that this is quartered
        beatPairDetails.push({
          pair: "QUARTERED",
          transformations: ["90° ROTATED+SWAPPED across all quarters"],
        });
      }
    }

    // Check for MIXED-SLICE pattern: Rotated(¼) + Swapped(½)
    // This pattern has 90° rotation at ALL quarter transitions,
    // but swap alternates: Q1→Q2 no swap, Q2→Q3 swap, Q3→Q4 swap, Q4→Q1 no swap
    // Net effect: rotation at ¼ slice, swap at ½ slice
    const quarterTransitions = [];
    for (let q = 0; q < 4; q++) {
      const qStart = q * quarterLength;
      const qNext = ((q + 1) % 4) * quarterLength;

      // Check first beat of each quarter transition
      const b1 = beats[qStart];
      const b2 = beats[qNext];

      const isPureRotation = isQuarteredRotatedOnly(b1, b2);
      const isRotationSwap = isQuarteredRotatedSwapped(b1, b2);

      quarterTransitions.push({
        transition: `Q${q + 1}→Q${(q % 4) + 2 > 4 ? 1 : (q % 4) + 2}`,
        pureRotation: isPureRotation,
        rotationSwap: isRotationSwap,
        has90Rotation: isPureRotation || isRotationSwap,
      });
    }

    // Check if all quarters have 90° rotation (some with swap, some without)
    const allHave90Rotation = quarterTransitions.every((t) => t.has90Rotation);
    const someHaveSwap = quarterTransitions.some((t) => t.rotationSwap);
    const someArePure = quarterTransitions.some((t) => t.pureRotation);

    // Mixed-slice pattern: all have 90° rotation, but swap alternates (not all same)
    if (allHave90Rotation && someHaveSwap && someArePure) {
      // This is Rotated(¼) + Swapped(½)
      // For mixed-slice patterns, the swap is inherently meaningful because it's structural:
      // hands exchange their rotational paths, which is a real choreographic distinction
      // even if motion types happen to be the same within each beat.

      // Remove individual components and add the compound
      const rotatedIdx = detectedComponents.indexOf("rotated");
      if (rotatedIdx !== -1) {
        detectedComponents.splice(rotatedIdx, 1);
      }
      if (!detectedComponents.includes("rotated+swapped")) {
        detectedComponents.push("rotated+swapped");
      }
      beatPairDetails.push({
        pair: "MIXED-SLICE",
        transformations: [
          "Rotated(¼) + Swapped(½): 90° rotation at quarters, swap at halves",
        ],
      });
    }
  }

  // Map to LOOP type
  let loopType = null;
  let confidence = "accidental";

  if (detectedComponents.length > 0) {
    // Sort for consistent naming
    const sorted = [...detectedComponents].sort().join("_");

    const typeMap = {
      rotated: "ROTATED",
      swapped: "SWAPPED",
      mirrored: "MIRRORED",
      flipped: "FLIPPED",
      inverted: "INVERTED",
      repeated: "STRICT_REPEATED",
      rotated_swapped: "ROTATED_SWAPPED",
      "rotated+swapped": "ROTATED_SWAPPED",
      mirrored_swapped: "MIRRORED_SWAPPED",
      "mirrored+swapped": "MIRRORED_SWAPPED",
      flipped_inverted: "FLIPPED_INVERTED",
      "flipped+inverted": "FLIPPED_INVERTED",
      inverted_rotated: "ROTATED_INVERTED",
      inverted_mirrored: "MIRRORED_INVERTED",
      "mirrored+swapped+inverted": "MIRRORED_SWAPPED_INVERTED",
      inverted_mirrored_swapped: "MIRRORED_SWAPPED_INVERTED",
    };

    loopType = typeMap[sorted] || `CUSTOM_${sorted.toUpperCase()}`;
    confidence = "strict";
  }

  return {
    isCircular: true,
    loopType,
    components: detectedComponents,
    confidence,
    period: "halved",
    details: results,
    beatPairDetails,
  };
}

// ============================================================================
// Validation Logic
// ============================================================================

/**
 * Normalize LOOP type for comparison
 */
function normalizeLOOPType(type) {
  if (!type) return null;
  return type
    .toUpperCase()
    .replace(/\s+/g, "_")
    .replace(/\+/g, "_")
    .replace(/STRICT_/g, "");
}

/**
 * Normalize components for comparison
 * Converts known component pairs into their compound equivalents
 */
function normalizeComponents(components) {
  if (!components || components.length === 0) return [];

  // Normalize individual component names
  let normalized = components.map((c) => c.toLowerCase().replace(/\+/g, "_"));

  // Define compound equivalents - when these parts appear, treat as single compound
  // Order matters: check three-component compounds first
  const compoundPairs = [
    {
      parts: ["mirrored", "swapped", "inverted"],
      compound: "mirrored_swapped_inverted",
    },
    {
      parts: ["mirrored_swapped", "inverted"],
      compound: "mirrored_swapped_inverted",
    },
    {
      parts: ["inverted", "mirrored_swapped"],
      compound: "mirrored_swapped_inverted",
    },
    { parts: ["flipped", "inverted"], compound: "flipped_inverted" },
    { parts: ["rotated", "swapped"], compound: "rotated_swapped" },
    { parts: ["mirrored", "swapped"], compound: "mirrored_swapped" },
    { parts: ["rotated", "inverted"], compound: "rotated_inverted" },
    { parts: ["mirrored", "inverted"], compound: "mirrored_inverted" },
  ];

  // Check each compound pair
  for (const { parts, compound } of compoundPairs) {
    const hasAllParts = parts.every((p) => normalized.includes(p));
    if (hasAllParts) {
      // Remove individual parts, add compound
      normalized = normalized.filter((c) => !parts.includes(c));
      normalized.push(compound);
    }
  }

  return normalized.sort();
}

/**
 * Compare detected result with labeled ground truth
 */
function compareResults(detected, labeled) {
  // Handle Unknown/freeform labels
  if (labeled.isUnknown) {
    return {
      match: detected.components.length === 0,
      reason:
        detected.components.length === 0
          ? "Both unknown"
          : "Labeled unknown but detected components",
    };
  }

  if (labeled.isFreeform) {
    return {
      match: detected.components.length === 0,
      reason:
        detected.components.length === 0
          ? "Both freeform"
          : "Labeled freeform but detected components",
    };
  }

  // Extract labeled components
  const labeledComponents = [];
  if (labeled.designations && labeled.designations.length > 0) {
    labeled.designations.forEach((d) => {
      if (d.components) {
        labeledComponents.push(...d.components);
      }
    });
  }

  const normalizedLabeled = normalizeComponents(labeledComponents);
  const normalizedDetected = normalizeComponents(detected.components);

  // Check if components match
  const match =
    normalizedLabeled.length === normalizedDetected.length &&
    normalizedLabeled.every((c, i) => c === normalizedDetected[i]);

  return {
    match,
    labeledComponents: normalizedLabeled,
    detectedComponents: normalizedDetected,
    reason: match ? "Components match" : "Components differ",
  };
}

// ============================================================================
// Main Execution
// ============================================================================

async function main() {
  initFirebase();
  console.log("=".repeat(70));
  console.log("LOOP DETECTION VALIDATION");
  console.log("=".repeat(70));
  console.log();

  // Load sequence index
  const sequenceIndexPath = path.join(
    __dirname,
    "..",
    "static",
    "data",
    "sequence-index.json"
  );
  const sequenceIndex = JSON.parse(fs.readFileSync(sequenceIndexPath, "utf8"));
  const sequenceMap = new Map();
  sequenceIndex.sequences.forEach((s) => {
    sequenceMap.set(s.word, s);
  });

  console.log(`Loaded ${sequenceMap.size} sequences from sequence-index.json`);

  // Load labels from Firebase
  const snapshot = await db.collection("loop-labels").get();
  const labels = [];
  snapshot.forEach((doc) => {
    labels.push({ word: doc.id, ...doc.data() });
  });

  console.log(`Loaded ${labels.length} labels from Firebase`);
  console.log();

  // Validate each labeled sequence
  const results = {
    total: 0,
    matches: 0,
    mismatches: 0,
    notFound: 0,
    details: [],
  };

  for (const label of labels) {
    const sequence = sequenceMap.get(label.word);

    if (!sequence) {
      results.notFound++;
      results.details.push({
        word: label.word,
        status: "NOT_FOUND",
        reason: "Sequence not in index",
      });
      continue;
    }

    results.total++;

    const detected = detectLOOPType(sequence);
    const comparison = compareResults(detected, label);

    if (comparison.match) {
      results.matches++;
      results.details.push({
        word: label.word,
        status: "MATCH",
        labeled: comparison.labeledComponents || ["unknown/freeform"],
        detected: detected.components,
      });
    } else {
      results.mismatches++;
      results.details.push({
        word: label.word,
        status: "MISMATCH",
        labeled: comparison.labeledComponents || ["unknown/freeform"],
        detected: detected.components,
        reason: comparison.reason,
        beatPairDetails: detected.beatPairDetails,
      });
    }
  }

  // Print summary
  console.log("=".repeat(70));
  console.log("SUMMARY");
  console.log("=".repeat(70));
  console.log(`Total validated: ${results.total}`);
  console.log(
    `Matches: ${results.matches} (${((results.matches / results.total) * 100).toFixed(1)}%)`
  );
  console.log(`Mismatches: ${results.mismatches}`);
  console.log(`Not found in index: ${results.notFound}`);
  console.log();

  // Print matches
  console.log("=".repeat(70));
  console.log("MATCHES");
  console.log("=".repeat(70));
  results.details
    .filter((d) => d.status === "MATCH")
    .forEach((d) => {
      console.log(`  ${d.word}: ${d.detected.join(" + ") || "none"}`);
    });
  console.log();

  // Print mismatches with details
  console.log("=".repeat(70));
  console.log("MISMATCHES (need investigation)");
  console.log("=".repeat(70));
  results.details
    .filter((d) => d.status === "MISMATCH")
    .forEach((d) => {
      console.log(`\n  ${d.word}:`);
      console.log(`    Labeled:  ${d.labeled.join(" + ") || "none"}`);
      console.log(`    Detected: ${d.detected.join(" + ") || "none"}`);
      console.log(`    Reason:   ${d.reason}`);
      if (d.beatPairDetails && d.beatPairDetails.length > 0) {
        console.log(`    Beat pairs:`);
        d.beatPairDetails.forEach((bp) => {
          console.log(`      ${bp.pair}: ${bp.transformations.join(", ")}`);
        });
      }
    });

  // Print not found
  if (results.notFound > 0) {
    console.log();
    console.log("=".repeat(70));
    console.log("NOT FOUND IN SEQUENCE INDEX");
    console.log("=".repeat(70));
    results.details
      .filter((d) => d.status === "NOT_FOUND")
      .forEach((d) => {
        console.log(`  ${d.word}`);
      });
  }

  process.exit(0);
}

if (require.main === module) {
  main().catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });
}

// Pure detection functions, exported for the loop round-trip audit harness
// (tests/unit/loop/real-loop-detector-audit.test.ts). No Firebase needed.
module.exports = {
  detectLOOPType,
  isCircular,
  extractBeats,
};
