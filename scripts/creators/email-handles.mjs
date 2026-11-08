#!/usr/bin/env node
/**
 * Replace handles that publish the part of someone's email before the @.
 *
 *   node scripts/creators/email-handles.mjs           # dry run: counts and a list
 *   node scripts/creators/email-handles.mjs --apply   # rewrite and backfill
 *   node scripts/creators/email-handles.mjs --only <uid,uid> [--apply]
 *                                       # limit the run to an approved list
 *
 * Reads Auth for the emails (the public users docs do not hold them), then:
 *   1. Lists users whose handle equals their email's local part, ignoring case,
 *      with the handle the name-based rule proposes, one line each: old → new.
 *   2. Lists full accounts holding a handle with no reservation at
 *      usernames/{lowercase handle}. The security rules key off that document.
 *
 * The new handle comes from the profile's own displayName first (the name the
 * person chose or kept), then Auth's names. A name that is itself the email's
 * local part is not a name; earlier signups stored it that way. With no name
 * left the person gets the `creator` placeholder.
 *
 * Safety:
 * - The old usernames/{old} reservation is never deleted. It is rewritten to
 *   { userId, released: true, releasedAt } so nobody else can claim the old
 *   handle: the rules' usernames create only applies to an id with no doc, and
 *   an update needs the holder's own uid.
 * - When two accounts would get the same new handle, both are printed and
 *   skipped; the first one does not win.
 * - Inside the transaction the profile is read again, and the account is
 *   skipped when its handle no longer equals the one this run listed.
 * - The five legacy hidden accounts (legacy-hidden-handles.ts) are skipped
 *   entirely: no rewrite and no reservation backfill.
 *
 * Needs serviceAccountKey.json at the repo root, as the other admin scripts do,
 * or GOOGLE_APPLICATION_CREDENTIALS.
 *
 * It does not rewrite handles copied into other documents. Sequences store the
 * owner's display name and avatar, not the handle, so none are expected.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import {
  HANDLE_PATTERN,
  handleCandidates,
} from "../../src/lib/shared/auth/domain/models/handle-rule.ts";
import { LEGACY_HIDDEN_HANDLES } from "../../src/lib/shared/community/domain/legacy-hidden-handles.ts";

const require = createRequire(import.meta.url);
const admin = require("firebase-admin");

const APPLY = process.argv.includes("--apply");
const ONLY = (() => {
  const at = process.argv.indexOf("--only");
  if (at < 0) return null;
  const value = process.argv[at + 1];
  if (!value || value.startsWith("--")) {
    console.error("--only needs a comma-separated list of uids");
    process.exit(1);
  }
  const uids = value
    .split(",")
    .map((uid) => uid.trim())
    .filter(Boolean);
  return new Set(uids);
})();
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
const timestamp = () => admin.firestore.FieldValue.serverTimestamp();

const LEGACY_HIDDEN = new Set(LEGACY_HIDDEN_HANDLES);

/** One of the five accounts moderated by handle; this script leaves them be. */
function isLegacyHidden(data) {
  return [data.username, data.usernameLowercase].some(
    (value) =>
      typeof value === "string" && LEGACY_HIDDEN.has(value.toLowerCase().trim())
  );
}

function localPart(email) {
  return email ? email.split("@")[0].toLowerCase() : null;
}

/** The person's real name, or null when all we hold is their email again. */
function usableName(authUser, profile, local) {
  const names = [
    profile.displayName,
    authUser?.displayName,
    authUser?.providerData?.find((p) => p.displayName)?.displayName,
  ];
  for (const name of names) {
    if (!name) continue;
    const squeezed = name.toLowerCase().replace(/\s+/g, "");
    if (squeezed !== local) return name;
  }
  return null;
}

/**
 * The first candidate nobody else holds. Other rows of this run are not
 * consulted: two accounts landing on the same handle is caught afterwards and
 * both are skipped.
 */
async function freeHandle(name, uid, claimOwner) {
  for (const candidate of handleCandidates(name)) {
    const owner = claimOwner.has(candidate)
      ? claimOwner.get(candidate)
      : (await db.collection("usernames").doc(candidate).get()).get("userId");
    if (!owner || owner === uid) return candidate;
  }
  throw new Error(`No free handle for ${uid}`);
}

async function allAuthUsers() {
  const byUid = new Map();
  let pageToken;
  do {
    const page = await admin.auth().listUsers(1000, pageToken);
    for (const user of page.users) byUid.set(user.uid, user);
    pageToken = page.pageToken;
  } while (pageToken);
  return byUid;
}

/** All profiles, or only the --only ones. */
async function readProfiles() {
  if (!ONLY) return (await db.collection("users").get()).docs;
  const refs = [...ONLY].map((uid) => db.collection("users").doc(uid));
  return (await db.getAll(...refs)).filter((doc) => doc.exists);
}

