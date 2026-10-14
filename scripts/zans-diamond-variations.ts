#!/usr/bin/env node
/**
 * Zan's Diamond variations.
 *
 * Reads Austen's author-verified Zan's Diamond record, builds every stagger
 * and per-hand reversal of its hand path (see
 * src/lib/shared/foundation/services/solo-prop-pair-variations.ts and
 * docs/superpowers/specs/2026-10-14-zans-diamond-variations-design.md), and
 * prints a manifest. With --write it imports each new variation through
 * scripts/import-sequence.cjs, publishes it through scripts/publish-sequence.cjs,
 * and appends it to the public "Zan's Diamond" collection. Variations whose
 * word and start placement are already in the collection are skipped, so the
 * write is safe to rerun.
 *
 * Usage:
 *   TKA_ADMIN=1 node --import tsx scripts/zans-diamond-variations.ts            # dry run: manifest + JSON files
 *   TKA_ADMIN=1 node --import tsx scripts/zans-diamond-variations.ts --write    # import, publish, add to collection
 *   ... --out <dir>   where the import JSON files go (default: <tmp>/zans-diamond-variations)
 *   ... --limit <n>   with --write, stop after n new sequences (a staged first run)
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { initFirestore } from "./lib/firestore-provider.js";
import { addSequencesToCollection } from "./add-sequence-to-collection.js";
import {
  buildStaggerAndReversalVariations,
  type PairLetterLookup,
  type SoloPropPairResult,
} from "../src/lib/shared/foundation/services/solo-prop-pair-variations.js";
import {
  lookupLetter,
  parseCsvEdges,
} from "../src/lib/features/choreo-card/services/pictograph-letter-lookup.js";
import type { SoloPropStepData } from "../src/lib/shared/foundation/domain/models/solo-prop-step-data.js";

const require = createRequire(import.meta.url);
const { AUSTEN_UID } = require("./import-sequence.cjs") as {
  AUSTEN_UID: string;
};

const OWNER_ID = AUSTEN_UID;
const SOURCE_SEQUENCE_ID = "seq_1791923102683_sysj46042";
const COLLECTION_ID = "dab5fdca-b279-4a50-bd7a-67f291fce071";
const SCRIPTS_DIR = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = resolve(SCRIPTS_DIR, "..");

interface Options {
  write: boolean;
  outDir: string;
  limit: number;
}

function parseArgs(argv: string[]): Options {
  const options: Options = {
    write: false,
    outDir: join(tmpdir(), "zans-diamond-variations"),
    limit: Number.POSITIVE_INFINITY,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--write") options.write = true;
    else if (arg === "--out") {
      options.outDir = argv[++i] ?? "";
      if (!options.outDir) throw new Error("--out requires a directory");
    } else if (arg === "--limit") {
      options.limit = Number(argv[++i]);
      if (!Number.isInteger(options.limit) || options.limit < 1) {
        throw new Error("--limit requires a positive whole number");
      }
    } else throw new Error(`Unknown option: ${arg}`);
  }
  return options;
}

interface DocRefLike {
  path: string;
  get(): Promise<{
    exists: boolean | (() => boolean);
    data(): Record<string, unknown> | undefined;
  }>;
}
interface DbLike {
  doc(path: string): DocRefLike;
  runTransaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T>;
}

function exists(snapshot: { exists: boolean | (() => boolean) }): boolean {
  return typeof snapshot.exists === "function"
    ? snapshot.exists()
    : snapshot.exists;
}

function loadDiamondLookup(): PairLetterLookup {
  const csv = readFileSync(
    resolve(
      REPO_ROOT,
      "static/data/pictographs/DiamondPictographDataframe.csv"
    ),
    "utf8"
  );
  const edges = parseCsvEdges(csv);
  return (q) =>
    lookupLetter(edges, {
      startPlacement: q.startPlacement,
      endPlacement: q.endPlacement,
      left: q.left,
      right: q.right,
    });
}

function toImportMotion(hand: "left" | "right", step: SoloPropStepData) {
  return {
    hand,
    motionType: step.motionType,
    rotationDirection: step.rotationDirection,
    startLocation: step.startLocation,
    endLocation: step.endLocation,
    turns: step.turns,
    startOrientation: step.startOrientation,
    endOrientation: step.endOrientation,
  };
}

function toImportJson(result: SoloPropPairResult, sourceWord: string) {
  const { variation, beats, word } = result;
  return {
    word,
    name: word,
    gridMode: "diamond",
    startPlacement: beats[0]!.startPlacement,
    notes:
      `Zan's Diamond variation: ${variation.label.toLowerCase()}. ` +
      `Each hand traces the Zan's Diamond path; derived from ${sourceWord} (${SOURCE_SEQUENCE_ID}).`,
    metadata: {
      zansDiamondVariant: variation.id,
      zansDiamondSource: SOURCE_SEQUENCE_ID,
    },
    steps: beats.map((beat, i) => ({
      beat: i + 1,
      letter: beat.letter,
      startPlacement: beat.startPlacement,
      endPlacement: beat.endPlacement,
      duration: 1,
      motions: {
        left: toImportMotion("left", beat.left),
        right: toImportMotion("right", beat.right),
      },
    })),
  };
}

function runScript(args: string[]): string {
  const run = spawnSync(process.execPath, args, {
    cwd: REPO_ROOT,
    encoding: "utf8",
    env: { ...process.env, TKA_ADMIN: "1" },
  });
  const output = `${run.stdout ?? ""}${run.stderr ?? ""}`;
  if (run.status !== 0) {
    throw new Error(
      `${args.join(" ")} failed (exit ${run.status}):\n${output}`
    );
  }
  return output;
}

function importSequence(file: string): string {
  const output = runScript([resolve(SCRIPTS_DIR, "import-sequence.cjs"), file]);
  const match = output.match(/^ID:\s*(seq_\S+)/m);
  if (!match)
    throw new Error(`import-sequence.cjs printed no sequence id:\n${output}`);
  return match[1]!;
}

function publishSequence(sequenceId: string): void {
  runScript([
    resolve(SCRIPTS_DIR, "publish-sequence.cjs"),
    sequenceId,
    "--owner",
    OWNER_ID,
  ]);
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const { db, FieldValue } = (await initFirestore()) as {
    db: DbLike;
    FieldValue: { serverTimestamp: () => unknown };
  };

  const sourceRef = db.doc(`users/${OWNER_ID}/sequences/${SOURCE_SEQUENCE_ID}`);
  const sourceSnap = await sourceRef.get();
  if (!exists(sourceSnap))
    throw new Error(`Source record not found: ${sourceRef.path}`);
  const source = sourceSnap.data()!;
  const leftSteps = (source["leftSoloProp"] as { steps: SoloPropStepData[] })
    .steps;
  const rightSteps = (source["rightSoloProp"] as { steps: SoloPropStepData[] })
    .steps;
  const sourceWord = String(source["word"]);
  console.log(
    `Source: ${sourceWord} (${SOURCE_SEQUENCE_ID}), ${leftSteps.length} beats`
  );

  const collectionRef = db.doc(
    `users/${OWNER_ID}/collections/${COLLECTION_ID}`
  );
  const collectionSnap = await collectionRef.get();
  if (!exists(collectionSnap))
    throw new Error(`Collection not found: ${collectionRef.path}`);
  const collection = collectionSnap.data()!;
  const memberIds = (collection["sequenceIds"] as string[] | undefined) ?? [];
  const members = await Promise.all(
    memberIds.map(async (id) => {
      const snap = await db.doc(`users/${OWNER_ID}/sequences/${id}`).get();
      const data = exists(snap) ? snap.data()! : undefined;
      const start = data?.["startPlacement"] as
        | { startPlacement?: string }
        | undefined;
      return {
        id,
        key: data
          ? `${String(data["word"])}@${start?.startPlacement ?? "?"}`
          : null,
      };
    })
  );
  const existingByKey = new Map(
    members.filter((m) => m.key).map((m) => [m.key!, m.id])
  );
  console.log(
    `Collection "${collection["name"]}" holds ${memberIds.length} sequences.\n`
  );

  const results = buildStaggerAndReversalVariations(
    leftSteps,
    rightSteps,
    loadDiamondLookup()
  );
  mkdirSync(options.outDir, { recursive: true });

  const unresolved = results.filter((r) => r.unresolvedBeats.length > 0);
  console.log("id            word             start    status");
  const files = new Map<string, string>();
  for (const result of results) {
    const key = `${result.word}@${result.beats[0]!.startPlacement}`;
    const file = join(
      options.outDir,
      `${result.variation.id.replace(/\+/g, "_")}.json`
    );
    writeFileSync(
      file,
      JSON.stringify(toImportJson(result, sourceWord), null, 2)
    );
    files.set(result.variation.id, file);
    const status =
      result.unresolvedBeats.length > 0
        ? `UNRESOLVED beats ${result.unresolvedBeats.join(",")}`
        : existingByKey.has(key)
          ? `already in collection (${existingByKey.get(key)})`
          : "new";
    console.log(
      `${result.variation.id.padEnd(13)} ${result.word.padEnd(16)} ${result.beats[0]!.startPlacement.padEnd(8)} ${status}`
    );
  }
  console.log(`\nImport JSON written to ${options.outDir}`);

  if (unresolved.length > 0) {
    console.log(
      `\n${unresolved.length} variation(s) have beats with no dataframe letter; they are not written.`
    );
  }
  if (!options.write) {
    console.log(
      "\nDry run. Pass --write to import, publish, and add to the collection."
    );
    return;
  }

  const pending = results
    .filter(
      (r) =>
        r.unresolvedBeats.length === 0 &&
        !existingByKey.has(`${r.word}@${r.beats[0]!.startPlacement}`)
    )
    .slice(0, options.limit);
  console.log(`\nWriting ${pending.length} new variation(s)...`);
  const createdIds: string[] = [];
  for (const result of pending) {
    const id = importSequence(files.get(result.variation.id)!);
    publishSequence(id);
    const added = await addSequencesToCollection(
      db as never,
      () => FieldValue.serverTimestamp(),
      OWNER_ID,
      COLLECTION_ID,
      [id]
    );
    createdIds.push(id);
    console.log(
      `${result.variation.id.padEnd(13)} ${result.word.padEnd(16)} -> ${id} (collection: ${added.sequenceCount})`
    );
  }
  console.log(
    `\nDone. ${createdIds.length} sequence(s) added to the collection.`
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(
      "Error:",
      error instanceof Error ? (error.stack ?? error.message) : error
    );
    process.exit(1);
  });
