/**
 * Shared composition logic for decomposing sequences into compositional fields.
 *
 * Used by both import-sequence.cjs and migrate-compositional.cjs to populate
 * leftSoloProp, rightSoloProp, stepPairings, and content hashes.
 *
 * Reimplements the TypeScript composition pipeline in pure CJS so it can run
 * in Node without building the app.
 */

const { randomUUID } = require("crypto");

// Enum values (mirrored from TypeScript sources so we stay in CJS land)

const GridLocation = {
  NORTH: "n",
  EAST: "e",
  SOUTH: "s",
  WEST: "w",
  NORTHEAST: "ne",
  SOUTHEAST: "se",
  SOUTHWEST: "sw",
  NORTHWEST: "nw",
  CENTER: "c",
};

const GridMode = {
  DIAMOND: "diamond",
  BOX: "box",
  SKEWED: "skewed",
  CENTRIC: "centric",
};

const MotionType = {
  STATIC: "static",
};

const RotationDirection = {
  NO_ROTATION: "noRotation",
};

const Orientation = {
  IN: "in",
};

const CARDINAL_LOCATIONS = new Set([
  GridLocation.NORTH,
  GridLocation.EAST,
  GridLocation.SOUTH,
  GridLocation.WEST,
]);

const INTERCARDINAL_LOCATIONS = new Set([
  GridLocation.NORTHEAST,
  GridLocation.SOUTHEAST,
  GridLocation.SOUTHWEST,
  GridLocation.NORTHWEST,
]);

// ContentHasher

const BASE62_CHARS =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

function toBase62(bytes) {
  let result = "";
  let value = 0n;
  for (const byte of bytes) {
    value = (value << 8n) | BigInt(byte);
  }
  while (value > 0n) {
    result = BASE62_CHARS[Number(value % 62n)] + result;
    value = value / 62n;
  }
  return result.padStart(22, "0");
}

function hash128(input) {
  let h1 = 0xcbf29ce484222325n;
  let h2 = 0x100000001b3n;
  const FNV_PRIME = 0x00000100000001b3n;
  for (let i = 0; i < input.length; i++) {
    const c = BigInt(input.charCodeAt(i));
    h1 ^= c;
    h1 = (h1 * FNV_PRIME) & 0xffffffffffffffffn;
    h2 ^= c;
    h2 = (h2 * (FNV_PRIME + 2n)) & 0xffffffffffffffffn;
  }
  const bytes = new Uint8Array(16);
  for (let i = 7; i >= 0; i--) {
    bytes[i] = Number(h1 & 0xffn);
    h1 >>= 8n;
    bytes[i + 8] = Number(h2 & 0xffn);
    h2 >>= 8n;
  }
  return toBase62(bytes);
}

function serializeStep(step) {
  let s = `${step.startLocation}:${step.endLocation}:${step.motionType}:${step.rotationDirection}:${step.turns}:${step.startOrientation}:${step.endOrientation}`;
  if (step.plane != null && step.plane !== "wall") s += `:plane=${step.plane}`;
  if (step.handPath != null) {
    s += `:${step.handPath}`;
    if (step.skewSteps != null) {
      s += `:${step.skewSteps}:${step.skewDir ?? ""}`;
    }
  }
  return s;
}

function hashHandPath(locations) {
  return hash128(locations.join("|"));
}

function hashSoloProp(soloProp) {
  const parts = [`${soloProp.startLocation}:${soloProp.startOrientation}`];
  for (const step of soloProp.steps) {
    parts.push(serializeStep(step));
  }
  return hash128(parts.join("|"));
}

// ---------------------------------------------------------------------------
// HandPathFactory
// ---------------------------------------------------------------------------

function deriveGridMode(locations) {
  if (locations.includes(GridLocation.CENTER)) return GridMode.CENTRIC;
  const perimeter = locations.filter((loc) => loc !== GridLocation.CENTER);
  if (perimeter.length === 0) return GridMode.DIAMOND;
  if (perimeter.every((loc) => CARDINAL_LOCATIONS.has(loc)))
    return GridMode.DIAMOND;
  if (perimeter.every((loc) => INTERCARDINAL_LOCATIONS.has(loc)))
    return GridMode.BOX;
  return GridMode.SKEWED;
}

function buildBigrams(locations) {
  const bigrams = [];
  for (let i = 0; i < locations.length - 1; i++) {
    bigrams.push(`${locations[i]}_${locations[i + 1]}`);
  }
  return bigrams;
}

function deduplicateLocations(locations) {
  const seen = new Set();
  const result = [];
  for (const loc of locations) {
    if (!seen.has(loc)) {
      seen.add(loc);
      result.push(loc);
    }
  }
  return result;
}

