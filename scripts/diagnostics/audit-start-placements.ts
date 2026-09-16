/**
 * READ-ONLY diagnostic. Two questions:
 *   1. Which sequences render an empty start-placement cell? (startPlacement field
 *      missing, or present but carrying no motion data the renderer can draw.)
 *   2. Where does a given sequence id live (owner subcollection + public mirror),
 *      so we can explain why a "deleted" card reappears.
 *
 * Scans publicSequences (community gallery source) and one user's library.
 * No writes.
 *
 * Usage:
 *   npx tsx scripts/diagnostics/audit-start-placements.ts
 *   npx tsx scripts/diagnostics/audit-start-placements.ts --user <uid> --id <seqId>
 */

import { initFirestore } from "../lib/firestore-provider.js";

type AnyRec = Record<string, unknown>;

const DEFAULT_USER = "PBp3GSBO6igCKPwJyLZNmVEmamI3";
const argv = process.argv.slice(2);
const userId = (() => {
  const i = argv.indexOf("--user");
  return i >= 0 && argv[i + 1] ? argv[i + 1]! : DEFAULT_USER;
})();
const probeId = (() => {
  const i = argv.indexOf("--id");
  return i >= 0 && argv[i + 1] ? argv[i + 1]! : "seq_1778908018922_16c7s0zaj";
})();

// Words the user flagged as rendering with no start position.
const FLAGGED_WORDS = ["V", "OR", "osot", "Lambda", "Λ", "λ"];

/** What does the start-placement cell have to draw with? */
function inspectStartPlacement(data: AnyRec): {
  present: boolean;
  hasMotions: boolean;
  motionKeys: string[];
  letter: unknown;
  endPlacement: unknown;
} {
  const sp = data["startPlacement"] as AnyRec | undefined;
  if (!sp || typeof sp !== "object") {
    return {
      present: false,
      hasMotions: false,
      motionKeys: [],
      letter: undefined,
      endPlacement: undefined,
    };
  }
  const motions = sp["motions"] as AnyRec | undefined;
  const motionKeys =
    motions && typeof motions === "object" ? Object.keys(motions) : [];
  return {
    present: true,
    hasMotions: motionKeys.length > 0,
    motionKeys,
    letter: sp["letter"],
    endPlacement: sp["endPlacement"],
  };
}

function isRenderable(data: AnyRec): boolean {
  const sp = inspectStartPlacement(data);
  // Renderer needs the startPlacement object AND at least one motion to draw a prop.
  return sp.present && sp.hasMotions;
}

async function scanCollection(
  db: AnyRec,
  label: string,
  getSnap: () => Promise<{ docs: Array<{ id: string; data: () => AnyRec }> }>
): Promise<void> {
  const snap = await getSnap();
  let total = 0;
  let missingField = 0;
  let presentNoMotions = 0;
  const bad: Array<{
    id: string;
    word: string;
    reason: string;
    letter: unknown;
  }> = [];

  for (const d of snap.docs) {
    total++;
    const data = d.data();
    if (data["isDeleted"] === true) continue;
    const sp = inspectStartPlacement(data);
    const word = (data["word"] as string) ?? (data["name"] as string) ?? d.id;
    if (!sp.present) {
      missingField++;
      bad.push({
        id: d.id,
        word,
        reason: "no startPlacement field",
        letter: undefined,
      });
    } else if (!sp.hasMotions) {
      presentNoMotions++;
      bad.push({
        id: d.id,
        word,
        reason: "startPlacement present but motions empty",
        letter: sp.letter,
      });
    }
  }

  console.log(`\n──────── ${label} ────────`);
  console.log(`scanned (non-deleted):        ${total}`);
  console.log(`empty start cell (will break): ${bad.length}`);
  console.log(`  · missing startPlacement field: ${missingField}`);
  console.log(`  · present but no motions:       ${presentNoMotions}`);
  if (bad.length) {
    console.log(`  offenders (up to 40):`);
    for (const b of bad.slice(0, 40)) {
      console.log(
        `    [${b.reason}] "${b.word}"  ${b.id}  letter=${JSON.stringify(b.letter)}`
      );
    }
  }
}

