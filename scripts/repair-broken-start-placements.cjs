#!/usr/bin/env node
/**
 * Repair Broken Start Positions
 *
 * Finds user-library sequences where `startPlacement` EXISTS but is missing
 * canonical `motions.left` or `motions.right`, and rebuilds the motions block from
 * the first step's start-side motion data.
 *
 * This fixes docs produced by an older `import-sequence.cjs` that passed
 * through a string `startPlacement` (e.g. "beta5" from MCP generate_sequence)
 * and wrote an object with undefined nested fields. Symptom: the gallery
 * thumbnail renders the Start cell with grid + label but no props.
 * Public sequences are reported but never changed by this owner-only script;
 * use reconcile-sequence-public-projections.ts for public parity repair.
 *
 * Usage:
 *   node scripts/repair-broken-start-placements.cjs                    # dry-run, all users
 *   node scripts/repair-broken-start-placements.cjs --commit           # write
 *   node scripts/repair-broken-start-placements.cjs --id <seqId>       # single doc
 *   node scripts/repair-broken-start-placements.cjs --id <seqId> --commit
 */

const admin = require("firebase-admin");
const { readFileSync } = require("fs");
const { resolve } = require("path");

const args = process.argv.slice(2);
const isCommit = args.includes("--commit");
const idIdx = args.indexOf("--id");
const targetId = idIdx >= 0 ? args[idIdx + 1] : null;

const serviceAccountPath = resolve(__dirname, "../serviceAccountKey.json");
let serviceAccount;
try {
  serviceAccount = JSON.parse(readFileSync(serviceAccountPath, "utf8"));
} catch {
  console.error("Missing serviceAccountKey.json in project root.");
  process.exit(1);
}

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
const db = admin.firestore();

function letterFromGrid(gridPos) {
  if (typeof gridPos !== "string") return null;
  if (gridPos.startsWith("alpha")) return "α";
  if (gridPos.startsWith("beta")) return "β";
  if (gridPos.startsWith("gamma")) return "γ";
  return null;
}

function synthesizeMotionsFromSteps(steps) {
  const firstStep = steps?.[0];
  const leftMotion = firstStep?.motions?.left || firstStep?.motions?.blue;
  const rightMotion = firstStep?.motions?.right || firstStep?.motions?.red;
  if (!leftMotion || !rightMotion) return null;

  return {
    left: {
      hand: "left",
      motionType: "static",
      startLocation: leftMotion.startLocation,
      endLocation: leftMotion.startLocation,
      startOrientation: leftMotion.startOrientation,
      endOrientation: leftMotion.startOrientation,
      rotationDirection: "noRotation",
      turns: 0,
      isVisible: leftMotion.isVisible !== false,
      propType: leftMotion.propType,
    },
    right: {
      hand: "right",
      motionType: "static",
      startLocation: rightMotion.startLocation,
      endLocation: rightMotion.startLocation,
      startOrientation: rightMotion.startOrientation,
      endOrientation: rightMotion.startOrientation,
      rotationDirection: "noRotation",
      turns: 0,
      isVisible: rightMotion.isVisible !== false,
      propType: rightMotion.propType,
    },
  };
}

/**
 * Repair produces a complete startPlacement by merging what's valid on the
 * stored doc with fields derived from steps[0]. We never discard working
 * motion data — we only fill in what's missing (gridPlacement, startPlacement,
 * endPlacement, letter) and synthesize motions only when they're absent.
 */
function repairStartPlacement(data, sequenceId) {
  const existing = data.startPlacement || {};
  const firstStep = (data.steps || data.beats || [])[0];
  const derivedGridPos = firstStep?.startPlacement || null;

  const gridPos =
    existing.gridPlacement || existing.startPlacement || derivedGridPos || null;

  const existingLeft = existing.motions?.left || existing.motions?.blue;
  const existingRight = existing.motions?.right || existing.motions?.red;
  const motionsOk = existingLeft?.startLocation && existingRight?.startLocation;
  const motions = motionsOk
    ? { left: existingLeft, right: existingRight }
    : synthesizeMotionsFromSteps(data.steps || data.beats || []);

  if (!gridPos || !motions) return null;

  return {
    isStartPlacement: true,
    id: existing.id || `start-${sequenceId}`,
    gridPlacement: gridPos,
    letter: existing.letter || letterFromGrid(gridPos),
    startPlacement: gridPos,
    endPlacement: gridPos,
    motions,
  };
}

