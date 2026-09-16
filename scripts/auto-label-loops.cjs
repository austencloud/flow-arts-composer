/**
 * Auto-Label LOOP Sequences
 *
 * Runs the LOOP detection algorithm on all unlabeled circular sequences
 * and saves predictions to Firebase with needsVerification: true flag.
 *
 * Usage:
 *   node scripts/auto-label-caps.cjs              # Dry run - show what would be labeled
 *   node scripts/auto-label-caps.cjs --apply      # Actually write to Firebase
 *   node scripts/auto-label-caps.cjs --word XXXX  # Test single word
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

// LOOP Detection Logic (from validate-loop-detection.cjs)

// Beat-pair graph transformation maps (includes 90° and 270° rotations)
// Note: "CCW" = counterclockwise as viewed from above
const ROTATE_270_CCW = {
  n: "e",
  e: "s",
  s: "w",
  w: "n",
  ne: "se",
  se: "sw",
  sw: "nw",
  nw: "ne",
};

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

// Clockwise rotation (opposite of CCW)
const ROTATE_90_CW = {
  n: "e",
  e: "s",
  s: "w",
  w: "n",
  ne: "se",
  se: "sw",
  sw: "nw",
  nw: "ne",
};

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

function invertMotionType(type) {
  if (type === "pro") return "anti";
  if (type === "anti") return "pro";
  return type;
}

function isCircular(sequence) {
  const beats = sequence.fullMetadata?.sequence?.filter((b) => b.beat >= 1);
  if (!beats || beats.length < 2) return false;
  const startPlacement = sequence.fullMetadata?.sequence?.find(
    (b) => b.beat === 0
  );
  const lastBeat = beats[beats.length - 1];
  if (!startPlacement || !lastBeat) return false;
  const startPos = startPlacement.endPos || startPlacement.sequenceStartPlacement;
  const endPos = lastBeat.endPos;
  return startPos === endPos;
}

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

function isRotated(beat1, beat2) {
  const b1Left = beat1.left,
    b1Right = beat1.right,
    b2Left = beat2.left,
    b2Right = beat2.right;
  if (!b1Left?.endLoc || !b2Left?.endLoc || !b1Right?.endLoc || !b2Right?.endLoc)
    return false;
  return (
    ROTATE_180[b1Left.startLoc] === b2Left.startLoc &&
    ROTATE_180[b1Left.endLoc] === b2Left.endLoc &&
    ROTATE_180[b1Right.startLoc] === b2Right.startLoc &&
    ROTATE_180[b1Right.endLoc] === b2Right.endLoc
  );
}

function isSwapped(beat1, beat2) {
  const b1Left = beat1.left,
    b1Right = beat1.right,
    b2Left = beat2.left,
    b2Right = beat2.right;
  if (!b1Left?.endLoc || !b2Left?.endLoc || !b1Right?.endLoc || !b2Right?.endLoc)
    return false;
  if (b1Left.motionType === b1Right.motionType) return false;
  return (
    b1Left.startLoc === b2Right.startLoc &&
    b1Left.endLoc === b2Right.endLoc &&
    b1Left.motionType === b2Right.motionType &&
    b1Right.startLoc === b2Left.startLoc &&
    b1Right.endLoc === b2Left.endLoc &&
    b1Right.motionType === b2Left.motionType
  );
}

function isRepeated(beat1, beat2) {
  const b1Left = beat1.left,
    b1Right = beat1.right,
    b2Left = beat2.left,
    b2Right = beat2.right;
  if (!b1Left?.endLoc || !b2Left?.endLoc || !b1Right?.endLoc || !b2Right?.endLoc)
    return false;
  return (
    b1Left.startLoc === b2Left.startLoc &&
    b1Left.endLoc === b2Left.endLoc &&
    b1Left.motionType === b2Left.motionType &&
    b1Right.startLoc === b2Right.startLoc &&
    b1Right.endLoc === b2Right.endLoc &&
    b1Right.motionType === b2Right.motionType
  );
}

function isMirrored(beat1, beat2) {
  const b1Left = beat1.left,
    b1Right = beat1.right,
    b2Left = beat2.left,
    b2Right = beat2.right;
  if (!b1Left?.endLoc || !b2Left?.endLoc || !b1Right?.endLoc || !b2Right?.endLoc)
    return false;
  return (
    MIRROR_VERTICAL[b1Left.startLoc] === b2Left.startLoc &&
    MIRROR_VERTICAL[b1Left.endLoc] === b2Left.endLoc &&
    MIRROR_VERTICAL[b1Right.startLoc] === b2Right.startLoc &&
    MIRROR_VERTICAL[b1Right.endLoc] === b2Right.endLoc
  );
}

function isFlipped(beat1, beat2) {
  const b1Left = beat1.left,
    b1Right = beat1.right,
    b2Left = beat2.left,
    b2Right = beat2.right;
  if (!b1Left?.endLoc || !b2Left?.endLoc || !b1Right?.endLoc || !b2Right?.endLoc)
    return false;
  return (
    FLIP_HORIZONTAL[b1Left.startLoc] === b2Left.startLoc &&
    FLIP_HORIZONTAL[b1Left.endLoc] === b2Left.endLoc &&
    FLIP_HORIZONTAL[b1Right.startLoc] === b2Right.startLoc &&
    FLIP_HORIZONTAL[b1Right.endLoc] === b2Right.endLoc
  );
}

function isInverted(beat1, beat2) {
  const b1Left = beat1.left,
    b1Right = beat1.right,
    b2Left = beat2.left,
    b2Right = beat2.right;
  if (!b1Left?.motionType || !b2Left?.motionType) return false;
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

function isRotatedThenSwapped(beat1, beat2) {
  const b1Left = beat1.left,
    b1Right = beat1.right,
    b2Left = beat2.left,
    b2Right = beat2.right;
  if (!b1Left?.endLoc || !b2Left?.endLoc || !b1Right?.endLoc || !b2Right?.endLoc)
    return false;
  return (
    ROTATE_180[b1Right.startLoc] === b2Left.startLoc &&
    ROTATE_180[b1Right.endLoc] === b2Left.endLoc &&
    b1Right.motionType === b2Left.motionType &&
    ROTATE_180[b1Left.startLoc] === b2Right.startLoc &&
    ROTATE_180[b1Left.endLoc] === b2Right.endLoc &&
    b1Left.motionType === b2Right.motionType
  );
}

function isMirroredThenSwapped(beat1, beat2) {
  const b1Left = beat1.left,
    b1Right = beat1.right,
    b2Left = beat2.left,
    b2Right = beat2.right;
  if (!b1Left?.endLoc || !b2Left?.endLoc || !b1Right?.endLoc || !b2Right?.endLoc)
    return false;
  return (
    MIRROR_VERTICAL[b1Right.startLoc] === b2Left.startLoc &&
    MIRROR_VERTICAL[b1Right.endLoc] === b2Left.endLoc &&
    b1Right.motionType === b2Left.motionType &&
    MIRROR_VERTICAL[b1Left.startLoc] === b2Right.startLoc &&
    MIRROR_VERTICAL[b1Left.endLoc] === b2Right.endLoc &&
    b1Left.motionType === b2Right.motionType
  );
}

function isMirroredSwappedInverted(beat1, beat2) {
  const b1Left = beat1.left,
    b1Right = beat1.right,
    b2Left = beat2.left,
    b2Right = beat2.right;
  if (!b1Left?.endLoc || !b2Left?.endLoc || !b1Right?.endLoc || !b2Right?.endLoc)
    return false;
  return (
    MIRROR_VERTICAL[b1Right.startLoc] === b2Left.startLoc &&
    MIRROR_VERTICAL[b1Right.endLoc] === b2Left.endLoc &&
    invertMotionType(b1Right.motionType) === b2Left.motionType &&
    MIRROR_VERTICAL[b1Left.startLoc] === b2Right.startLoc &&
    MIRROR_VERTICAL[b1Left.endLoc] === b2Right.endLoc &&
    invertMotionType(b1Left.motionType) === b2Right.motionType
  );
}

function isFlippedThenInverted(beat1, beat2) {
  const b1Left = beat1.left,
    b1Right = beat1.right,
    b2Left = beat2.left,
    b2Right = beat2.right;
  if (!b1Left?.endLoc || !b2Left?.endLoc || !b1Right?.endLoc || !b2Right?.endLoc)
    return false;
  const positionsFlipped =
    FLIP_HORIZONTAL[b1Left.startLoc] === b2Left.startLoc &&
    FLIP_HORIZONTAL[b1Left.endLoc] === b2Left.endLoc &&
    FLIP_HORIZONTAL[b1Right.startLoc] === b2Right.startLoc &&
    FLIP_HORIZONTAL[b1Right.endLoc] === b2Right.endLoc;
  if (!positionsFlipped) return false;
  return (
    invertMotionType(b1Left.motionType) === b2Left.motionType &&
    invertMotionType(b1Right.motionType) === b2Right.motionType
  );
}

function isQuarteredRotatedOnly(beat1, beat2) {
  const b1Left = beat1.left,
    b1Right = beat1.right,
    b2Left = beat2.left,
    b2Right = beat2.right;
  if (!b1Left?.endLoc || !b2Left?.endLoc || !b1Right?.endLoc || !b2Right?.endLoc)
    return false;
  return (
    ROTATE_90_CCW[b1Left.startLoc] === b2Left.startLoc &&
    ROTATE_90_CCW[b1Left.endLoc] === b2Left.endLoc &&
    b1Left.motionType === b2Left.motionType &&
    ROTATE_90_CCW[b1Right.startLoc] === b2Right.startLoc &&
    ROTATE_90_CCW[b1Right.endLoc] === b2Right.endLoc &&
    b1Right.motionType === b2Right.motionType
  );
}

function isQuarteredRotatedSwapped(beat1, beat2) {
  const b1Left = beat1.left,
    b1Right = beat1.right,
    b2Left = beat2.left,
    b2Right = beat2.right;
  if (!b1Left?.endLoc || !b2Left?.endLoc || !b1Right?.endLoc || !b2Right?.endLoc)
    return false;
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
 * Detect rotation direction for quartered sequences
 * Compares beat positions at quarter boundaries (1→5→9→13 for 16-beat)
 * Returns: "ccw" | "cw" | null
 */
