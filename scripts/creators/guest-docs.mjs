#!/usr/bin/env node
/**
 * Take guest profiles out of the Creators directory query.
 *
 *   node scripts/creators/guest-docs.mjs           # dry run: counts only
 *   node scripts/creators/guest-docs.mjs --apply   # set their version to 0
 *
 * Guests used to get publicProfileVersion 2, the same as a full account, so
 * the roster's newest-200 query filled up with them and pushed real creators
 * off the end. A guest is now written with version 0 (GUEST_PROFILE_VERSION in
 * src/lib/shared/community/domain/models/public-profile-contract.ts), and an
 * upgrade sets 2. This moves the guest docs written before that change.
 * The client also moves a guest's own doc on its next visit; this catches the
 * ones that never come back.
 *
 * A guest is a doc with isAnonymous == true. The old "Anonymous User" display
 * name with no isAnonymous flag is listed but not changed: without the flag the
 * rules refuse version 0, and those few are worth a look by hand.
 *
 * Needs serviceAccountKey.json at the repo root, as the other admin scripts do,
 * or GOOGLE_APPLICATION_CREDENTIALS.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const admin = require("firebase-admin");

const APPLY = process.argv.includes("--apply");
const PAGE = 400;
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const KEY_PATH = resolve(ROOT, "serviceAccountKey.json");

if (existsSync(KEY_PATH)) {
  admin.initializeApp({
    credential: admin.credential.cert(
      JSON.parse(readFileSync(KEY_PATH, "utf8"))
    ),
  });
} else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  admin.initializeApp({ credential: admin.credential.applicationDefault() });
} else {
  console.error(
    "No credentials: serviceAccountKey.json is missing and GOOGLE_APPLICATION_CREDENTIALS is not set."
  );
  process.exit(1);
}
const db = admin.firestore();
const users = db.collection("users");

/** Every doc a query matches, a page at a time, so the read stays bounded. */
async function* pages(base) {
  let cursor = null;
  for (;;) {
    let q = base.orderBy(admin.firestore.FieldPath.documentId()).limit(PAGE);
    if (cursor) q = q.startAfter(cursor);
    const snap = await q.get();
    if (snap.empty) return;
    yield snap.docs;
    cursor = snap.docs[snap.docs.length - 1];
    if (snap.size < PAGE) return;
  }
}

async function main() {
  const guests = users
    .where("publicProfileVersion", "==", 2)
    .where("isAnonymous", "==", true);
  let count = 0;
  let moved = 0;
  for await (const docs of pages(guests)) {
    count += docs.length;
    if (!APPLY) continue;
    const batch = db.batch();
    for (const doc of docs) {
      batch.update(doc.ref, { publicProfileVersion: 0 });
    }
    await batch.commit();
    moved += docs.length;
  }

  const unflagged = await users
    .where("publicProfileVersion", "==", 2)
    .where("displayName", "==", "Anonymous User")
    .limit(PAGE)
    .get();
  const looksLikeGuests = unflagged.docs.filter(
    (doc) => doc.get("isAnonymous") !== true
  );

  console.log(`Guest docs (isAnonymous) listed with version 2: ${count}`);
  console.log(
    `"Anonymous User" docs with no guest flag, left alone: ${looksLikeGuests.length}`
  );
  for (const doc of looksLikeGuests) console.log(`  ${doc.id}`);

  if (!APPLY) {
    console.log("\nDry run. Nothing written. Add --apply to write.");
    return;
  }
  console.log(`\nSet version 0 on ${moved} guest docs.`);
}

await main();
