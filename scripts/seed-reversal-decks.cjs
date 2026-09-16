/**
 * Seed Reversal Variant Decks to Firestore
 *
 * Reads sequences from a source deck, applies reversal transformations
 * (flipping pro↔anti on reversed beats), recomputes letters via CSV lookup,
 * recalculates orientations, and writes each pattern variant as a new deck.
 *
 * Usage:
 *   node scripts/seed-reversal-decks.cjs --source l1-tnd-motions --patterns book,red-book,blue-book,long-book,alternating
 *   node scripts/seed-reversal-decks.cjs --source l1-tnd-motions --patterns book --dry-run
 *   node scripts/seed-reversal-decks.cjs --source l1-tnd-motions --patterns book --gridMode diamond
 */

const admin = require("firebase-admin");
const path = require("path");
const fs = require("fs");
const { REVERSAL_PATTERNS } = require("./apply-reversal-pattern.cjs");
const {
  calculateEndOrientation,
} = require("../packages/sequence-engine/dist/core/orientation/OrientationCalculator.js");

// Firebase Admin Setup

const serviceAccountPath = path.join(__dirname, "..", "serviceAccountKey.json");
let db;

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

// CLI Arguments

const args = process.argv.slice(2);
function getArg(name) {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 ? args[idx + 1] : null;
}

const sourceDeckId = getArg("source");
const patternsArg = getArg("patterns");
const gridMode = getArg("gridMode") || "diamond";
const DRY_RUN = args.includes("--dry-run");

if (!sourceDeckId || !patternsArg) {
  console.error(
    "Usage: node seed-reversal-decks.cjs --source <deckId> --patterns <p1,p2,...> [--dry-run] [--gridMode diamond]"
  );
  process.exit(1);
}

const patternIds = patternsArg.split(",").map((s) => s.trim());

// Validate patterns
for (const pid of patternIds) {
  if (!REVERSAL_PATTERNS[pid]) {
    console.error(`Unknown reversal pattern: ${pid}`);
    console.error(`Available: ${Object.keys(REVERSAL_PATTERNS).join(", ")}`);
    process.exit(1);
  }
}

// ============================================================================
// CSV Loading for Letter Re-derivation
// ============================================================================

const CSV_PATHS = {
  diamond: path.join(
    __dirname,
    "..",
    "static",
    "data",
    "pictographs",
    "DiamondPictographDataframe.csv"
  ),
  box: path.join(
    __dirname,
    "..",
    "static",
    "data",
    "pictographs",
    "BoxPictographDataframe.csv"
  ),
};

function loadCsvEdges() {
  const csvPath = CSV_PATHS[gridMode];
  if (!csvPath || !fs.existsSync(csvPath)) {
    console.error(`CSV not found for grid mode: ${gridMode}`);
    process.exit(1);
  }
  const lines = fs
    .readFileSync(csvPath, "utf8")
    .split("\n")
    .filter((l) => l.trim());
  const headers = lines[0].split(",").map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cols = line.split(",").map((c) => c.trim());
    const edge = {};
    headers.forEach((h, i) => (edge[h] = cols[i]));
    edge.leftMotionType ||= edge.blueMotionType;
    edge.leftRotationDirection ||= edge.blueRotationDirection;
    edge.leftStartLocation ||= edge.blueStartLocation;
    edge.leftEndLocation ||= edge.blueEndLocation;
    edge.rightMotionType ||= edge.redMotionType;
    edge.rightRotationDirection ||= edge.redRotationDirection;
    edge.rightStartLocation ||= edge.redStartLocation;
    edge.rightEndLocation ||= edge.redEndLocation;
    return edge;
  });
}

const csvEdges = loadCsvEdges();
console.log(`Loaded ${csvEdges.length} CSV edges for ${gridMode} grid\n`);

/**
 * Find the letter from CSV given a step's left and right motion types + locations.
 */
function lookupLetterForStep(step) {
  const left = step.motions?.left;
  const right = step.motions?.right;
  if (!left || !right) return null;

  const match = csvEdges.find(
    (e) =>
      e.startPlacement === step.startPlacement &&
      e.endPlacement === step.endPlacement &&
      e.leftMotionType === left.motionType &&
      e.leftStartLocation === left.startLocation &&
      e.leftEndLocation === left.endLocation &&
      e.rightMotionType === right.motionType &&
      e.rightStartLocation === right.startLocation &&
      e.rightEndLocation === right.endLocation
  );
  return match ? match.letter : null;
}

// ============================================================================
// Reversal Application
// ============================================================================

