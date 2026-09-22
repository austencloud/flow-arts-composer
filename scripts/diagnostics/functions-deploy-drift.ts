/**
 * Read-only: which Cloud Functions does `firebase-functions/src/index.ts`
 * export that production does not run?
 *
 * Functions deploy by hand, so a feature can ship its client half through the
 * normal push while its server half never leaves the repo. That happened to
 * magic-link state (2026-07-22) and again to the library-count triggers
 * (2026-08-01): the client stopped writing profile counts, the triggers that
 * took over were never deployed, and every profile count froze silently.
 *
 *   npx tsx scripts/diagnostics/functions-deploy-drift.ts
 *
 * Exits 1 when anything exported is missing from production, so it can gate a
 * release checklist. Deployed-but-not-exported names are reported too; those
 * are orphans a full deploy would offer to delete.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const INDEX_PATH = join(REPO_ROOT, "firebase-functions", "src", "index.ts");

/**
 * Every value export name in the functions entry point. Covers the two shapes
 * the file uses, `export { a, b as c } from "..."` and `export const x = ...`.
 * Type-only exports are skipped because they deploy nothing.
 */
export function parseFunctionExportNames(source: string): string[] {
  const names = new Set<string>();
  for (const match of source.matchAll(/export\s+(type\s+)?\{([^}]*)\}/g)) {
    if (match[1]) continue;
    for (const specifier of match[2]!.split(",")) {
      const trimmed = specifier.replace(/\/\/.*$/gm, "").trim();
      if (!trimmed || trimmed.startsWith("type ")) continue;
      names.add(trimmed.split(/\s+as\s+/).pop()!.trim());
    }
  }
  for (const match of source.matchAll(
    /export\s+(?:const|let|function|async\s+function)\s+(\w+)/g
  )) {
    names.add(match[1]!);
  }
  return [...names].sort();
}

export function readExportedFunctionNames(): string[] {
  return parseFunctionExportNames(readFileSync(INDEX_PATH, "utf8"));
}

/** Function ids live in production, via the signed-in Firebase CLI. */
export function listDeployedFunctionIds(): string[] {
  const raw = execFileSync(
    "npx",
    ["firebase", "functions:list", "--json"],
    { cwd: REPO_ROOT, encoding: "utf8", shell: true, stdio: ["ignore", "pipe", "pipe"] }
  );
  const parsed = JSON.parse(raw.slice(raw.indexOf("{"))) as {
    status: string;
    result?: Array<{ id: string }>;
  };
  if (parsed.status !== "success" || !parsed.result) {
    throw new Error(`firebase functions:list failed: ${raw.slice(0, 300)}`);
  }
  return parsed.result.map((fn) => fn.id);
}

export interface DeployDrift {
  undeployed: string[];
  orphaned: string[];
}

export function diffDeployment(
  exported: readonly string[],
  deployed: readonly string[]
): DeployDrift {
  const live = new Set(deployed);
  const local = new Set(exported);
  return {
    undeployed: exported.filter((name) => !live.has(name)),
    // Extensions deploy under their own "ext-" ids, never from index.ts.
    orphaned: deployed.filter(
      (id) => !local.has(id) && !id.startsWith("ext-")
    ),
  };
}

function main(): void {
  const exported = readExportedFunctionNames();
  const deployed = listDeployedFunctionIds();
  const { undeployed, orphaned } = diffDeployment(exported, deployed);

  console.log(
    `${exported.length} exported, ${deployed.length} deployed (read-only)`
  );
  console.log(
    undeployed.length
      ? `\nNOT DEPLOYED (${undeployed.length}):\n  ${undeployed.join("\n  ")}`
      : "\nEvery exported function is deployed."
  );
  if (orphaned.length) {
    console.log(
      `\nDeployed but no longer exported (${orphaned.length}):\n  ${orphaned.join("\n  ")}`
    );
  }
  process.exitCode = undeployed.length ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
