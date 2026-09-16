/**
 * READ-ONLY broad audit of the sequence corpus for accumulated cruft, beyond the
 * already-fixed start-placement + timestamp issues. Scans the user's library and
 * the public mirror; reports counts + samples per category. No writes.
 *
 *   npx tsx scripts/diagnostics/audit-sequence-cruft.ts
 *   npx tsx scripts/diagnostics/audit-sequence-cruft.ts --user <uid>
 */
import { initFirestore } from "../lib/firestore-provider.js";
import { hydrate } from "../../src/lib/shared/foundation/services/sequence-hydrator";
import { deriveWord } from "../../src/lib/shared/foundation/services/word-deriver";
import type { SequenceData } from "../../src/lib/shared/foundation/domain/models/sequence-data";

type AnyRec = Record<string, unknown>;
const DEFAULT_USER = "PBp3GSBO6igCKPwJyLZNmVEmamI3";
const argv = process.argv.slice(2);
const USER = (() => {
  const i = argv.indexOf("--user");
  return i >= 0 && argv[i + 1] ? argv[i + 1]! : DEFAULT_USER;
})();

const POSITION_LETTERS = new Set(["α", "β", "γ"]);

class Bucket {
  count = 0;
  samples: string[] = [];
  hit(label: string) {
    this.count++;
    if (this.samples.length < 8) this.samples.push(label);
  }
}

function isSentinel(v: unknown): boolean {
  return !!v && typeof v === "object" && "_methodName" in (v as AnyRec);
}
function arr(v: unknown): unknown[] | null {
  return Array.isArray(v) ? v : null;
}

