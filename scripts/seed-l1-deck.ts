/**
 * Seed the Level 1 Quartered Rotated LOOP Deck to Firestore
 *
 * Uses the MCP server's battle-tested loop executor (executeLOOP) to build
 * all valid 8-beat quartered rotated LOOP sequences on the diamond grid.
 *
 * Algorithm:
 *   1. Load CSV data (same as MCP server's loadDataframe)
 *   2. Build adjacency map
 *   3. Enumerate all valid 2-beat seeds that end at a quartered LOOP position
 *   4. Execute executeLOOP() on each seed to produce the full 8-beat sequence
 *   5. Deduplicate: rotation-invariant + motion-type normalization (pro/anti → shift at 0 turns)
 *   6. Group into hand-path families, write to Firestore
 *
 * Usage: npx tsx scripts/seed-l1-deck.ts [--dry-run]
 * Requires: serviceAccountKey.json in project root
 */

import * as fs from "fs";
import * as path from "path";
import { randomUUID } from "crypto";
import { fileURLToPath } from "url";

// Sequence engine imports (moved from old mcp-server/src/core/)
import {
  executeLOOP,
  type PictographData,
  type MotionData as McpMotionData,
} from "../packages/sequence-engine/src/loop/execution/LOOPExecutor.js";
import {
  LOOPType,
  Period,
} from "../packages/sequence-engine/src/loop/loop-types.js";
import { QUARTERED_LOOPS } from "../packages/sequence-engine/src/loop/validation/LOOPValidator.js";

/**
 * CW-only 90° rotation map. The enumerate script uses CW exclusively.
 * Including both CW and CCW would double the deck with mirrored variants.
 */
const ROTATE_POS_90_CW: Record<string, string> = {
  alpha1: "alpha3",
  alpha3: "alpha5",
  alpha5: "alpha7",
  alpha7: "alpha1",
  beta1: "beta3",
  beta3: "beta5",
  beta5: "beta7",
  beta7: "beta1",
  gamma1: "gamma3",
  gamma3: "gamma5",
  gamma5: "gamma7",
  gamma7: "gamma9",
  gamma9: "gamma11",
  gamma11: "gamma13",
  gamma13: "gamma15",
  gamma15: "gamma1",
};
import {
  calculateOrientations,
  calculateEndOrientation,
  getHandpathDirection,
} from "../packages/sequence-engine/src/core/orientation/OrientationCalculator.js";
import type { SequenceStep } from "../packages/sequence-engine/src/core/types/sequence-engine-types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..");
const CSV_PATH = path.resolve(
  PROJECT_ROOT,
  "static/data/pictographs/DiamondPictographDataframe.csv"
);
const SERVICE_ACCOUNT_PATH = path.resolve(
  PROJECT_ROOT,
  "serviceAccountKey.json"
);
const DECK_ID = "l1-quartered-loop";
const DRY_RUN = process.argv.includes("--dry-run");

const LETTER_TYPES: Record<string, number> = {
  A: 1,
  B: 1,
  C: 1,
  D: 1,
  E: 1,
  F: 1,
  G: 1,
  H: 1,
  I: 1,
  J: 1,
  K: 1,
  L: 1,
  M: 1,
  N: 1,
  O: 1,
  P: 1,
  Q: 1,
  R: 1,
  S: 1,
  T: 1,
  U: 1,
  V: 1,
  W: 2,
  X: 2,
  Y: 2,
  Z: 2,
  Σ: 2,
  Δ: 2,
  Θ: 2,
  Ω: 2,
  "W-": 3,
  "X-": 3,
  "Y-": 3,
  "Z-": 3,
  "Σ-": 3,
  "Δ-": 3,
  "Θ-": 3,
  "Ω-": 3,
  Φ: 4,
  Ψ: 4,
  Λ: 4,
  "Φ-": 5,
  "Ψ-": 5,
  "Λ-": 5,
  α: 6,
  β: 6,
  γ: 6,
};

const TYPE_NAMES: Record<number, string> = {
  1: "Dual-Shift",
  2: "Shift",
  3: "Cross-Shift",
  4: "Dash",
  5: "Dual-Dash",
  6: "Static",
};

