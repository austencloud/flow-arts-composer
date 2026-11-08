#!/usr/bin/env node
/**
 * Hide the accounts that were moderated before `isHidden` existed.
 *
 *   node scripts/creators/hide-legacy-accounts.mjs           # dry run: lists them
 *   node scripts/creators/hide-legacy-accounts.mjs --apply   # set isHidden: true
 *
 * The five handles live in src/lib/shared/community/domain/legacy-hidden-handles.ts.
 * The client hides them by handle today; once this has run in production that
 * check (listed-creator.ts) and the list come out, and the flag does the work.
 *
 * Touches only profiles whose `username` or `usernameLowercase` is one of the
 * five, ignoring case, and writes only `isHidden: true` and `updatedAt`. Every
 * doc is checked again before it is written; anything else is refused.
 *
 * Needs serviceAccountKey.json at the repo root, as the other admin scripts do,
 * or GOOGLE_APPLICATION_CREDENTIALS.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { LEGACY_HIDDEN_HANDLES } from "../../src/lib/shared/community/domain/legacy-hidden-handles.ts";

const require = createRequire(import.meta.url);
const admin = require("firebase-admin");

const APPLY = process.argv.includes("--apply");
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const KEY_PATH = resolve(ROOT, "serviceAccountKey.json");
const HANDLES = new Set(LEGACY_HIDDEN_HANDLES);

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

/** Is this profile one of the five? Ignores case, checks both handle fields. */
function isLegacyHidden(data) {
  return [data.username, data.usernameLowercase].some(
    (value) => typeof value === "string" && HANDLES.has(value.toLowerCase().trim())
  );
}

/**
 * The profiles holding one of the five handles. `in` is exact, so a stored
 * mixed-case `username` is caught by its `usernameLowercase`; a handle found
 * by neither shows as "not found" for a look by hand. At most ten docs each.
 */
async function findProfiles() {
  const list = [...HANDLES];
  const queries = [
    users.where("usernameLowercase", "in", list).limit(10),
    users.where("username", "in", list).limit(10),
  ];
  const byId = new Map();
  for (const query of queries) {
    const snap = await query.get();
    for (const doc of snap.docs) byId.set(doc.id, doc);
  }
  return [...byId.values()];
}

async function main() {
  const found = await findProfiles();
  const matched = new Set();

  console.log(`Legacy hidden handles: ${[...HANDLES].join(", ")}\n`);
  for (const doc of found) {
    const data = doc.data();
    const handle = (data.usernameLowercase || data.username || "").toLowerCase();
    if (!isLegacyHidden(data)) {
      // A query can only return these, but nothing outside the list is touched.
      console.log(`${doc.id}  ${handle}  REFUSED: not on the list`);
      continue;
    }
    matched.add(handle);
    const state = data.isHidden === true ? "already hidden" : "→ isHidden: true";
    console.log(`${doc.id}  ${handle}  ${state}`);
  }
  for (const handle of HANDLES) {
    if (!matched.has(handle)) console.log(`(none)  ${handle}  not found`);
  }

  if (!APPLY) {
    console.log("\nDry run. Nothing written. Add --apply to write.");
    return;
  }

  let hidden = 0;
  for (const doc of found) {
    const changed = await db.runTransaction(async (tx) => {
      const fresh = await tx.get(doc.ref);
      if (!fresh.exists || !isLegacyHidden(fresh.data())) return false;
      if (fresh.get("isHidden") === true) return false;
      tx.update(doc.ref, {
        isHidden: true,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return true;
    });
    if (changed) hidden += 1;
  }
  console.log(`\nSet isHidden on ${hidden} profiles.`);
}

await main();