function detectRotationDirection(beats) {
  if (beats.length < 4 || beats.length % 4 !== 0) return null;

  const quarterLength = beats.length / 4;

  // Get representative beats at each quarter
  const quarterBeats = [
    beats[0], // Q1: beat 1
    beats[quarterLength], // Q2: beat 5 (for 16-beat)
    beats[quarterLength * 2], // Q3: beat 9
    beats[quarterLength * 3], // Q4: beat 13
  ];

  // Track the progression of Blue's startLoc through quarters
  const leftStartLocs = quarterBeats.map((b) => b.left?.startLoc);
  const rightStartLocs = quarterBeats.map((b) => b.right?.startLoc);

  // Check if positions follow CCW or CW progression
  // CCW progression: n→w→s→e→n or any rotation of this (s→e→n→w, etc.)
  // CW progression: n→e→s→w→n or any rotation of this (s→w→n→e, etc.)

  let ccwMatches = 0;
  let cwMatches = 0;

  // Check Blue's progression
  for (let i = 0; i < 4; i++) {
    const current = leftStartLocs[i];
    const next = leftStartLocs[(i + 1) % 4];
    if (!current || !next) continue;

    if (ROTATE_90_CCW[current] === next) ccwMatches++;
    if (ROTATE_90_CW[current] === next) cwMatches++;
  }

  // Check Red's progression
  for (let i = 0; i < 4; i++) {
    const current = rightStartLocs[i];
    const next = rightStartLocs[(i + 1) % 4];
    if (!current || !next) continue;

    if (ROTATE_90_CCW[current] === next) ccwMatches++;
    if (ROTATE_90_CW[current] === next) cwMatches++;
  }

  // Determine direction based on majority
  if (ccwMatches > cwMatches && ccwMatches >= 4) return "ccw";
  if (cwMatches > ccwMatches && cwMatches >= 4) return "cw";

  return null;
}

// Beat-Pair Graph Detection (for modular patterns)

/**
 * Compare two beats and identify ALL transformations between them
 * Returns array of transformation types
 *
 * IMPORTANT: We check ALL possible transformations and return all that match.
 * This allows finding the COMMON transformation across all beat pairs.
 */
function compareBeatPair(beat1, beat2) {
  const b1Left = beat1.left,
    b1Right = beat1.right;
  const b2Left = beat2.left,
    b2Right = beat2.right;

  if (
    !b1Left?.startLoc ||
    !b2Left?.startLoc ||
    !b1Right?.startLoc ||
    !b2Right?.startLoc
  ) {
    return [];
  }

  const transformations = [];

  // Check if beats are identical (repeated)
  const isRepeated =
    b1Left.startLoc === b2Left.startLoc &&
    b1Left.endLoc === b2Left.endLoc &&
    b1Left.motionType === b2Left.motionType &&
    b1Right.startLoc === b2Right.startLoc &&
    b1Right.endLoc === b2Right.endLoc &&
    b1Right.motionType === b2Right.motionType;

  if (isRepeated) {
    transformations.push("repeated");
    // DON'T early return - repeated beats may also satisfy other transformations
    // (e.g., a symmetric pattern that is both repeated AND rotated+swapped)
  }

  // Check COMPOUND transformations first (rotation + swap)
  // These are the most common LOOP patterns

  // ROTATED + SWAPPED position checks (colors swapped)
  const positions180Swapped =
    ROTATE_180[b1Right.startLoc] === b2Left.startLoc &&
    ROTATE_180[b1Right.endLoc] === b2Left.endLoc &&
    ROTATE_180[b1Left.startLoc] === b2Right.startLoc &&
    ROTATE_180[b1Left.endLoc] === b2Right.endLoc;

  const positions90CCWSwapped =
    ROTATE_90_CCW[b1Right.startLoc] === b2Left.startLoc &&
    ROTATE_90_CCW[b1Right.endLoc] === b2Left.endLoc &&
    ROTATE_90_CCW[b1Left.startLoc] === b2Right.startLoc &&
    ROTATE_90_CCW[b1Left.endLoc] === b2Right.endLoc;

  const positions90CWSwapped =
    ROTATE_270_CCW[b1Right.startLoc] === b2Left.startLoc &&
    ROTATE_270_CCW[b1Right.endLoc] === b2Left.endLoc &&
    ROTATE_270_CCW[b1Left.startLoc] === b2Right.startLoc &&
    ROTATE_270_CCW[b1Left.endLoc] === b2Right.endLoc;

  // Motion checks for swapped colors (Red1→Blue2, Blue1→Red2)
  const motionSameSwapped =
    b1Right.motionType === b2Left.motionType &&
    b1Left.motionType === b2Right.motionType;

  const motionInvertedSwapped =
    invertMotionType(b1Right.motionType) === b2Left.motionType &&
    invertMotionType(b1Left.motionType) === b2Right.motionType;

  // ROTATED_180 + SWAPPED (motion unchanged)
  if (positions180Swapped && motionSameSwapped) {
    transformations.push("rotated_180_swapped");
  }

  // ROTATED_180 + SWAPPED + INVERTED (motion inverted)
  if (positions180Swapped && motionInvertedSwapped) {
    transformations.push("rotated_180_swapped_inverted");
  }

  // ROTATED_90_CCW + SWAPPED (motion unchanged)
  if (positions90CCWSwapped && motionSameSwapped) {
    transformations.push("rotated_90_ccw_swapped");
  }

  // ROTATED_90_CCW + SWAPPED + INVERTED (motion inverted)
  if (positions90CCWSwapped && motionInvertedSwapped) {
    transformations.push("rotated_90_ccw_swapped_inverted");
  }

  // ROTATED_90_CW + SWAPPED (motion unchanged)
  if (positions90CWSwapped && motionSameSwapped) {
    transformations.push("rotated_90_cw_swapped");
  }

  // ROTATED_90_CW + SWAPPED + INVERTED (motion inverted)
  if (positions90CWSwapped && motionInvertedSwapped) {
    transformations.push("rotated_90_cw_swapped_inverted");
  }

  // MIRRORED + SWAPPED
  const isMirroredSwapped =
    MIRROR_VERTICAL[b1Right.startLoc] === b2Left.startLoc &&
    MIRROR_VERTICAL[b1Right.endLoc] === b2Left.endLoc &&
    b1Right.motionType === b2Left.motionType &&
    MIRROR_VERTICAL[b1Left.startLoc] === b2Right.startLoc &&
    MIRROR_VERTICAL[b1Left.endLoc] === b2Right.endLoc &&
    b1Left.motionType === b2Right.motionType;

  if (isMirroredSwapped) {
    transformations.push("mirrored_swapped");
  }

  // Check simple position transformations (same colors)

  // 90° rotation (CCW) - check positions
  const positions90CCW =
    ROTATE_90_CCW[b1Left.startLoc] === b2Left.startLoc &&
    ROTATE_90_CCW[b1Left.endLoc] === b2Left.endLoc &&
    ROTATE_90_CCW[b1Right.startLoc] === b2Right.startLoc &&
    ROTATE_90_CCW[b1Right.endLoc] === b2Right.endLoc;

  // 180° rotation - check positions
  const positions180 =
    ROTATE_180[b1Left.startLoc] === b2Left.startLoc &&
    ROTATE_180[b1Left.endLoc] === b2Left.endLoc &&
    ROTATE_180[b1Right.startLoc] === b2Right.startLoc &&
    ROTATE_180[b1Right.endLoc] === b2Right.endLoc;

  // 90° CW rotation (270° CCW) - check positions
  const positions90CW =
    ROTATE_270_CCW[b1Left.startLoc] === b2Left.startLoc &&
    ROTATE_270_CCW[b1Left.endLoc] === b2Left.endLoc &&
    ROTATE_270_CCW[b1Right.startLoc] === b2Right.startLoc &&
    ROTATE_270_CCW[b1Right.endLoc] === b2Right.endLoc;

  // Check if motion is same or inverted (for same-color comparisons)
  const motionSameColors =
    b1Left.motionType === b2Left.motionType &&
    b1Right.motionType === b2Right.motionType;

  const motionInvertedSameColors =
    invertMotionType(b1Left.motionType) === b2Left.motionType &&
    invertMotionType(b1Right.motionType) === b2Right.motionType;

  // ROTATED_90_CCW (pure rotation, motion unchanged)
  if (positions90CCW && motionSameColors) {
    transformations.push("rotated_90_ccw");
  }

  // ROTATED_90_CCW + INVERTED (rotation + motion inversion)
  if (positions90CCW && motionInvertedSameColors) {
    transformations.push("rotated_90_ccw_inverted");
  }

  // ROTATED_180 (pure rotation, motion unchanged)
  if (positions180 && motionSameColors) {
    transformations.push("rotated_180");
  }

  // ROTATED_180 + INVERTED (rotation + motion inversion)
  if (positions180 && motionInvertedSameColors) {
    transformations.push("rotated_180_inverted");
  }

  // ROTATED_90_CW (pure rotation, motion unchanged)
  if (positions90CW && motionSameColors) {
    transformations.push("rotated_90_cw");
  }

  // ROTATED_90_CW + INVERTED (rotation + motion inversion)
  if (positions90CW && motionInvertedSameColors) {
    transformations.push("rotated_90_cw_inverted");
  }

  // Vertical mirror
  if (
    MIRROR_VERTICAL[b1Left.startLoc] === b2Left.startLoc &&
    MIRROR_VERTICAL[b1Left.endLoc] === b2Left.endLoc &&
    MIRROR_VERTICAL[b1Right.startLoc] === b2Right.startLoc &&
    MIRROR_VERTICAL[b1Right.endLoc] === b2Right.endLoc
  ) {
    transformations.push("mirrored");
  }

  // Horizontal flip (positions only, motion unchanged)
  const positionsFlipped =
    FLIP_HORIZONTAL[b1Left.startLoc] === b2Left.startLoc &&
    FLIP_HORIZONTAL[b1Left.endLoc] === b2Left.endLoc &&
    FLIP_HORIZONTAL[b1Right.startLoc] === b2Right.startLoc &&
    FLIP_HORIZONTAL[b1Right.endLoc] === b2Right.endLoc;

  const motionSame =
    b1Left.motionType === b2Left.motionType &&
    b1Right.motionType === b2Right.motionType;

  const motionFlipInverted =
    invertMotionType(b1Left.motionType) === b2Left.motionType &&
    invertMotionType(b1Right.motionType) === b2Right.motionType;

  if (positionsFlipped && motionSame) {
    transformations.push("flipped");
  }

  // FLIPPED + INVERTED (positions flipped AND motion inverted)
  if (positionsFlipped && motionFlipInverted) {
    transformations.push("flipped_inverted");
  }

  // Check if colors are swapped (without position change)
  const colorsSwapped =
    b1Left.startLoc === b2Right.startLoc &&
    b1Left.endLoc === b2Right.endLoc &&
    b1Right.startLoc === b2Left.startLoc &&
    b1Right.endLoc === b2Left.endLoc &&
    b1Left.motionType === b2Right.motionType &&
    b1Right.motionType === b2Left.motionType;

  if (colorsSwapped && !transformations.includes("swapped")) {
    transformations.push("swapped");
  }

  // Check if motion types are inverted (same positions)
  const motionInverted =
    b1Left.startLoc === b2Left.startLoc &&
    b1Left.endLoc === b2Left.endLoc &&
    b1Right.startLoc === b2Right.startLoc &&
    b1Right.endLoc === b2Right.endLoc &&
    invertMotionType(b1Left.motionType) === b2Left.motionType &&
    invertMotionType(b1Right.motionType) === b2Right.motionType;

  if (motionInverted) {
    transformations.push("inverted");
  }

  return transformations;
}

