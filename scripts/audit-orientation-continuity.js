#!/usr/bin/env node
/**
 * Orientation Continuity Audit
 *
 * Checks every sequence in every deck for:
 * 1. Beat-to-beat orientation continuity (each step's startOri = previous step's endOri)
 * 2. Loop closure (last step's endOri = startPlacement's ori for circular sequences)
 *
 * Usage:
 *   node scripts/audit-orientation-continuity.js
 *   node scripts/audit-orientation-continuity.js --deck=DECK_ID
 *   node scripts/audit-orientation-continuity.js --verbose
 */

import admin from "firebase-admin";
import { readFileSync } from "fs";

const args = process.argv.slice(2);
const verbose = args.includes("--verbose");
const deckArg = args.find((a) => a.startsWith("--deck="));
const targetDeckId = deckArg ? deckArg.split("=")[1] : null;

const serviceAccount = JSON.parse(
  readFileSync("./serviceAccountKey.json", "utf8")
);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

const COLORS = ["blue", "red"];
const DELAY_MS = 500;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getMotion(stepOrStart, color) {
  if (!stepOrStart) return null;
  const motions = stepOrStart.motions || stepOrStart.motion;
  if (!motions) return null;
  return motions[color] || null;
}

function getSteps(seq) {
  return seq.steps || seq.beats || [];
}

function getStartPlacement(seq) {
  return seq.startPlacement || seq.start_position || null;
}

function validateSequence(seq, deckId) {
  const errors = [];
  const steps = getSteps(seq);
  const startPos = getStartPlacement(seq);

  if (steps.length === 0) return errors;

  // Check 1: startPlacement → first step continuity
  if (startPos) {
    const firstStep = steps[0];
    for (const color of COLORS) {
      const startMotion = getMotion(startPos, color);
      const firstMotion = getMotion(firstStep, color);
      if (!startMotion || !firstMotion) continue;

      const expectedStart = startMotion.endOrientation || startMotion.end_orientation;
      const actualStart = firstMotion.startOrientation || firstMotion.start_orientation;

      if (expectedStart && actualStart && expectedStart !== actualStart) {
        errors.push({
          type: "start-to-step1",
          stepIndex: 0,
          color,
          expected: expectedStart,
          actual: actualStart,
          message: `${color} ori break: startPlacement.endOri="${expectedStart}" → step1.startOri="${actualStart}"`,
        });
      }
    }
  }

  // Check 2: beat-to-beat continuity
  for (let i = 1; i < steps.length; i++) {
    const prev = steps[i - 1];
    const curr = steps[i];

    for (const color of COLORS) {
      const prevMotion = getMotion(prev, color);
      const currMotion = getMotion(curr, color);
      if (!prevMotion || !currMotion) continue;

      const expectedStart = prevMotion.endOrientation || prevMotion.end_orientation;
      const actualStart = currMotion.startOrientation || currMotion.start_orientation;

      if (expectedStart && actualStart && expectedStart !== actualStart) {
        errors.push({
          type: "step-continuity",
          stepIndex: i,
          color,
          expected: expectedStart,
          actual: actualStart,
          message: `${color} ori break: step${i}.endOri="${expectedStart}" → step${i + 1}.startOri="${actualStart}"`,
        });
      }
    }
  }

  // Check 3: loop closure (last step → startPlacement)
  if (startPos && (seq.isCircular || seq.loopType)) {
    const lastStep = steps[steps.length - 1];
    for (const color of COLORS) {
      const lastMotion = getMotion(lastStep, color);
      const startMotion = getMotion(startPos, color);
      if (!lastMotion || !startMotion) continue;

      const lastEnd = lastMotion.endOrientation || lastMotion.end_orientation;
      const startStart = startMotion.startOrientation || startMotion.start_orientation;

      if (lastEnd && startStart && lastEnd !== startStart) {
        errors.push({
          type: "loop-closure",
          stepIndex: steps.length - 1,
          color,
          expected: startStart,
          actual: lastEnd,
          message: `${color} loop closure break: lastStep.endOri="${lastEnd}" ≠ startPlacement.startOri="${startStart}"`,
        });
      }
    }
  }

  return errors;
}