async function main(): Promise<void> {
  const init = await initFirestore();
  const db = init.db as AnyRec;
  console.log(
    `Firestore via ${init.sdk} SDK (admin=${init.isAdmin}) — user ${userId}`
  );

  // ── Scan 1: community gallery source ───────────────────────────────
  await scanCollection(db, "publicSequences", async () =>
    (
      db.collection as (p: string) => {
        get: () => Promise<{ docs: Array<{ id: string; data: () => AnyRec }> }>;
      }
    )("publicSequences").get()
  );

  // ── Scan 2: this user's library ────────────────────────────────────
  await scanCollection(db, `users/${userId}/sequences`, async () =>
    (
      db.collection as (p: string) => {
        get: () => Promise<{ docs: Array<{ id: string; data: () => AnyRec }> }>;
      }
    )(`users/${userId}/sequences`).get()
  );

  // ── Targeted dump: the flagged words, wherever they live ───────────
  console.log(`\n──────── flagged words detail ────────`);
  const sources: Array<{ label: string; path: string }> = [
    { label: "publicSequences", path: "publicSequences" },
    { label: "library", path: `users/${userId}/sequences` },
  ];
  for (const src of sources) {
    const snap = await (
      db.collection as (p: string) => {
        get: () => Promise<{ docs: Array<{ id: string; data: () => AnyRec }> }>;
      }
    )(src.path).get();
    for (const d of snap.docs) {
      const data = d.data();
      const word = (data["word"] as string) ?? "";
      const name = (data["name"] as string) ?? "";
      if (!FLAGGED_WORDS.includes(word) && !FLAGGED_WORDS.includes(name))
        continue;
      const sp = inspectStartPlacement(data);
      console.log(
        `[${src.label}] "${word}" (${name})  ${d.id}  ` +
          `vis=${data["visibility"]}  deleted=${data["isDeleted"]}  ` +
          `sp.present=${sp.present} sp.motions=[${sp.motionKeys.join(",")}] ` +
          `letter=${JSON.stringify(sp.letter)} stepPairings=${Array.isArray(data["stepPairings"]) ? (data["stepPairings"] as unknown[]).length : "none"}`
      );
    }
  }

  // ── Probe a specific id across owner + public ──────────────────────
  console.log(`\n──────── id probe: ${probeId} ────────`);
  // Public mirror
  const pub = await (
    db.collection as (p: string) => {
      doc: (id: string) => {
        get: () => Promise<{ exists: boolean; data: () => AnyRec | undefined }>;
      };
    }
  )("publicSequences")
    .doc(probeId)
    .get();
  const pubExists =
    (pub as AnyRec).exists === true || (pub as AnyRec).exists === undefined
      ? typeof (pub as AnyRec).exists === "boolean"
        ? (pub as AnyRec).exists
        : !!pub.data()
      : !!pub.data();
  console.log(
    `publicSequences/${probeId}: exists=${!!pub.data()}  owner=${pub.data()?.["ownerId"]}  word=${pub.data()?.["word"]}  vis=n/a`
  );
  void pubExists;
  // This user's copy
  const mine = await (
    db.collection as (p: string) => {
      doc: (id: string) => {
        get: () => Promise<{ data: () => AnyRec | undefined }>;
      };
    }
  )(`users/${userId}/sequences`)
    .doc(probeId)
    .get();
  console.log(
    `users/${userId}/sequences/${probeId}: exists=${!!mine.data()}  vis=${mine.data()?.["visibility"]}  deleted=${mine.data()?.["isDeleted"]}  word=${mine.data()?.["word"]}`
  );

  // If the public doc names an owner, check the owner's source doc too.
  const ownerId = pub.data()?.["ownerId"] as string | undefined;
  if (ownerId && ownerId !== userId) {
    const ownerDoc = await (
      db.collection as (p: string) => {
        doc: (id: string) => {
          get: () => Promise<{ data: () => AnyRec | undefined }>;
        };
      }
    )(`users/${ownerId}/sequences`)
      .doc(probeId)
      .get();
    console.log(
      `users/${ownerId}/sequences/${probeId} (owner): exists=${!!ownerDoc.data()}  vis=${ownerDoc.data()?.["visibility"]}  deleted=${ownerDoc.data()?.["isDeleted"]}`
    );
  }

  // ── Deep dump: good (V) vs broken, to design the fix ───────────────
  console.log(`\n──────── deep dump (library) ────────`);
  const dumpIds = [
    "V",
    "3275fe30-64ce-404b-8b06-2fe36c2e1cc1",
    "0889f6cf-5fb5-4ecd-96de-89cdd54ba77f",
    "b3306fcf-a8f7-4dcf-b482-d9b656724aec",
  ];
  for (const id of dumpIds) {
    const snap = await (
      db.collection as (p: string) => {
        doc: (i: string) => {
          get: () => Promise<{ data: () => AnyRec | undefined }>;
        };
      }
    )(`users/${userId}/sequences`)
      .doc(id)
      .get();
    const data = snap.data();
    if (!data) {
      console.log(`\n[${id}] MISSING`);
      continue;
    }
    const leftSolo = (data["leftSoloProp"] ?? data["blueSoloProp"]) as
      | AnyRec
      | undefined;
    const rightSolo = (data["rightSoloProp"] ?? data["redSoloProp"]) as
      | AnyRec
      | undefined;
    console.log(`\n[${id}] word="${data["word"]}"`);
    console.log(`  fields: ${Object.keys(data).sort().join(", ")}`);
    console.log(
      `  startPlacement: ${JSON.stringify(data["startPlacement"])?.slice(0, 600)}`
    );
    console.log(
      `  has stepPairings=${Array.isArray(data["stepPairings"])} leftSoloProp=${!!leftSolo} rightSoloProp=${!!rightSolo}`
    );
    if (leftSolo) {
      console.log(
        `  leftSolo.startLocation=${JSON.stringify(leftSolo["startLocation"])} startOrientation=${JSON.stringify(leftSolo["startOrientation"])}`
      );
      const bsteps = leftSolo["steps"] as AnyRec[] | undefined;
      console.log(
        `  leftSolo.steps[0]=${JSON.stringify(bsteps?.[0])?.slice(0, 300)}`
      );
    }
    if (rightSolo) {
      console.log(
        `  rightSolo.startLocation=${JSON.stringify(rightSolo["startLocation"])} startOrientation=${JSON.stringify(rightSolo["startOrientation"])}`
      );
    }
    const sp0 = (data["stepPairings"] as AnyRec[] | undefined)?.[0];
    console.log(`  stepPairings[0]=${JSON.stringify(sp0)?.slice(0, 400)}`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