function isBroken(startPlacement) {
  if (!startPlacement) return false; // backfill-start-placement.cjs handles the missing case
  if (typeof startPlacement !== "object") return true;
  const hasLeftMotion = !!startPlacement.motions?.left?.startLocation;
  const hasRightMotion = !!startPlacement.motions?.right?.startLocation;
  const hasGrid = !!(startPlacement.gridPlacement || startPlacement.startPlacement);
  return !(hasLeftMotion && hasRightMotion && hasGrid);
}

async function processDoc(docSnap, stats) {
  const data = docSnap.data();
  if (!isBroken(data.startPlacement)) {
    stats.ok++;
    return;
  }
  if (data.visibility === "public") {
    // This repair performs an owner-only update. A public sequence must be
    // changed through the canonical persistence/reconciliation path so its
    // projection and content-hash claim move in the same transaction.
    stats.publicSkipped++;
    console.log(
      `  [public skipped] ${docSnap.ref.path} — use reconcile-sequence-public-projections.ts`
    );
    return;
  }

  const repaired = repairStartPlacement(data, docSnap.id);
  if (!repaired) {
    stats.unrepairable++;
    console.log(
      `  [unrepairable] ${docSnap.ref.path} — cannot derive gridPlacement or motions`
    );
    return;
  }

  stats.willRepair++;
  console.log(
    `  [${isCommit ? "REPAIR" : "dry-run"}] ${docSnap.ref.path} (word: ${data.word || data.name || "?"})`
  );
  console.log(`    old: ${JSON.stringify(data.startPlacement).slice(0, 160)}`);
  console.log(
    `    new.gridPlacement=${repaired.gridPlacement} blue=${repaired.motions.left.startLocation}/${repaired.motions.left.startOrientation} red=${repaired.motions.right.startLocation}/${repaired.motions.right.startOrientation}`
  );

  if (isCommit) {
    await docSnap.ref.update({ startPlacement: repaired });
    stats.committed++;
  }
}

async function main() {
  console.log(
    `Repair Broken Start Positions ${isCommit ? "(COMMIT)" : "(dry-run)"}`
  );
  const stats = {
    ok: 0,
    willRepair: 0,
    committed: 0,
    unrepairable: 0,
    publicSkipped: 0,
  };

  if (targetId) {
    // Single doc across all users
    const usersSnapshot = await db.collection("users").get();
    let found = false;
    for (const userDoc of usersSnapshot.docs) {
      const ref = db.doc(`users/${userDoc.id}/sequences/${targetId}`);
      const snap = await ref.get();
      if (snap.exists) {
        found = true;
        await processDoc(snap, stats);
      }
    }
    if (!found) {
      console.error(`Sequence not found: ${targetId}`);
      process.exit(2);
    }
  } else {
    const usersSnapshot = await db.collection("users").get();
    for (const userDoc of usersSnapshot.docs) {
      const libSnap = await db
        .collection(`users/${userDoc.id}/sequences`)
        .get();
      for (const d of libSnap.docs) await processDoc(d, stats);
    }
  }

  console.log("\nSummary:");
  console.log(`  OK (already valid):  ${stats.ok}`);
  console.log(`  Repairable:          ${stats.willRepair}`);
  console.log(`  Committed:           ${stats.committed}`);
  console.log(`  Unrepairable:        ${stats.unrepairable}`);
  console.log(`  Public skipped:      ${stats.publicSkipped}`);
  if (!isCommit && stats.willRepair > 0) {
    console.log("\nRe-run with --commit to write.");
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