// PHASE 1 — LOAD CSV DATA

/** Port of MCP server's loadDataframe() from server-context.ts */
function loadDiamondDataframe(): PictographData[] {
  const csvContent = fs.readFileSync(CSV_PATH, "utf-8");
  const lines = csvContent.trim().split("\n");
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map((h) => h.trim());
  const pictographs: PictographData[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(",").map((v) => v.trim());
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = values[index] || "";
    });

    // The checked-in dataframes keep their published color-keyed headers.
    // Normalize once here so all deck construction below is hand-relative.
    row.leftMotionType ||= row.blueMotionType;
    row.leftRotationDirection ||= row.blueRotationDirection;
    row.leftStartLocation ||= row.blueStartLocation;
    row.leftEndLocation ||= row.blueEndLocation;
    row.rightMotionType ||= row.redMotionType;
    row.rightRotationDirection ||= row.redRotationDirection;
    row.rightStartLocation ||= row.redStartLocation;
    row.rightEndLocation ||= row.redEndLocation;

    if (!row.letter || row.letter.trim() === "") continue;

    const leftOrientations = calculateOrientations({
      motionType: row.leftMotionType,
      turns: 0,
      rotationDirection: row.leftRotationDirection || "cw",
      startLocation: row.leftStartLocation,
      endLocation: row.leftEndLocation,
      startOrientation: "in",
    });

    const rightOrientations = calculateOrientations({
      motionType: row.rightMotionType,
      turns: 0,
      rotationDirection: row.rightRotationDirection || "cw",
      startLocation: row.rightStartLocation,
      endLocation: row.rightEndLocation,
      startOrientation: "in",
    });

    pictographs.push({
      letter: row.letter,
      startPlacement: row.startPlacement,
      endPlacement: row.endPlacement,
      timing: row.timing,
      direction: row.direction,
      leftMotion: {
        hand: "left",
        startLocation: row.leftStartLocation,
        endLocation: row.leftEndLocation,
        motionType: row.leftMotionType,
        rotationDirection: row.leftRotationDirection,
        startOrientation: leftOrientations.startOrientation,
        endOrientation: leftOrientations.endOrientation,
      },
      rightMotion: {
        hand: "right",
        startLocation: row.rightStartLocation,
        endLocation: row.rightEndLocation,
        motionType: row.rightMotionType,
        rotationDirection: row.rightRotationDirection,
        startOrientation: rightOrientations.startOrientation,
        endOrientation: rightOrientations.endOrientation,
      },
    });
  }

  return pictographs;
}

// PHASE 2 — BUILD ADJACENCY MAP

function buildAdjacencyMap(
  pictographs: PictographData[]
): Map<string, PictographData[]> {
  const adj = new Map<string, PictographData[]>();
  for (const p of pictographs) {
    const list = adj.get(p.startPlacement) ?? [];
    list.push(p);
    adj.set(p.startPlacement, list);
  }
  return adj;
}

// PHASE 3 — ENUMERATE VALID 2-BEAT SEEDS & EXECUTE LOOP

/** Convert a PictographData edge into a SequenceStep for the loop executor */
function edgeToStep(edge: PictographData, stepNumber: number): SequenceStep {
  return {
    letter: edge.letter,
    variation: 0,
    startPlacement: edge.startPlacement,
    endPlacement: edge.endPlacement,
    leftMotion: { ...edge.leftMotion },
    rightMotion: { ...edge.rightMotion },
    stepNumber: stepNumber,
    stepNumber,
    isBridge: false,
  };
}