async function loadAllDecks() {
  const snapshot = await db.collection("catalogs").get();
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function loadDeckSequences(deckId) {
  const snapshot = await db.collection(`catalogs/${deckId}/sequences`).get();
  return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function main() {
  console.log("=== Orientation Continuity Audit ===\n");

  let decks;
  if (targetDeckId) {
    const deckDoc = await db.collection("catalogs").doc(targetDeckId).get();
    if (!deckDoc.exists) {
      console.error(`Deck ${targetDeckId} not found.`);
      process.exit(1);
    }
    decks = [{ id: deckDoc.id, ...deckDoc.data() }];
  } else {
    console.log("Loading all decks...");
    decks = await loadAllDecks();
    console.log(`Found ${decks.length} decks.\n`);
  }

  let totalSequences = 0;
  let totalErrors = 0;
  let totalFaultySequences = 0;
  const faultyReport = [];

  for (const deck of decks) {
    if (verbose) {
      console.log(`\nDeck: ${deck.name || deck.id} (${deck.id})`);
      console.log(`  Level: ${deck.level}, Grid: ${deck.gridMode}, Loop: ${deck.loopType}`);
    }

    const sequences = await loadDeckSequences(deck.id);
    if (verbose) {
      console.log(`  Sequences: ${sequences.length}`);
    }

    let deckErrors = 0;

    for (const seq of sequences) {
      totalSequences++;
      const errors = validateSequence(seq, deck.id);

      if (errors.length > 0) {
        totalErrors += errors.length;
        totalFaultySequences++;
        deckErrors++;

        const entry = {
          deckId: deck.id,
          deckName: deck.name || deck.id,
          sequenceId: seq.id,
          word: seq.word || seq.name || "unknown",
          stepCount: getSteps(seq).length,
          gridMode: seq.gridMode || deck.gridMode || "unknown",
          level: deck.level,
          loopType: seq.loopType || deck.loopType || "unknown",
          errors,
        };
        faultyReport.push(entry);

        if (verbose) {
          console.log(`\n  ❌ ${seq.word || seq.id} (${seq.id})`);
          for (const e of errors) {
            console.log(`     ${e.message}`);
          }
        }
      }
    }

    if (!verbose && deckErrors > 0) {
      console.log(`❌ ${deck.name || deck.id}: ${deckErrors} faulty sequence(s) out of ${sequences.length}`);
    } else if (!verbose && sequences.length > 0) {
      console.log(`✅ ${deck.name || deck.id}: ${sequences.length} sequences OK`);
    }

    await sleep(DELAY_MS);
  }

  // Summary
  console.log("\n=== SUMMARY ===");
  console.log(`Total decks scanned:      ${decks.length}`);
  console.log(`Total sequences scanned:  ${totalSequences}`);
  console.log(`Faulty sequences:         ${totalFaultySequences}`);
  console.log(`Total orientation errors:  ${totalErrors}`);

  if (faultyReport.length > 0) {
    console.log("\n=== FAULTY SEQUENCES ===\n");
    for (const entry of faultyReport) {
      console.log(`Deck:     ${entry.deckName} (${entry.deckId})`);
      console.log(`Sequence: ${entry.word} (${entry.sequenceId})`);
      console.log(`Steps:    ${entry.stepCount}, Grid: ${entry.gridMode}, Level: ${entry.level}`);
      for (const e of entry.errors) {
        console.log(`  → [${e.type}] ${e.message}`);
      }
      console.log();
    }

    // Machine-readable JSON dump
    const reportPath = "orientation-audit-report.json";
    const { writeFileSync } = await import("fs");
    writeFileSync(reportPath, JSON.stringify(faultyReport, null, 2));
    console.log(`Full report written to: ${reportPath}`);
  } else {
    console.log("\n✅ All sequences pass orientation continuity checks!");
  }
}

main().catch((err) => {
  console.error("Audit failed:", err);
  process.exit(1);
});