function buildBeatPairGraph(beats) {
  const graph = {};

  for (let i = 0; i < beats.length; i++) {
    const beat1 = beats[i];
    graph[beat1.beatNumber] = {};

    for (let j = 0; j < beats.length; j++) {
      if (i === j) continue;

      const beat2 = beats[j];
      const transformations = compareBeatPair(beat1, beat2);

      if (transformations.length > 0) {
        graph[beat1.beatNumber][beat2.beatNumber] = transformations;
      }
    }
  }

  return graph;
}

/**
 * Generate beat-pair relationships for halved sequences
 * Compares beat 1 ↔ halfLength+1, beat 2 ↔ halfLength+2, etc.
 * Returns array matching BeatPairRelationship interface
 */
function generateHalvedBeatPairs(beats) {
  if (beats.length < 2 || beats.length % 2 !== 0) return [];

  const halfLength = beats.length / 2;
  const beatPairs = [];

  for (let i = 0; i < halfLength; i++) {
    const beat1 = beats[i];
    const beat2 = beats[halfLength + i];
    const rawTransformations = compareBeatPair(beat1, beat2);

    // Format transformations as human-readable strings
    const formattedTransformations =
      formatBeatPairTransformations(rawTransformations);

    beatPairs.push({
      keyBeat: beat1.beatNumber,
      correspondingBeat: beat2.beatNumber,
      rawTransformations: rawTransformations, // Keep raw for finding common transformation
      detectedTransformations:
        formattedTransformations.length > 0
          ? formattedTransformations
          : ["UNKNOWN"],
    });
  }

  return beatPairs;
}

/**
 * Generate beat-pair relationships for quartered sequences
 * Compares beat 1 ↔ quarterLength+1, beat 2 ↔ quarterLength+2, etc.
 * Used to detect 90° rotations
 */
function generateQuarteredBeatPairs(beats) {
  if (beats.length < 4 || beats.length % 4 !== 0) return [];

  const quarterLength = beats.length / 4;
  const beatPairs = [];

  // Compare each beat with its corresponding beat one quarter ahead
  for (let i = 0; i < quarterLength * 3; i++) {
    const beat1 = beats[i];
    const beat2 = beats[(i + quarterLength) % beats.length];
    const rawTransformations = compareBeatPair(beat1, beat2);

    // Note: 90° rotations are already detected by compareBeatPair() with proper motion checks.
    // No need for additional position-only checks here.

    const formattedTransformations =
      formatBeatPairTransformations(rawTransformations);

    beatPairs.push({
      keyBeat: beat1.beatNumber,
      correspondingBeat: beat2.beatNumber,
      rawTransformations: rawTransformations,
      detectedTransformations:
        formattedTransformations.length > 0
          ? formattedTransformations
          : ["UNKNOWN"],
    });
  }

  return beatPairs;
}

/**
 * Priority order for transformation types
 *
 * PRINCIPLE: Prefer SIMPLER explanations over compound ones.
 * If a pattern can be explained by pure rotation, prefer that over rotation+swap.
 *
 * Example: Sequence "A" satisfies both 90° CW (pure) and 90° CCW+SWAP.
 * The pure rotation is the simpler/correct explanation.
 */
const TRANSFORMATION_PRIORITY = [
  // Pure directional rotations first (simplest explanation)
  "rotated_90_cw", // 90° CW rotation (pure)
  "rotated_90_ccw", // 90° CCW rotation (pure)
  "rotated_180", // 180° rotation (pure)
  // Rotation + inversion (more specific than pure rotation)
  "rotated_90_cw_inverted", // 90° CW rotation + motion inversion
  "rotated_90_ccw_inverted", // 90° CCW rotation + motion inversion
  "rotated_180_inverted", // 180° rotation + motion inversion
  // Rotation + swap (compound)
  "rotated_90_cw_swapped", // Quartered CW rotation + swap
  "rotated_90_ccw_swapped", // Quartered CCW rotation + swap
  "rotated_180_swapped", // Halved rotation + swap
  // Rotation + swap + inversion (triple compound)
  "rotated_90_cw_swapped_inverted", // Quartered CW + swap + inversion
  "rotated_90_ccw_swapped_inverted", // Quartered CCW + swap + inversion
  "rotated_180_swapped_inverted", // Halved + swap + inversion
  // Other compound transformations
  "flipped_inverted", // Flip + motion inversion
  "mirrored_swapped", // Mirror + swap
  // Simple transformations
  "mirrored", // Vertical mirror
  "flipped", // Horizontal flip
  "swapped", // Color swap only
  "inverted", // Motion inversion only
  "repeated", // Identical (lowest priority)
];

/**
 * Format raw transformations into human-readable strings
 * Prioritizes compound transformations over simple ones
 */