/** Build a start-placement SequenceStep from the first edge */
function buildStartPlacementStep(edge: PictographData): SequenceStep {
  return {
    letter: "α", // placeholder — will be overridden by position group
    variation: 0,
    startPlacement: edge.startPlacement,
    endPlacement: edge.startPlacement,
    leftMotion: {
      hand: "left",
      motionType: "static",
      rotationDirection: "noRotation",
      startLocation: edge.leftMotion.startLocation,
      endLocation: edge.leftMotion.startLocation,
      startOrientation: "in",
      endOrientation: "in",
    },
    rightMotion: {
      hand: "right",
      motionType: "static",
      rotationDirection: "noRotation",
      startLocation: edge.rightMotion.startLocation,
      endLocation: edge.rightMotion.startLocation,
      startOrientation: "in",
      endOrientation: "in",
    },
    stepNumber: 0,
    stepNumber: 0,
    isBridge: false,
  };
}

/**
 * The MCP executor's derivePositionFromLocations is a simplified heuristic
 * that gets position NAMES wrong (e.g., maps left@s/right@n → alpha5 instead
 * of alpha1). Fix this by looking up each generated beat's motions in the
 * CSV to find the correct start/end position names.
 */
function findMatchingPictograph(
  step: SequenceStep,
  allPictographs: PictographData[]
): PictographData | null {
  const bm = step.leftMotion;
  const rm = step.rightMotion;

  for (const p of allPictographs) {
    if (
      p.leftMotion.motionType.toLowerCase() === bm.motionType.toLowerCase() &&
      p.leftMotion.startLocation.toLowerCase() ===
        bm.startLocation.toLowerCase() &&
      p.leftMotion.endLocation.toLowerCase() === bm.endLocation.toLowerCase() &&
      p.rightMotion.motionType.toLowerCase() === rm.motionType.toLowerCase() &&
      p.rightMotion.startLocation.toLowerCase() ===
        rm.startLocation.toLowerCase() &&
      p.rightMotion.endLocation.toLowerCase() === rm.endLocation.toLowerCase()
    ) {
      return p;
    }
  }
  return null;
}

/**
 * Fix position names on generated beats (3-8) by looking them up in the CSV.
 * Beats 1-2 come directly from CSV edges and already have correct positions.
 */
function fixPositionNames(
  steps: SequenceStep[],
  allPictographs: PictographData[]
): SequenceStep[] {
  return steps.map((step, i) => {
    // Beats 1-2 (index 0-1) are from the CSV seed — positions are correct
    if (i < 2) return step;

    const match = findMatchingPictograph(step, allPictographs);
    if (match) {
      return {
        ...step,
        startPlacement: match.startPlacement,
        endPlacement: match.endPlacement,
        letter: match.letter, // Also fix letter from CSV (more authoritative)
      };
    }
    return step;
  });
}

/**
 * Trace the full 8-beat hand path — the actual locations each hand visits.
 *
 * Returns a location chain like "s→w→w→n→n→e→e→s" for each hand.
 * The chain shows where the hand physically IS at each beat boundary.
 */
function traceHandPath(steps: SequenceStep[]): { left: string; right: string } {
  // Start location from beat 1, then each beat's end location
  const leftLocations = [steps[0].leftMotion.startLocation];
  const rightLocations = [steps[0].rightMotion.startLocation];

  for (const step of steps) {
    leftLocations.push(step.leftMotion.endLocation);
    rightLocations.push(step.rightMotion.endLocation);
  }

  return {
    left: leftLocations.join("→"),
    right: rightLocations.join("→"),
  };
}

/**
 * Compute a hand-canonical path key from the full 8-beat location trace.
 *
 * Traces exactly where each hand goes (e.g., s→w→w→n→n→e→e→s→s),
 * then sorts the two hands for assignment invariance (left↔right = same pattern).
 */
function computeHandPathKey(steps: SequenceStep[]): string {
  const trace = traceHandPath(steps);
  return [trace.left, trace.right].sort().join("|");
}

/**
 * Chain orientations across beats so each beat's start orientation
 * matches the previous beat's end orientation.
 *
 * The CSV stores each edge independently with startOrientation="in",
 * but in a real sequence orientations must chain: beat N's end orientation
 * becomes beat N+1's start orientation. Without this, a sequence like
 * anti(in→out) followed by pro would incorrectly start the pro at "in"
 * instead of "out", producing wrong prop facing.
 */
