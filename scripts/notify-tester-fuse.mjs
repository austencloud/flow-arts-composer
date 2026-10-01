#!/usr/bin/env node
/**
 * Tell a tester that Create > Fuse is now open to them.
 *
 * Writes a `system-announcement` doc into users/{uid}/notifications, which the
 * deployed onNewNotification function turns into an FCM push.
 *
 * Fuse sits behind ADMIN_ONLY_TABS with a "tester" role override, and the app
 * resolves role from Firebase Auth CUSTOM CLAIMS, not the Firestore `role`
 * field. This refuses to send unless the recipient's claim actually says
 * tester — notifying someone into a tab they still cannot open is worse than
 * not notifying them at all.
 *
 * Usage:
 *   node scripts/notify-tester-fuse.mjs <username>            # dry run
 *   node scripts/notify-tester-fuse.mjs <username> --send
 */
import admin from "firebase-admin";
import { readFileSync } from "fs";

const query = process.argv[2];
const SEND = process.argv.includes("--send");
if (!query) {
  console.error("usage: node scripts/notify-tester-fuse.mjs <username|displayName> [--send]");
  process.exit(1);
}

const serviceAccount = JSON.parse(
  readFileSync("E:/tka-platform/serviceAccountKey.json", "utf8")
);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: "the-kinetic-alphabet",
});
const db = admin.firestore();
const auth = admin.auth();

const MESSAGE =
  "Fuse is open to testers — find it under Create. Give it a spin and send feedback.";

const users = await db.collection("users").get();
const matches = users.docs.filter((d) => {
  const x = d.data();
  return new RegExp(query, "i").test(
    `${x.displayName ?? ""} ${x.username ?? ""} ${x.email ?? ""}`
  );
});

if (matches.length !== 1) {
  console.error(`Expected exactly 1 match for "${query}", got ${matches.length}:`);
  for (const d of matches) console.error("  ", d.data().displayName, "|", d.data().username);
  process.exit(1);
}

const doc = matches[0];
const profile = doc.data();
const user = await auth.getUser(doc.id);
const claims = user.customClaims ?? {};
const claimRole = claims.admin === true ? "admin" : (claims.role ?? "user");

console.log(`recipient   : ${profile.displayName} (@${profile.username})`);
console.log(`uid         : ${doc.id}`);
console.log(`firestore   : role = ${profile.role}`);
console.log(`auth claim  : ${claimRole}`);
console.log(`lastRefresh : ${user.metadata.lastRefreshTime}`);
console.log(`message     : "${MESSAGE}"`);

if (claimRole !== "tester" && claimRole !== "admin") {
  console.error(
    `\nREFUSING: auth claim is "${claimRole}". The app reads claims, not the` +
      ` Firestore role field — they would still not see Fuse.` +
      `\nRun scripts/sync-role-claims.mjs --apply first.`
  );
  process.exit(1);
}

// A token minted before the claim was written still says "user". Firebase
// tokens live one hour, so a client whose last refresh predates the claim by
// less than that may not have picked it up yet.
const lastRefresh = new Date(user.metadata.lastRefreshTime);
const ageMinutes = Math.round((Date.now() - lastRefresh.getTime()) / 60000);
console.log(`token age   : ${ageMinutes} min (expires at 60)`);
if (ageMinutes < 60) {
  console.log(
    `\nNOTE: their cached token may still predate the tester claim.` +
      ` It expires in ${60 - ageMinutes} min, after which any app open picks` +
      ` up the new role.`
  );
}

if (!SEND) {
  console.log("\nDry run. Re-run with --send to deliver it.");
  process.exit(0);
}

const ref = await db.collection("users").doc(doc.id).collection("notifications").add({
  userId: doc.id,
  type: "system-announcement",
  message: MESSAGE,
  read: false,
  createdAt: admin.firestore.FieldValue.serverTimestamp(),
});
console.log(`\nSent. notifications/${ref.id}`);
process.exit(0);
