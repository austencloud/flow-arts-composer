/**
 * Repair every shortcode's payload-derived labels (parity-repair spec,
 * "Shortcode correction → Repair path").
 *
 * The payload is the authority: the `encoded` blob (falling back to embedded
 * `sequenceData.steps`) is decoded, each beat's letter is matched against the
 * pictograph dataframes (the same match `motion-query-handler` performs, done
 * directly over `parseCsvEdges` because the app's CSV loader is browser-only),
 * and the result runs through the shared STRICT word API
 * (`deriveWordStatusFromSteps` → { word, complete, missingStepIndexes,
 * stepCount }). Labels are updated only when derivation is COMPLETE — a
 * partial word would misrepresent the payload, so those records are reported
 * for manual review, never guessed.
 *
 * Every stale mutable label is repaired — not only the auto-name class the
 * first version of this script targeted. `payloadWord`, `payloadStepCount`,
 * and `payloadSchemaVersion: 2` are stamped alongside the `sequenceName` /
 * `sequence` compatibility aliases (readers prefer payloadWord). Scan counts,
 * encoded payloads, ownership, deck attribution, and timestamps are never
 * touched. Historical payload versions (no payloadSchemaVersion) are counted
 * separately from schema-2 records whose labels drifted.
 *
 * Requires the Admin SDK in BOTH modes: the scan reads every full document
 * (the old client-SDK `select()` projection path breaks under the compat
 * client — "db.collection(...).select is not a function"), and writes are
 * admin-only by rules regardless.
 *
 *   TKA_ADMIN=1 npx tsx scripts/migrations/backfill-shortcode-words.ts             # dry-run
 *   TKA_ADMIN=1 npx tsx scripts/migrations/backfill-shortcode-words.ts --apply     # write
 *   TKA_ADMIN=1 npx tsx scripts/migrations/backfill-shortcode-words.ts --apply --limit 5
 */
import { writeFileSync } from "fs";
import { join } from "path";
import { initFirestore } from "../lib/firestore-provider.js";
import {
  derivePayloadWord,
  PAYLOAD_SCHEMA_VERSION,
  type AnyRec,
  type PayloadDerivation,
} from "./lib/shortcode-derivation";
import {
  isCurrentShortcodeClass,
  isWordPayloadKind,
  validateHandPathRecord,
} from "./lib/shortcode-payload-kinds";
import { decodeSequenceFromQR } from "../../src/lib/shared/navigation/services/sequence-encoder";
import {
  getSequenceMotionProfile,
  motionHandForAuthoredHand,
} from "../../src/lib/shared/foundation/services/sequence-motion-profile";
import {
  extractLeftSoloProp,
  extractRightSoloProp,
} from "../../src/lib/shared/foundation/services/sequence-decomposer";
import { hashSoloProp } from "../../src/lib/shared/foundation/services/content-hasher";
import type { SoloPropData } from "../../src/lib/shared/foundation/domain/models/solo-prop-data";
import type { SequenceData } from "../../src/lib/shared/foundation/domain/models/sequence-data";

const argv = process.argv.slice(2);
const APPLY = argv.includes("--apply");
const LIMIT = (() => {
  const i = argv.indexOf("--limit");
  return i >= 0 && argv[i + 1] ? Number(argv[i + 1]) : Infinity;
})();

type LabelClass =
  | "LABELS_CURRENT"
  | "SOLO_CURRENT"
  | "HAND_PATH_CURRENT"
  /** A payloadKind with no rule in shortcode-payload-kinds.ts. Never
   *  derived as a word, never written. */
  | "UNKNOWN_PAYLOAD_KIND"
  | "STALE_MUTABLE_LABELS"
  | "LEGACY_PAYLOAD_VERSION"
  | "PAYLOAD_INCOMPLETE"
  | "PAYLOAD_MISSING"
  | "PAYLOAD_SOURCES_CONFLICT"
  /** stored.slice(1) === derived: the old encoder consumed a 0-based first
   *  CONTENT beat as the start position at mint, so the payload physically
   *  lost that beat. Relabeling would enshrine the loss — quarantined. */
  | "TRUNCATED_PAYLOAD_AT_MINT"
  /** The derived word contradicts the stored label, is not a seed→expansion,
   *  and only ONE payload source could vouch for it. The decode+dataframe
   *  channel shows systematic same-family letter bias (Θ↔Ω, Σ↔Δ, R↔P …) on
   *  old blobs, so an uncorroborated contradiction needs human review. */
  | "LABEL_CONTRADICTS_PAYLOAD"
  | "DERIVATION_FAILED";

