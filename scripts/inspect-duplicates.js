#!/usr/bin/env node
/**
 * Inspect sequences with the same word to understand why they look identical
 * but have different fingerprints.
 *
 * Usage: node scripts/inspect-duplicates.js [word]
 *        node scripts/inspect-duplicates.js "ΔΥ-ΕΦ-"
 */

import { createHash } from "crypto";
import { initFirestore } from "./lib/firestore-provider.js";

const AUSTEN_UID = "PBp3GSBO6igCKPwJyLZNmVEmamI3";
const searchWord = process.argv[2];

async function run() {
  const { db } = await initFirestore();
  console.log("Connected to Firestore.\n");

  const seqsRef = db.collection(`users/${AUSTEN_UID}/sequences`);
  const snapshot = await seqsRef.get();

  // Find all sequences with duplicate words
  const byWord = new Map();
  snapshot.forEach((doc) => {
    const data = doc.data();
    const word = data.word || data.name || "";
    if (!byWord.has(word)) byWord.set(word, []);
    byWord.get(word).push({ id: doc.id, data });
  });

  // Filter to words with 2+ sequences
  const multipleWords = [];
  for (const [word, docs] of byWord) {
    if (docs.length > 1) multipleWords.push({ word, docs });
  }

  if (searchWord) {
    // Show detailed comparison for a specific word
    const group = multipleWords.find((g) => g.word === searchWord);
    if (!group) {
      console.log(`No sequences found with word "${searchWord}"`);
      console.log("\nWords with multiple sequences:");
      for (const g of multipleWords) {
        console.log(`  "${g.word}" — ${g.docs.length} sequences`);
      }
      return;
    }
    await compareDetailed(group);
  } else {
    // List all words with multiple sequences
    console.log(`Found ${multipleWords.length} words with multiple sequences:\n`);
    for (const group of multipleWords) {
      console.log(`  "${group.word}" — ${group.docs.length} sequences`);
      for (const doc of group.docs) {
        const d = doc.data;
        const date = d.birthday?.toDate?.()?.toISOString?.()?.split("T")[0] || "unknown";
        const steps = (d.steps || d.beats || []).length;
        console.log(`    ${doc.id} | ${steps} steps | ${date} | vis: ${d.visibility || "?"}`);
      }
    }
    console.log("\nRun with a word argument to see detailed comparison.");
    console.log('Example: node scripts/inspect-duplicates.js "ΔΥ-ΕΦ-"');
  }
}

async function compareDetailed(group) {
  console.log(`Comparing ${group.docs.length} sequences for word "${group.word}":\n`);

  for (let i = 0; i < group.docs.length; i++) {
    const doc = group.docs[i];
    const d = doc.data;
    const steps = d.steps || d.beats || [];

    console.log(`--- Sequence ${i + 1}: ${doc.id} ---`);
    console.log(`  Created: ${d.birthday?.toDate?.()?.toISOString?.() || d.createdAt?.toDate?.()?.toISOString?.() || "unknown"}`);
    console.log(`  Visibility: ${d.visibility || "unknown"}`);
    console.log(`  Steps: ${steps.length}`);
    console.log(`  GridMode: ${d.gridMode}`);
    console.log(`  ContentHash: ${d.contentHash || "(none)"}`);

    // Show each step's key motion data
    for (let s = 0; s < steps.length; s++) {
      const step = steps[s];
      const left = step.motions?.left;
      const right = step.motions?.right;
      console.log(`  Step ${s}: letter=${step.letter}, blueRev=${step.leftReversal}, redRev=${step.rightReversal}`);
      if (left) console.log(`    BLUE: ${left.motionType} ${left.rotationDirection} ${left.startLocation}→${left.endLocation} turns=${left.turns} orient=${left.startOrientation}→${left.endOrientation}`);
      if (right) console.log(`    RED:  ${right.motionType} ${right.rotationDirection} ${right.startLocation}→${right.endLocation} turns=${right.turns} orient=${right.startOrientation}→${right.endOrientation}`);
    }
    console.log();
  }

  // Now diff them field by field
  if (group.docs.length === 2) {
    console.log("=== DIFF ===\n");
    const a = group.docs[0].data;
    const b = group.docs[1].data;

    const stepsA = a.steps || a.beats || [];
    const stepsB = b.steps || b.beats || [];

    if (stepsA.length !== stepsB.length) {
      console.log(`Step count differs: ${stepsA.length} vs ${stepsB.length}`);
      return;
    }

    let identical = true;
    // Compare top-level fields
    const topFields = ["gridMode", "word", "isCircular"];
    for (const f of topFields) {
      if (JSON.stringify(a[f]) !== JSON.stringify(b[f])) {
        console.log(`  TOP "${f}": ${JSON.stringify(a[f])} vs ${JSON.stringify(b[f])}`);
        identical = false;
      }
    }

    // Compare startPlacement
    const spA = a.startPlacement || a.startingPlacement;
    const spB = b.startPlacement || b.startingPlacement;
    if (JSON.stringify(spA) !== JSON.stringify(spB)) {
      // Drill down
      const spKeys = new Set([...Object.keys(spA || {}), ...Object.keys(spB || {})]);
      for (const k of spKeys) {
        if (JSON.stringify(spA?.[k]) !== JSON.stringify(spB?.[k])) {
          console.log(`  START_POS "${k}" differs`);
          identical = false;
        }
      }
    }

    // Compare each step
    for (let s = 0; s < stepsA.length; s++) {
      const sa = stepsA[s];
      const sb = stepsB[s];
      const allKeys = new Set([...Object.keys(sa), ...Object.keys(sb)]);
      for (const k of allKeys) {
        const va = JSON.stringify(sa[k]);
        const vb = JSON.stringify(sb[k]);
        if (va !== vb) {
          console.log(`  STEP[${s}] "${k}":`);
          console.log(`    A: ${va?.slice(0, 200)}`);
          console.log(`    B: ${vb?.slice(0, 200)}`);
          identical = false;
        }
      }
    }

    if (identical) {
      console.log("  Steps and motions are IDENTICAL.");
      console.log(`\n  To delete the newer one, run:`);
      // Determine which is newer
      const dateA = a.birthday?.toDate?.() || a.createdAt?.toDate?.() || new Date(0);
      const dateB = b.birthday?.toDate?.() || b.createdAt?.toDate?.() || new Date(0);
      const newer = dateA > dateB ? group.docs[0] : group.docs[1];
      console.log(`  node scripts/find-and-delete-duplicates.js --delete`);
    }
  }
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Error:", err);
    process.exit(1);
  });