function chainOrientations(steps: SequenceStep[]): SequenceStep[] {
  if (steps.length === 0) return steps;

  // Beat 1 starts at "in" (the universal starting orientation)
  let leftOri = "in";
  let rightOri = "in";

  return steps.map((step) => {
    // This beat starts where the previous beat ended
    const leftStart = leftOri;
    const rightStart = rightOri;

    // Calculate end orientations from the motion data
    const leftEnd = calculateEndOrientation({
      motionType: step.leftMotion.motionType,
      turns: 0,
      rotationDirection: step.leftMotion.rotationDirection || "cw",
      startLocation: step.leftMotion.startLocation,
      endLocation: step.leftMotion.endLocation,
      startOrientation: leftStart,
    });

    const rightEnd = calculateEndOrientation({
      motionType: step.rightMotion.motionType,
      turns: 0,
      rotationDirection: step.rightMotion.rotationDirection || "cw",
      startLocation: step.rightMotion.startLocation,
      endLocation: step.rightMotion.endLocation,
      startOrientation: rightStart,
    });

    // Advance the chain for the next beat
    leftOri = leftEnd;
    rightOri = rightEnd;

    return {
      ...step,
      leftMotion: {
        ...step.leftMotion,
        startOrientation: leftStart,
        endOrientation: leftEnd,
      },
      rightMotion: {
        ...step.rightMotion,
        startOrientation: rightStart,
        endOrientation: rightEnd,
      },
    };
  });
}

interface DeckSequence {
  seqId: string;
  word: string;
  loopWord: string;
  letter1: string;
  letter2: string;
  t1: number;
  t2: number;
  handPath: string;
  handPathId: string;
  familyId: string;
  startPos: string;
  steps: SequenceStep[];
  startPlacementStep: SequenceStep;
}

function enumerateAndExecute(
  adj: Map<string, PictographData[]>,
  allPictographs: PictographData[],
  startPos: string
): DeckSequence[] {
  const results: DeckSequence[] = [];
  const edges = adj.get(startPos) ?? [];

  for (const b1 of edges) {
    const edges2 = adj.get(b1.endPlacement) ?? [];
    for (const b2 of edges2) {
      // Check if seed end position is the CW 90° rotation of start.
      // Only CW — including CCW would double the deck with mirrored variants.
      if (b2.endPlacement !== ROTATE_POS_90_CW[startPos]) continue;

      // Rotation continuity: rotation directions must be compatible between
      // beats AND across the quarter boundary (b2 → b1 of the next quarter).
      // "noRotation" is always compatible; otherwise directions must match.
      const rotOk = (a: string, b: string) =>
        a === "noRotation" || b === "noRotation" || a === b;

      // Beat 1 → Beat 2 continuity
      if (
        !rotOk(b1.leftMotion.rotationDirection, b2.leftMotion.rotationDirection)
      )
        continue;
      if (
        !rotOk(
          b1.rightMotion.rotationDirection,
          b2.rightMotion.rotationDirection
        )
      )
        continue;
      // Quarter boundary: Beat 2 → Beat 1 (of next quarter) continuity
      if (
        !rotOk(b2.leftMotion.rotationDirection, b1.leftMotion.rotationDirection)
      )
        continue;
      if (
        !rotOk(
          b2.rightMotion.rotationDirection,
          b1.rightMotion.rotationDirection
        )
      )
        continue;

      // Build the 3-step input: [startPlacement, beat1, beat2]
      const startStep = buildStartPlacementStep(b1);
      const beat1Step = edgeToStep(b1, 1);
      const beat2Step = edgeToStep(b2, 2);
      const seedWord = `${b1.letter}${b2.letter}`;

      const result = executeLOOP(
        [startStep, beat1Step, beat2Step],
        seedWord,
        LOOPType.ROTATED,
        Period.QUARTERED,
        allPictographs
      );

      if (!result.success) continue;

      // The result has 9 steps: [startPos, beat1..beat8]
      const rawSteps = result.steps.slice(1); // Remove start position
      if (rawSteps.length !== 8) continue;

      // Fix position names on generated beats (executor's derivation is simplified)
      const positionFixedSteps = fixPositionNames(rawSteps, allPictographs);

      // Chain orientations: each beat's start orientation = previous beat's end orientation.
      // Without this, every beat incorrectly starts at "in" regardless of what came before.
      const actualSteps = chainOrientations(positionFixedSteps);

      const t1 = LETTER_TYPES[b1.letter] ?? 0;
      const t2 = LETTER_TYPES[b2.letter] ?? 0;
      const handPath = `${TYPE_NAMES[t1]}+${TYPE_NAMES[t2]}`;
      const familyId = handPath.toLowerCase().replace(/\s+/g, "-");
      const handPathId = computeHandPathKey(actualSteps);

      // Build a motion-type + direction suffix for unique IDs.
      // Motion type alone isn't enough — two sequences can share the same
      // letters and motion types but differ in hand direction (CW vs CCW).
      // Include left hand's start→end locations from both beats as disambiguator.
      const suffix = [
        b1.leftMotion.motionType[0],
        b1.rightMotion.motionType[0],
        b1.leftMotion.startLocation[0] + b1.leftMotion.endLocation[0],
        b2.leftMotion.motionType[0],
        b2.rightMotion.motionType[0],
        b2.leftMotion.startLocation[0] + b2.leftMotion.endLocation[0],
      ].join("");

      results.push({
        seqId: `${startPos}-${seedWord}-${suffix}`,
        word: seedWord,
        loopWord: result.loopWord,
        letter1: b1.letter,
        letter2: b2.letter,
        t1,
        t2,
        handPath,
        handPathId,
        familyId,
        startPos,
        steps: actualSteps,
        startPlacementStep: result.steps[0],
      });
    }
  }

  return results;
}