function formatBeatPairTransformations(rawTransformations) {
  if (rawTransformations.length === 0) return [];

  const formatted = [];

  // Sort by priority - compound transformations first
  const sorted = [...rawTransformations].sort((a, b) => {
    const priorityA = TRANSFORMATION_PRIORITY.indexOf(a);
    const priorityB = TRANSFORMATION_PRIORITY.indexOf(b);
    return (
      (priorityA === -1 ? 999 : priorityA) -
      (priorityB === -1 ? 999 : priorityB)
    );
  });

  // Format primary (highest priority) transformation
  // Convert underscores to readable format with direction info
  let primary = sorted[0].toUpperCase();
  // Triple compound (rotation + swap + invert) - order matters!
  primary = primary.replace(
    /ROTATED_90_CCW_SWAPPED_INVERTED/,
    "ROTATED_90_CCW+SWAPPED+INVERTED"
  );
  primary = primary.replace(
    /ROTATED_90_CW_SWAPPED_INVERTED/,
    "ROTATED_90_CW+SWAPPED+INVERTED"
  );
  primary = primary.replace(
    /ROTATED_180_SWAPPED_INVERTED/,
    "ROTATED_180+SWAPPED+INVERTED"
  );
  // Double compound (rotation + invert)
  primary = primary.replace(
    /ROTATED_90_CCW_INVERTED/,
    "ROTATED_90_CCW+INVERTED"
  );
  primary = primary.replace(/ROTATED_90_CW_INVERTED/, "ROTATED_90_CW+INVERTED");
  primary = primary.replace(/ROTATED_180_INVERTED/, "ROTATED_180+INVERTED");
  // Double compound (rotation + swap)
  primary = primary.replace(/ROTATED_90_CCW_SWAPPED/, "ROTATED_90_CCW+SWAPPED");
  primary = primary.replace(/ROTATED_90_CW_SWAPPED/, "ROTATED_90_CW+SWAPPED");
  primary = primary.replace(/ROTATED_180_SWAPPED/, "ROTATED_180+SWAPPED");
  // Other compounds
  primary = primary.replace(/FLIPPED_INVERTED/, "FLIPPED+INVERTED");
  primary = primary.replace(/MIRRORED_SWAPPED/, "MIRRORED+SWAPPED");
  primary = primary.replace(/_/g, " ");
  formatted.push(primary);

  // Add alternatives (other matching transformations)
  for (let i = 1; i < sorted.length; i++) {
    const alt = sorted[i].toUpperCase().replace(/_/g, " ");
    if (!formatted.includes(alt)) {
      formatted.push(`(also: ${alt})`);
    }
  }

  return formatted;
}

/**
 * Find the common transformation(s) shared by ALL beat pairs
 * Returns the highest-priority transformation that appears in all pairs
 */
function findCommonTransformation(beatPairs) {
  if (beatPairs.length === 0) return null;

  // Get the set of transformations for each beat pair
  const allTransformations = beatPairs.map(
    (pair) => new Set(pair.rawTransformations || [])
  );

  // Find intersection - transformations that appear in ALL pairs
  const common = [...allTransformations[0]].filter((t) =>
    allTransformations.every((set) => set.has(t))
  );

  if (common.length === 0) return null;

  // Return the highest priority common transformation
  const sorted = common.sort((a, b) => {
    const priorityA = TRANSFORMATION_PRIORITY.indexOf(a);
    const priorityB = TRANSFORMATION_PRIORITY.indexOf(b);
    return (
      (priorityA === -1 ? 999 : priorityA) -
      (priorityB === -1 ? 999 : priorityB)
    );
  });

  return sorted[0];
}

/**
 * Find ALL common transformations shared by ALL beat pairs
 * Returns array of all transformations that appear in every pair
 * Used to identify multiple equally-valid designations
 */
function findAllCommonTransformations(beatPairs) {
  if (beatPairs.length === 0) return [];

  // Get the set of transformations for each beat pair
  const allTransformations = beatPairs.map(
    (pair) => new Set(pair.rawTransformations || [])
  );

  // Find intersection - transformations that appear in ALL pairs
  const common = [...allTransformations[0]].filter((t) =>
    allTransformations.every((set) => set.has(t))
  );

  // Sort by priority for consistent ordering
  return common.sort((a, b) => {
    const priorityA = TRANSFORMATION_PRIORITY.indexOf(a);
    const priorityB = TRANSFORMATION_PRIORITY.indexOf(b);
    return (
      (priorityA === -1 ? 999 : priorityA) -
      (priorityB === -1 ? 999 : priorityB)
    );
  });
}

/**
 * Build candidate designations from all common transformations
 * Each valid transformation becomes a separate candidate that can be confirmed/denied
 * Deduplicates by components+direction to avoid showing the same thing twice
 */
function buildCandidateDesignations(allCommon, interval, rotationDirection) {
  const candidates = [];
  const seen = new Set(); // Track unique component+direction combinations

  for (const transformation of allCommon) {
    // Skip "repeated" as it's usually redundant
    if (transformation === "repeated") continue;

    const components = deriveComponentsFromBeatPairPattern(transformation);
    if (components.length === 0) continue;

    const direction =
      extractRotationDirection(transformation) || rotationDirection;

    // Create unique key for deduplication
    const key = components.sort().join("+") + "|" + (direction || "none");
    if (seen.has(key)) continue;
    seen.add(key);

    // Build intervals based on components
    const intervals = {};
    if (components.includes("rotated")) intervals.rotation = interval;
    if (components.includes("swapped")) intervals.swap = interval;
    if (components.includes("mirrored")) intervals.mirror = interval;
    if (components.includes("inverted")) intervals.invert = interval;

    // Create human-readable label
    let label = components.join("+");
    if (direction) label += ` (${direction.toUpperCase()})`;
    if (interval === 4) label += " (1/4)";
    else if (interval === 2) label += " (1/2)";

    candidates.push({
      transformation,
      components,
      intervals,
      rotationDirection: direction,
      label,
      // For display: format like "90° CW pure rotation" vs "90° CCW + swap"
      description: formatCandidateDescription(transformation, direction),
    });
  }

  return candidates;
}

/**
 * Format a human-readable description for a candidate designation
 */
function formatCandidateDescription(transformation, direction) {
  const upper = transformation.toUpperCase();

  // Triple compound: rotation + swap + invert (check first, most specific)
  if (
    upper.includes("ROTATED_90") &&
    upper.includes("SWAPPED") &&
    upper.includes("INVERTED")
  ) {
    const dir = upper.includes("CCW")
      ? "CCW"
      : upper.includes("CW")
        ? "CW"
        : "";
    return `Rotated 90° ${dir} + Swapped + Inverted`;
  }
  if (
    upper.includes("ROTATED_180") &&
    upper.includes("SWAPPED") &&
    upper.includes("INVERTED")
  ) {
    return "Rotated 180° + Swapped + Inverted";
  }

  // Double compound: rotation + invert
  if (
    upper.includes("ROTATED_90") &&
    upper.includes("INVERTED") &&
    !upper.includes("SWAPPED")
  ) {
    const dir = upper.includes("CCW")
      ? "CCW"
      : upper.includes("CW")
        ? "CW"
        : "";
    return `Rotated 90° ${dir} + Inverted`;
  }
  if (
    upper.includes("ROTATED_180") &&
    upper.includes("INVERTED") &&
    !upper.includes("SWAPPED")
  ) {
    return "Rotated 180° + Inverted";
  }

  // Double compound: rotation + swap
  if (upper.includes("ROTATED_90") && upper.includes("SWAPPED")) {
    const dir = upper.includes("CCW")
      ? "CCW"
      : upper.includes("CW")
        ? "CW"
        : "";
    return `Rotated 90° ${dir} + Swapped`;
  }
  if (upper.includes("ROTATED_180") && upper.includes("SWAPPED")) {
    return "Rotated 180° + Swapped";
  }

  // Pure rotations
  if (upper.includes("ROTATED_90")) {
    const dir = upper.includes("CCW")
      ? "CCW"
      : upper.includes("CW")
        ? "CW"
        : "";
    return `Rotated 90° ${dir}`;
  }
  if (upper.includes("ROTATED_180")) {
    return "Rotated 180°";
  }

  // Other compounds
  if (upper.includes("MIRRORED") && upper.includes("SWAPPED")) {
    return "Mirrored + Swapped";
  }
  if (upper.includes("MIRRORED")) {
    return "Mirrored";
  }
  if (upper.includes("FLIPPED") && upper.includes("INVERTED")) {
    return "Flipped + Inverted";
  }
  if (upper.includes("FLIPPED")) {
    return "Flipped";
  }
  if (upper.includes("SWAPPED")) {
    return "Swapped";
  }
  if (upper.includes("INVERTED")) {
    return "Inverted";
  }

  return transformation.replace(/_/g, " ");
}

/**
 * Group beat pairs by their transformation pattern
 * Uses the highest-priority transformation as the grouping key
 * Returns groups like: { "ROTATED_180+SWAPPED": [1, 2, 3, 4] }
 */
function groupBeatPairsByPattern(beatPairs) {
  const groups = {};

  for (const pair of beatPairs) {
    // Use the highest-priority transformation as grouping key
    const primaryPattern = pair.detectedTransformations[0] || "UNKNOWN";

    if (!groups[primaryPattern]) {
      groups[primaryPattern] = [];
    }
    groups[primaryPattern].push(pair.keyBeat);
  }

  return groups;
}

/**
 * Group beats by letter
 */
function groupBeatsByLetter(beats) {
  const groups = {};

  for (const beat of beats) {
    if (!groups[beat.letter]) {
      groups[beat.letter] = [];
    }
    groups[beat.letter].push(beat.beatNumber);
  }

  return groups;
}

/**
 * Analyze transformation pattern for a group of beats (same letter)
 */