/**
 * Apply a reversal pattern to a sequence's steps (Firestore format).
 *
 * Per-beat reversal: each beat flips from its OWN current value, not from
 * a running state. This preserves the invariant that rotated copies of
 * the same seed beat always share the same motion type after reversal.
 */
function applyReversalToSequence(steps, patternId, startPlacement) {
  const pattern = REVERSAL_PATTERNS[patternId];
  const seq = pattern.sequence;

  // Reversal is CUMULATIVE, matching reversal-detector.ts: a beat is a reversal
  // when its prop spin differs from the previous beat. So a pattern symbol toggles
  // a running per-hand parity; the beat's motion is flipped from base whenever that
  // parity is currently true. (Absolute per-beat flipping makes PPPP uniform-anti,
  // which the detector reads back as "continuous" — the bug this replaces.)
  let leftParity = false;
  let rightParity = false;
  let beatIndex = 0;
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (step.isStartPlacement) continue;

    const left = step.motions?.left;
    const right = step.motions?.right;

    const symbol = seq[beatIndex % seq.length];
    const leftToggle = symbol === "P" || symbol === "B";
    const rightToggle = symbol === "P" || symbol === "R";

    if (leftToggle) leftParity = !leftParity;
    if (rightToggle) rightParity = !rightParity;

    // The stored reversal flag marks the spin-change beat (the toggle point),
    // which is exactly what reversal-detector.ts re-derives from rotation deltas.
    step.leftReversal = leftToggle;
    step.rightReversal = rightToggle;

    if (left && leftParity) {
      if (left.motionType === "pro" || left.motionType === "anti") {
        left.motionType = left.motionType === "pro" ? "anti" : "pro";
      }
      if (left.rotationDirection === "cw" || left.rotationDirection === "ccw") {
        left.rotationDirection = left.rotationDirection === "cw" ? "ccw" : "cw";
      }
    }

    if (right && rightParity) {
      if (right.motionType === "pro" || right.motionType === "anti") {
        right.motionType = right.motionType === "pro" ? "anti" : "pro";
      }
      if (
        right.rotationDirection === "cw" ||
        right.rotationDirection === "ccw"
      ) {
        right.rotationDirection =
          right.rotationDirection === "cw" ? "ccw" : "cw";
      }
    }

    // Re-derive letter
    const newLetter = lookupLetterForStep(step);
    if (newLetter) step.letter = newLetter;

    beatIndex++;
  }

  // Recalculate orientations through the chain (baselined from the start position)
  recalcOrientations(steps, startPlacement);

  return steps;
}

/**
 * Recalculate orientations through a sequence after reversal.
 *
 * Mirrors the canonical client propagator (orientation-propagation.ts): the
 * baseline is the start position's end orientation per hand, and EVERY real
 * beat is recomputed from beat 1 onward — including the first beat, whose
 * orientation depends on its (now reversed) motion type + turns coming out of
 * the start position. The previous version started at i=1 over the beats array
 * and never recomputed the first beat, leaving it with stale pre-reversal data
 * that then cascaded down the whole chain.
 */
