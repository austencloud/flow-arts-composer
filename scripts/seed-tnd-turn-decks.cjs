/**
 * Seed TnD Turn Variant Decks to Firestore
 *
 * Reads the 19 base TnD sequences from decks/l1-tnd-motions/sequences,
 * then creates 5 new decks with different turn values applied to all motions.
 *
 * Each TnD ratio maps to a TKA turn value:
 *   2:1 → 0.5 turns (float)
 *   3:1 → 1 turn
 *   4:1 → 1.5 turns
 *   5:1 → 2 turns
 *   7:1 → 3 turns
 *
 * The 1:1 ratio (0 turns) already exists as l1-tnd-motions and is not recreated.
 *
 * Usage:
 *   node scripts/seed-tnd-turn-decks.cjs              # Seed all 5 decks
 *   node scripts/seed-tnd-turn-decks.cjs --dry-run     # Preview without writing
 */

const admin = require("firebase-admin");
const path = require("path");
const { randomUUID } = require("crypto");
const {
  calculateEndOrientation,
} = require("../packages/sequence-engine/dist/core/orientation/OrientationCalculator.js");
const {
  resolveRotationDirections,
  validateRotationDirections,
} = require("./lib/resolve-rotation-direction.cjs");

// Firebase Admin Setup

const serviceAccountPath = path.join(__dirname, "..", "serviceAccountKey.json");
const DRY_RUN = process.argv.includes("--dry-run");
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


const SOURCE_DECK_ID = "l1-tnd-motions";

/**
 * Each entry defines a new deck. The 1:1 ratio (0 turns) already exists.
 */
const TURN_VARIANTS = [
  { ratio: "2:1", turns: 0.5, deckId: "tnd-2to1-motions", name: "TnD Motions (2:1 ratio)" },
  { ratio: "3:1", turns: 1,   deckId: "tnd-3to1-motions", name: "TnD Motions (3:1 ratio)" },
  { ratio: "4:1", turns: 1.5, deckId: "tnd-4to1-motions", name: "TnD Motions (4:1 ratio)" },
  { ratio: "5:1", turns: 2,   deckId: "tnd-5to1-motions", name: "TnD Motions (5:1 ratio)" },
  { ratio: "6:1", turns: 2.5, deckId: "tnd-6to1-motions", name: "TnD Motions (6:1 ratio)" },
  { ratio: "7:1", turns: 3,   deckId: "tnd-7to1-motions", name: "TnD Motions (7:1 ratio)" },
];


/**
 * Apply a turn value to all motions in a sequence's steps, recalculating
 * orientations through the chain.
 *
 * The start position step (beat 0) keeps its static orientations.
 * Each subsequent beat gets the new turn value and orientations are
 * chained: the end orientation of beat N becomes the start orientation
 * of beat N+1.
 */
function applyTurnsToSteps(steps, turnValue) {
  if (!steps || steps.length === 0) return steps;

  // Track running orientations per hand, starting from "in"
  let leftOri = "in";
  let rightOri = "in";

  // First pass: clone steps and apply turn value
  const cloned = steps.map((step) => ({
    ...step,
    id: randomUUID(),
    motions: {
      left: { ...step.motions.left, turns: turnValue },
      right: { ...step.motions.right, turns: turnValue },
    },
  }));

  // Resolve noRotation before calculating orientations
  resolveRotationDirections(cloned, turnValue);

  // Second pass: propagate orientations through the chain
  return cloned.map((step) => {
    const left = step.motions.left;
    const right = step.motions.right;

    left.startOrientation = leftOri;
    right.startOrientation = rightOri;

    left.endOrientation = calculateEndOrientation({
      motionType: left.motionType,
      turns: turnValue,
      rotationDirection: left.rotationDirection,
      startLocation: left.startLocation,
      endLocation: left.endLocation,
      startOrientation: leftOri,
    });

    right.endOrientation = calculateEndOrientation({
      motionType: right.motionType,
      turns: turnValue,
      rotationDirection: right.rotationDirection,
      startLocation: right.startLocation,
      endLocation: right.endLocation,
      startOrientation: rightOri,
    });

    leftOri = left.endOrientation;
    rightOri = right.endOrientation;

    return step;
  });
}

/**
 * Update the start position step's orientations to "in" (they should
 * already be "in" for static motions at 0 turns, but we make it explicit).
 */
function cloneStartPlacement(startPlacement) {
  if (!startPlacement) return startPlacement;

  return {
    ...startPlacement,
    id: randomUUID(),
    motions: {
      left: {
        ...startPlacement.motions.left,
        startOrientation: "in",
        endOrientation: "in",
        turns: 0,
      },
      right: {
        ...startPlacement.motions.right,
        startOrientation: "in",
        endOrientation: "in",
        turns: 0,
      },
    },
  };
}


/**
 * Load all 19 sequences from the source deck.
 */
async function loadSourceSequences() {
  const snapshot = await db
    .collection(`catalogs/${SOURCE_DECK_ID}/sequences`)
    .get();

  if (snapshot.empty) {
    throw new Error(
      `No sequences found in decks/${SOURCE_DECK_ID}/sequences. ` +
        "Run seed-tnd-deck.ts first."
    );
  }

  const sequences = [];
  for (const doc of snapshot.docs) {
    sequences.push({ docId: doc.id, ...doc.data() });
  }

  return sequences;
}

