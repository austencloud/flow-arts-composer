/**
 * Pipeline Corpus Validation
 *
 * Fetches all circular sequences from Firestore, runs the real TypeScript
 * LOOPDetector pipeline on each, and compares the detected loopType to the
 * stored loopType. Reports mismatches.
 *
 * Usage:
 *   npx tsx scripts/validate-pipeline-corpus.ts              # Full corpus
 *   npx tsx scripts/validate-pipeline-corpus.ts --word ABCD   # Single word
 *   npx tsx scripts/validate-pipeline-corpus.ts --snapshot    # Save results to JSON
 */

import { initFirestore } from "./lib/firestore-provider.js";
import { loopDetector } from "../src/lib/features/loop-labeler/services/implementations/LOOPDetector";
import type {
  SequenceEntry,
  RawStepData,
} from "../src/lib/shared/loop-labeler/domain/sequence-models";
import { writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const HERE = dirname(fileURLToPath(import.meta.url));

interface ValidationResult {
  word: string;
  storedLoopType: string | null;
  detectedLoopType: string | null;
  match: boolean;
  detectedComponents: string[];
  detectedPeriod: number;
  rawStepCount: number;
}

function normalizeLoopType(lt: string | null | undefined): string | null {
  if (!lt) return null;
  let normalized = lt
    .toLowerCase()
    .replace(/_90$/, "")
    .replace(/_ccw$/, "")
    .replace(/_cw$/, "")
    .replace(/^strict_/, "");

  // flipped = mirrored+swapped = rotated_180+swapped — treat as equivalent
  if (normalized === "flipped") normalized = "mirrored_swapped";
  normalized = normalized.replace(/\bflipped\b/, "mirrored_swapped");

  // rotated_180 ≈ mirrored for comparison purposes
  normalized = normalized.replace(/\brotated_180\b/, "rotated");

  const parts = normalized.split("_").sort();
  return parts.join("_");
}

function convertMotionAttrs(motion: Record<string, unknown> | undefined) {
  if (!motion) return undefined;
  return {
    motionType: (motion["motionType"] as string) || undefined,
    startLoc:
      (motion["startLocation"] as string) ||
      (motion["startLoc"] as string) ||
      undefined,
    endLoc:
      (motion["endLocation"] as string) ||
      (motion["endLoc"] as string) ||
      undefined,
    startOri:
      (motion["startOrientation"] as string) ||
      (motion["startOri"] as string) ||
      undefined,
    endOri:
      (motion["endOrientation"] as string) ||
      (motion["endOri"] as string) ||
      undefined,
    propRotDir:
      (motion["rotationDirection"] as string) ||
      (motion["propRotDir"] as string) ||
      undefined,
    turns: motion["turns"] as number | string | undefined,
  };
}

function motionForHand(
  motions: Record<string, Record<string, unknown>> | undefined,
  hand: "left" | "right"
): Record<string, unknown> | undefined {
  if (!motions) return undefined;
  return hand === "left"
    ? (motions["left"] ?? motions["blue"])
    : (motions["right"] ?? motions["red"]);
}

function deriveGridPlacement(
  motions: Record<string, Record<string, unknown>> | undefined,
  locKey: "startLocation" | "endLocation"
): string {
  if (!motions) return "";
  const left = (motionForHand(motions, "left")?.[locKey] as string) || "";
  const right = (motionForHand(motions, "right")?.[locKey] as string) || "";
  if (!left || !right) return "";
  return `${left}_${right}`;
}

function convertToRawSequence(data: Record<string, unknown>): RawStepData[] {
  const result: RawStepData[] = [];

  const beats = data["beats"] as Array<Record<string, unknown>> | undefined;
  if (beats && beats.length > 0) {
    const firstStep = beats[0];

    const isRawFormat =
      firstStep &&
      ("leftAttributes" in firstStep ||
        "blueAttributes" in firstStep ||
        "beat" in firstStep ||
        "word" in firstStep);
    if (isRawFormat) {
      return beats as RawStepData[];
    }

    const hasMotions = firstStep && "motions" in firstStep;
    const hasBeatOrStep =
      firstStep && ("beatNumber" in firstStep || "stepNumber" in firstStep);

    if (hasMotions && hasBeatOrStep) {
      result.push({
        word: (data["word"] as string) || "",
        author: (data["author"] as string) || "",
        level: (data["level"] as number) || undefined,
        gridMode: (data["gridMode"] as string) || "diamond",
        isCircular: (data["isCircular"] as boolean) ?? false,
      });

      const startPos = (data["startPlacement"] || data["startingPlacement"]) as
        | Record<string, unknown>
        | undefined;
      if (startPos) {
        const sMotions = startPos["motions"] as
          | Record<string, Record<string, unknown>>
          | undefined;
        const gridPos =
          deriveGridPlacement(sMotions, "endLocation") ||
          (startPos["gridPlacement"] as string) ||
          (data["startingPlacementGroup"] as string) ||
          "";
        result.push({
          beat: 0,
          sequenceStartPlacement: gridPos,
          endPos: gridPos,
          letter: (startPos["letter"] as string) || undefined,
          leftAttributes: convertMotionAttrs(motionForHand(sMotions, "left")),
          rightAttributes: convertMotionAttrs(motionForHand(sMotions, "right")),
        });
      }

      for (const step of beats) {
        const motions = step["motions"] as
          | Record<string, Record<string, unknown>>
          | undefined;
        const beatNum = Number(step["beatNumber"] ?? step["stepNumber"]) || 0;
        if (beatNum < 1) continue;
        result.push({
          beat: beatNum,
          letter: (step["letter"] as string) || undefined,
          startPos: deriveGridPlacement(motions, "startLocation") || undefined,
          endPos: deriveGridPlacement(motions, "endLocation") || undefined,
          leftAttributes: convertMotionAttrs(motionForHand(motions, "left")),
          rightAttributes: convertMotionAttrs(motionForHand(motions, "right")),
        });
      }
      return result;
    }
  }

  result.push({
    word: (data["word"] as string) || (data["name"] as string) || "",
    author: (data["author"] as string) || "",
    level: (data["level"] as number) || undefined,
    gridMode: (data["gridMode"] as string) || "diamond",
    isCircular: (data["isCircular"] as boolean) ?? false,
  });

  const startPos = (data["startPlacement"] || data["startingPlacement"]) as
    | Record<string, unknown>
    | undefined;
  if (startPos) {
    const motions = startPos["motions"] as
      | Record<string, Record<string, unknown>>
      | undefined;
    const gridPos =
      deriveGridPlacement(motions, "endLocation") ||
      (startPos["gridPlacement"] as string) ||
      (startPos["startPlacement"] as string) ||
      "";
    result.push({
      beat: 0,
      sequenceStartPlacement: gridPos,
      endPos: gridPos,
      letter: (startPos["letter"] as string) || undefined,
      leftAttributes: convertMotionAttrs(motionForHand(motions, "left")),
      rightAttributes: convertMotionAttrs(motionForHand(motions, "right")),
    });
  }

  const steps = (data["steps"] || []) as Array<Record<string, unknown>>;
  const seqData = data["sequenceData"] as Record<string, unknown> | undefined;
  const actualSteps =
    steps.length > 0
      ? steps
      : ((seqData?.["steps"] || []) as Array<Record<string, unknown>>);

  for (const step of actualSteps) {
    const motions = step["motions"] as
      | Record<string, Record<string, unknown>>
      | undefined;
    const stepNumber = (step["stepNumber"] as number) ?? 0;
    if (stepNumber < 1) continue;

    result.push({
      beat: stepNumber,
      letter: (step["letter"] as string) || undefined,
      startPos:
        (step["startPlacement"] as string) ||
        deriveGridPlacement(motions, "startLocation") ||
        undefined,
      endPos:
        (step["endPlacement"] as string) ||
        deriveGridPlacement(motions, "endLocation") ||
        undefined,
      leftAttributes: convertMotionAttrs(motionForHand(motions, "left")),
      rightAttributes: convertMotionAttrs(motionForHand(motions, "right")),
    });
  }

  return result;
}

async function main() {
  const args = process.argv.slice(2);
  const wordFilter = args.includes("--word")
    ? args[args.indexOf("--word") + 1]
    : null;
  const saveSnapshot = args.includes("--snapshot");

  console.log("=".repeat(70));
  console.log("PIPELINE CORPUS VALIDATION");
  console.log("Uses the real TypeScript LOOPDetector pipeline");
  console.log("=".repeat(70));
  console.log();

  const { db, sdk } = await initFirestore();
  console.log(`Connected via ${sdk} SDK`);

  // Fetch public sequences index
  const publicSeqSnapshot = await db.collection("publicSequences").get();
  const publicSeqs: Array<{ id: string; data: Record<string, unknown> }> = [];
  publicSeqSnapshot.forEach(
    (docSnap: { id: string; data: () => Record<string, unknown> }) => {
      publicSeqs.push({ id: docSnap.id, data: docSnap.data() });
    }
  );

  console.log(`Loaded ${publicSeqs.length} public sequences`);

  // Filter to circular sequences only
  let circular = publicSeqs.filter((s) => s.data["isCircular"] === true);
  if (wordFilter) {
    circular = circular.filter(
      (s) =>
        (s.data["word"] as string)?.toUpperCase() === wordFilter.toUpperCase()
    );
    if (circular.length === 0) {
      console.error(`No circular sequence found with word: ${wordFilter}`);
      process.exit(1);
    }
  }

  console.log(`Circular sequences to validate: ${circular.length}`);
  console.log();

  const results: ValidationResult[] = [];
  let loaded = 0;
  let loadFailed = 0;

  for (const seq of circular) {
    const data = seq.data;
    const word = (data["word"] as string) || seq.id;
    const storedLoopType = (data["loopType"] as string) || null;

    // Resolve full sequence data via sourceRef
    const sourceRef =
      (data["sourceRef"] as string) ||
      (data["ownerId"] ? `users/${data["ownerId"]}/sequences/${seq.id}` : null);

    if (!sourceRef) {
      loadFailed++;
      continue;
    }

    let fullDoc: Record<string, unknown>;
    try {
      const docSnap = await db.doc(sourceRef).get();
      if (!docSnap.exists) {
        loadFailed++;
        continue;
      }
      fullDoc = docSnap.data() as Record<string, unknown>;
    } catch {
      loadFailed++;
      continue;
    }

    // Convert to RawStepData[] and build SequenceEntry
    const rawSequence = convertToRawSequence(fullDoc);

    const sequenceEntry: SequenceEntry = {
      id: seq.id,
      word,
      isCircular: true,
      loopType: storedLoopType,
      thumbnails: [],
      sequenceLength: rawSequence.filter(
        (r) => typeof r.beat === "number" && r.beat >= 1
      ).length,
      gridMode: (data["gridMode"] as string) || "diamond",
      fullMetadata: { sequence: rawSequence },
    };

    // Run the real pipeline
    const detected = loopDetector.detectLOOP(sequenceEntry);
    loaded++;

    const match =
      normalizeLoopType(storedLoopType) ===
      normalizeLoopType(detected.loopType);
    const rawStepCount = rawSequence.filter(
      (r) => typeof r.beat === "number" && r.beat >= 1
    ).length;

    results.push({
      word,
      storedLoopType,
      detectedLoopType: detected.loopType,
      match,
      detectedComponents: detected.components,
      detectedPeriod: detected.period,
      rawStepCount,
    });

    // Progress indicator
    if (loaded % 50 === 0) {
      process.stdout.write(`  Processed ${loaded}/${circular.length}...\r`);
    }
  }

  console.log();

  // Summary
  const matches = results.filter((r) => r.match);
  const mismatches = results.filter((r) => !r.match);
  const bothNull = results.filter(
    (r) => r.storedLoopType === null && r.detectedLoopType === null
  );
  const storedOnly = mismatches.filter(
    (r) => r.storedLoopType !== null && r.detectedLoopType === null
  );
  const detectedOnly = mismatches.filter(
    (r) => r.storedLoopType === null && r.detectedLoopType !== null
  );
  const disagree = mismatches.filter(
    (r) => r.storedLoopType !== null && r.detectedLoopType !== null
  );

  const noDataMismatches = mismatches.filter((m) => m.rawStepCount === 0);
  const withDataTotal = results.filter((r) => r.rawStepCount > 0).length;
  const withDataMatches = matches.filter((r) => r.rawStepCount > 0).length;
  const withDataMismatches = mismatches.filter((r) => r.rawStepCount > 0);

  console.log("=".repeat(70));
  console.log("RESULTS");
  console.log("=".repeat(70));
  console.log(`Total validated:       ${results.length}`);
  console.log(`Full metadata loaded:  ${loaded}`);
  console.log(`Load failures:         ${loadFailed}`);
  console.log(`No step data (stripped):  ${noDataMismatches.length}`);
  console.log();
  console.log(`--- Overall (including stripped docs) ---`);
  console.log(
    `MATCHES:               ${matches.length} (${((matches.length / results.length) * 100).toFixed(1)}%)`
  );
  console.log(`  Both null (no loop): ${bothNull.length}`);
  console.log(`  Both agree on type:  ${matches.length - bothNull.length}`);
  console.log(`MISMATCHES:            ${mismatches.length}`);
  console.log(`  Stored but not detected:    ${storedOnly.length}`);
  console.log(`  Detected but not stored:    ${detectedOnly.length}`);
  console.log(`  Both set, disagree:         ${disagree.length}`);
  console.log();
  console.log(`--- With step data (real pipeline accuracy) ---`);
  console.log(
    `MATCHES:               ${withDataMatches}/${withDataTotal} (${((withDataMatches / withDataTotal) * 100).toFixed(1)}%)`
  );
  console.log(`REAL MISMATCHES:       ${withDataMismatches.length}`);

  if (mismatches.length > 0) {
    console.log();
    console.log("=".repeat(70));
    console.log("MISMATCH DETAILS");
    console.log("=".repeat(70));

    const noData = mismatches.filter((m) => m.rawStepCount === 0);
    const withData = mismatches.filter((m) => m.rawStepCount > 0);

    if (noData.length > 0) {
      console.log(
        `\n  --- NO STEP DATA (source doc stripped): ${noData.length} ---`
      );
      for (const m of noData) {
        console.log(`    ${m.word}: stored=${m.storedLoopType || "(null)"}`);
      }
    }

    if (withData.length > 0) {
      console.log(
        `\n  --- WITH STEP DATA (real mismatches): ${withData.length} ---`
      );
      for (const m of withData) {
        console.log(`  ${m.word} (${m.rawStepCount} beats):`);
        console.log(`    stored:   ${m.storedLoopType || "(null)"}`);
        console.log(`    detected: ${m.detectedLoopType || "(null)"}`);
        console.log(`    components: [${m.detectedComponents.join(", ")}]`);
        console.log(`    period: ${m.detectedPeriod}`);
        console.log();
      }
    }
  }

  if (saveSnapshot) {
    const snapshotPath = resolve(
      HERE,
      "..",
      "tests",
      "parity",
      "loop-pipeline-corpus.json"
    );
    writeFileSync(
      snapshotPath,
      JSON.stringify(
        {
          capturedAt: new Date().toISOString(),
          totalSequences: results.length,
          matchRate: ((matches.length / results.length) * 100).toFixed(1) + "%",
          results: results.map((r) => ({
            word: r.word,
            stored: r.storedLoopType,
            detected: r.detectedLoopType,
            match: r.match,
            components: r.detectedComponents,
            period: r.detectedPeriod,
            rawStepCount: r.rawStepCount,
          })),
        },
        null,
        2
      )
    );
    console.log();
    console.log(`Snapshot saved to: ${snapshotPath}`);
  }

  // Exit with error code if mismatches found
  process.exit(mismatches.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