// ============================================================================
// PHASE 4 — DEDUPLICATE
// ============================================================================

/**
 * Deduplicate circular sequences.
 *
 * Three layers of dedup:
 *
 * 1. One per word per starting position (hand-assignment/rotation variants are the same concept)
 * 2. Circular equivalence: word XY from position A is the same LOOP as word YX
 *    from position B, just entered one beat later. A LOOP has no beginning.
 *    Use canonical key = sorted letter pair so XY and YX collapse.
 *
 * This reduces 192 raw → 64 unique circular sequences.
 */
function deduplicateSequences(sequences: DeckSequence[]): DeckSequence[] {
  // Phase 1: one per word per starting position
  const perWord = new Map<string, DeckSequence>();
  for (const seq of sequences) {
    const key = `${seq.startPos}|${seq.word}`;
    if (!perWord.has(key)) {
      perWord.set(key, seq);
    }
  }

  // Phase 2: circular equivalence — XY and YX are the same loop
  const unique = new Map<string, DeckSequence>();
  for (const seq of perWord.values()) {
    // Sort the two letters to create a canonical circular key
    const pair = [seq.letter1, seq.letter2].sort().join("+");
    if (!unique.has(pair)) {
      unique.set(pair, seq);
    }
  }

  return Array.from(unique.values());
}

// ============================================================================
// PHASE 5 — FIRESTORE WRITE
// ============================================================================

/** Build the Firestore-ready motion object from a SequenceStep motion */
function buildFirestoreMotion(motion: McpMotionData, hand: "left" | "right") {
  return {
    motionType: motion.motionType,
    rotationDirection: motion.rotationDirection,
    startLocation: motion.startLocation,
    endLocation: motion.endLocation,
    turns: 0,
    startOrientation: motion.startOrientation,
    endOrientation: motion.endOrientation,
    hand,
    propType: "staff",
    gridMode: "diamond",
    isVisible: true,
    arrowLocation: motion.endLocation,
  };
}

/** Build a Firestore-ready step from a SequenceStep */
function buildFirestoreStep(step: SequenceStep, stepNumber: number) {
  return {
    id: randomUUID(),
    isStep: true,
    stepNumber,
    letter: step.letter,
    startPlacement: step.startPlacement,
    endPlacement: step.endPlacement,
    gridMode: "diamond",
    duration: 1.0,
    leftReversal: false,
    rightReversal: false,
    isBlank: false,
    motions: {
      left: buildFirestoreMotion(step.leftMotion, "left"),
      right: buildFirestoreMotion(step.rightMotion, "right"),
    },
  };
}