function analyzeLetterGroupPattern(beatNumbers, graph) {
  if (beatNumbers.length < 2) {
    return { pattern: "single", transformationSequence: [] };
  }

  // Check transformation sequence through the cycle
  const transformationSequence = [];

  for (let i = 0; i < beatNumbers.length - 1; i++) {
    const from = beatNumbers[i];
    const to = beatNumbers[i + 1];

    const transforms = graph[from]?.[to] || [];
    transformationSequence.push({
      from,
      to,
      transformations: transforms,
    });
  }

  // Also check last to first (circular)
  const lastToFirst =
    graph[beatNumbers[beatNumbers.length - 1]]?.[beatNumbers[0]] || [];
  transformationSequence.push({
    from: beatNumbers[beatNumbers.length - 1],
    to: beatNumbers[0],
    transformations: lastToFirst,
  });

  return {
    pattern: "cycle",
    transformationSequence,
  };
}

/**
 * Detect modular patterns using beat-pair graph approach
 * Only returns modular if letters have NON-CONSECUTIVE occurrences with different patterns
 */
function detectModularPattern(beats) {
  if (beats.length < 2) {
    return null;
  }

  // Build the beat pair graph
  const graph = buildBeatPairGraph(beats);

  // Group beats by letter
  const letterGroups = groupBeatsByLetter(beats);

  // Filter out letters that only appear consecutively (like AA in AABB)
  // These are not independent motifs - they're just repeated letters
  //
  // IMPORTANT: This correctly handles circular boundaries. For example:
  // - If A appears at beats [1, 16] (end of partial wrapping to start),
  //   16 ≠ 1+1, so allConsecutive = false → A is INCLUDED ✓
  // - If A appears at beats [1, 2] (only consecutive occurrence),
  //   2 = 1+1, so allConsecutive = true → A is FILTERED OUT ✓
  // - If A appears at beats [1, 6, 7] (mixed consecutive and gaps),
  //   6 ≠ 1+1, so allConsecutive = false → A is INCLUDED ✓
  const nonConsecutiveLetterGroups = {};
  for (const [letter, beatNumbers] of Object.entries(letterGroups)) {
    if (beatNumbers.length === 1) {
      // Single occurrence - include it
      nonConsecutiveLetterGroups[letter] = beatNumbers;
      continue;
    }

    // Check if all occurrences are consecutive (numerically)
    const sorted = [...beatNumbers].sort((a, b) => a - b);
    let allConsecutive = true;
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] !== sorted[i - 1] + 1) {
        allConsecutive = false;
        break;
      }
    }

    // Only include if NOT all consecutive (i.e., letter repeats at different points)
    if (!allConsecutive) {
      nonConsecutiveLetterGroups[letter] = beatNumbers;
    }
  }

  // Need at least 2 letters with non-consecutive occurrences for modular
  if (Object.keys(nonConsecutiveLetterGroups).length < 2) {
    return null;
  }

  // Analyze each letter group's pattern
  const letterPatterns = {};
  for (const [letter, beatNumbers] of Object.entries(
    nonConsecutiveLetterGroups
  )) {
    letterPatterns[letter] = analyzeLetterGroupPattern(beatNumbers, graph);
  }

  // Check if different letters have different patterns (= modular)
  const uniquePatterns = new Set();
  for (const [letter, analysis] of Object.entries(letterPatterns)) {
    const patternSig = JSON.stringify(
      analysis.transformationSequence.map((t) =>
        t.transformations.sort().join("+")
      )
    );
    uniquePatterns.add(patternSig);
  }

  const isModular = uniquePatterns.size > 1;

  if (isModular) {
    return {
      isModular: true,
      letterGroups: nonConsecutiveLetterGroups,
      letterPatterns,
      uniquePatternCount: uniquePatterns.size,
    };
  }

  return null;
}