async function auditCollection(
  db: AnyRec,
  label: string,
  path: string,
  isPublic: boolean
): Promise<void> {
  const snap = await (db.collection as (p: string) => AnyRec)(path)["get"]();
  const docs = snap.docs as Array<{ id: string; data: () => AnyRec }>;

  const B = {
    preComp: new Bucket(),          // has steps/beats but no stepPairings
    unrenderable: new Bucket(),     // no stepPairings AND no steps/beats
    lenMismatch: new Bucket(),      // sequenceLength != stepPairings.length
    wordMismatch: new Bucket(),     // stored word != derived word
    emptyWord: new Bucket(),        // word blank/missing
    noContentHash: new Bucket(),    // missing contentHash
    dupContentHash: new Bucket(),   // same contentHash on >1 doc
    softDeleted: new Bucket(),      // isDeleted:true lingering
    noGridMode: new Bucket(),       // gridMode missing
    badStartLetter: new Bucket(),   // startPlacement.letter not α/β/γ
    sentinelTs: new Bucket(),       // serverTimestamp-sentinel timestamps
    noOwner: new Bucket(),          // public: ownerId missing
    orphanMirror: new Bucket(),     // public(Austen): source doc gone
    visMismatch: new Bucket(),      // public(Austen): source not public
    legacyBlob: new Bucket(),       // nested sequenceData blob present
  };

  const hashSeen = new Map<string, string[]>();

  for (const d of docs) {
    const data = d.data();
    const word = (data["word"] as string) ?? "";
    const tag = `"${word}" ${d.id}`;

    if (data["isDeleted"] === true) { B.softDeleted.hit(tag); continue; }

    const stepPairings = arr(data["stepPairings"]);
    const steps = arr(data["steps"]) ?? arr(data["beats"]) ?? arr((data["sequenceData"] as AnyRec)?.["beats"]);
    const hasPairings = !!stepPairings && stepPairings.length > 0;

    // Structural
    if (!hasPairings && steps && steps.length > 0) B.preComp.hit(tag);
    if (!hasPairings && (!steps || steps.length === 0)) B.unrenderable.hit(tag);
    if (data["sequenceData"] !== undefined) B.legacyBlob.hit(tag);

    // Length
    if (hasPairings && typeof data["sequenceLength"] === "number" && data["sequenceLength"] !== stepPairings!.length) {
      B.lenMismatch.hit(`${tag} (stored ${data["sequenceLength"]} vs ${stepPairings!.length})`);
    }

    // Word. A LOOP's stored word is the simplified seed and deriveWord returns
    // the full expansion, so one being a repeat-extension of the other is the
    // EXPECTED convention, not cruft. Only flag when the base letters differ
    // (neither string is a prefix of the other).
    if (!word || word.trim() === "") B.emptyWord.hit(tag);
    else if (hasPairings) {
      try {
        const h = hydrate({ ...(data as object), id: d.id } as SequenceData);
        const dw = deriveWord(h as SequenceData);
        if (dw && dw !== word && !dw.startsWith(word) && !word.startsWith(dw)) {
          B.wordMismatch.hit(`${tag} (derived "${dw}")`);
        }
      } catch { /* skip */ }
    }

    // Hashes / dedupe
    const ch = data["contentHash"] as string | undefined;
    if (!ch) B.noContentHash.hit(tag);
    else {
      const list = hashSeen.get(ch) ?? [];
      list.push(tag);
      hashSeen.set(ch, list);
    }

    // Misc fields
    if (!data["gridMode"]) B.noGridMode.hit(tag);
    const sp = data["startPlacement"] as AnyRec | undefined;
    if (sp?.["motions"] && sp["letter"] !== undefined && !POSITION_LETTERS.has(String(sp["letter"]))) {
      B.badStartLetter.hit(`${tag} (letter ${JSON.stringify(sp["letter"])})`);
    }
    if (isSentinel(data["createdAt"]) || isSentinel(data["updatedAt"]) || isSentinel(data["birthday"])) {
      B.sentinelTs.hit(tag);
    }

    // Public-only
    if (isPublic) {
      const owner = data["ownerId"] as string | undefined;
      if (!owner) B.noOwner.hit(tag);
      if (owner === USER) {
        const src = await (db.collection as (p: string) => AnyRec)(`users/${USER}/sequences`)["doc"](d.id)["get"]();
        const srcData = src.data() as AnyRec | undefined;
        if (!srcData) B.orphanMirror.hit(tag);
        else if (srcData["visibility"] !== "public") B.visMismatch.hit(`${tag} (source vis=${srcData["visibility"]})`);
      }
    }
  }

  // Duplicate content hashes
  for (const [ch, list] of hashSeen) {
    if (list.length > 1) B.dupContentHash.hit(`${list.length}× hash ${ch.slice(0, 10)}: ${list.slice(0, 3).join(" | ")}`);
  }

  console.log(`\n════════ ${label} (${path}) — ${docs.length} docs ════════`);
  const order: Array<[keyof typeof B, string]> = [
    ["preComp", "pre-compositional (steps, no stepPairings)"],
    ["unrenderable", "unrenderable (no pairings, no steps)"],
    ["legacyBlob", "legacy sequenceData blob present"],
    ["lenMismatch", "sequenceLength != stepPairings.length"],
    ["wordMismatch", "stored word != derived word"],
    ["emptyWord", "empty / blank word"],
    ["noContentHash", "missing contentHash"],
    ["dupContentHash", "duplicate contentHash (dupes)"],
    ["badStartLetter", "start-placement letter not α/β/γ"],
    ["sentinelTs", "serverTimestamp-sentinel timestamps"],
    ["softDeleted", "soft-deleted (isDeleted) lingering"],
    ["noGridMode", "missing gridMode"],
    ["noOwner", "public: missing ownerId"],
    ["orphanMirror", "public: orphaned mirror (source gone)"],
    ["visMismatch", "public: source not public"],
  ];
  for (const [key, desc] of order) {
    const b = B[key];
    if (b.count === 0) continue;
    console.log(`  ⚠️  ${b.count.toString().padStart(4)}  ${desc}`);
    for (const s of b.samples) console.log(`             ${s}`);
  }
  const clean = order.every(([k]) => B[k].count === 0);
  if (clean) console.log("  ✅ clean");
}

async function main(): Promise<void> {
  const { db, sdk, isAdmin } = (await initFirestore()) as AnyRec & { db: AnyRec };
  console.log(`Firestore via ${sdk} (admin=${isAdmin}) — user ${USER}`);
  await auditCollection(db, "user library", `users/${USER}/sequences`, false);
  await auditCollection(db, "public mirror", "publicSequences", true);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
