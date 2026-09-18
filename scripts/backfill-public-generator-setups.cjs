// One-shot backfill for public generator setups.
//
// 1. Every users/{uid}/generatorSetups/{id} doc gets isPublic: true.
// 2. Every users/{uid} doc drops the retired favoriteConfig projection.
//
// Idempotent - skips docs that already match.
//
// Usage: node scripts/backfill-public-generator-setups.cjs [--dry-run]
//
// The service account key is read from ../serviceAccountKey.json next to the
// repo root, or from TKA_SERVICE_ACCOUNT_KEY when running from a worktree
// that does not carry the key.
const admin = require("firebase-admin");
const path = require("path");

const keyPath =
  process.env.TKA_SERVICE_ACCOUNT_KEY ||
  path.join(__dirname, "../serviceAccountKey.json");
const sa = require(keyPath);
admin.initializeApp({ credential: admin.credential.cert(sa) });

const dryRun = process.argv.includes("--dry-run");

async function main() {
  const db = admin.firestore();

  const setups = await db.collectionGroup("generatorSetups").get();
  let flagged = 0;
  let alreadyPublic = 0;

  for (const setupDoc of setups.docs) {
    if (setupDoc.data().isPublic === true) {
      alreadyPublic++;
      continue;
    }
    console.log(
      `${dryRun ? "[dry-run] " : ""}isPublic: true -> ${setupDoc.ref.path}`
    );
    if (!dryRun) await setupDoc.ref.update({ isPublic: true });
    flagged++;
  }

  const favorites = await db
    .collection("users")
    .where("favoriteConfig", "!=", null)
    .get();
  let cleared = 0;

  for (const userDoc of favorites.docs) {
    console.log(
      `${dryRun ? "[dry-run] " : ""}delete favoriteConfig -> ${userDoc.ref.path}`
    );
    if (!dryRun) {
      await userDoc.ref.update({
        favoriteConfig: admin.firestore.FieldValue.delete(),
      });
    }
    cleared++;
  }

  console.log(
    `setups flagged: ${flagged}, already public: ${alreadyPublic}, favoriteConfig cleared: ${cleared}`
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