function recalcOrientations(steps, startPlacement) {
  const beats = steps.filter((s) => !s.isStartPlacement);

  let prevLeftEnd = startPlacement?.motions?.left?.endOrientation ?? "in";
  let prevRightEnd = startPlacement?.motions?.right?.endOrientation ?? "in";

  for (const step of beats) {
    const left = step.motions?.left;
    const right = step.motions?.right;

    if (left) {
      left.startOrientation = prevLeftEnd;
      left.endOrientation = calculateEndOrientation({
        motionType: left.motionType,
        turns: left.turns ?? 0,
        rotationDirection: left.rotationDirection,
        startLocation: left.startLocation,
        endLocation: left.endLocation,
        startOrientation: prevLeftEnd,
      });
      prevLeftEnd = left.endOrientation;
    }

    if (right) {
      right.startOrientation = prevRightEnd;
      right.endOrientation = calculateEndOrientation({
        motionType: right.motionType,
        turns: right.turns ?? 0,
        rotationDirection: right.rotationDirection,
        startLocation: right.startLocation,
        endLocation: right.endLocation,
        startOrientation: prevRightEnd,
      });
      prevRightEnd = right.endOrientation;
    }
  }
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log(`Source deck: ${sourceDeckId}`);
  console.log(`Patterns: ${patternIds.join(", ")}`);
  console.log(`Dry run: ${DRY_RUN}\n`);

  // Load source deck metadata
  const sourceDeckDoc = await db.doc(`catalogs/${sourceDeckId}`).get();
  if (!sourceDeckDoc.exists) {
    console.error(`Source deck not found: ${sourceDeckId}`);
    process.exit(1);
  }
  const sourceDeck = sourceDeckDoc.data();

  // Load source sequences
  const seqSnapshot = await db
    .collection(`catalogs/${sourceDeckId}/sequences`)
    .get();
  const sourceSequences = seqSnapshot.docs.map((d) => ({
    id: d.id,
    ...d.data(),
  }));
  console.log(
    `Loaded ${sourceSequences.length} sequences from ${sourceDeckId}\n`
  );

  for (const patternId of patternIds) {
    const newDeckId = `${sourceDeckId}-${patternId}`;
    const patternDef = REVERSAL_PATTERNS[patternId];
    console.log(`━━━ ${newDeckId} (${patternDef.sequence}) ━━━`);

    const transformedSequences = [];

    for (const seq of sourceSequences) {
      // Deep clone
      const cloned = JSON.parse(JSON.stringify(seq));
      const steps = cloned.steps || [];

      // Apply reversal
      applyReversalToSequence(steps, patternId, cloned.startPlacement);

      // Recompute word from new letters
      const beatSteps = steps.filter((s) => !s.isStartPlacement);
      const word = beatSteps.map((s) => s.letter).join("");

      cloned.word = word;
      cloned.name = word;
      cloned.reversalPattern = patternId;
      cloned.steps = steps;

      transformedSequences.push(cloned);
    }

    // Reversal preserves hand-path family membership and sequence ids, so the
    // correct family grouping is exactly the source deck's. Reusing it avoids
    // the handPathFamily collapse (source seqs lack that field → all "unknown").
    const transformedIds = new Set(transformedSequences.map((s) => s.id));
    const families = (sourceDeck.families ?? []).map((f) => ({
      ...f,
      sequenceIds: (f.sequenceIds ?? []).filter((id) => transformedIds.has(id)),
    }));

    console.log(
      `  ${transformedSequences.length} sequences in ${families.length} families`
    );
    console.log(
      `  Sample words: ${transformedSequences
        .slice(0, 3)
        .map((s) => s.word)
        .join(", ")}`
    );

    if (DRY_RUN) {
      console.log("  [dry run — not written]\n");
      continue;
    }

    // Resolve metadata fields that must be present on the variant deck.
    // The spread of sourceDeck copies these if they exist, but source decks
    // created before the backfill script ran may be missing them. We derive
    // them explicitly here so variant decks are always fully populated,
    // which is required for the drill-down filtering in LoopCollectionView.
    const resolvedLoopType =
      sourceDeck.loopType ||
      (() => {
        const LOOP_TYPE_PATTERNS = [
          "rotated",
          "mirrored",
          "swapped",
          "inverted",
          "rewound",
        ];
        for (const p of LOOP_TYPE_PATTERNS) {
          if (sourceDeckId.includes(p)) return p;
        }
        return null;
      })();

    const resolvedBeatCount =
      sourceDeck.beatCount ||
      (() => {
        const match = (sourceDeck.name || "").match(/(\d+)-Beat/);
        return match ? parseInt(match[1], 10) : null;
      })();

    // turns carries over from source (undefined is fine — it means 0 turns)
    const resolvedTurns = sourceDeck.turns ?? undefined;

    // Write deck document
    await db.doc(`catalogs/${newDeckId}`).set({
      ...sourceDeck,
      id: newDeckId,
      name: `${sourceDeck.name} (${patternDef.sequence})`,
      reversalPattern: patternId,
      families,
      totalSequences: transformedSequences.length,
      // Explicitly set metadata so variant decks always have these fields,
      // even when the source deck was written before backfill-deck-metadata ran.
      ...(resolvedLoopType !== null && resolvedLoopType !== undefined
        ? { loopType: resolvedLoopType }
        : {}),
      ...(resolvedBeatCount !== null && resolvedBeatCount !== undefined
        ? { beatCount: resolvedBeatCount }
        : {}),
      ...(resolvedTurns !== undefined ? { turns: resolvedTurns } : {}),
    });

    // Write sequences in batches of 450
    const BATCH_SIZE = 450;
    for (let i = 0; i < transformedSequences.length; i += BATCH_SIZE) {
      const batch = db.batch();
      const chunk = transformedSequences.slice(i, i + BATCH_SIZE);
      for (const seq of chunk) {
        batch.set(db.doc(`catalogs/${newDeckId}/sequences/${seq.id}`), seq);
      }
      await batch.commit();
    }

    console.log(`  ✓ Written to Firestore\n`);
  }

  console.log("Done!");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