function detectLOOPType(sequence) {
  const circular = isCircular(sequence);
  const beats = extractBeats(sequence);

  if (!circular || beats.length < 2) {
    return { loopType: null, components: [], transformationIntervals: {} };
  }

  // Continue with standard halved/quartered detection for non-modular patterns
  const halfLength = Math.floor(beats.length / 2);
  if (beats.length % 2 !== 0) {
    return { loopType: null, components: [], transformationIntervals: {} };
  }

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

  for (let i = 0; i < halfLength; i++) {
    const beat1 = beats[i];
    const beat2 = beats[i + halfLength];

    if (isRotated(beat1, beat2)) results.rotated.matches++;
    if (isSwapped(beat1, beat2)) results.swapped.matches++;
    if (isMirrored(beat1, beat2)) results.mirrored.matches++;
    if (isFlipped(beat1, beat2)) results.flipped.matches++;
    if (isInverted(beat1, beat2)) results.inverted.matches++;
    if (isRotatedThenSwapped(beat1, beat2)) results.rotatedSwapped.matches++;
    if (isMirroredThenSwapped(beat1, beat2)) results.mirroredSwapped.matches++;
    if (isFlippedThenInverted(beat1, beat2)) results.flippedInverted.matches++;
    if (isMirroredSwappedInverted(beat1, beat2))
      results.mirroredSwappedInverted.matches++;
    if (isRepeated(beat1, beat2)) results.repeated.matches++;
  }

  const detectedComponents = [];

  if (results.rotated.matches === halfLength)
    detectedComponents.push("rotated");
  if (results.swapped.matches === halfLength)
    detectedComponents.push("swapped");
  if (results.mirrored.matches === halfLength)
    detectedComponents.push("mirrored");
  if (results.flipped.matches === halfLength)
    detectedComponents.push("flipped");
  if (results.inverted.matches === halfLength)
    detectedComponents.push("inverted");
  if (results.repeated.matches === halfLength)
    detectedComponents.push("repeated");

  // Check compound types
  if (results.rotatedSwapped.matches === halfLength) {
    const swapIsMeaningful = beats
      .slice(0, halfLength)
      .some((beat) => beat.left?.motionType !== beat.right?.motionType);
    if (swapIsMeaningful && !detectedComponents.includes("rotated+swapped")) {
      detectedComponents.push("rotated+swapped");
    }
  }
  if (results.mirroredSwapped.matches === halfLength) {
    const swapIsMeaningful = beats
      .slice(0, halfLength)
      .some((beat) => beat.left?.motionType !== beat.right?.motionType);
    if (swapIsMeaningful && !detectedComponents.includes("mirrored+swapped")) {
      detectedComponents.push("mirrored+swapped");
    }
  }
  if (results.flippedInverted.matches === halfLength) {
    const flippedIndex = detectedComponents.indexOf("flipped");
    if (flippedIndex !== -1) detectedComponents.splice(flippedIndex, 1);
    detectedComponents.push("flipped+inverted");
  }
  if (results.mirroredSwappedInverted.matches === halfLength) {
    const swapIsMeaningful = beats
      .slice(0, halfLength)
      .some((beat) => beat.left?.motionType !== beat.right?.motionType);
    if (swapIsMeaningful) {
      [
        "mirrored",
        "swapped",
        "inverted",
        "mirrored+swapped",
        "flipped+inverted",
      ].forEach((c) => {
        const idx = detectedComponents.indexOf(c);
        if (idx !== -1) detectedComponents.splice(idx, 1);
      });
      detectedComponents.push("mirrored+swapped+inverted");
    }
  }

  // Check QUARTERED patterns
  if (beats.length >= 4 && beats.length % 4 === 0) {
    const quarterLength = beats.length / 4;
    let quarteredRotatedSwappedMatches = 0;

    for (let q = 0; q < 3; q++) {
      for (let i = 0; i < quarterLength; i++) {
        const beat1 = beats[q * quarterLength + i];
        const beat2 = beats[(q + 1) * quarterLength + i];
        if (isQuarteredRotatedSwapped(beat1, beat2))
          quarteredRotatedSwappedMatches++;
      }
    }

    const totalQuarteredPairs = quarterLength * 3;
    if (quarteredRotatedSwappedMatches === totalQuarteredPairs) {
      const swapIsMeaningful = beats
        .slice(0, quarterLength)
        .some((beat) => beat.left?.motionType !== beat.right?.motionType);
      if (swapIsMeaningful) {
        const rotatedIdx = detectedComponents.indexOf("rotated");
        if (rotatedIdx !== -1) detectedComponents.splice(rotatedIdx, 1);
        if (!detectedComponents.includes("rotated+swapped"))
          detectedComponents.push("rotated+swapped");
      }
    }

    // Check MIXED-SLICE pattern
    const quarterTransitions = [];
    for (let q = 0; q < 4; q++) {
      const qStart = q * quarterLength;
      const qNext = ((q + 1) % 4) * quarterLength;
      const b1 = beats[qStart];
      const b2 = beats[qNext];
      quarterTransitions.push({
        pureRotation: isQuarteredRotatedOnly(b1, b2),
        rotationSwap: isQuarteredRotatedSwapped(b1, b2),
        has90Rotation:
          isQuarteredRotatedOnly(b1, b2) || isQuarteredRotatedSwapped(b1, b2),
      });
    }

    const allHave90Rotation = quarterTransitions.every((t) => t.has90Rotation);
    const someHaveSwap = quarterTransitions.some((t) => t.rotationSwap);
    const someArePure = quarterTransitions.some((t) => t.pureRotation);

    if (allHave90Rotation && someHaveSwap && someArePure) {
      const rotatedIdx = detectedComponents.indexOf("rotated");
      if (rotatedIdx !== -1) detectedComponents.splice(rotatedIdx, 1);
      if (!detectedComponents.includes("rotated+swapped"))
        detectedComponents.push("rotated+swapped");
    }
  }

  // Track transformation intervals (halved vs quartered) and rotation direction
  const transformationIntervals = {};
  let rotationDirection = null;

  // Rotation interval: Check if rotation is at ½ (180°) or ¼ (90°)
  if (
    detectedComponents.includes("rotated") ||
    detectedComponents.includes("rotated+swapped")
  ) {
    // If quartered rotation was detected, it's 90° (quartered)
    // Otherwise if halved rotation matched, it's 180° (halved)
    const hasQuarteredRotation =
      beats.length >= 4 &&
      beats.length % 4 === 0 &&
      (() => {
        const quarterLength = beats.length / 4;
        for (let i = 0; i < quarterLength; i++) {
          if (
            !isQuarteredRotatedOnly(beats[i], beats[quarterLength + i]) &&
            !isQuarteredRotatedSwapped(beats[i], beats[quarterLength + i])
          ) {
            return false;
          }
        }
        return true;
      })();
    transformationIntervals.rotation = hasQuarteredRotation ? 4 : 2;

    // Detect rotation direction for quartered rotations
    if (hasQuarteredRotation) {
      rotationDirection = detectRotationDirection(beats);
    }
  }

  // Swap interval: Check if swap is at ½ or ¼
  if (
    detectedComponents.includes("swapped") ||
    detectedComponents.includes("rotated+swapped") ||
    detectedComponents.includes("mirrored+swapped") ||
    detectedComponents.includes("mirrored+swapped+inverted")
  ) {
    // Check if swap happens at quarter boundaries
    const hasQuarteredSwap =
      beats.length >= 4 &&
      beats.length % 4 === 0 &&
      (() => {
        const quarterLength = beats.length / 4;
        // For quartered swap: beat 1 should swap with beat at quarterLength+1
        for (let i = 0; i < quarterLength; i++) {
          const b1 = beats[i];
          const b2 = beats[quarterLength + i];
          // Check if blue/red swap at quarter boundary
          const swappedAtQuarter =
            b1.left?.startLoc === b2.right?.startLoc &&
            b1.right?.startLoc === b2.left?.startLoc;
          if (!swappedAtQuarter) return false;
        }
        return true;
      })();
    transformationIntervals.swap = hasQuarteredSwap ? 4 : 2;
  }

  // Mirror interval
  if (
    detectedComponents.includes("mirrored") ||
    detectedComponents.includes("mirrored+swapped") ||
    detectedComponents.includes("mirrored+swapped+inverted")
  ) {
    transformationIntervals.mirror = 2; // Mirror is typically halved
  }

  // Invert interval
  if (
    detectedComponents.includes("inverted") ||
    detectedComponents.includes("mirrored+swapped+inverted") ||
    detectedComponents.includes("flipped+inverted")
  ) {
    transformationIntervals.invert = 2; // Invert is typically halved
  }

  // Generate beat-pair analysis - this is the source of truth
  const beatPairs = generateHalvedBeatPairs(beats);
  const beatPairGroups = groupBeatPairsByPattern(beatPairs);

  // ============================================================
  // PRIORITY 0: Check for QUARTERED patterns first (90° rotations)
  // For sequences divisible by 4, check quarter-to-quarter transformations
  // ALSO check if halved 180° pattern exists as an additional valid designation
  // ============================================================
  if (beats.length >= 4 && beats.length % 4 === 0) {
    const quarteredBeatPairs = generateQuarteredBeatPairs(beats);
    const allQuarteredCommon = findAllCommonTransformations(quarteredBeatPairs);

    // Filter to only 90° rotation patterns
    const rotation90Patterns = allQuarteredCommon.filter(
      (t) =>
        t.includes("rotated_90") || t.includes("90_ccw") || t.includes("90_cw")
    );

    if (rotation90Patterns.length > 0) {
      // Build quartered candidate designations
      const quarteredCandidates = buildCandidateDesignations(
        rotation90Patterns,
        4,
        rotationDirection
      );

      // ALSO check for halved 180° pattern as an additional valid designation
      // This is often the "simpler" explanation when motion types differ between halves
      const allHalvedCommon = findAllCommonTransformations(beatPairs);
      const halved180Patterns = allHalvedCommon.filter(
        (t) => t.includes("rotated_180") || t === "rotated"
      );

      // Build halved candidates if 180° rotation exists
      const halvedCandidates =
        halved180Patterns.length > 0
          ? buildCandidateDesignations(halved180Patterns, 2, null)
          : [];

      // Combine: halved 180° first (simpler), then quartered 90° patterns
      // The simpler 180° explanation is often more intuitive when halves are distinct
      const candidateDesignations = [
        ...halvedCandidates,
        ...quarteredCandidates,
      ];

      // Use halved 180° as primary if available, otherwise first quartered pattern
      const primaryPattern =
        halved180Patterns.length > 0
          ? halved180Patterns[0]
          : rotation90Patterns[0];
      const primaryInterval =
        halved180Patterns.length > 0 ? 2 : 4;
      const derivedComponents =
        deriveComponentsFromBeatPairPattern(primaryPattern);
      const derivedDirection =
        primaryInterval === 4
          ? extractRotationDirection(primaryPattern) || rotationDirection
          : null;

      if (derivedComponents.length > 0) {
        const derivedIntervals = {};
        if (derivedComponents.includes("rotated"))
          derivedIntervals.rotation = primaryInterval;
        if (derivedComponents.includes("swapped"))
          derivedIntervals.swap = primaryInterval;
        if (derivedComponents.includes("mirrored"))
          derivedIntervals.mirror = primaryInterval;
        if (derivedComponents.includes("inverted"))
          derivedIntervals.invert = primaryInterval;

        const loopType =
          primaryInterval === 2
            ? derivedComponents.sort().join("_")
            : derivedComponents.sort().join("_") + "_quartered";

        return {
          loopType,
          components: derivedComponents,
          transformationIntervals: derivedIntervals,
          rotationDirection: derivedDirection,
          beatPairs: quarteredBeatPairs,
          beatPairGroups: groupBeatPairsByPattern(quarteredBeatPairs),
          commonTransformation: primaryPattern,
          // ALL valid candidate designations (halved 180° + quartered 90°)
          candidateDesignations,
          allCommonTransformations: [
            ...halved180Patterns,
            ...rotation90Patterns,
          ],
        };
      }
    }
  }

  // ============================================================
  // PRIORITY 1: Find COMMON transformation across ALL beat pairs (halved)
  // This is the most accurate way to identify the LOOP pattern
  // ============================================================
  const allHalvedCommon = findAllCommonTransformations(beatPairs);
  const commonTransformation =
    allHalvedCommon.length > 0 ? allHalvedCommon[0] : null;

  if (commonTransformation) {
    // Build ALL candidate designations from common transformations
    const candidateDesignations = buildCandidateDesignations(
      allHalvedCommon,
      2,
      rotationDirection
    );

    // We found a transformation that ALL beat pairs share!
    const derivedComponents =
      deriveComponentsFromBeatPairPattern(commonTransformation);

    if (derivedComponents.length > 0) {
      const derivedIntervals = {};
      if (derivedComponents.includes("inverted"))
        derivedIntervals.invert = 2;
      if (derivedComponents.includes("rotated"))
        derivedIntervals.rotation = 2;
      if (derivedComponents.includes("swapped"))
        derivedIntervals.swap = 2;
      if (derivedComponents.includes("mirrored"))
        derivedIntervals.mirror = 2;
      if (derivedComponents.includes("flipped"))
        derivedIntervals.flip = 2;

      const loopType = derivedComponents.sort().join("_");

      // Use previously detected rotation direction if available
      return {
        loopType,
        components: derivedComponents,
        transformationIntervals: derivedIntervals,
        rotationDirection,
        beatPairs,
        beatPairGroups,
        commonTransformation,
        // NEW: All equally-valid candidate designations
        candidateDesignations,
        allCommonTransformations: allHalvedCommon,
      };
    }
  }

  // ============================================================
  // PRIORITY 2: Check if all beat pairs have the same PRIMARY pattern
  // ============================================================
  const groupKeys = Object.keys(beatPairGroups);

  if (groupKeys.length === 1 && groupKeys[0] !== "UNKNOWN") {
    const unifiedPattern = groupKeys[0];
    const derivedComponents =
      deriveComponentsFromBeatPairPattern(unifiedPattern);

    if (derivedComponents.length > 0) {
      const derivedIntervals = {};
      if (derivedComponents.includes("inverted"))
        derivedIntervals.invert = 2;
      if (derivedComponents.includes("rotated"))
        derivedIntervals.rotation = 2;
      if (derivedComponents.includes("swapped"))
        derivedIntervals.swap = 2;
      if (derivedComponents.includes("mirrored"))
        derivedIntervals.mirror = 2;
      if (derivedComponents.includes("flipped"))
        derivedIntervals.flip = 2;

      const loopType = derivedComponents.sort().join("_");

      return {
        loopType,
        components: derivedComponents,
        transformationIntervals: derivedIntervals,
        rotationDirection,
        beatPairs,
        beatPairGroups,
      };
    }
  }

  // ============================================================
  // PRIORITY 3: Check for modular patterns (different letters have different patterns)
  // Only do this if we couldn't find a common transformation
  // ============================================================
  const modularResult = detectModularPattern(beats);
  if (modularResult && modularResult.isModular) {
    return {
      loopType: "modular",
      components: ["modular"],
      transformationIntervals: {},
      rotationDirection,
      modularAnalysis: modularResult,
      beatPairs,
      beatPairGroups,
    };
  }

  // ============================================================
  // PRIORITY 4: Fall back to old detection for complex/mixed patterns
  // ============================================================
  let loopType = null;
  if (detectedComponents.length > 0) {
    const sorted = [...detectedComponents].sort().join("_");
    const typeMap = {
      rotated: "rotated",
      swapped: "swapped",
      mirrored: "mirrored",
      flipped: "flipped",
      inverted: "inverted",
      repeated: "repeated",
      // Double compounds
      rotated_swapped: "rotated_swapped",
      "rotated+swapped": "rotated_swapped",
      rotated_inverted: "rotated_inverted",
      "rotated+inverted": "rotated_inverted",
      inverted_rotated: "rotated_inverted",
      mirrored_swapped: "mirrored_swapped",
      "mirrored+swapped": "mirrored_swapped",
      flipped_inverted: "flipped_inverted",
      "flipped+inverted": "flipped_inverted",
      // Triple compounds
      rotated_swapped_inverted: "rotated_swapped_inverted",
      "rotated+swapped+inverted": "rotated_swapped_inverted",
      inverted_rotated_swapped: "rotated_swapped_inverted",
      "mirrored+swapped+inverted": "mirrored_swapped_inverted",
    };
    loopType = typeMap[sorted] || sorted;
  }

  return {
    loopType,
    components: detectedComponents,
    transformationIntervals,
    rotationDirection,
    beatPairs,
    beatPairGroups,
  };
}

