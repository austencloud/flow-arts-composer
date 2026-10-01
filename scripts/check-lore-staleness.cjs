/**
 * Lore Staleness Detection
 *
 * Compares the story bible's "last updated" date against the museum-dev
 * tracker in Firestore. Reports any lore-tagged items created or updated
 * after the story bible was last synced.
 *
 * Also flags deprecated museum docs that have been consolidated into
 * the story bible but still exist on disk.
 *
 * Exit code 0 = up to date, exit code 1 = stale items need syncing.
 *
 * Usage: node scripts/check-lore-staleness.cjs
 */

const admin = require("firebase-admin");
const { readFileSync, existsSync } = require("fs");
const path = require("path");

// Firebase init

const serviceAccountPath = path.resolve(__dirname, "..", "serviceAccountKey.json");
const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, "utf8"));

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

const db = admin.firestore();
const COLLECTION = "museumDev";

// Story bible date extraction

// The story bible is private and lives in the austencloud/flow-arts-private clone.
// FLOW_ARTS_PRIVATE_DIR points at that clone when it isn't at E:/flow-arts-private.
const PRIVATE_DIR = process.env.FLOW_ARTS_PRIVATE_DIR || "E:/flow-arts-private";
const STORY_BIBLE_PATH = path.resolve(PRIVATE_DIR, "museum", "story-bible.md");

function readStoryBibleDate() {
  if (!existsSync(STORY_BIBLE_PATH)) {
    console.error("\n  Story bible not found at:", STORY_BIBLE_PATH);
    process.exit(2);
  }

  const content = readFileSync(STORY_BIBLE_PATH, "utf8");
  const match = content.match(/\*Last updated:\s*(\d{4}-\d{2}-\d{2})\*/);

  if (!match) {
    console.error("\n  Could not find *Last updated: YYYY-MM-DD* in story bible.");
    process.exit(2);
  }

  return match[1];
}

// Deprecated doc detection

const DEPRECATED_DOCS = [
  // Deleted 2026-03-04 (consolidated into story-bible.md).
  // Kept as safety net: flags if anyone recreates them.
  { rel: "docs/museum/timeline.md", label: "Historical timeline (deleted)" },
  { rel: "docs/museum/phase-structure.md", label: "Museum phase structure (deleted)" },
  { rel: "docs/museum/endings.md", label: "Endings design (deleted)" },
  { rel: "docs/museum/orders/closed-palm.md", label: "Order of the Closed Palm (deleted)" },
  { rel: "docs/museum/orders/scribes.md", label: "Scribes detail (deleted)" },
];

function findDeprecatedDocs() {
  const found = [];
  for (const doc of DEPRECATED_DOCS) {
    const full = path.resolve(__dirname, "..", doc.rel);
    if (existsSync(full)) {
      found.push(doc);
    }
  }
  return found;
}

// Firestore query

async function fetchNewerLoreItems(sinceDate) {
  // sinceDate is "YYYY-MM-DD" — we want items updated strictly after this date.
  // Add one day so the comparison is "after end of that day."
  const cutoff = new Date(sinceDate + "T23:59:59.999Z");

  const snapshot = await db.collection(COLLECTION).get();

  const newer = [];

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const tags = data.tags || [];

    if (!tags.includes("lore")) continue;

    // Use updatedAt if present, fall back to createdAt
    const timestamp = data.updatedAt || data.createdAt;
    if (!timestamp) continue;

    const itemDate = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);

    if (itemDate > cutoff) {
      newer.push({
        id: doc.id,
        type: data.type || "unknown",
        title: data.title || "(untitled)",
        date: itemDate,
      });
    }
  }

  // Sort newest first
  newer.sort((a, b) => b.date - a.date);

  return newer;
}

// Report

function truncate(str, max) {
  if (str.length <= max) return str;
  return str.substring(0, max - 3) + "...";
}

function formatDate(d) {
  return d.toISOString().split("T")[0];
}

async function main() {
  const syncDate = readStoryBibleDate();
  const newerItems = await fetchNewerLoreItems(syncDate);
  const deprecatedDocs = findDeprecatedDocs();

  console.log("\n" + "=".repeat(70));
  console.log("\n  LORE STALENESS REPORT\n");
  console.log("=".repeat(70));

  console.log(`\n  Story bible last synced:  ${syncDate}`);
  console.log(`  Tracker items since then: ${newerItems.length}`);

  // Newer items detail
  if (newerItems.length > 0) {
    console.log("\n" + "-".repeat(70));
    console.log("\n  Items needing sync:\n");

    for (const item of newerItems) {
      const shortId = item.id.substring(0, 8);
      const typeLabel = item.type.padEnd(10);
      const title = truncate(item.title, 80);
      console.log(`  ${shortId}  ${typeLabel}  ${formatDate(item.date)}  ${title}`);
    }
  }

  // Deprecated docs
  if (deprecatedDocs.length > 0) {
    console.log("\n" + "-".repeat(70));
    console.log("\n  Deprecated docs (consolidated into story-bible.md):\n");

    for (const doc of deprecatedDocs) {
      console.log(`  [DEPRECATED]  ${doc.rel}  (${doc.label})`);
    }
  }

  // Summary
  console.log("\n" + "=".repeat(70));

  // Clean up Firebase connection before exiting
  await admin.app().delete();

  const hasIssues = newerItems.length > 0 || deprecatedDocs.length > 0;

  if (!hasIssues) {
    console.log("\n  UP TO DATE\n");
    process.exit(0);
  } else {
    const parts = [];
    if (newerItems.length > 0) {
      parts.push(`${newerItems.length} item${newerItems.length === 1 ? "" : "s"} need${newerItems.length === 1 ? "s" : ""} syncing`);
    }
    if (deprecatedDocs.length > 0) {
      parts.push(`${deprecatedDocs.length} deprecated doc${deprecatedDocs.length === 1 ? "" : "s"} still on disk`);
    }
    console.log(`
  ${parts.join(", ")}
`);
    process.exit(1);
  }
}

main().catch(async (err) => {
  console.error("\n  Error:", err.message);
  try { await admin.app().delete(); } catch (_) { /* ignore */ }
  process.exit(2);
});
