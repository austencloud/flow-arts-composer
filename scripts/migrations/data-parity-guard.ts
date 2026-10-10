/**
 * Data-Parity Guard — the NON-RENDER complement to the pixel-parity net.
 *
 * The pixel harness (/test/step-migration-parity) renders and diffs pixels. It
 * is structurally BLIND to the sinks a StepData->Step / MotionData->Motion
 * migration can silently corrupt with zero pixel drift — an adversarial review
 * (2026-07-01) flagged these as the real danger:
 *
 *   - identity contentHash (V2) — the phantom-fork-on-resave sink. Drops of
 *     handPath/skew shift the hash and fork every float/skew sequence on resave.
 *   - soloprop / hand-path contentHashes — Firestore foreign-key + dedup doc keys
 *     (publicSoloProps/{hash}, publicHandPaths/{hash}). Re-keying orphans docs.
 *   - step signatures — cross-sequence dedup / alignment.
 *   - share-URL encoder round-trip — encode->decode must preserve identity.
 *
 * This guard freezes a real corpus and snapshots all four fingerprints per
 * sequence, then re-computes them after a refactor and asserts byte-stability.
 * It runs headless in Node (unlike the browser pixel net), so it is CI-able and
 * is the ONE gate that can see the migration's primary failure mode.
 *
 *   TKA_ADMIN=1 npx tsx scripts/migrations/data-parity-guard.ts --capture --limit 80
 *   npx tsx scripts/migrations/data-parity-guard.ts          # check vs snapshot
 *
 * Workflow: --capture BEFORE the migration -> do the refactor -> plain run to
 * check. A frozen snapshot means the only variable is the code. Non-zero drift =
 * a data corruption the pixel net cannot see. The snapshot is written to
 * scripts/migrations/fixtures/data-parity-baseline.json (not committed by
 * default; regenerate per migration).
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { initFirestore } from "../lib/firestore-provider.js";
import {
  hydrate,
  ensureComposition,
} from "../../src/lib/shared/foundation/services/sequence-hydrator";
import { computeHash } from "../../src/lib/shared/library/services/sequence-content-hasher";
// Import the node-safe classes directly — the getStepSignatureGenerator getter
// is a browser-only singleton (imports $app/env and throws when !browser).
import { StepSignatureGenerator } from "../../src/lib/shared/comparison/services/step-signature-generator";
import { MotionSignatureGenerator } from "../../src/lib/shared/comparison/services/motion-signature-generator";
import {
  encodeSequence,
  decodeSequence,
} from "../../src/lib/shared/navigation/services/sequence-encoder";

const stepSig = new StepSignatureGenerator(new MotionSignatureGenerator());
import type { SequenceData } from "../../src/lib/shared/foundation/domain/models/sequence-data";
import {
  viewFieldsDigest,
  riskFieldCoverage,
  formatCoverage,
} from "./lib/view-fields-digest.js";
import { buildRiskFixtureRecords } from "./lib/risk-fixtures.js";

if (!(globalThis as { crypto?: { subtle?: unknown } }).crypto?.subtle) {
  const { webcrypto } = await import("node:crypto");
  (globalThis as { crypto?: unknown }).crypto = webcrypto;
}

type AnyRec = Record<string, unknown>;
const __dirname = dirname(fileURLToPath(import.meta.url));
const SNAPSHOT = join(__dirname, "fixtures", "data-parity-baseline.json");
const DEFAULT_USER = "PBp3GSBO6igCKPwJyLZNmVEmamI3";
const argv = process.argv.slice(2);
const CAPTURE = argv.includes("--capture");
const LIMIT = (() => {
  const i = argv.indexOf("--limit");
  return i >= 0 && argv[i + 1] ? parseInt(argv[i + 1]!, 10) : 80;
})();

// A per-sequence bundle of every non-render fingerprint. Each is computed
// defensively so one broken sink can't mask the others.
interface Fingerprint {
  word: string;
  identityHash: string; // computeHash(hydrate(seq)) — the phantom-fork sink
  leftPathHash: string;
  rightPathHash: string;
  leftSoloHash: string;
  rightSoloHash: string;
  stepSignatures: string; // JSON of generateSignatures(steps)
  encoderRoundTripHash: string; // computeHash(hydrate(decode(encode(seq))))
  viewFieldsDigest: string; // direct digest of handPath/skew/pathShape/prefloat/turns/plane
}

async function fingerprint(seq: SequenceData): Promise<Fingerprint> {
  const safe = async (fn: () => Promise<string> | string): Promise<string> => {
    try {
      return await fn();
    } catch (e) {
      return `ERR:${e instanceof Error ? e.message : String(e)}`.slice(0, 80);
    }
  };
  const hydrated = hydrate(seq) as SequenceData;
  const composed = ensureComposition(hydrated) as AnyRec;
  return {
    word: seq.word ?? "?",
    identityHash: await safe(() => computeHash(hydrated)),
    leftPathHash: String(composed["leftPathHash"] ?? ""),
    rightPathHash: String(composed["rightPathHash"] ?? ""),
    leftSoloHash: String(composed["leftSoloHash"] ?? ""),
    rightSoloHash: String(composed["rightSoloHash"] ?? ""),
    stepSignatures: await safe(() =>
      JSON.stringify(stepSig.generateSignatures(hydrated.steps ?? []))
    ),
    encoderRoundTripHash: await safe(async () =>
      computeHash(
        hydrate(decodeSequence(encodeSequence(hydrated))) as SequenceData
      )
    ),
    viewFieldsDigest: await safe(() => viewFieldsDigest(hydrated.steps ?? [])),
  };
}

const FIELDS: (keyof Fingerprint)[] = [
  "identityHash",
  "leftPathHash",
  "rightPathHash",
  "leftSoloHash",
  "rightSoloHash",
  "stepSignatures",
  "encoderRoundTripHash",
  "viewFieldsDigest",
];

// ─── capture ────────────────────────────────────────────────────────────────

async function capture(): Promise<void> {
  const { db, sdk } = (await initFirestore()) as AnyRec & { db: AnyRec };
  console.log(`via ${sdk} — CAPTURE — freezing up to ${LIMIT} sequences`);
  const snap = await (db.collection as (p: string) => AnyRec)(
    "publicSequences"
  )["get"]();
  const docs = (snap.docs as Array<{ id: string; data: () => AnyRec }>).slice(
    0,
    LIMIT
  );
  const records: Array<{ raw: SequenceData; fp: Fingerprint }> = [];
  for (const d of docs) {
    const raw = { ...(d.data() as object), id: d.id } as SequenceData;
    if ((raw as AnyRec)["isDeleted"] === true) continue;
    const hydrated = hydrate(raw) as SequenceData;
    if (!hydrated.steps || hydrated.steps.length === 0) continue;
    records.push({ raw, fp: await fingerprint(raw) });
  }
  // Synthetic risk fixtures — the corpus carries zero handPath/skew/pathShape
  // (2026-07-01 audit), so without these every check is vacuous on the exact
  // fields the migration endangers. Snapshot-local; never written to Firestore.
  for (const raw of buildRiskFixtureRecords(records.map((r) => r.raw))) {
    records.push({ raw, fp: await fingerprint(raw) });
  }
  const allSteps = records.flatMap(
    (r) => (hydrate(r.raw) as SequenceData).steps ?? []
  );
  console.log(
    `risk-field coverage: ${formatCoverage(riskFieldCoverage(allSteps))}`
  );
  if (!existsSync(dirname(SNAPSHOT)))
    mkdirSync(dirname(SNAPSHOT), { recursive: true });
  writeFileSync(
    SNAPSHOT,
    JSON.stringify({ capturedAt: new Date().toISOString(), records }, null, 2)
  );
  console.log(
    `Froze ${records.length} sequences + fingerprints -> ${SNAPSHOT}`
  );
  console.log(`Now do the migration, then re-run WITHOUT --capture to check.`);
  process.exit(0);
}

// ─── check ──────────────────────────────────────────────────────────────────

async function check(): Promise<void> {
  if (!existsSync(SNAPSHOT)) {
    console.error(
      `No snapshot at ${SNAPSHOT}. Run with --capture first (pre-migration).`
    );
    process.exit(1);
  }
  const { capturedAt, records } = JSON.parse(
    readFileSync(SNAPSHOT, "utf8")
  ) as {
    capturedAt: string;
    records: Array<{ raw: SequenceData; fp: Fingerprint }>;
  };
  console.log(`CHECK vs snapshot ${capturedAt} — ${records.length} sequences`);
  const drift: Array<{
    word: string;
    field: string;
    before: string;
    after: string;
  }> = [];
  for (const rec of records) {
    const now = await fingerprint(rec.raw);
    for (const f of FIELDS) {
      if (now[f] !== rec.fp[f]) {
        drift.push({
          word: rec.fp.word,
          field: f,
          before: String(rec.fp[f]).slice(0, 24),
          after: String(now[f]).slice(0, 24),
        });
      }
    }
  }
  const byField = new Map<string, number>();
  for (const d of drift) byField.set(d.field, (byField.get(d.field) ?? 0) + 1);
  console.log(
    `\n─── result: ${records.length} sequences, ${FIELDS.length} fingerprints each ───`
  );
  if (drift.length === 0) {
    console.log(
      `✅ DATA PARITY — 0 fingerprints drifted. No non-render corruption.`
    );
  } else {
    console.log(
      `❌ DATA DRIFT — ${drift.length} fingerprints changed across ${new Set(drift.map((d) => d.word)).size} sequences:`
    );
    for (const [field, n] of byField) console.log(`   ${field}: ${n}`);
    console.log(`\nfirst 15:`);
    for (const d of drift.slice(0, 15))
      console.log(`   ${d.word} · ${d.field}: ${d.before} -> ${d.after}`);
  }
  process.exit(drift.length === 0 ? 0 : 1);
}

(CAPTURE ? capture() : check()).catch((e) => {
  console.error(e);
  process.exit(1);
});