async function rewrite(row) {
  const lower = row.proposed;
  const oldRef = db
    .collection("usernames")
    .doc(row.current.toLowerCase().trim());
  const newRef = db.collection("usernames").doc(lower);
  const userRef = db.collection("users").doc(row.uid);
  await db.runTransaction(async (tx) => {
    const profile = await tx.get(userRef);
    if (!profile.exists || profile.get("username") !== row.current) {
      const now = profile.exists ? profile.get("username") : "no profile";
      throw new Error(`its handle changed during the run (now ${now})`);
    }
    const fresh = await tx.get(newRef);
    if (fresh.exists && fresh.get("userId") !== row.uid) {
      throw new Error(`${lower} was taken during the run`);
    }
    const old = await tx.get(oldRef);
    tx.set(newRef, {
      userId: row.uid,
      createdAt: timestamp(),
      updatedAt: timestamp(),
    });
    tx.update(userRef, {
      username: lower,
      usernameLowercase: lower,
      updatedAt: timestamp(),
    });
    // Never deleted: the old handle stays this person's, marked released, so
    // nobody else can claim it. One held by someone else is left alone.
    if (!old.exists || old.get("userId") === row.uid) {
      tx.set(oldRef, {
        userId: row.uid,
        released: true,
        releasedAt: timestamp(),
      });
    }
  });
}

async function main() {
  const authUsers = await allAuthUsers();
  const [profiles, claims] = await Promise.all([
    readProfiles(),
    db.collection("usernames").get(),
  ]);
  const claimOwner = new Map(
    claims.docs.map((doc) => [doc.id, doc.get("userId")])
  );

  const proposals = [];
  const unreserved = [];
  const conflicts = [];

  for (const profile of profiles) {
    const data = profile.data();
    const uid = profile.id;
    const username = data.username;
    if (!username || data.isAnonymous === true) continue;
    if (isLegacyHidden(data)) continue;
    const authUser = authUsers.get(uid);
    const local = localPart(authUser?.email);

    if (local && username.toLowerCase() === local) {
      const name = usableName(authUser, data, local);
      proposals.push({
        uid,
        current: username,
        proposed: await freeHandle(name, uid, claimOwner),
      });
      continue;
    }

    const lower = username.toLowerCase().trim();
    const owner = claimOwner.get(lower);
    if (!owner) unreserved.push({ uid, username, lower });
    else if (owner !== uid) conflicts.push({ uid, username, owner });
  }

  // Two accounts proposed the same handle: print them all, rewrite none.
  const proposedCount = new Map();
  for (const row of proposals) {
    proposedCount.set(row.proposed, (proposedCount.get(row.proposed) ?? 0) + 1);
  }
  const emailHandles = proposals.filter(
    (row) => proposedCount.get(row.proposed) === 1
  );
  const collisions = proposals.filter(
    (row) => proposedCount.get(row.proposed) > 1
  );

  if (ONLY) {
    const found = new Set(profiles.map((doc) => doc.id));
    const missing = [...ONLY].filter((uid) => !found.has(uid));
    console.log(`Limited by --only to ${ONLY.size} uids.`);
    if (missing.length > 0) console.log(`No profile for: ${missing.join(", ")}`);
  }
  console.log(`Users read: ${profiles.length}, Auth accounts: ${authUsers.size}`);

  console.log(`\nHandles equal to the email's local part: ${emailHandles.length}`);
  for (const row of emailHandles) {
    console.log(`${row.uid}  ${row.current} → ${row.proposed}`);
  }
  if (collisions.length > 0) {
    console.log(
      `\nSame new handle for more than one account, all skipped: ${collisions.length}`
    );
    for (const row of collisions) {
      console.log(`${row.uid}  ${row.current} → ${row.proposed}  (collision)`);
    }
  }
  console.log(`\nHandles with no reservation: ${unreserved.length}`);
  for (const row of unreserved) {
    const legacy = HANDLE_PATTERN.test(row.username) ? "" : "  (older format)";
    console.log(`${row.uid}  ${row.username}${legacy}`);
  }
  if (conflicts.length > 0) {
    console.log(
      `\nHandles reserved by someone else, left alone: ${conflicts.length}`
    );
    for (const row of conflicts) {
      console.log(`${row.uid}  ${row.username}  held by ${row.owner}`);
    }
  }

  if (!APPLY) {
    console.log("\nDry run. Nothing written. Add --apply to write.");
    return;
  }

  let rewritten = 0;
  for (const row of emailHandles) {
    try {
      await rewrite(row);
      rewritten += 1;
    } catch (error) {
      console.error(`Skipped ${row.uid}: ${error.message}`);
    }
  }
  let backfilled = 0;
  for (const row of unreserved) {
    await db
      .collection("usernames")
      .doc(row.lower)
      .create({
        userId: row.uid,
        createdAt: timestamp(),
        updatedAt: timestamp(),
      })
      .then(() => {
        backfilled += 1;
      })
      .catch((error) => {
        console.error(`Skipped reservation ${row.lower}: ${error.message}`);
      });
  }
  console.log(`\nRewrote ${rewritten} handles, backfilled ${backfilled} reservations.`);
}

await main();