const SOLO_PAYLOAD_SCHEMA_VERSION = 3;

async function validateSoloRecord(data: AnyRec): Promise<string | null> {
  const title = data.payloadTitle;
  const authoredHand = data.authoredHand;
  const contentHash = data.payloadContentHash;
  const stepCount = data.payloadStepCount;
  const sourceSoloPropId = data.sourceSoloPropId;
  if (data.payloadSchemaVersion !== SOLO_PAYLOAD_SCHEMA_VERSION) {
    return "solo payloadSchemaVersion must be 3";
  }
  if (typeof title !== "string" || title.length === 0) {
    return "solo payloadTitle is missing";
  }
  if (data.sequence !== title || data.sequenceName !== title) {
    return "solo compatibility titles contradict payloadTitle";
  }
  if ("payloadWord" in data || "sequenceData" in data) {
    return "solo record carries a word-only field";
  }
  if (authoredHand !== "left" && authoredHand !== "right") {
    return "solo authoredHand is invalid";
  }
  if (
    typeof contentHash !== "string" ||
    contentHash.length !== 22 ||
    !Number.isInteger(stepCount) ||
    Number(stepCount) <= 0
  ) {
    return "solo identity envelope is incomplete";
  }
  if (
    sourceSoloPropId !== undefined &&
    (typeof sourceSoloPropId !== "string" || sourceSoloPropId.length === 0)
  ) {
    return "solo sourceSoloPropId is invalid";
  }

  const hasEncoded =
    typeof data.encoded === "string" && data.encoded.length > 0;
  const hasEmbedded =
    data.soloData !== null && typeof data.soloData === "object";
  if (hasEncoded === hasEmbedded) {
    return "solo record must carry exactly one durable payload";
  }

  let soloProp: SoloPropData;
  if (hasEncoded) {
    let decoded: SequenceData;
    try {
      decoded = await decodeSequenceFromQR(String(data.encoded));
    } catch (error) {
      return `solo encoded payload does not decode: ${String(
        error instanceof Error ? error.message : error
      ).slice(0, 120)}`;
    }
    const profile = getSequenceMotionProfile(decoded);
    const expectedHand = motionHandForAuthoredHand(authoredHand);
    if (profile.kind !== "solo" || profile.hand !== expectedHand) {
      return "solo encoded payload contradicts authoredHand";
    }
    if (decoded.steps.length !== stepCount) {
      return "solo encoded step count contradicts envelope";
    }
    soloProp =
      authoredHand === "left"
        ? extractLeftSoloProp(decoded)
        : extractRightSoloProp(decoded);
  } else {
    soloProp = data.soloData as SoloPropData;
    if (
      !Array.isArray(soloProp.steps) ||
      soloProp.steps.length !== stepCount ||
      (sourceSoloPropId !== undefined && soloProp.id !== sourceSoloPropId) ||
      soloProp.authoredHand !== authoredHand
    ) {
      return "embedded solo identity contradicts envelope";
    }
  }

  if (hashSoloProp(soloProp) !== contentHash) {
    return "solo payload content hash contradicts envelope";
  }
  return null;
}