/**
 * Load the source deck metadata.
 */
async function loadSourceDeckMeta() {
  const doc = await db.doc(`catalogs/${SOURCE_DECK_ID}`).get();
  if (!doc.exists) {
    throw new Error(`Deck metadata not found at decks/${SOURCE_DECK_ID}`);
  }
  return doc.data();
}

/**
 * Write a single turn-variant deck to Firestore.
 */
async function writeDeck(variant, sourceSequences, sourceMeta) {
  const { deckId, turns, ratio, name } = variant;
  const deckPath = `catalogs/${deckId}`;

  // Delete existing sequences in this deck
  const existingSeqs = await db.collection(`${deckPath}/sequences`).get();
  if (!existingSeqs.empty) {
    console.log(
      `  Deleting ${existingSeqs.size} existing sequences in ${deckId}...`
    );
    const deleteBatch = db.batch();
    for (const doc of existingSeqs.docs) {
      deleteBatch.delete(doc.ref);
    }
    await deleteBatch.commit();
  }

  // Build transformed sequences
  let batch = db.batch();
  let batchCount = 0;

  for (const srcSeq of sourceSequences) {
    // Clone and transform steps with new turn value
    const newSteps = applyTurnsToSteps(srcSeq.steps, turns);
    const newStartPos = cloneStartPlacement(srcSeq.startPlacement);

    // Build new sequence ID: replace "vtg-" prefix with ratio-specific prefix
    const newSeqId = srcSeq.id.replace("tnd-", `tnd-${ratio.replace(":", "to")}-`);

    const seqRef = db.doc(`${deckPath}/sequences/${newSeqId}`);
    batch.set(seqRef, {
      ...srcSeq,
      id: newSeqId,
      steps: newSteps,
      startPlacement: newStartPos,
      tags: ["tnd-deck", `vtg-${ratio.replace(":", "to")}`, ...(srcSeq.tags || []).filter(t => t !== "tnd-deck")],
      notes: `TnD ${srcSeq.metadata?.vtgCategory || ""} (${ratio}): ${srcSeq.word}`,
      metadata: {
        ...srcSeq.metadata,
        deckId,
        vtgRatio: ratio,
        turns,
      },
    });

    batchCount++;

    // Firestore batches max out at 500 operations
    if (batchCount >= 490) {
      await batch.commit();
      batch = db.batch();
      batchCount = 0;
    }
  }

  // Write deck metadata
  const deckRef = db.doc(deckPath);
  batch.set(deckRef, {
    ...sourceMeta,
    id: deckId,
    name,
    description: `The 19 TnD motion categories at ${ratio} ratio (${turns} turns).`,
    vtgRatio: ratio,
    turns,
    sourceCatalog: SOURCE_DECK_ID,
  });
  batchCount++;

  await batch.commit();
  console.log(
    `  Wrote ${sourceSequences.length} sequences + metadata to ${deckPath}`
  );
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log("=== TnD Turn Variant Deck Seeder ===\n");

  // Load source data
  console.log(`Loading source sequences from decks/${SOURCE_DECK_ID}...`);
  const sourceSequences = await loadSourceSequences();
  console.log(`  Loaded ${sourceSequences.length} sequences`);

  const sourceMeta = await loadSourceDeckMeta();
  console.log(`  Source deck: "${sourceMeta.name}"\n`);

  // Preview a sample orientation change
  if (sourceSequences.length > 0) {
    const sample = sourceSequences[0];
    console.log(`Sample: ${sample.word}`);
    if (sample.steps && sample.steps.length > 0) {
      const step = sample.steps[0];
      console.log(
        `  Beat 1 blue: ${step.motions.left.motionType} ` +
          `[${step.motions.left.startLocation}->${step.motions.left.endLocation}] ` +
          `ori: ${step.motions.left.startOrientation}->${step.motions.left.endOrientation}`
      );

      // Show what each turn value produces
      for (const v of TURN_VARIANTS) {
        const endOri = calculateEndOrientation({
          motionType: step.motions.left.motionType,
          turns: v.turns,
          rotationDirection: step.motions.left.rotationDirection || "cw",
          startLocation: step.motions.left.startLocation,
          endLocation: step.motions.left.endLocation,
          startOrientation: "in",
        });
        console.log(
          `  At ${v.ratio} (${v.turns} turns): in -> ${endOri}`
        );
      }
    }
    console.log("");
  }

  // Seed each variant
  for (const variant of TURN_VARIANTS) {
    console.log(
      `[${variant.ratio}] ${variant.name} (${variant.turns} turns) -> decks/${variant.deckId}`
    );

    if (DRY_RUN) {
      console.log("  (dry run - skipping write)\n");
      continue;
    }

    await writeDeck(variant, sourceSequences, sourceMeta);
    console.log("");
  }

  // Summary
  console.log("--- Summary ---");
  console.log(`Source deck: ${SOURCE_DECK_ID} (${sourceSequences.length} sequences)`);
  console.log(`Decks ${DRY_RUN ? "to create" : "created"}: ${TURN_VARIANTS.length}`);
  for (const v of TURN_VARIANTS) {
    console.log(
      `  ${v.deckId} — ${v.name} (${v.turns} turns, ${sourceSequences.length} sequences)`
    );
  }

  if (DRY_RUN) {
    console.log("\n--- DRY RUN — no data written ---");
    console.log("Run without --dry-run to seed all decks.");
  }
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
