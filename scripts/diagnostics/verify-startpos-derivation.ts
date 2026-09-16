/**
 * READ-ONLY. Proves whether the live hydrate() path reconstructs a valid
 * startPlacement for the docs that lack the persisted field — isolating the
 * empty-start bug to cache/persistence vs. derivation logic. Also dumps the
 * puppyflower's timestamps to explain "deleted but comes back".
 */
import { initFirestore } from "../lib/firestore-provider.js";
import { hydrate } from "../../src/lib/shared/foundation/services/sequence-hydrator";
import type { SequenceData } from "../../src/lib/shared/foundation/domain/models/sequence-data";

type AnyRec = Record<string, unknown>;
const USER = "PBp3GSBO6igCKPwJyLZNmVEmamI3";

function startPosSummary(sp: AnyRec | undefined): string {
  if (!sp) return "NONE";
  const m = sp["motions"] as AnyRec | undefined;
  const keys = m ? Object.keys(m) : [];
  const left = m?.["blue"] as AnyRec | undefined;
  const right = m?.["red"] as AnyRec | undefined;
  return `motions=[${keys.join(",")}] blue@${left?.["startLocation"]}/${left?.["motionType"]} red@${right?.["startLocation"]}/${right?.["motionType"]} letter=${JSON.stringify(sp["letter"])}`;
}

async function main(): Promise<void> {
  const { db, sdk, isAdmin } = await initFirestore() as AnyRec & { db: AnyRec };
  console.log(`Firestore via ${sdk} (admin=${isAdmin})`);

  const broken = ["3275fe30-64ce-404b-8b06-2fe36c2e1cc1", "b3306fcf-a8f7-4dcf-b482-d9b656724aec", "0889f6cf-5fb5-4ecd-96de-89cdd54ba77f"];
  for (const id of broken) {
    const snap = await (db.collection as (p: string) => AnyRec)(`users/${USER}/sequences`)
      ["doc"](id)["get"]();
    const raw = snap.data() as SequenceData | undefined;
    if (!raw) { console.log(`\n[${id}] MISSING`); continue; }
    console.log(`\n[${id}] word="${(raw as AnyRec)["word"]}"`);
    console.log(`  raw.startPlacement:      ${startPosSummary((raw as AnyRec)["startPlacement"] as AnyRec)}`);
    let hydrated: SequenceData;
    try {
      hydrated = hydrate({ ...(raw as object), id } as SequenceData);
      console.log(`  hydrated.steps:         ${hydrated.steps?.length ?? 0}`);
      console.log(`  hydrated.startPlacement: ${startPosSummary((hydrated as AnyRec)["startPlacement"] as AnyRec)}`);
    } catch (e) {
      console.log(`  hydrate threw: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // Puppyflower delete probe
  const pid = "seq_1778908018922_16c7s0zaj";
  const ps = await (db.collection as (p: string) => AnyRec)(`users/${USER}/sequences`)["doc"](pid)["get"]();
  const pd = ps.data() as AnyRec | undefined;
  console.log(`\n[puppyflower ${pid}]`);
  if (pd) {
    console.log(`  word=${pd["word"]} visibility=${pd["visibility"]} isDeleted=${pd["isDeleted"]} source=${pd["source"]}`);
    console.log(`  createdAt=${JSON.stringify(pd["createdAt"])}`);
    console.log(`  updatedAt=${JSON.stringify(pd["updatedAt"])}`);
    console.log(`  fields: ${Object.keys(pd).sort().join(", ")}`);
  } else {
    console.log(`  MISSING from user library`);
  }
  const pubs = await (db.collection as (p: string) => AnyRec)("publicSequences")["doc"](pid)["get"]();
  console.log(`  publicSequences mirror exists=${!!pubs.data()}`);

  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