async function main(): Promise<void> {
  const { db, sdk, isAdmin } = (await initFirestore()) as AnyRec & {
    db: AnyRec;
    sdk: string;
    isAdmin: boolean;
  };
  if (!isAdmin) {
    throw new Error(
      "This repair reads every full shortcode document and writes label fields — run with TKA_ADMIN=1. (The client compat SDK also lacks select(), which broke the old dry-run path.)"
    );
  }
  console.log(
    `via ${sdk} — ${APPLY ? "APPLY" : "DRY-RUN"}` +
      (LIMIT !== Infinity ? ` — limit ${LIMIT}` : "")
  );

  const snap = await (db.collection as (p: string) => AnyRec)("shortcodes")[
    "get"
  ]();
  let docs = (snap.docs as Array<{ id: string; data: () => AnyRec }>).map(
    (d) => ({ id: d.id, data: d.data() })
  );
  docs.sort((a, b) => (a.id < b.id ? -1 : 1));
  if (LIMIT !== Infinity) docs = docs.slice(0, LIMIT);
  console.log(`shortcodes scanned: ${docs.length}`);

  const results: Array<{
    code: string;
    cls: LabelClass;
    storedLabel?: string;
    derivedWord?: string;
    detail?: string;
  }> = [];
  let batch = (db.batch as () => AnyRec)();
  let batchCount = 0;
  const commitBatch = async () => {
    if (batchCount === 0) return;
    await (batch.commit as () => Promise<unknown>)();
    batch = (db.batch as () => AnyRec)();
    batchCount = 0;
  };

  for (const { id: code, data } of docs) {
    if (data.payloadKind === "solo") {
      const detail = await validateSoloRecord(data);
      results.push(
        detail
          ? {
              code,
              cls: "DERIVATION_FAILED",
              storedLabel: String(data.payloadTitle ?? ""),
              detail,
            }
          : { code, cls: "SOLO_CURRENT" }
      );
      continue;
    }
    if (data.payloadKind === "hand-path") {
      const detail = await validateHandPathRecord(code, data);
      results.push(
        detail
          ? {
              code,
              cls: "DERIVATION_FAILED",
              storedLabel: String(data.payloadTitle ?? ""),
              detail,
            }
          : { code, cls: "HAND_PATH_CURRENT" }
      );
      continue;
    }
    if (!isWordPayloadKind(data.payloadKind)) {
      results.push({
        code,
        cls: "UNKNOWN_PAYLOAD_KIND",
        detail: `payloadKind ${JSON.stringify(data.payloadKind)} has no audit rule (scripts/migrations/lib/shortcode-payload-kinds.ts)`,
      });
      continue;
    }

    const storedLabel = String(
      data.payloadWord ?? data.sequenceName ?? data.sequence ?? ""
    );
    const isLegacyVersion =
      data.payloadSchemaVersion !== PAYLOAD_SCHEMA_VERSION;

    let raw: Awaited<ReturnType<typeof derivePayloadWord>>;
    try {
      raw = await derivePayloadWord(data);
    } catch (e) {
      results.push({
        code,
        cls: "DERIVATION_FAILED",
        storedLabel,
        detail: String(e instanceof Error ? e.message : e).slice(0, 200),
      });
      continue;
    }

    if (!raw) {
      results.push({ code, cls: "PAYLOAD_MISSING", storedLabel });
      continue;
    }
    if ("conflict" in raw) {
      // Encoded and embedded payloads are both complete, same beat count,
      // DIFFERENT words — a human decides which payload is telling the truth.
      results.push({
        code,
        cls: "PAYLOAD_SOURCES_CONFLICT",
        storedLabel,
        detail: `encoded says "${raw.conflict.encoded.word}", embedded says "${raw.conflict.embedded.word}"`,
      });
      continue;
    }
    const derived = raw;
    if (!derived.complete || derived.word.length === 0) {
      // Quarantine: never invent or truncate a word. Reported for manual
      // review with the exact unresolved beat indexes.
      results.push({
        code,
        cls: "PAYLOAD_INCOMPLETE",
        storedLabel,
        derivedWord: derived.word,
        detail: `missing beat indexes: ${derived.missingStepIndexes.join(", ")} (of ${derived.stepCount})`,
      });
      continue;
    }

    const labelsCurrent =
      data.payloadWord === derived.word &&
      data.sequenceName === derived.word &&
      data.sequence === derived.word &&
      data.payloadStepCount === derived.stepCount &&
      !isLegacyVersion;
    if (labelsCurrent) {
      results.push({ code, cls: "LABELS_CURRENT" });
      continue;
    }

    // Word-change safety gate. A complete derivation earns a WRITE only when
    // the change is self-evidently safe:
    //   - the label was never a notation word (auto-names, suffixed titles),
    //   - or the derived word is the stored seed's full expansion,
    //   - or BOTH payload sources corroborate the new word.
    // Everything else quarantines: mint-truncated payloads must not have the
    // loss enshrined, and the decode-only channel's letter bias must not
    // overwrite a plausible word on one witness.
    const WORD_SHAPE = /^[A-ZΑ-Ωα-ω-]+$/u;
    const wordChanged = storedLabel !== derived.word;
    const labelIsWordShaped =
      storedLabel.length > 0 && WORD_SHAPE.test(storedLabel);
    if (wordChanged && labelIsWordShaped) {
      // One notation token = letter + optional dash suffix ("W-", "Σ-").
      const storedTokens = storedLabel.match(/[A-ZΑ-Ωα-ω]-?/gu) ?? [];
      const storedMinusFirstToken = storedTokens.slice(1).join("");

      if (
        storedMinusFirstToken === derived.word &&
        storedTokens.length === derived.stepCount + 1
      ) {
        results.push({
          code,
          cls: "TRUNCATED_PAYLOAD_AT_MINT",
          storedLabel,
          derivedWord: derived.word,
          detail: `payload lost its first beat at mint (0-based content beat consumed as start position); label kept`,
        });
        continue;
      }
      // A payload with MORE beats than the label has tokens is structural
      // proof the label never described this payload ("GI" on a 7-beat blob —
      // the VOJT/Z3WC class): every channel here can only LOSE beats, never
      // invent them, so one witness suffices. Same-beat-count letter
      // disagreements are the decode channel's known letter-family bias and
      // stay quarantined unless both witnesses agree; a SHORTER payload on a
      // single witness may itself be the loss and also quarantines.
      const payloadOutgrowsLabel = derived.stepCount > storedTokens.length;
      if (
        !derived.word.startsWith(storedLabel) &&
        !derived.corroborated &&
        !payloadOutgrowsLabel
      ) {
        results.push({
          code,
          cls: "LABEL_CONTRADICTS_PAYLOAD",
          storedLabel,
          derivedWord: derived.word,
          detail: `single-witness (${derived.source}) contradiction — review before relabeling`,
        });
        continue;
      }
    }

    // Historical payload versions (no schema stamp yet) are counted
    // separately from schema-2 records whose mutable labels drifted — the
    // same write, two different stories about how the record got here.
    const cls: LabelClass = isLegacyVersion
      ? "LEGACY_PAYLOAD_VERSION"
      : "STALE_MUTABLE_LABELS";
    results.push({ code, cls, storedLabel, derivedWord: derived.word });

    if (APPLY) {
      const ref = (db.collection as (p: string) => AnyRec)("shortcodes")["doc"](
        code
      ) as AnyRec;
      // Label fields ONLY — scan counts, encoded payloads, ownership,
      // deck/print attribution, and timestamps are never touched.
      (batch.update as (r: AnyRec, u: AnyRec) => void)(ref, {
        payloadWord: derived.word,
        payloadStepCount: derived.stepCount,
        payloadSchemaVersion: PAYLOAD_SCHEMA_VERSION,
        sequenceName: derived.word,
        sequence: derived.word,
      });
      batchCount++;
      if (batchCount >= 400) await commitBatch();
    }
  }
  if (APPLY) await commitBatch();

  const counts: Record<string, number> = {};
  for (const r of results) counts[r.cls] = (counts[r.cls] ?? 0) + 1;
  console.log(`\n════ ${APPLY ? "APPLY" : "DRY-RUN"} SUMMARY ════`);
  for (const [cls, count] of Object.entries(counts).sort()) {
    console.log(`  ${count.toString().padStart(5)}  ${cls}`);
  }
  // Console lists problems in full and a sample of repairs; the manifest has
  // every record. 20k+ deck codes would otherwise flood the terminal.
  const PRINT_CAP_PER_CLASS = 40;
  const printed: Record<string, number> = {};
  for (const r of results) {
    if (isCurrentShortcodeClass(r.cls)) continue;
    const isProblem =
      r.cls === "UNKNOWN_PAYLOAD_KIND" ||
      r.cls === "PAYLOAD_INCOMPLETE" ||
      r.cls === "PAYLOAD_MISSING" ||
      r.cls === "PAYLOAD_SOURCES_CONFLICT" ||
      r.cls === "TRUNCATED_PAYLOAD_AT_MINT" ||
      r.cls === "LABEL_CONTRADICTS_PAYLOAD" ||
      r.cls === "DERIVATION_FAILED";
    printed[r.cls] = (printed[r.cls] ?? 0) + 1;
    if (!isProblem && printed[r.cls]! > PRINT_CAP_PER_CLASS) continue;
    const arrow =
      r.derivedWord !== undefined
        ? ` "${r.storedLabel}" → "${r.derivedWord}"`
        : ` "${r.storedLabel ?? ""}"`;
    console.log(
      `  ${isProblem ? "⚠️ " : APPLY ? "✅" : "· "} ${r.code}${arrow}${r.detail ? ` — ${r.detail}` : ""}`
    );
  }
  for (const [cls, n] of Object.entries(printed)) {
    if (
      n > PRINT_CAP_PER_CLASS &&
      cls !== "PAYLOAD_INCOMPLETE" &&
      cls !== "PAYLOAD_MISSING" &&
      cls !== "DERIVATION_FAILED"
    ) {
      console.log(`  … ${n - PRINT_CAP_PER_CLASS} more ${cls} (see manifest)`);
    }
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outPath = join(
    "scripts",
    "migrations",
    "backups",
    `shortcode-labels-${APPLY ? "apply" : "dryrun"}-${stamp}.json`
  );
  writeFileSync(
    outPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        mode: APPLY ? "apply" : "dry-run",
        counts,
        results,
      },
      null,
      2
    )
  );
  console.log(`\nmanifest: ${outPath}`);
  if (!APPLY) console.log("Re-run with TKA_ADMIN=1 … --apply to write.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