function createHandPath(locations) {
  if (locations.length === 0) {
    throw new Error("HandPathFactory: locations must not be empty");
  }
  const startLocation = locations[0];
  const endLocation = locations[locations.length - 1];
  return {
    id: randomUUID(),
    locations,
    contentHash: hashHandPath(locations),
    startLocation,
    endLocation,
    length: locations.length,
    bigrams: buildBigrams(locations),
    uniqueLocations: deduplicateLocations(locations),
    impliedGridMode: deriveGridMode(locations),
    isClosed: startLocation === endLocation,
  };
}

// ---------------------------------------------------------------------------
// SoloPropFactory
// ---------------------------------------------------------------------------

function extractHandPathLocations(steps) {
  if (steps.length === 0) return [];
  const locations = [steps[0].startLocation];
  for (const step of steps) {
    locations.push(step.endLocation);
  }
  return locations;
}

function createSoloProp(steps, startLocation, startOrientation) {
  if (steps.length === 0) {
    throw new Error("SoloPropFactory: steps must not be empty");
  }
  const handPathLocations = extractHandPathLocations(steps);
  const handPath = createHandPath(handPathLocations);
  const contentHash = hashSoloProp({ startLocation, startOrientation, steps });
  return {
    id: randomUUID(),
    steps,
    startLocation,
    startOrientation,
    contentHash,
    handPath,
    length: steps.length,
    bigrams: handPath.bigrams,
    impliedGridMode: handPath.impliedGridMode,
  };
}

// ---------------------------------------------------------------------------
// SequenceDecomposer
// ---------------------------------------------------------------------------

function motionToSoloPropStep(motion, duration) {
  return {
    startLocation: motion.startLocation,
    endLocation: motion.endLocation,
    startOrientation: motion.startOrientation,
    endOrientation: motion.endOrientation,
    motionType: motion.motionType,
    rotationDirection: motion.rotationDirection,
    turns: motion.turns,
    handPath: motion.handPath ?? null,
    skewSteps: motion.skewSteps ?? null,
    skewDir: motion.skewDir ?? null,
    duration: duration ?? 1,
    ...(motion.plane && { plane: motion.plane }),
  };
}

function makePlaceholderStep(location, orientation, duration) {
  return {
    startLocation: location,
    endLocation: location,
    startOrientation: orientation,
    endOrientation: orientation,
    motionType: MotionType.STATIC,
    rotationDirection: RotationDirection.NO_ROTATION,
    turns: 0,
    duration: duration ?? 1,
  };
}

function motionForHand(motions, hand) {
  if (!motions) return undefined;
  if (hand === "left") return motions.left ?? motions.blue;
  return motions.right ?? motions.red;
}

function extractSoloProp(sequence, hand) {
  const startPlacementMotions =
    sequence.startPlacement?.motions ?? sequence.startingPlacement?.motions;

  const startPlacementMotion = motionForHand(startPlacementMotions, hand);
  const startLocationFromPos = startPlacementMotion?.startLocation;
  const startOrientationFromPos = startPlacementMotion?.startOrientation;

  const firstStepMotion = motionForHand(sequence.steps[0]?.motions, hand);

  const startLocation =
    startLocationFromPos ??
    firstStepMotion?.startLocation ??
    GridLocation.NORTH;

  const startOrientation =
    startOrientationFromPos ??
    firstStepMotion?.startOrientation ??
    Orientation.IN;

  const steps = sequence.steps.map((step) => {
    const motion = motionForHand(step.motions, hand);
    if (!motion) {
      return makePlaceholderStep(
        startLocation,
        startOrientation,
        step.duration
      );
    }
    return motionToSoloPropStep(motion, step.duration ?? 1);
  });

  return createSoloProp(steps, startLocation, startOrientation);
}

function extractStepPairings(sequence) {
  return sequence.steps.map((step) => ({
    letter: step.letter ?? null,
    leftReversal: step.leftReversal ?? false,
    rightReversal: step.rightReversal ?? false,
    startPlacement: step.startPlacement ?? null,
    endPlacement: step.endPlacement ?? null,
  }));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Decompose a sequence into its compositional fields.
 *
 * @param {object} sequence - Must have `steps[]` with current
 *   motions.left/right or legacy motions.blue/red, and optionally a
 *   `startPlacement` with motions.
 * @returns {object|null} Compositional fields to merge into the Firestore doc,
 *   or null if the sequence has no steps.
 */
function decomposeSequence(sequence) {
  if (
    !sequence.steps ||
    !Array.isArray(sequence.steps) ||
    sequence.steps.length === 0
  ) {
    return null;
  }

  const leftSoloProp = extractSoloProp(sequence, "left");
  const rightSoloProp = extractSoloProp(sequence, "right");
  const stepPairings = extractStepPairings(sequence);

  return {
    leftSoloProp,
    rightSoloProp,
    stepPairings,
    leftSoloHash: leftSoloProp.contentHash,
    rightSoloHash: rightSoloProp.contentHash,
  };
}

module.exports = { decomposeSequence };
