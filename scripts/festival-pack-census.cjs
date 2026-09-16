// Census of candidate sequences for the festival sample pack's eight card
// slots. Answers one question: how many distinct 8-card lists can actually be
// built from RELEASED data, per slot, at a given letter-purity constraint.
//
// Two sources, because they hold different things:
//   1. static/data/snapshots/public-sequences.json — the publicSequences
//      export (466 docs). Human-authored, named, mostly plain-letter words.
//      This is where beginner-legible all-Type-1 words live.
//   2. Firestore catalogs/*  — machine enumerations (tens of thousands of
//      docs). Exhaustive, but overwhelmingly Greek/dash glyph words.
//
// Reading the catalogs needs the Admin SDK (serviceAccountKey.json at the repo
// root) and takes several minutes, so it is opt-in and cached:
//   node scripts/festival-pack-census.cjs              # snapshot only (fast)
//   node scripts/festival-pack-census.cjs --catalogs   # + fetch/cache catalogs
// The cache lands at scripts/.cache/festival-catalog-dump.json (gitignored by
// the .cache path; delete it to refetch).
const fs = require("fs");
const path = require("path");

const REPO = path.join(__dirname, "..");
const SNAPSHOT = path.join(REPO, "static/data/snapshots/public-sequences.json");
const CACHE_DIR = path.join(__dirname, ".cache");
const CACHE = path.join(CACHE_DIR, "festival-catalog-dump.json");

// Catalogs whose loopType/length can fill a pack slot. The full catalogs/
// collection is ~180 docs, most of them TnD motion sets that the TnD base-words
// file already covers.
const CATALOG_IDS = [
  "l1-halved-mirrored-8beat-c54",
  "l1-halved-mirrored-inverted-8beat-c54",
  "l1-halved-mirrored-swapped-8beat-c54",
  "l1-quartered-rotated-8beat-c54",
  "l1-quartered-rotated-16beat",
  "l1-halved-strict-rotated-8beat",
  "l1-quartered-strict-rotated-8beat",
];

// Canonical Type 1 letters — packages/domain/src/constants/letter-registry.ts,
// TYPE_DEFINITIONS.type1. Everything else (Greek, dash-suffixed) is Type 2–6.
const TYPE1 = new Set("ABCDEFGHIJKLMNOPQRSTUV".split(""));

/** Count of non-Type-1 letters in a word. 0 = every letter is Type 1. */
function impurity(word) {
  if (!word) return Number.POSITIVE_INFINITY;
  let n = 0;
  for (const ch of word) {
    if (ch === "-") continue; // the dash is a suffix marker, not a letter
    if (!TYPE1.has(ch)) n++;
  }
  return n;
}

async function fetchCatalogs() {
  const admin = require(path.join(REPO, "node_modules", "firebase-admin"));
  const serviceAccount = require(path.join(REPO, "serviceAccountKey.json"));
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  }
  const db = admin.firestore();
  const out = {};
  for (const id of CATALOG_IDS) {
    const snap = await db.collection(`catalogs/${id}/sequences`).get();
    out[id] = snap.docs.map((d) => {
      const s = d.data();
      return {
        id: d.id,
        word: s.word,
        name: s.name,
        sequenceLength: s.sequenceLength ?? s.steps?.length ?? null,
        level: s.level,
        gridMode: s.gridMode,
        loopType: s.loopType,
        period: s.period,
        startPlacementId: s.startPlacement?.id ?? null,
      };
    });
    console.error(`  fetched ${id}: ${snap.size}`);
  }
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(CACHE, JSON.stringify(out));
  return out;
}

(async () => {
  const rows = [];
  const push = (source, s) =>
    rows.push({
      source,
      name: s.name || s.word,
      word: s.word,
      len: s.sequenceLength,
      loop: s.loopType,
      level: s.level,
      impurity: impurity(s.word),
    });

  for (const d of JSON.parse(fs.readFileSync(SNAPSHOT, "utf8")).documents) {
    push("snapshot", d);
  }

  if (process.argv.includes("--catalogs")) {
    let dump;
    if (fs.existsSync(CACHE)) {
      console.error("using cached catalog dump:", CACHE);
      dump = JSON.parse(fs.readFileSync(CACHE, "utf8"));
    } else {
      console.error("fetching catalogs from Firestore (minutes)...");
      dump = await fetchCatalogs();
    }
    for (const [id, seqs] of Object.entries(dump)) {
      for (const s of seqs) push(id, s);
    }
  }

  const SLOTS = [
    ["mirrored 16", "mirrored", 16],
    ["mirrored 8", "mirrored", 8],
    ["rotated 16", "rotated", 16],
    ["rotated 8", "rotated", 8],
    ["mirrored_swapped 8", "mirrored_swapped", 8],
    ["mirrored_swapped 16", "mirrored_swapped", 16],
    ["mirrored_inverted 8", "mirrored_inverted", 8],
    ["mirrored_inverted 16", "mirrored_inverted", 16],
  ];

  console.log(`sources: ${rows.length} sequences\n`);
  console.log(
    "slot".padEnd(21) + "total".padStart(7) + "pureT1".padStart(8) + "<=1 non-T1".padStart(12)
  );
  for (const [label, loop, len] of SLOTS) {
    const all = rows.filter((r) => r.loop === loop && r.len === len && r.level === 1);
    const pure = all.filter((r) => r.impurity === 0);
    const near = all.filter((r) => r.impurity <= 1);
    console.log(
      label.padEnd(21) +
        String(all.length).padStart(7) +
        String(pure.length).padStart(8) +
        String(near.length).padStart(12)
    );
    if (pure.length > 0 && pure.length <= 12) {
      console.log("    pure: " + pure.map((r) => r.name).join(", "));
    }
  }
})().catch((err) => {
  console.error("FAILED:", err.message);
  process.exit(1);
});