/** Build the Firestore-ready start position data */
function buildFirestoreStartPlacement(step: SequenceStep) {
  return {
    isStartPlacement: true,
    id: randomUUID(),
    gridPlacement: step.startPlacement,
    gridMode: "diamond",
    motions: {
      left: buildFirestoreMotion(step.leftMotion, "left"),
      right: buildFirestoreMotion(step.rightMotion, "right"),
    },
  };
}

interface FamilyMeta {
  id: string;
  label: string;
  typeCombo: string;
  sequenceIds: string[];
}

interface Family {
  id: string;
  label: string;
  typeCombo: string;
  sequences: DeckSequence[];
}

function groupIntoFamilies(sequences: DeckSequence[]): Family[] {
  const familyMap = new Map<string, Family>();

  for (const seq of sequences) {
    // Circular equivalence: sort type pair so Dual-Shift+Dash and Dash+Dual-Shift
    // merge into one family. A LOOP has no start, so beat order is arbitrary.
    const sortedTypes = [seq.t1, seq.t2].sort((a, b) => a - b);
    const canonicalId =
      `${TYPE_NAMES[sortedTypes[0]]}+${TYPE_NAMES[sortedTypes[1]]}`
        .toLowerCase()
        .replace(/\s+/g, "-");
    const canonicalLabel = `${TYPE_NAMES[sortedTypes[0]]}+${TYPE_NAMES[sortedTypes[1]]}`;
    const canonicalCombo = `Type ${sortedTypes[0]} + Type ${sortedTypes[1]}`;

    let family = familyMap.get(canonicalId);
    if (!family) {
      family = {
        id: canonicalId,
        label: canonicalLabel,
        typeCombo: canonicalCombo,
        sequences: [],
      };
      familyMap.set(canonicalId, family);
    }
    family.sequences.push(seq);
  }

  // Sort by type combo
  return Array.from(familyMap.values()).sort((a, b) => {
    const [aT1, aT2] =
      a.sequences[0].t1 <= a.sequences[0].t2
        ? [a.sequences[0].t1, a.sequences[0].t2]
        : [a.sequences[0].t2, a.sequences[0].t1];
    const [bT1, bT2] =
      b.sequences[0].t1 <= b.sequences[0].t2
        ? [b.sequences[0].t1, b.sequences[0].t2]
        : [b.sequences[0].t2, b.sequences[0].t1];
    return aT1 * 10 + aT2 - (bT1 * 10 + bT2);
  });
}

