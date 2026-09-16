#!/usr/bin/env node
/**
 * One-shot "show me this sequence" pipeline.
 *
 * Takes raw sequence JSON (the same app/MCP format import-sequence.cjs
 * accepts) and in one command: imports it privately into Austen's library,
 * mints a self-contained tka.run short code, and prints the link. A scan does
 * not require a public gallery projection, so this path never publishes.
 *
 * Usage:
 *   node scripts/show-sequence.mjs sequence.json
 *   node scripts/show-sequence.mjs sequence.json --demo
 *   cat sequence.json | node scripts/show-sequence.mjs --stdin
 *   node scripts/show-sequence.mjs --purge-demos            # list demo entries
 *   node scripts/show-sequence.mjs --purge-demos --confirm  # delete them
 *
 * Idempotent: re-running with the same content reuses the existing library
 * doc (matched by content hash) and its existing short code.
 *
 * Reuses:
 *   - scripts/import-sequence.cjs   (canonical owner normalization + LOOP detection)
 *   - scripts/create-shortcodes-batch.js (minting, transaction-guarded)
 *   - scripts/lib/firestore-provider.js  (forced to Admin SDK for the
 *     query-in-transaction shortcode mint)
 */

// Force the Admin SDK before firestore-provider loads its priority chain.
process.env.TKA_ADMIN = "1";

import { readFileSync } from "fs";
import { resolve } from "path";
import crypto from "crypto";
import { createRequire } from "module";
import { initFirestore } from "./lib/firestore-provider.js";
import { createShortcode, findExistingShortcode } from "./create-shortcodes-batch.js";

const require = createRequire(import.meta.url);
const {
  AUSTEN_UID,
  detectLoop,
  buildFirestoreDoc,
  normalizeFirestoreDoc,
  stampNewSequenceTimestamps,
} = require("./import-sequence.cjs");

// Args

const argv = process.argv.slice(2);
const flags = {
  stdin: false,
  demo: false,
  purgeDemos: false,
  confirm: false,
  notes: null,
  prop: null,
};
let jsonPath = null;

for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--stdin") flags.stdin = true;
  else if (a === "--demo") flags.demo = true;
  else if (a === "--purge-demos") flags.purgeDemos = true;
  else if (a === "--confirm") flags.confirm = true;
  else if (a === "--notes" && argv[i + 1]) flags.notes = argv[++i];
  else if (a === "--prop" && argv[i + 1]) flags.prop = argv[++i];
  else if (!a.startsWith("--")) jsonPath = a;
}

if (!flags.purgeDemos && !jsonPath && !flags.stdin) {
  console.error("Usage: node scripts/show-sequence.mjs <sequence.json> [--demo] [--notes 'text']");
  console.error("       cat sequence.json | node scripts/show-sequence.mjs --stdin [--demo]");
  console.error("       node scripts/show-sequence.mjs --purge-demos [--confirm]");
  process.exit(1);
}

// Helpers

async function readInput() {
  if (flags.stdin) {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    return Buffer.concat(chunks).toString("utf8");
  }
  return readFileSync(resolve(jsonPath), "utf8");
}

/**
 * Deterministic hash of the sequence CONTENT (word + grid + steps), used for
 * idempotency: re-running with the same JSON reuses the existing doc instead
 * of importing a duplicate.
 */
function contentHashOf(raw) {
  const canonical = JSON.stringify({
    word: raw.word || "",
    gridMode: raw.gridMode || "diamond",
    startPlacement: raw.startPlacement || raw.startingPlacement || null,
    steps: raw.steps || [],
  });
  return crypto.createHash("sha256").update(canonical).digest("hex").slice(0, 32);
}

// Purge demos

async function purgeDemos(db) {
  const libSnap = await db
    .collection(`users/${AUSTEN_UID}/sequences`)
    .where("demo", "==", true)
    .get();
  const pubSnap = await db.collection("publicSequences").where("demo", "==", true).get();

  const seqIds = new Set([...libSnap.docs.map((d) => d.id), ...pubSnap.docs.map((d) => d.id)]);
  if (seqIds.size === 0) {
    console.log("No demo sequences found. Nothing to purge.");
    return;
  }

  const codeDocs = [];
  for (const seqId of seqIds) {
    const snap = await db.collection("shortcodes").where("sequenceId", "==", seqId).get();
    snap.docs.forEach((d) => codeDocs.push(d));
  }

  console.log(`Demo entries found:`);
  for (const d of libSnap.docs) {
    console.log(`  library:  users/${AUSTEN_UID}/sequences/${d.id} (${d.data().word || "?"})`);
  }
  for (const d of pubSnap.docs) {
    console.log(`  public:   publicSequences/${d.id} (${d.data().word || "?"})`);
  }
  for (const d of codeDocs) {
    console.log(`  shortcode: ${d.id} -> https://tka.run/${d.id}`);
  }

  if (flags.confirm) {
    throw new Error(
      "Direct demo purging is disabled because it bypassed owner/public/hash-claim transactions. Delete the library sequences through the app."
    );
  }

  console.log(
    "\nRead-only listing. Direct purge is disabled; delete the library sequences through the app."
  );
}