/**
 * Derive component list from a beat-pair transformation pattern string
 * e.g., "ROTATED_180 + INVERTED" → ["rotated", "inverted"]
 * Also extracts rotation direction if present
 */
function deriveComponentsFromBeatPairPattern(pattern) {
  const components = [];
  const upper = pattern.toUpperCase();

  // Check for each transformation type
  if (upper.includes("INVERTED") || upper.includes("INV")) {
    components.push("inverted");
  }
  if (upper.includes("ROTATED") || upper.includes("ROT")) {
    components.push("rotated");
  }
  if (
    upper.includes("SWAPPED") ||
    upper.includes("SWAP") ||
    upper.includes("SW")
  ) {
    // Only add swap if it's explicitly mentioned (not as part of other words)
    if (
      upper.includes("SWAPPED") ||
      upper.match(/\bSW\b/) ||
      upper.match(/\bSWAP\b/)
    ) {
      components.push("swapped");
    }
  }
  if (
    upper.includes("MIRRORED") ||
    upper.includes("MIRROR") ||
    upper.match(/\bMIR\b/)
  ) {
    components.push("mirrored");
  }
  if (
    upper.includes("FLIPPED") ||
    upper.includes("FLIP") ||
    upper.includes("HORIZONTAL_FLIP")
  ) {
    components.push("flipped");
  }
  if (upper.includes("REPEATED") || upper === "SAME") {
    components.push("repeated");
  }

  return components;
}

/**
 * Extract rotation direction from a transformation pattern
 * Returns "ccw" | "cw" | null
 */
function extractRotationDirection(pattern) {
  const upper = pattern.toUpperCase();
  if (upper.includes("CCW")) return "ccw";
  if (upper.includes("CW")) return "cw";
  return null;
}

// ============================================================================
// Main Execution
// ============================================================================

/**
 * Generate minimal JSON format for a sequence - strips noise for AI analysis
 */
function generateMinimalSequenceJSON(sequence, detected) {
  const beats = extractBeats(sequence);

  const minimal = {
    word: sequence.word,
    beatCount: beats.length,
    isCircular: isCircular(sequence),

    // ALL equally-valid candidate designations (can confirm/deny each)
    candidateDesignations: (detected.candidateDesignations || []).map((c) => ({
      label: c.label,
      description: c.description,
      components: c.components,
      rotationDirection: c.rotationDirection || null,
      intervals: c.intervals,
    })),

    // Primary auto-detected LOOP label (first candidate)
    primaryDetection: {
      loopType: detected.loopType,
      components: detected.components,
      rotationDirection: detected.rotationDirection || null,
      intervals: detected.transformationIntervals,
    },

    // All common transformations found (raw)
    allCommonTransformations: detected.allCommonTransformations || [],

    // Minimal beat data - only what matters for LOOP analysis
    beats: beats.map((b) => ({
      beat: b.beatNumber,
      letter: b.letter,
      left: {
        start: b.left.startLoc,
        end: b.left.endLoc,
        motion: b.left.motionType,
      },
      right: {
        start: b.right.startLoc,
        end: b.right.endLoc,
        motion: b.right.motionType,
      },
    })),
  };

  return minimal;
}

