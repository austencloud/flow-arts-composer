/**
 * Seed TnD Asymmetric Turn Variant Decks to Firestore
 *
 * Takes the 19 base TnD sequences from decks/l1-tnd-motions/sequences and
 * creates 42 new decks with DIFFERENT turn values per hand (blue vs red).
 *
 * Turn value → TnD ratio mapping:
 *   0   → 1:1
 *   0.5 → 2:1
 *   1   → 3:1
 *   1.5 → 4:1
 *   2   → 5:1
 *   2.5 → 6:1
 *   3   → 7:1
 *
 * Symmetric combos (blue == red) already exist from seed-tnd-turn-decks.cjs.
 * This script generates all 42 asymmetric pairs where blue ≠ red.
 *
 * Notation on cards: "3:1|5:1" means blue=3:1, red=5:1 (pipe-separated, color-coded).
 * In TKA: "1|2" (just the turn counts).
 *
 * Usage:
 *   node scripts/seed-tnd-asymmetric-decks.cjs              # Seed all 42 decks
 *   node scripts/seed-tnd-asymmetric-decks.cjs --dry-run    # Preview without writing
 *   node scripts/seed-tnd-asymmetric-decks.cjs --only 1,2   # Only seed blue=1, red=2
 */

const admin = require("firebase-admin");
const path = require("path");
const { randomUUID } = require("crypto");
const {
  calculateEndOrientation,
} = require("../packages/sequence-engine/dist/core/orientation/OrientationCalculator.js");

// Firebase Admin Setup

const serviceAccountPath = path.join(__dirname, "..", "serviceAccountKey.json");
const DRY_RUN = process.argv.includes("--dry-run");
const ONLY_ARG = process.argv.find(a => a.startsWith("--only"));
const ONLY_PAIR = ONLY_ARG
  ? ONLY_ARG.split("=")[1]?.split(",").map(Number) ?? process.argv[process.argv.indexOf("--only") + 1]?.split(",").map(Number)
  : null;

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

const TURN_VALUES = [0, 0.5, 1, 1.5, 2, 2.5, 3];

function turnsToRatio(turns) {
  const ratioNum = turns * 2 + 1;
  return `${ratioNum}:1`;
}

function turnsToRatioSlug(turns) {
  const ratioNum = turns * 2 + 1;
  return `${ratioNum}to1`;
}

function buildAsymmetricVariants() {
  const variants = [];
  for (const leftTurns of TURN_VALUES) {
    for (const rightTurns of TURN_VALUES) {
      if (leftTurns === rightTurns) continue; // symmetric already exists
      if (ONLY_PAIR && (leftTurns !== ONLY_PAIR[0] || rightTurns !== ONLY_PAIR[1])) continue;

      const leftRatio = turnsToRatio(leftTurns);
      const rightRatio = turnsToRatio(rightTurns);
      const leftSlug = turnsToRatioSlug(leftTurns);
      const rightSlug = turnsToRatioSlug(rightTurns);

      variants.push({
        leftTurns,
        rightTurns,
        leftRatio,
        rightRatio,
        pipeRatio: `${leftRatio}|${rightRatio}`,
        tkaPipe: `${leftTurns}|${rightTurns}`,
        deckId: `tnd-${leftSlug}v${rightSlug}-motions`,
        name: `TnD Motions (${leftRatio}|${rightRatio})`,
      });
    }
  }
  return variants;
}

// ============================================================================
// ROTATION DIRECTION RESOLUTION (per-hand aware)
// ============================================================================

function resolveRotationDirectionsAsymmetric(steps, leftTurns, rightTurns) {
  for (const [color, turnVal] of [["blue", leftTurns], ["red", rightTurns]]) {
    if (turnVal === 0) continue;

    const dirs = steps
      .map(s => s.motions?.[color]?.rotationDirection)
      .filter(d => d && d !== "noRotation");
    const dominant = dirs.length > 0 ? mostCommon(dirs) : "cw";

    for (const step of steps) {
      const motion = step.motions?.[color];
      if (!motion) continue;
      if (motion.rotationDirection === "noRotation" || !motion.rotationDirection) {
        motion.rotationDirection = dominant;
      }
    }
  }
}