// Pipeline

async function run() {
  const { db, FieldValue, isAdmin } = await initFirestore();

  if (flags.purgeDemos) {
    await purgeDemos(db);
    return;
  }

  const input = await readInput();
  let raw;
  try {
    raw = JSON.parse(input);
  } catch (err) {
    console.error("Failed to parse JSON:", err.message);
    process.exit(1);
  }

  const loopInfo = detectLoop(raw);
  const localClock = { serverTimestamp: () => new Date() };
  const built = buildFirestoreDoc(raw, localClock, loopInfo, {
    visibility: "private",
    notes: flags.notes,
    demo: flags.demo,
  });
  if (flags.prop) {
    const propConfig = {
      leftPropType: flags.prop,
      rightPropType: flags.prop,
      catDogMode: false,
    };
    built.data.intendedProp = propConfig;
    built.data.creatorIntent = { propConfig };
  }
  const candidate = await normalizeFirestoreDoc(built);
  const hash = candidate.contentHash;
  const legacyHash = contentHashOf(raw);
  console.log(`Sequence "${candidate.data.word || "(no word)"}" (${candidate.hydrated.steps?.length || 0} steps, hash ${hash.slice(0, 8)})`);

  // 1. Import into library (or reuse an existing import of the same content).
  const seqCollection = db.collection(`users/${AUSTEN_UID}/sequences`);
  let seqId;
  let libData;
  let dupSnap = await seqCollection.where("contentHash", "==", hash).limit(1).get();
  if (dupSnap.empty && legacyHash !== hash) {
    dupSnap = await seqCollection
      .where("contentHash", "==", legacyHash)
      .limit(1)
      .get();
  }
  let hydrated;
  if (!dupSnap.empty) {
    seqId = dupSnap.docs[0].id;
    libData = dupSnap.docs[0].data();
    hydrated = (await normalizeFirestoreDoc({ id: seqId, data: libData }))
      .hydrated;
    console.log(`Reusing existing library doc ${seqId}`);
  } else {
    seqId = candidate.id;
    hydrated = candidate.hydrated;
    libData = stampNewSequenceTimestamps(candidate.data, FieldValue);
    await seqCollection.doc(seqId).set(libData);
    await db.doc(`users/${AUSTEN_UID}`).set(
      {
        sequenceCount: FieldValue.increment(1),
        lastActivityDate: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    console.log(`Imported as users/${AUSTEN_UID}/sequences/${seqId}`);
  }

  // 2. Mint (or reuse) the tka.run short code. createShortcode is
  //    transaction-guarded against concurrent duplicate mints; this pre-check
  //    just skips the transaction on the common re-run path.
  let code = await findExistingShortcode(db, seqId, isAdmin);
  if (code) {
    console.log(`Reusing existing shortcode ${code}`);
  } else {
    const descriptor = {
      ownerId: libData.ownerId || AUSTEN_UID,
      word: libData.word || candidate.data.word,
    };
    const sourceData = {
      steps: hydrated.steps || [],
      startPlacement: hydrated.startPlacement || null,
    };
    code = await createShortcode(
      db,
      seqId,
      descriptor,
      sourceData,
      isAdmin,
      FieldValue
    );
    console.log(`Minted shortcode ${code}`);
  }

  // The /q scan page reads ?bp=<propType> (validated against the PropType
  // enum) and seeds the viewer's prop settings from it, overriding the staff
  // default. intendedProp on the doc covers app-side loads; the param covers
  // the scan route.
  const propParam = flags.prop ? `?bp=${flags.prop}` : "";
  console.log(`https://localhost:5173/q/${code}${propParam}`);
  console.log(`https://tka.run/${code}${propParam}`);
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Error:", err);
    process.exit(1);
  });
