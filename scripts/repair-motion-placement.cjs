#!/usr/bin/env node
/**
 * Repair Motion Placement Data
 *
 * Finds user-library sequences whose motions EXIST but are missing
 * `propPlacementData` / `arrowPlacementData`, and writes the default placement
 * objects in place.
 *
 * Symptom this repairs: a cell renders grid + label with no props and no
 * arrows. The render pipeline enforces these fields with two guards that fail
 * SILENTLY — PictographPreparer.calculateProps early-returns without
 * propPlacementData, and ArrowLifecycleManager.loadArrowAssets throws and is
 * swallowed upstream. Most visible on the start-placement cell, because steps
 * are rebuilt through createMotionData (which defaults the fields) while a
 * stored startPlacement is passed through verbatim.
 *
 * Not the same defect as repair-broken-start-placements.cjs, which rebuilds a
 * startPlacement whose canonical `motions.left` / `motions.right` are missing
 * entirely. Historical blue/red keys are still accepted at the repair boundary.
 * one handles motions that are present but placement-less. Run both; they are
 * disjoint.
 *
 * The values written are the same zero-defaults createPropPlacementData() and
 * createArrowPlacementData() produce (see
 * src/lib/shared/pictograph/prop/domain/factories/create-prop-placement-data.ts
 * and .../arrow/positioning/placement/domain/create-arrow-placement-data.ts).
 * The placers recompute real coordinates at render time from the motion's
 * locations and orientations, so these fields only need to EXIST — writing
 * zeros is exactly what the runtime backfill (ensureStepPlacement) does.
 *
 * Strictly additive: only absent fields are written. No existing value is
 * modified, so a doc that already renders correctly is left byte-identical.
 *
 * As of 2026-07-27 the app also heals this at read AND save time
 * (pictograph/shared/services/motion-placement.ts, imported by both sequence
 * hydrators), so this script is a proactive cleanup rather than a requirement.
 *
 * Usage:
 *   node scripts/repair-motion-placement.cjs                 # dry-run, all users
 *   node scripts/repair-motion-placement.cjs --commit        # write
 *   node scripts/repair-motion-placement.cjs --user <uid>    # scope to one user
 *   node scripts/repair-motion-placement.cjs --id <seqId>    # single doc
 */

const admin = require("firebase-admin");
const { readFileSync } = require("fs");
const { resolve } = require("path");

const args = process.argv.slice(2);
const isCommit = args.includes("--commit");
const idIdx = args.indexOf("--id");
const targetId = idIdx >= 0 ? args[idIdx + 1] : null;
const userIdx = args.indexOf("--user");
const targetUser = userIdx >= 0 ? args[userIdx + 1] : null;

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

const DEFAULT_PROP_PLACEMENT = {
  positionX: 0,
  positionY: 0,
  rotationAngle: 0,
  coordinates: null,
  svgCenter: null,
};

const DEFAULT_ARROW_PLACEMENT = {
  positionX: 0,
  positionY: 0,
  rotationAngle: 0,
  coordinates: null,
  svgCenter: null,
  svgMirrored: false,
  manualAdjustmentX: 0,
  manualAdjustmentY: 0,
};

/** Returns a repaired copy of a motion, or null when nothing was missing. */
function repairMotion(motion) {
  if (!motion || typeof motion !== "object") return null;
  const needsProp = !motion.propPlacementData;
  const needsArrow = !motion.arrowPlacementData;
  if (!needsProp && !needsArrow) return null;
  return {
    ...motion,
    ...(needsProp && { propPlacementData: { ...DEFAULT_PROP_PLACEMENT } }),
    ...(needsArrow && { arrowPlacementData: { ...DEFAULT_ARROW_PLACEMENT } }),
  };
}

/** Returns a repaired copy of a step-shaped record, or null when clean. */
function repairStepShape(step) {
  if (!step || typeof step !== "object" || !step.motions) return null;
  const left = repairMotion(step.motions.left);
  const right = repairMotion(step.motions.right);
  if (!left && !right) return null;
  return {
    ...step,
    motions: {
      ...step.motions,
      ...(left && { left }),
      ...(right && { right }),
    },
  };
}

async function processDoc(doc, stats) {
  const data = doc.data();
  stats.scanned++;

  const update = {};
  const touched = [];

  for (const field of ["startPlacement", "startingPlacement"]) {
    const repaired = repairStepShape(data[field]);
    if (repaired) {
      update[field] = repaired;
      touched.push(field);
    }
  }

  if (Array.isArray(data.steps)) {
    let stepsChanged = 0;
    const repairedSteps = data.steps.map((step) => {
      const fixed = repairStepShape(step);
      if (fixed) stepsChanged++;
      return fixed ?? step;
    });
    if (stepsChanged > 0) {
      update.steps = repairedSteps;
      touched.push(`steps(${stepsChanged})`);
    }
  }

  if (touched.length === 0) return;

  stats.needingRepair++;
  stats.byField.push(`${doc.id} — ${touched.join(", ")}`);

  if (isCommit) {
    await doc.ref.update(update);
    stats.repaired++;
  }
}

async function main() {
  const stats = { scanned: 0, needingRepair: 0, repaired: 0, byField: [] };

  console.log(
    isCommit
      ? "MODE: COMMIT — documents will be written."
      : "MODE: DRY RUN — nothing will be written. Re-run with --commit to apply."
  );

  const usersSnapshot = targetUser
    ? { docs: [{ id: targetUser }] }
    : await db.collection("users").get();

  for (const userDoc of usersSnapshot.docs) {
    const libSnap = await db.collection(`users/${userDoc.id}/sequences`).get();
    for (const d of libSnap.docs) {
      if (targetId && d.id !== targetId) continue;
      await processDoc(d, stats);
    }
  }

  console.log("");
  console.log(`Scanned:          ${stats.scanned}`);
  console.log(`Needing repair:   ${stats.needingRepair}`);
  console.log(`Repaired:         ${isCommit ? stats.repaired : 0}`);
  if (stats.byField.length > 0) {
    console.log("");
    console.log("Affected documents (first 40):");
    for (const line of stats.byField.slice(0, 40)) console.log(`  ${line}`);
    if (stats.byField.length > 40) {
      console.log(`  ... and ${stats.byField.length - 40} more`);
    }
  }
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  }
);
