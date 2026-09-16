#!/usr/bin/env node
/**
 * Find and delete exact duplicate sequences in a user's library.
 *
 * Groups sequences by word, then compares their actual motion data (step-level)
 * to find true duplicates. Most older sequences don't have a contentHash stored,
 * so we compute a fingerprint from the raw step data on the fly.
 *
 * Keeps the OLDEST version (lowest birthday/createdAt) and deletes the newer clone.
 *
 * Usage:
 *   node scripts/find-and-delete-duplicates.js           # dry run — just list duplicates
 *   node scripts/find-and-delete-duplicates.js --delete   # actually delete the dupes
 */

import { createHash } from "crypto";
import { initFirestore } from "./lib/firestore-provider.js";

const AUSTEN_UID = "PBp3GSBO6igCKPwJyLZNmVEmamI3";
const shouldDelete = process.argv.includes("--delete");

/**
 * Extract only motion-defining fields from a step's motion data.
 * Mirrors SequenceContentHasher.extractMotion() in the app code.
 */
function extractMotion(m) {
  if (!m) return null;
  return {
    motionType: m.motionType,
    rotationDirection: m.rotationDirection,
    startLocation: m.startLocation,
    endLocation: m.endLocation,
    turns: m.turns,
    startOrientation: m.startOrientation,
    endOrientation: m.endOrientation,
    handPath: m.handPath ?? null,
    gridMode: m.gridMode ?? null,
    skewSteps: m.skewSteps ?? null,
    skewDir: m.skewDir ?? null,
  };
}

function extractMotions(motions) {
  if (!motions) return null;
  const result = {};
  for (const color of ["blue", "red"]) {
    if (motions[color]) result[color] = extractMotion(motions[color]);
  }
  return result;
}

/**
 * Compute a fingerprint from a sequence's motion content.
 * Two sequences with the same fingerprint have identical movement patterns.
 */
function computeFingerprint(data) {
  const steps = data.steps || data.beats || [];
  const sp = data.startPlacement || data.startingPlacement;

  const content = {
    gridMode: data.gridMode ?? null,
    startPlacement: sp ? { motions: extractMotions(sp.motions), gridMode: sp.gridMode ?? null } : null,
    steps: steps.map((s) => ({
      letter: s.letter ?? null,
      leftReversal: s.leftReversal,
      rightReversal: s.rightReversal,
      isBlank: s.isBlank,
      duration: s.duration,
      motions: extractMotions(s.motions),
      gridMode: s.gridMode ?? null,
    })),
  };

  return createHash("sha256").update(JSON.stringify(content)).digest("hex");
}

async function run() {
  const { db } = await initFirestore();
  console.log("Connected to Firestore.\n");

  const seqsRef = db.collection(`users/${AUSTEN_UID}/sequences`);
  const snapshot = await seqsRef.get();
  console.log(`Loaded ${snapshot.size} sequences from library.\n`);

  // Group by word first (cheap), then fingerprint within each group
  const byWord = new Map();
  snapshot.forEach((doc) => {
    const data = doc.data();
    const word = data.word || data.name || "";
    if (!byWord.has(word)) byWord.set(word, []);
    byWord.get(word).push({ id: doc.id, data, ref: doc.ref });
  });

  // Within each word group, compute fingerprints and find duplicates
  const duplicateGroups = [];
  for (const [word, docs] of byWord) {
    if (docs.length < 2) continue;

    const byFingerprint = new Map();
    for (const doc of docs) {
      const fp = computeFingerprint(doc.data);
      if (!byFingerprint.has(fp)) byFingerprint.set(fp, []);
      byFingerprint.get(fp).push(doc);
    }

    for (const [fp, fpDocs] of byFingerprint) {
      if (fpDocs.length > 1) {
        duplicateGroups.push({ word, fingerprint: fp, docs: fpDocs });
      }
    }
  }

  if (duplicateGroups.length === 0) {
    console.log("No exact duplicates found. Library is clean.");
    return;
  }

  console.log(`Found ${duplicateGroups.length} duplicate group(s):\n`);

  const toDelete = [];

  for (const group of duplicateGroups) {
    // Sort by creation date — keep the oldest
    group.docs.sort((a, b) => {
      const dateA = a.data.birthday?.toDate?.() || a.data.createdAt?.toDate?.() || new Date(0);
      const dateB = b.data.birthday?.toDate?.() || b.data.createdAt?.toDate?.() || new Date(0);
      return dateA - dateB;
    });

    const keeper = group.docs[0];
    const dupes = group.docs.slice(1);

    console.log(`  Word: "${group.word}"`);
    console.log(`  Hash: ${group.fingerprint.slice(0, 16)}...`);
    console.log(`  KEEP:   ${keeper.id} (created ${formatDate(keeper.data)}, visibility: ${keeper.data.visibility || "unknown"})`);
    for (const dupe of dupes) {
      console.log(`  DELETE: ${dupe.id} (created ${formatDate(dupe.data)}, visibility: ${dupe.data.visibility || "unknown"})`);
      toDelete.push(dupe);
    }
    console.log();
  }

  console.log(`Total to delete: ${toDelete.length} duplicate(s)\n`);

  if (!shouldDelete) {
    console.log("⚠️  DRY RUN — no changes made.");
    console.log("Run with --delete to remove duplicates.");
    return;
  }

  // Delete duplicates and their public index entries
  let deleted = 0;
  for (const dupe of toDelete) {
    try {
      // Remove from public index if it exists there
      const publicRef = db.collection("publicSequences").doc(dupe.id);
      const publicDoc = await publicRef.get();
      if (publicDoc.exists) {
        await publicRef.delete();
        console.log(`  Removed ${dupe.id} from publicSequences`);
      }

      // Delete the sequence itself
      await dupe.ref.delete();
      deleted++;
      console.log(`  Deleted ${dupe.id} from user library`);
    } catch (err) {
      console.error(`  Failed to delete ${dupe.id}: ${err.message}`);
    }
  }

  // Decrement sequence count
  if (deleted > 0) {
    try {
      const { FieldValue } = await initFirestore();
      const userRef = db.collection("users").doc(AUSTEN_UID);
      await userRef.update({ sequenceCount: FieldValue.increment(-deleted) });
      console.log(`\nDecremented sequenceCount by ${deleted}`);
    } catch (err) {
      console.warn(`Could not update sequenceCount: ${err.message}`);
    }
  }

  console.log(`\nDone. Deleted ${deleted} duplicate(s).`);
}

function formatDate(data) {
  const ts = data.birthday || data.createdAt;
  if (ts?.toDate) return ts.toDate().toISOString().split("T")[0];
  return "unknown date";
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Error:", err);
    process.exit(1);
  });
