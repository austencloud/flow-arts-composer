/**
 * backfill-library-counts — one-time baseline for `users/{uid}.sequenceCount`
 * and `.collectionCount`.
 *
 * Since 2026-08-01 the client no longer writes these counters; the
 * `syncLibraryCounts` triggers own them. A profile only joins that system once
 * `_reconcileLibraryCountsOnProfileCreate` stamps `system/libraryCounts.ready`
 * with an aggregate baseline. That runs when a profile is created or on the
 * profile's next library event, so every profile that predates the triggers
 * and stays idle keeps its stale count until this script reconciles it.
 *
 * --apply calls that same trigger function, so the baseline, the system
 * collection exclusions, and the cutoff that makes late event delivery safe
 * all come from one owner. It refuses to run until every sync trigger is
 * deployed: a baseline taken while the triggers are down goes stale on the
 * next library change, and `ready` then stops reconciliation from repairing it.
 *
 *   TKA_ADMIN=1 npx tsx scripts/migrations/backfill-library-counts.ts            # dry-run
 *   TKA_ADMIN=1 npx tsx scripts/migrations/backfill-library-counts.ts --apply
 *
 * Run --apply from the primary checkout: it loads the functions source, whose
 * dependencies live in firebase-functions/node_modules.
 */
import { initFirestore } from "../lib/firestore-provider.js";
import {
  diffDeployment,
  listDeployedFunctionIds,
} from "../diagnostics/functions-deploy-drift";

const REQUIRED_TRIGGERS = [
  "syncSequenceCountOnCreate",
  "syncSequenceCountOnDelete",
  "syncCollectionCountOnCreate",
  "syncCollectionCountOnDelete",
  "syncLibraryCountsOnProfileCreate",
];

type Db = any;

const apply = process.argv.includes("--apply");
const { db, isAdmin, sdk } = (await initFirestore()) as {
  db: Db;
  isAdmin: boolean;
  sdk: string;
};
if (!isAdmin) {
  console.error("Needs the Admin SDK to read every profile. Set TKA_ADMIN=1.");
  process.exit(1);
}

if (apply) {
  const { undeployed } = diffDeployment(
    REQUIRED_TRIGGERS,
    listDeployedFunctionIds()
  );
  if (undeployed.length) {
    console.error(
      `Refusing --apply: deploy these triggers first:\n  ${undeployed.join("\n  ")}`
    );
    process.exit(1);
  }
}

/** Dry-run preview of the trigger's aggregate. --apply never uses this. */
async function liveCounts(uid: string): Promise<{ seq: number; col: number }> {
  const collections = db.collection(`users/${uid}/collections`);
  const [seq, all, typed, untyped] = await Promise.all([
    db.collection(`users/${uid}/sequences`).count().get(),
    collections.count().get(),
    collections
      .where("systemType", "in", ["favorites", "founding"])
      .count()
      .get(),
    collections.where("systemType", "==", null).count().get(),
  ]);
  return {
    seq: seq.data().count,
    col: Math.max(
      0,
      all.data().count - typed.data().count - untyped.data().count
    ),
  };
}

const reconcile = apply
  ? (await import("../../firebase-functions/src/profiles/syncLibraryCounts"))
      ._reconcileLibraryCountsOnProfileCreate
  : null;

console.log(`via ${sdk} — ${apply ? "APPLY" : "dry-run"}`);
const profiles = await db
  .collection("users")
  .select("sequenceCount", "collectionCount")
  .get();

let alreadyReady = 0;
let wrong = 0;
let reconciled = 0;
for (const profile of profiles.docs) {
  const uid: string = profile.id;
  const state = await db.doc(`users/${uid}/system/libraryCounts`).get();
  if (state.exists && state.data()?.ready === true) {
    alreadyReady++;
    continue;
  }

  const stored = profile.data();
  const live = await liveCounts(uid);
  const storedSeq = stored.sequenceCount ?? 0;
  const storedCol = stored.collectionCount ?? 0;
  if (storedSeq !== live.seq || storedCol !== live.col) {
    wrong++;
    console.log(
      `  ${uid.slice(0, 8)}…  sequences ${storedSeq} → ${live.seq}   collections ${storedCol} → ${live.col}`
    );
  }

  if (reconcile) {
    await reconcile(uid, db);
    reconciled++;
  }
}

console.log(
  `\n${profiles.size} profiles; ${alreadyReady} already reconciled; ${wrong} with wrong counts` +
    (apply
      ? `; ${reconciled} reconciled.`
      : ". Dry-run: nothing written.")
);
process.exit(0);
