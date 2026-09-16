/**
 * Parity corpus capture script.
 *
 * Builds the pinned baseline that every later phase of the sequence-engine
 * unification will diff against. Produces bit-identical canonical JSON per
 * sequence under `tests/parity/corpus/<id>.json` plus a sidecar
 * `<id>.meta.json` capturing the inputs.
 *
 * Status: scaffolding. The engine adapter and Firestore fetch layer land
 * with Phase 1 preparation (see docs/superpowers/plans/2026-04-20-
 * sequence-engine-unification-plan.md Task 0.6). The CLI interface and
 * edge-case loader are wired now so consumers and CI can depend on a
 * stable entrypoint.
 *
 * Usage:
 *   tsx tests/parity/capture-corpus.ts --help
 *   tsx tests/parity/capture-corpus.ts --sources=edge
 *   tsx tests/parity/capture-corpus.ts --sources=edge,decks,firestore --out=tests/parity/corpus
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));

export interface CaptureOptions {
  sources: ReadonlyArray<"edge" | "decks" | "firestore">;
  outDir: string;
  firestoreDays: number;
  dryRun: boolean;
}

const DEFAULTS: CaptureOptions = Object.freeze({
  sources: ["edge"],
  outDir: resolve(HERE, "corpus"),
  firestoreDays: 30,
  dryRun: false,
});

const USAGE = `\
capture-corpus — build the parity baseline corpus

Usage:
  tsx tests/parity/capture-corpus.ts [options]

Options:
  --sources=<list>        Comma-separated: edge,decks,firestore  (default: edge)
  --out=<dir>             Output directory for <id>.json files    (default: tests/parity/corpus)
  --firestore-days=<n>    Days of prod writes to capture          (default: 30)
  --dry-run               Parse + enumerate without writing files
  -h, --help              Show this message

Sources:
  edge       — load tests/parity/edge-cases.json (always deterministic)
  decks      — enumerate all Firestore deck sequences
  firestore  — last N days of user-written sequences

Output layout:
  <outDir>/<id>.json         canonical sequence output
  <outDir>/<id>.meta.json    inputs used to regenerate the output
  <outDir>/../corpus-manifest.json
                             updated with capturedAt, capturedCommit,
                             and one entry per captured sequence

Exit codes:
  0 on success (corpus written and manifest updated)
  1 on capture failure
  2 on CLI argument error
`;

function parseArgs(argv: ReadonlyArray<string>): CaptureOptions | null {
  if (argv.includes("-h") || argv.includes("--help")) return null;
  const opts: {
    sources: CaptureOptions["sources"];
    outDir: string;
    firestoreDays: number;
    dryRun: boolean;
  } = {
    sources: DEFAULTS.sources,
    outDir: DEFAULTS.outDir,
    firestoreDays: DEFAULTS.firestoreDays,
    dryRun: DEFAULTS.dryRun,
  };
  for (const arg of argv) {
    if (arg === "--dry-run") {
      opts.dryRun = true;
    } else if (arg.startsWith("--sources=")) {
      const raw = arg.slice("--sources=".length);
      const parsed = raw.split(",").map((s) => s.trim());
      for (const s of parsed) {
        if (s !== "edge" && s !== "decks" && s !== "firestore") {
          throw new Error(`Unknown source: ${s}`);
        }
      }
      opts.sources = parsed as CaptureOptions["sources"];
    } else if (arg.startsWith("--out=")) {
      opts.outDir = resolve(process.cwd(), arg.slice("--out=".length));
    } else if (arg.startsWith("--firestore-days=")) {
      const n = Number(arg.slice("--firestore-days=".length));
      if (!Number.isInteger(n) || n < 1) {
        throw new Error(`--firestore-days must be a positive integer`);
      }
      opts.firestoreDays = n;
    } else if (arg.startsWith("-")) {
      throw new Error(`Unknown flag: ${arg}`);
    }
  }
  return opts;
}

export function canonicalStringify(value: unknown): string {
  return JSON.stringify(value, replacer, 2);
}
function replacer(_key: string, v: unknown): unknown {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    const sorted: Record<string, unknown> = {};
    for (const k of Object.keys(v as object).sort()) {
      sorted[k] = (v as Record<string, unknown>)[k];
    }
    return sorted;
  }
  return v;
}

interface EdgeCaseEntry {
  id: string;
  kind: string;
  word?: string;
  startPlacement?: string;
  options: Record<string, unknown>;
  description: string;
}

async function loadEdgeCases(): Promise<EdgeCaseEntry[]> {
  const path = resolve(HERE, "edge-cases.json");
  const raw = await readFile(path, "utf8");
  const parsed = JSON.parse(raw) as { entries: EdgeCaseEntry[] };
  return parsed.entries;
}

async function captureEdge(
  opts: CaptureOptions,
  writes: Map<string, string>
): Promise<EdgeCaseEntry[]> {
  const entries = await loadEdgeCases();
  console.log(`[edge] loaded ${entries.length} edge-case inputs`);
  for (const entry of entries) {
    const meta = {
      id: entry.id,
      kind: entry.kind,
      word: entry.word,
      startPlacement: entry.startPlacement,
      options: entry.options,
      description: entry.description,
    };
    writes.set(`${entry.id}.meta.json`, canonicalStringify(meta));
  }
  if (!opts.dryRun) {
    console.warn(
      "[edge] NOTE: sequence-engine output capture lands with Phase 1 prep " +
        "(see plan Task 0.6). Meta sidecars are written now; .json outputs " +
        "will be populated by the engine adapter once the unified Step type " +
        "is consumed by the builder."
    );
  }
  return entries;
}

async function captureDecks(): Promise<void> {
  throw new Error(
    "[decks] capture adapter lands with Phase 1 prep — deck-registry " +
      "fetch not wired yet. Run with --sources=edge for the current " +
      "scaffolding baseline."
  );
}

async function captureFirestore(): Promise<void> {
  throw new Error(
    "[firestore] capture adapter lands with Phase 1 prep — Firestore " +
      "client not wired yet. Run with --sources=edge for the current " +
      "scaffolding baseline."
  );
}

async function writeAll(
  outDir: string,
  writes: Map<string, string>,
  dryRun: boolean
): Promise<void> {
  if (!existsSync(outDir)) {
    await mkdir(outDir, { recursive: true });
  }
  for (const [name, body] of writes) {
    const target = resolve(outDir, name);
    if (dryRun) {
      console.log(`[dry-run] would write ${target} (${body.length} bytes)`);
      continue;
    }
    await writeFile(target, body, "utf8");
  }
}

async function updateManifest(
  entries: EdgeCaseEntry[],
  dryRun: boolean
): Promise<void> {
  const manifestPath = resolve(HERE, "corpus-manifest.json");
  const capturedCommit = (() => {
    try {
      return execSync("git rev-parse HEAD", { stdio: ["ignore", "pipe", "ignore"] })
        .toString()
        .trim();
    } catch {
      return null;
    }
  })();
  const manifest = {
    version: 1,
    capturedAt: new Date().toISOString(),
    capturedCommit,
    entries: entries.map((e) => ({
      id: e.id,
      kind: e.kind,
      description: e.description,
    })),
  };
  if (dryRun) {
    console.log(
      `[dry-run] would update ${manifestPath} with ${manifest.entries.length} entries`
    );
    return;
  }
  await writeFile(manifestPath, canonicalStringify(manifest) + "\n", "utf8");
  console.log(`[manifest] wrote ${manifest.entries.length} entries`);
}

export async function main(argv: ReadonlyArray<string>): Promise<number> {
  let opts: CaptureOptions | null;
  try {
    opts = parseArgs(argv);
  } catch (err) {
    console.error(`Error: ${(err as Error).message}\n`);
    process.stderr.write(USAGE);
    return 2;
  }
  if (opts === null) {
    process.stdout.write(USAGE);
    return 0;
  }
  const writes = new Map<string, string>();
  const collected: EdgeCaseEntry[] = [];
  for (const source of opts.sources) {
    if (source === "edge") {
      collected.push(...(await captureEdge(opts, writes)));
    } else if (source === "decks") {
      await captureDecks();
    } else if (source === "firestore") {
      await captureFirestore();
    }
  }
  await writeAll(opts.outDir, writes, opts.dryRun);
  await updateManifest(collected, opts.dryRun);
  console.log(`[done] sources=${opts.sources.join(",")} entries=${collected.length}`);
  return 0;
}

function isMainModule(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  const entryUrl = new URL(`file:///${entry.replace(/\\/g, "/")}`).href;
  const selfUrl = new URL(import.meta.url).href;
  return entryUrl.toLowerCase() === selfUrl.toLowerCase();
}

if (isMainModule()) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err) => {
      console.error(err);
      process.exit(1);
    }
  );
}