async function writeToFirestore(
  families: Family[],
  totalCount: number
): Promise<void> {
  // Dynamic import of firebase-admin (CommonJS module)
  const admin = await import("firebase-admin");

  const serviceAccount = JSON.parse(
    fs.readFileSync(SERVICE_ACCOUNT_PATH, "utf8")
  );

  if (!admin.default.apps.length) {
    admin.default.initializeApp({
      credential: admin.default.credential.cert(serviceAccount),
    });
  }

  const db = admin.default.firestore();

  // Delete old sequences first (clean slate)
  const oldSeqsRef = db.collection(`catalogs/${DECK_ID}/sequences`);
  const oldSnap = await oldSeqsRef.get();
  if (!oldSnap.empty) {
    console.log(`Deleting ${oldSnap.size} old sequence docs...`);
    const deleteBatch = db.batch();
    for (const doc of oldSnap.docs) {
      deleteBatch.delete(doc.ref);
    }
    await deleteBatch.commit();
    console.log("Old docs deleted.");
  }

  // Write new sequences in batches
  const familiesMeta: FamilyMeta[] = [];
  let written = 0;
  let currentBatch = db.batch();
  let batchCount = 0;

  for (const family of families) {
    const sequenceIds: string[] = [];

    for (const seq of family.sequences) {
      sequenceIds.push(seq.seqId);

      const firestoreSteps = seq.steps.map((step, i) =>
        buildFirestoreStep(step, i + 1)
      );

      const seqRef = db.doc(`catalogs/${DECK_ID}/sequences/${seq.seqId}`);
      currentBatch.set(seqRef, {
        id: seq.seqId,
        name: seq.loopWord,
        word: seq.loopWord,
        gridMode: "diamond",
        isCircular: true,
        loopType: "rotated",
        sequenceLength: 8,
        level: 1,
        isFavorite: false,
        tags: ["l1-deck", family.id],
        thumbnails: [],
        steps: firestoreSteps,
        startPlacement: buildFirestoreStartPlacement(seq.startPlacementStep),
        metadata: {
          deckId: DECK_ID,
          familyId: family.id,
          familyLabel: family.label,
          handPathId: seq.handPathId,
          startPlacement: seq.startPos,
          seed: seq.word,
          letter1: seq.letter1,
          letter2: seq.letter2,
        },
        author: "TKA System",
        notes: `${family.label} from ${seq.startPos}`,
      });

      written++;
      batchCount++;

      if (batchCount >= 450) {
        console.log(`  Committing batch (${batchCount} ops)...`);
        await currentBatch.commit();
        currentBatch = db.batch();
        batchCount = 0;
      }
    }

    familiesMeta.push({
      id: family.id,
      label: family.label,
      typeCombo: family.typeCombo,
      sequenceIds: [...new Set(sequenceIds)],
    });
  }

  // Write deck metadata in the final batch
  const deckRef = db.doc(`catalogs/${DECK_ID}`);
  currentBatch.set(deckRef, {
    id: DECK_ID,
    name: "Level 1: Quartered Rotated LOOP",
    description:
      "All valid 8-beat sequences on the diamond grid with continuous rotation. " +
      "Each sequence is a 2-beat seed rotated through 4 quarters.",
    families: familiesMeta,
    totalSequences: totalCount,
    gridMode: "diamond",
    level: 1,
  });
  batchCount++;

  console.log(`Committing final batch (${batchCount} ops)...`);
  await currentBatch.commit();
  console.log(`Done! Wrote ${written} sequences to Firestore.`);
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  console.log("=== L1 Quartered Rotated LOOP Deck Seeder ===\n");

  // Phase 1: Load data
  console.log("Phase 1: Loading CSV data...");
  const allPictographs = loadDiamondDataframe();
  console.log(`  Loaded ${allPictographs.length} pictograph rows`);

  // Phase 2: Build adjacency
  console.log("Phase 2: Building adjacency map...");
  const adj = buildAdjacencyMap(allPictographs);
  console.log(`  ${adj.size} positions with outgoing edges`);

  // Phase 3: Enumerate seeds + execute LOOPs from canonical starting positions
  console.log("Phase 3: Enumerating seeds and executing LOOPs...");

  // Use exactly one canonical position per group (alpha, beta, gamma).
  // All rotational variants within a group produce identical sequences,
  // so enumerating from one position per group gives the complete deck.
  const CANONICAL_STARTS = ["alpha1", "beta5", "gamma11"];
  let allSequences: DeckSequence[] = [];

  for (const startPos of CANONICAL_STARTS) {
    const results = enumerateAndExecute(adj, allPictographs, startPos);
    if (results.length > 0) {
      console.log(`  ${startPos}: ${results.length} raw sequences`);
      allSequences.push(...results);
    }
  }
  console.log(`  Total raw (before dedup): ${allSequences.length}`);

  // Phase 4: Deduplicate
  console.log("Phase 4: Deduplicating...");
  const unique = deduplicateSequences(allSequences);
  console.log(`  After dedup: ${unique.length} unique sequences`);

  // Phase 5: Group into families
  console.log("Phase 5: Grouping into families...");
  const families = groupIntoFamilies(unique);

  console.log(`\nOrganized into ${families.length} families:`);
  for (const f of families) {
    console.log(
      `  ${f.label} (${f.typeCombo}): ${f.sequences.length} sequences`
    );
  }

  // Phase 5b: Compute hand path statistics
  console.log("\nPhase 5b: Computing hand paths...");
  const handPathGroups = new Map<string, DeckSequence[]>();
  for (const seq of unique) {
    const group = handPathGroups.get(seq.handPathId) ?? [];
    group.push(seq);
    handPathGroups.set(seq.handPathId, group);
  }
  console.log(
    `  ${handPathGroups.size} unique hand paths across ${unique.length} sequences`
  );

  // Phase 6: Write to Firestore
  if (DRY_RUN) {
    console.log("\n--- DRY RUN — Skipping Firestore write ---");
    console.log(
      `Would write ${unique.length} sequences in ${families.length} families`
    );

    // Hand path breakdown by family
    console.log(
      `\n  ┌────────────────────────────┬───────────┬──────────────┐`
    );
    console.log(`  │ Family                     │ Sequences │ Hand Paths   │`);
    console.log(`  ├────────────────────────────┼───────────┼──────────────┤`);
    for (const f of families) {
      const familyHPs = new Set(f.sequences.map((s) => s.handPathId));
      console.log(
        `  │ ${f.label.padEnd(27)}│ ${String(f.sequences.length).padStart(9)} │ ${String(familyHPs.size).padStart(12)} │`
      );
    }
    console.log(`  ├────────────────────────────┼───────────┼──────────────┤`);
    console.log(
      `  │ TOTAL                      │ ${String(unique.length).padStart(9)} │ ${String(handPathGroups.size).padStart(12)} │`
    );
    console.log(`  └────────────────────────────┴───────────┴──────────────┘`);

    // Detailed hand path listing with actual traces
    console.log(`\n  Hand path traces:`);
    let hpNum = 1;
    for (const [hpId, seqs] of [...handPathGroups.entries()].sort()) {
      const familyTypes = [seqs[0].t1, seqs[0].t2].sort((a, b) => a - b);
      const family =
        TYPE_NAMES[familyTypes[0]] + "+" + TYPE_NAMES[familyTypes[1]];
      const trace = traceHandPath(seqs[0].steps);
      const words = seqs.map((s) => s.word).join(", ");
      console.log(
        `\n    Hand Path #${hpNum} [${family}] — ${seqs.length} sequences`
      );
      console.log(`      Hand A: ${trace.left}`);
      console.log(`      Hand B: ${trace.right}`);
      console.log(`      Words: ${words}`);
      hpNum++;
    }

    // Print sample sequences — pick one with anti motions to verify orientation chaining
    const antiSample =
      unique.find((s) =>
        s.steps.some(
          (st) =>
            st.leftMotion.motionType === "anti" ||
            st.rightMotion.motionType === "anti"
        )
      ) ?? unique[0];

    for (const sample of [unique[0], antiSample].filter(
      (s, i, a) => a.indexOf(s) === i
    )) {
      console.log(`\nSample: ${sample.seqId}`);
      console.log(`  Word: ${sample.loopWord} | Start: ${sample.startPos}`);
      for (const step of sample.steps) {
        console.log(
          `    Beat ${step.stepNumber}: ${step.letter} ` +
            `left=${step.leftMotion.motionType}[${step.leftMotion.startLocation}→${step.leftMotion.endLocation}] ` +
            `ori=${step.leftMotion.startOrientation}→${step.leftMotion.endOrientation} | ` +
            `right=${step.rightMotion.motionType}[${step.rightMotion.startLocation}→${step.rightMotion.endLocation}] ` +
            `ori=${step.rightMotion.startOrientation}→${step.rightMotion.endOrientation}`
        );
      }
    }
  } else {
    console.log("\nPhase 6: Writing to Firestore...");
    await writeToFirestore(families, unique.length);
  }

  // Summary
  console.log(`\n--- Summary ---`);
  console.log(`Deck: ${DECK_ID}`);
  console.log(`Total unique sequences: ${unique.length}`);
  console.log(`Unique hand paths: ${handPathGroups.size}`);
  console.log(`Families: ${families.length}`);
  console.log(`Steps per sequence: 8`);
  console.log(`Firestore path: decks/${DECK_ID}`);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
