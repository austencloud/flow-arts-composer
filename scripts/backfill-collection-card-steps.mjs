/**
 * Backfill `cardSteps` on existing public collections.
 *
 * The app keeps this field current when an owner opens their own public
 * collection (collection-manager `recordCollectionCardSteps`). This script
 * stamps the ones nobody has reopened, so a first-time visitor's placeholders
 * take the cards' row shapes.
 *
 * Reads the public collections with the same bounded query the app's feed uses
 * (collection group, isPublic == true, newest first, limit), then only the
 * public sequences those collections name, by id. Computes each value with the
 * app's own helper (no second implementation of the shape rule). The only
 * local mapping is the catalogue's doc-to-sequence step (legacy normalise, then
 * hydrate), repeated here because that mapper is a private class method.
 *
 * DRY RUN BY DEFAULT: prints what it would write and the reads it made.
 * Writes, one update of the single field per collection whose value differs,
 * only with --write. updatedAt is not touched.
 *
 * Run (needs tsx, which loads the app's TypeScript helpers):
 *   npx tsx scripts/backfill-collection-card-steps.mjs [--write] [--limit=200]
 */
import admin from "firebase-admin";
import { readFileSync } from "fs";
import { normalizeLegacySequence } from "@tka/tka-types";
import { hydrate } from "#lib/shared/foundation/services/sequence-hydrator.js";
import { collectionPlaceholderSteps } from "#lib/features/browse/collections/services/collection-placeholder-steps.ts";
import { cardStepsKey, parseCardSteps } from "#lib/shared/library/domain/collection-card-steps.ts";

const WRITE = process.argv.includes("--write");
const limitArg = process.argv.find((a) => a.startsWith("--limit="));
const LIMIT = limitArg ? Number(limitArg.split("=")[1]) : 200;
if (!Number.isInteger(LIMIT) || LIMIT < 1) throw new Error("bad --limit");

const serviceAccount = JSON.parse(
  readFileSync("E:/tka-platform/serviceAccountKey.json", "utf8")
);
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

let reads = 0;

// 1. The feed's query: public collections, newest first, bounded.
const snap = await db
  .collectionGroup("collections")
  .where("isPublic", "==", true)
  .orderBy("updatedAt", "desc")
  .limit(LIMIT)
  .get();
reads += snap.size;
console.log(`public collections read: ${snap.size} (limit ${LIMIT})`);

const items = [];
for (const d of snap.docs) {
  const ownerId = d.ref.parent.parent?.id;
  if (!ownerId) continue; // legacy root-level doc
  const data = d.data();
  if (data.systemType || data.kind === "smart") continue;
  if (!Array.isArray(data.sequenceIds) || data.sequenceIds.length === 0) continue;
  items.push({ ref: d.ref, id: d.id, ownerId, data });
}

// 2. Only the public sequences those collections name, once each, by id.
const needed = new Set();
for (const { data } of items) for (const id of data.sequenceIds) needed.add(id);
const refs = [...needed].map((id) => db.collection("publicSequences").doc(id));
const byId = new Map();
for (let i = 0; i < refs.length; i += 300) {
  const docs = await db.getAll(...refs.slice(i, i + 300));
  reads += docs.length;
  for (const doc of docs) {
    if (!doc.exists) continue;
    byId.set(doc.id, toSequenceData(doc.data(), doc.id));
  }
}
console.log(`public sequences read: ${refs.length} ids`);

/** The catalogue's doc-to-sequence step: normalise, hydrate steps if composed. */
function toSequenceData(raw, id) {
  const data = normalizeLegacySequence(raw);
  const seq = {
    id,
    name: data.name,
    word: data.word,
    steps: [],
    sequenceLength: data.sequenceLength,
    ownerId: data.ownerId,
    leftSoloProp: data.leftSoloProp,
    rightSoloProp: data.rightSoloProp,
    stepPairings: data.stepPairings,
  };
  if (data.leftSoloProp && data.rightSoloProp && data.stepPairings) {
    try {
      const hydrated = hydrate(seq);
      if (hydrated.steps && hydrated.steps.length > 0) {
        return { ...hydrated, sequenceLength: hydrated.steps.length };
      }
      return hydrated;
    } catch {
      // Unhydrated: falls back to sequenceLength, as in the catalogue.
    }
  }
  return seq;
}

// 3. Compute with the app's helper. The read above is certain, so the
// collection's public count is exactly the members found under their owner.
const catalog = [...byId.values()];
let toWrite = [];
for (const { ref, id, ownerId, data } of items) {
  const collection = {
    id,
    ownerId,
    name: data.name ?? "",
    sequenceIds: data.sequenceIds,
    sequenceOwnerIds: data.sequenceOwnerIds,
    galleryOwnerIds: data.galleryOwnerIds,
    isPublic: true,
    kind: "manual",
    sequenceCount: 0,
  };
  // Count what a visitor sees: members whose public mirror has that owner.
  const memberOwner = (sid) =>
    data.sequenceOwnerIds?.[sid] ?? data.galleryOwnerIds?.[sid] ?? ownerId;
  const visible = data.sequenceIds.filter(
    (sid) => byId.get(sid)?.ownerId === memberOwner(sid)
  ).length;
  const steps = collectionPlaceholderSteps(
    { ...collection, sequenceCount: visible },
    ownerId,
    catalog,
    { publicView: true }
  );
  if (!steps || steps.length === 0) {
    console.log(`skip  ${data.name} (${data.sequenceIds.length} members): not certain`);
    continue;
  }
  const next = { key: cardStepsKey(data.sequenceIds), steps };
  const prev = parseCardSteps(data.cardSteps);
  const same =
    prev &&
    prev.key === next.key &&
    prev.steps.length === steps.length &&
    prev.steps.every((n, i) => n === steps[i]);
  console.log(
    `${same ? "same " : "write"} ${data.name} (${data.sequenceIds.length} members): [${steps.join(", ")}]`
  );
  if (!same) toWrite.push({ ref, next });
}

console.log(
  `\nreads made: ${reads} | collections checked: ${items.length} | ` +
    `${WRITE ? "writing" : "would write"}: ${toWrite.length}`
);

// 4. One update of the one field per differing collection, only with --write.
if (WRITE) {
  for (const { ref, next } of toWrite) {
    await ref.update({ cardSteps: next });
  }
  console.log(`written: ${toWrite.length}`);
} else {
  console.log("dry run: nothing written (pass --write to write)");
}
process.exit(0);