function mostCommon(arr) {
  const counts = {};
  for (const v of arr) counts[v] = (counts[v] || 0) + 1;
  let best = arr[0], bestCount = 0;
  for (const [v, c] of Object.entries(counts)) {
    if (c > bestCount) { best = v; bestCount = c; }
  }
  return best;
}

// ============================================================================
// ORIENTATION RECALCULATION (asymmetric per-hand)
// ============================================================================

function applyAsymmetricTurns(steps, leftTurns, rightTurns) {
  if (!steps || steps.length === 0) return steps;

  let leftOri = "in";
  let rightOri = "in";

  const cloned = steps.map((step) => ({
    ...step,
    id: randomUUID(),
    motions: {
      left: { ...step.motions.left, turns: leftTurns },
      right: { ...step.motions.right, turns: rightTurns },
    },
  }));

  resolveRotationDirectionsAsymmetric(cloned, leftTurns, rightTurns);

  return cloned.map((step) => {
    const left = step.motions.left;
    const right = step.motions.right;

    left.startOrientation = leftOri;
    right.startOrientation = rightOri;

    left.endOrientation = calculateEndOrientation({
      motionType: left.motionType,
      turns: leftTurns,
      rotationDirection: left.rotationDirection,
      startLocation: left.startLocation,
      endLocation: left.endLocation,
      startOrientation: leftOri,
    });

    right.endOrientation = calculateEndOrientation({
      motionType: right.motionType,
      turns: rightTurns,
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

function cloneStartPlacement(startPlacement) {
  if (!startPlacement) return startPlacement;
  return {
    ...startPlacement,
    id: randomUUID(),
    motions: {
      left: { ...startPlacement.motions.left, startOrientation: "in", endOrientation: "in", turns: 0 },
      right: { ...startPlacement.motions.right, startOrientation: "in", endOrientation: "in", turns: 0 },
    },
  };
}

// ============================================================================
// FIRESTORE READ & WRITE
// ============================================================================

async function loadSourceSequences() {
  const snapshot = await db.collection(`catalogs/${SOURCE_DECK_ID}/sequences`).get();
  if (snapshot.empty) {
    throw new Error(`No sequences in decks/${SOURCE_DECK_ID}/sequences. Run seed-tnd-deck.ts first.`);
  }
  return snapshot.docs.map(doc => ({ docId: doc.id, ...doc.data() }));
}

async function loadSourceDeckMeta() {
  const doc = await db.doc(`catalogs/${SOURCE_DECK_ID}`).get();
  if (!doc.exists) throw new Error(`Deck metadata not found at decks/${SOURCE_DECK_ID}`);
  return doc.data();
}

async function writeDeck(variant, sourceSequences, sourceMeta) {
  const { deckId, leftTurns, rightTurns, pipeRatio, tkaPipe, name } = variant;
  const deckPath = `catalogs/${deckId}`;

  // Delete existing
  const existing = await db.collection(`${deckPath}/sequences`).get();
  if (!existing.empty) {
    console.log(`  Deleting ${existing.size} existing sequences in ${deckId}...`);
    const delBatch = db.batch();
    for (const doc of existing.docs) delBatch.delete(doc.ref);
    await delBatch.commit();
  }

  let batch = db.batch();
  let count = 0;

  for (const srcSeq of sourceSequences) {
    const newSteps = applyAsymmetricTurns(srcSeq.steps, leftTurns, rightTurns);
    const newStartPos = cloneStartPlacement(srcSeq.startPlacement);

    const ratioSlug = pipeRatio.replace(/:/g, "to").replace("|", "v");
    const newSeqId = srcSeq.id.replace("tnd-", `tnd-${ratioSlug}-`);

    const seqRef = db.doc(`${deckPath}/sequences/${newSeqId}`);
    batch.set(seqRef, {
      ...srcSeq,
      id: newSeqId,
      steps: newSteps,
      startPlacement: newStartPos,
      tags: ["tnd-deck", "tnd-asymmetric", `vtg-blue-${leftTurns}`, `vtg-red-${rightTurns}`, ...(srcSeq.tags || []).filter(t => !t.startsWith("vtg-") && !t.startsWith("tnd-"))],
      notes: `TnD ${srcSeq.metadata?.vtgCategory || ""} (${pipeRatio}): ${srcSeq.word}`,
      metadata: {
        ...srcSeq.metadata,
        deckId,
        vtgRatio: pipeRatio,
        tkaTurns: tkaPipe,
        leftTurns,
        rightTurns,
        asymmetric: true,
      },
    });

    count++;
    if (count >= 490) {
      await batch.commit();
      batch = db.batch();
      count = 0;
    }
  }

  // Deck metadata
  batch.set(db.doc(deckPath), {
    ...sourceMeta,
    id: deckId,
    name,
    canonicalName: name,
    description: `TnD motions with asymmetric turns: blue=${leftTurns} (${variant.leftRatio}), red=${rightTurns} (${variant.rightRatio}).`,
    vtgRatio: pipeRatio,
    tkaTurns: tkaPipe,
    leftTurns,
    rightTurns,
    asymmetric: true,
    sourceCatalog: SOURCE_DECK_ID,
    collection: "TnD",
    turnPattern: tkaPipe,
  });
  count++;

  await batch.commit();
  console.log(`  Wrote ${sourceSequences.length} sequences + metadata to ${deckPath}`);
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const variants = buildAsymmetricVariants();

  console.log("=== TnD Asymmetric Turn Deck Seeder ===\n");
  console.log(`Turn values: [${TURN_VALUES.join(", ")}]`);
  console.log(`Asymmetric combos: ${variants.length}`);
  console.log(`Total new sequences: ${variants.length} decks × 19 base patterns = ${variants.length * 19}\n`);

  if (variants.length === 0) {
    console.log("No variants to seed (check --only filter).");
    return;
  }

  // Load source
  console.log(`Loading source from decks/${SOURCE_DECK_ID}...`);
  const sourceSequences = await loadSourceSequences();
  console.log(`  ${sourceSequences.length} base sequences loaded`);

  const sourceMeta = await loadSourceDeckMeta();
  console.log(`  Source: "${sourceMeta.name}"\n`);

  // Preview one
  const preview = variants[0];
  console.log(`Preview: ${preview.name}`);
  console.log(`  Deck ID: ${preview.deckId}`);
  console.log(`  Blue: ${preview.leftTurns} turns (${preview.leftRatio})`);
  console.log(`  Red:  ${preview.rightTurns} turns (${preview.rightRatio})`);
  console.log(`  Card footer: VTG ${preview.pipeRatio} | TKA ${preview.tkaPipe}\n`);

  if (sourceSequences.length > 0) {
    const sample = sourceSequences[0];
    const transformed = applyAsymmetricTurns(sample.steps, preview.leftTurns, preview.rightTurns);
    if (transformed.length > 0) {
      const step = transformed[0];
      console.log(`  Sample beat 1 (${sample.word}):`);
      console.log(`    blue: ${step.motions.left.motionType} ${step.motions.left.rotationDirection} ${step.motions.left.startOrientation}->${step.motions.left.endOrientation} [${preview.leftTurns} turns]`);
      console.log(`    red:  ${step.motions.right.motionType} ${step.motions.right.rotationDirection} ${step.motions.right.startOrientation}->${step.motions.right.endOrientation} [${preview.rightTurns} turns]`);
    }
    console.log("");
  }

  // Seed all
  for (let i = 0; i < variants.length; i++) {
    const v = variants[i];
    console.log(`[${i + 1}/${variants.length}] ${v.name} (TKA ${v.tkaPipe}) -> decks/${v.deckId}`);

    if (DRY_RUN) {
      console.log("  (dry run)\n");
      continue;
    }

    await writeDeck(v, sourceSequences, sourceMeta);
    console.log("");
  }

  // Summary
  console.log("\n=== Summary ===");
  console.log(`Source: ${SOURCE_DECK_ID} (${sourceSequences.length} sequences)`);
  console.log(`Decks ${DRY_RUN ? "planned" : "seeded"}: ${variants.length}`);
  console.log(`Sequences ${DRY_RUN ? "planned" : "written"}: ${variants.length * sourceSequences.length}`);

  if (DRY_RUN) {
    console.log("\n--- DRY RUN — no data written ---");
    console.log("Run without --dry-run to seed.");
  }
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
