#!/usr/bin/env node
/**
 * Clear the stale config/effectPoints.trigeng override.
 *
 * Every client reads config/effectPoints and lets it override the tip tables
 * in prop-tip-points.ts. The stored trigeng points sit ~80 artwork units
 * below the sprite's pivot, so fire, LEDs and trails emit from empty space
 * next to the arms (verified 2026-09-17 by sampling the rendered sprite at
 * each emitter). The code table TRIGENG_TIP_POINTS lands on all three arm
 * caps, so the fix is to delete the override and let the table apply.
 *
 * Dry-run is the default. Pass --apply to write. The write only proceeds when
 * the current value is the known stale configuration, so a newer hand-tuned
 * set of points is never discarded.
 */
const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const SERVICE_ACCOUNT_PATH = process.env.TKA_SERVICE_ACCOUNT_PATH
  ? path.resolve(process.env.TKA_SERVICE_ACCOUNT_PATH)
  : path.join(PROJECT_ROOT, "serviceAccountKey.json");
const DOCUMENT_PATH = "config/effectPoints";
const FIELD = "trigeng";
const UPDATED_BY = "clear-trigeng-tip-override-2026-09-17";
const APPLY = process.argv.includes("--apply");

const STALE_TRIGENG_POINTS = [
  { dx: 118.3, dy: 78.3 },
  { dx: -58.3, dy: 184.2 },
  { dx: -61.7, dy: -22.5 },
];

function pointsEqual(actual, expected, tolerance = 1e-6) {
  return (
    Array.isArray(actual) &&
    actual.length === expected.length &&
    actual.every(
      (point, index) =>
        typeof point?.dx === "number" &&
        typeof point?.dy === "number" &&
        Math.abs(point.dx - expected[index].dx) <= tolerance &&
        Math.abs(point.dy - expected[index].dy) <= tolerance
    )
  );
}

function classify(points) {
  if (points === undefined || (Array.isArray(points) && points.length === 0)) {
    return "cleared";
  }
  if (pointsEqual(points, STALE_TRIGENG_POINTS)) return "stale";
  return "unexpected";
}

async function main() {
  if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
    throw new Error(`Missing service account key: ${SERVICE_ACCOUNT_PATH}`);
  }

  const serviceAccount = JSON.parse(
    fs.readFileSync(SERVICE_ACCOUNT_PATH, "utf8")
  );
  if (admin.apps.length === 0) {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  }

  const db = admin.firestore();
  const ref = db.doc(DOCUMENT_PATH);
  const before = await ref.get();
  if (!before.exists) throw new Error(`${DOCUMENT_PATH} does not exist`);

  const current = before.data()?.[FIELD];
  const state = classify(current);
  console.log(`Current ${DOCUMENT_PATH}.${FIELD} state: ${state}`);
  console.log(JSON.stringify(current ?? null, null, 2));

  if (state === "unexpected") {
    throw new Error(
      `Refusing to clear ${FIELD} points that do not match the known stale values.`
    );
  }
  if (state === "cleared") {
    console.log(`No change needed; ${FIELD} already falls back to the code table.`);
    return;
  }
  if (!APPLY) {
    console.log(
      `Dry run only. --apply deletes ${DOCUMENT_PATH}.${FIELD} so TRIGENG_TIP_POINTS applies.`
    );
    return;
  }

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const transactionState = classify(snapshot.data()?.[FIELD]);
    if (transactionState === "cleared") return;
    if (transactionState !== "stale") {
      throw new Error(
        `${FIELD} points changed after the initial read; refusing to overwrite them.`
      );
    }
    transaction.update(ref, {
      [FIELD]: admin.firestore.FieldValue.delete(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedBy: UPDATED_BY,
    });
  });

  const after = await ref.get();
  const updated = after.data();
  if (classify(updated?.[FIELD]) !== "cleared") {
    throw new Error(`Post-write verification failed for ${FIELD} tip points.`);
  }

  console.log(`Deleted and verified ${DOCUMENT_PATH}.${FIELD}.`);
  console.log(`updatedBy: ${updated?.updatedBy}`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await Promise.all(admin.apps.map((app) => app.delete()));
  });