async function main() {
  initFirebase();
  const args = process.argv.slice(2);
  const applyMode = args.includes("--apply");
  const forceMode = args.includes("--force");
  const formatMode = args.includes("--format"); // New: output minimal JSON format
  const wordArg = args.find((a) => a.startsWith("--word="));
  const wordIndex = args.indexOf("--word");
  const singleWord = wordArg
    ? wordArg.split("=")[1]
    : wordIndex >= 0
      ? args[wordIndex + 1]
      : null;

  // Skip header output in format mode
  if (!formatMode) {
    console.log("=".repeat(70));
    const modeLabel = applyMode
      ? forceMode
        ? "AUTO-LABEL LOOP SEQUENCES (APPLY + FORCE MODE)"
        : "AUTO-LABEL LOOP SEQUENCES (APPLY MODE)"
      : "AUTO-LABEL LOOP SEQUENCES (DRY RUN)";
    console.log(modeLabel);
    console.log("=".repeat(70));
    console.log();
  }

  // Load sequence index
  const sequenceIndexPath = path.join(
    __dirname,
    "..",
    "static",
    "data",
    "sequence-index.json"
  );
  const sequenceIndex = JSON.parse(fs.readFileSync(sequenceIndexPath, "utf8"));
  const sequences = sequenceIndex.sequences;
  if (!formatMode)
    console.log(
      `Loaded ${sequences.length} sequences from sequence-index.json`
    );

  // Get existing labels
  const snapshot = await db.collection("loop-labels").get();
  const existingLabels = new Set();
  snapshot.forEach((doc) => existingLabels.add(doc.id));
  if (!formatMode)
    console.log(`Found ${existingLabels.size} existing labels in Firebase`);

  // Filter to circular sequences (optionally skip already-labeled check with --force)
  let toLabel = sequences.filter((s) => {
    if (!s.fullMetadata?.sequence) return false;
    if (!forceMode && existingLabels.has(s.word)) return false;
    return isCircular(s);
  });

  if (singleWord) {
    toLabel = sequences.filter((s) => s.word === singleWord);
    if (toLabel.length === 0) {
      console.log(`\nSequence "${singleWord}" not found`);
      process.exit(1);
    }
  }

  if (!formatMode) {
    console.log(`\nSequences to label: ${toLabel.length}`);
    console.log();
  }

  // Group by detected type for summary
  const byType = {};
  const results = [];

  for (const seq of toLabel) {
    const detected = detectLOOPType(seq);
    const typeKey = detected.loopType || "none";

    if (!byType[typeKey]) byType[typeKey] = [];
    byType[typeKey].push(seq.word);

    results.push({
      word: seq.word,
      beatCount: extractBeats(seq).length,
      loopType: detected.loopType,
      components: detected.components,
      transformationIntervals: detected.transformationIntervals,
      rotationDirection: detected.rotationDirection,
      beatPairs: detected.beatPairs || [],
      beatPairGroups: detected.beatPairGroups || {},
      // All equally-valid candidate designations
      candidateDesignations: detected.candidateDesignations || [],
    });
  }

  // Print summary by type (skip in format mode)
  if (!formatMode) {
    console.log("=".repeat(70));
    console.log("DETECTION SUMMARY BY TYPE");
    console.log("=".repeat(70));
    Object.entries(byType)
      .sort((a, b) => b[1].length - a[1].length)
      .forEach(([type, words]) => {
        console.log(`\n${type.toUpperCase()} (${words.length}):`);
        console.log(
          `  ${words.slice(0, 20).join(", ")}${words.length > 20 ? "..." : ""}`
        );
      });
  }

  // Apply if requested
  if (applyMode && !singleWord) {
    console.log();
    console.log("=".repeat(70));
    console.log("APPLYING TO FIREBASE...");
    console.log("=".repeat(70));

    const batch = db.batch();
    let batchCount = 0;
    const BATCH_LIMIT = 500;

    for (const result of results) {
      const docRef = db.collection("loop-labels").doc(result.word);

      // Build ALL candidate designations for Firebase storage
      const candidates = (result.candidateDesignations || []).map((c) => ({
        components: c.components,
        loopType: c.components.sort().join("_"),
        transformationIntervals: c.intervals,
        rotationDirection: c.rotationDirection || null,
        label: c.label,
        description: c.description,
        confirmed: false, // User can confirm/deny each candidate
      }));

      // Build primary designation for backwards compatibility
      const designation = {
        components: result.components,
        loopType: result.loopType,
      };
      if (Object.keys(result.transformationIntervals || {}).length > 0) {
        designation.transformationIntervals = result.transformationIntervals;
      }
      if (result.rotationDirection) {
        designation.rotationDirection = result.rotationDirection;
      }

      // Build notes with beat-pair grouping summary
      let notesParts = [
        `Auto-labeled by detection algorithm. Detected: ${result.components.join("+") || "none"}`,
      ];
      if (Object.keys(result.transformationIntervals || {}).length > 0) {
        notesParts.push(
          `Intervals: ${Object.entries(result.transformationIntervals)
            .map(([k, v]) => `${k}=${v}`)
            .join(", ")}`
        );
      }
      if (result.rotationDirection) {
        notesParts.push(
          `Rotation direction: ${result.rotationDirection.toUpperCase()}`
        );
      }
      if (candidates.length > 1) {
        notesParts.push(
          `Multiple valid designations detected: ${candidates.length}`
        );
      }
      if (Object.keys(result.beatPairGroups || {}).length > 1) {
        // Multiple groups = modular or mixed transformations
        const groupSummary = Object.entries(result.beatPairGroups)
          .map(([pattern, beats]) => `Beats ${beats.join(",")}: ${pattern}`)
          .join(" | ");
        notesParts.push(`Beat-pair groups: ${groupSummary}`);
      }

      const labelData = {
        word: result.word,
        designations: result.components.length > 0 ? [designation] : [],
        // NEW: All candidate designations for UI to display/confirm
        candidateDesignations: candidates,
        hasMultipleCandidates: candidates.length > 1,
        isFreeform: result.components.length === 0,
        needsVerification: true,
        autoLabeled: true,
        labeledAt: new Date().toISOString(),
        notes: notesParts.join(". "),
      };

      // Only add optional fields if they have values
      if (result.rotationDirection) {
        labelData.rotationDirection = result.rotationDirection;
      }
      if (result.beatPairs && result.beatPairs.length > 0) {
        labelData.beatPairs = result.beatPairs;
      }
      if (
        result.beatPairGroups &&
        Object.keys(result.beatPairGroups).length > 0
      ) {
        labelData.beatPairGroups = result.beatPairGroups;
      }

      batch.set(docRef, labelData);
      batchCount++;

      if (batchCount >= BATCH_LIMIT) {
        await batch.commit();
        console.log(`Committed batch of ${batchCount} labels`);
        batchCount = 0;
      }
    }

    if (batchCount > 0) {
      await batch.commit();
      console.log(`Committed final batch of ${batchCount} labels`);
    }

    console.log(`\nTotal labels written: ${results.length}`);
  } else if (singleWord) {
    const result = results[0];
    const seq = toLabel[0];

    // Format mode: output minimal JSON only
    if (formatMode) {
      const detected = detectLOOPType(seq);
      const minimal = generateMinimalSequenceJSON(seq, detected);
      console.log(JSON.stringify(minimal, null, 2));
      process.exit(0);
    }

    console.log();
    console.log("=".repeat(70));
    console.log(`SINGLE WORD RESULT: ${singleWord}`);
    console.log("=".repeat(70));
    console.log(`  Beat count: ${result.beatCount}`);
    console.log(`  LOOP Type: ${result.loopType || "none"}`);
    console.log(`  Components: ${result.components.join("+") || "none"}`);
    if (Object.keys(result.transformationIntervals || {}).length > 0) {
      console.log(
        `  Intervals: ${Object.entries(result.transformationIntervals)
          .map(([k, v]) => `${k}=${v}`)
          .join(", ")}`
      );
    }
    if (result.rotationDirection) {
      console.log(
        `  Rotation Direction: ${result.rotationDirection.toUpperCase()}`
      );
    }
    console.log(
      `  Already labeled: ${existingLabels.has(singleWord) ? "YES" : "NO"}`
    );

    // Show candidate designations
    if (
      result.candidateDesignations &&
      result.candidateDesignations.length > 0
    ) {
      console.log();
      console.log("  CANDIDATE DESIGNATIONS:");
      console.log("  " + "-".repeat(50));
      for (let i = 0; i < result.candidateDesignations.length; i++) {
        const c = result.candidateDesignations[i];
        const primary = i === 0 ? " [PRIMARY]" : "";
        console.log(`    ${i + 1}. ${c.description}${primary}`);
        console.log(`       Label: ${c.label}`);
      }
    }

    // Show beat-pair analysis
    if (result.beatPairs && result.beatPairs.length > 0) {
      console.log();
      console.log("  BEAT-PAIR ANALYSIS:");
      console.log("  " + "-".repeat(50));
      for (const pair of result.beatPairs) {
        console.log(
          `    Beat ${pair.keyBeat} ↔ Beat ${pair.correspondingBeat}:`
        );
        for (const t of pair.detectedTransformations) {
          console.log(`      • ${t}`);
        }
      }
    }

    // Show beat-pair groups
    if (
      result.beatPairGroups &&
      Object.keys(result.beatPairGroups).length > 0
    ) {
      console.log();
      console.log("  BEAT-PAIR GROUPS (by transformation pattern):");
      console.log("  " + "-".repeat(50));
      for (const [pattern, beats] of Object.entries(result.beatPairGroups)) {
        console.log(`    ${pattern}: Beats ${beats.join(", ")}`);
      }
    }

    // Save to Firebase in single word mode with --apply
    if (applyMode) {
      console.log();
      console.log("  Saving to Firebase...");

      const docRef = db.collection("loop-labels").doc(result.word);

      // Build ALL candidate designations for Firebase storage (same as batch mode)
      const candidates = (result.candidateDesignations || []).map((c) => ({
        components: c.components,
        loopType: c.components.sort().join("_"),
        transformationIntervals: c.intervals,
        rotationDirection: c.rotationDirection || null,
        label: c.label,
        description: c.description,
        confirmed: false, // User can confirm/deny each candidate
      }));

      // Build primary designation for backwards compatibility
      const designation = {
        components: result.components,
        loopType: result.loopType,
      };
      if (Object.keys(result.transformationIntervals || {}).length > 0) {
        designation.transformationIntervals = result.transformationIntervals;
      }
      if (result.rotationDirection) {
        designation.rotationDirection = result.rotationDirection;
      }

      // Build notes with beat-pair grouping summary
      let notesParts = [
        `Auto-labeled by detection algorithm. Detected: ${result.components.join("+") || "none"}`,
      ];
      if (Object.keys(result.transformationIntervals || {}).length > 0) {
        notesParts.push(
          `Intervals: ${Object.entries(result.transformationIntervals)
            .map(([k, v]) => `${k}=${v}`)
            .join(", ")}`
        );
      }
      if (result.rotationDirection) {
        notesParts.push(
          `Rotation direction: ${result.rotationDirection.toUpperCase()}`
        );
      }
      if (candidates.length > 1) {
        notesParts.push(
          `Multiple valid designations detected: ${candidates.length}`
        );
      }
      if (Object.keys(result.beatPairGroups || {}).length > 1) {
        const groupSummary = Object.entries(result.beatPairGroups)
          .map(([pattern, beats]) => `Beats ${beats.join(",")}: ${pattern}`)
          .join(" | ");
        notesParts.push(`Beat-pair groups: ${groupSummary}`);
      }

      const labelData = {
        word: result.word,
        designations: result.components.length > 0 ? [designation] : [],
        // NEW: All candidate designations for UI to display/confirm
        candidateDesignations: candidates,
        hasMultipleCandidates: candidates.length > 1,
        isFreeform: result.components.length === 0,
        needsVerification: true,
        autoLabeled: true,
        labeledAt: new Date().toISOString(),
        notes: notesParts.join(". "),
      };

      // Only add optional fields if they have values
      if (result.rotationDirection) {
        labelData.rotationDirection = result.rotationDirection;
      }
      if (result.beatPairs && result.beatPairs.length > 0) {
        labelData.beatPairs = result.beatPairs;
      }
      if (
        result.beatPairGroups &&
        Object.keys(result.beatPairGroups).length > 0
      ) {
        labelData.beatPairGroups = result.beatPairGroups;
      }

      await docRef.set(labelData);
      console.log("  ✅ Label saved to Firebase");
      if (candidates.length > 0) {
        console.log(`  📋 Saved ${candidates.length} candidate designation(s)`);
      }
    } else {
      console.log();
      console.log("  Run with --apply to save to Firebase");
    }
  } else {
    console.log();
    console.log("=".repeat(70));
    console.log("DRY RUN COMPLETE");
    console.log("=".repeat(70));
    console.log(
      `\nRun with --apply to write ${results.length} labels to Firebase`
    );
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
  isRotated,
  isSwapped,
  isMirrored,
  isFlipped,
  isInverted,
  isRepeated,
};
