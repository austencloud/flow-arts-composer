/**
 * The repository's own source import graph, read from files rather than a
 * build, so a boundary rule can run in a fast unit test.
 *
 * By default it follows static `import`/`export ... from` specifiers only:
 * `import type` and dynamic `import()` are how a heavy dependency is supposed
 * to be reached lazily, so a boot-cost rule must not see them. Pass
 * `{ dynamic: true }` to also follow `import("...")` with a literal specifier,
 * for rules about everything a route can ever load, not only what it loads
 * first.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.."
);
const SRC = path.join(REPO_ROOT, "src");

const RESOLVE_SUFFIXES = [
  "",
  ".ts",
  ".js",
  ".svelte",
  ".svelte.ts",
  "/index.ts",
  "/index.js",
];

const VIRTUAL_PREFIXES = ["$app/", "$env/", "$service-worker"];

/** `import`/`export … from` specifiers, minus `import type`, plus `import()` on request. */
export function importSpecifiers(
  code: string,
  options: { dynamic?: boolean } = {}
): string[] {
  const stripped = code
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
  const patterns = [
    /(?:^|[\s;}])(?:import|export)\s+(?!type\s)(?:[^'"()]*?\sfrom\s*)?["']([^"']+)["']/g,
    /(?:^|[\s;}])import\s*["']([^"']+)["']/g,
  ];
  if (options.dynamic) patterns.push(/import\(\s*["']([^"']+)["']\s*\)/g);
  const specs = new Set<string>();
  for (const pattern of patterns) {
    for (const [, spec] of stripped.matchAll(pattern)) {
      if (spec) specs.add(spec);
    }
  }
  return [...specs];
}

function resolveLocal(spec: string, importer: string): string | null {
  let base: string;
  if (spec === "$lib") base = path.join(SRC, "lib/index");
  else if (spec.startsWith("$lib/"))
    base = path.join(SRC, "lib", spec.slice(5));
  else if (spec.startsWith("."))
    base = path.resolve(path.dirname(importer), spec);
  else return null;
  for (const suffix of RESOLVE_SUFFIXES) {
    const candidate = base + suffix;
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile())
      return candidate;
  }
  return null;
}

export interface ImportGraph {
  /** Every source file reachable from the entries. */
  files: Set<string>;
  /** Bare package specifier → the source files that import it. */
  packages: Map<string, Set<string>>;
  /** Child → the file that first reached it, for a readable failure. */
  parent: Map<string, string | null>;
}

export function importGraph(
  entries: string[],
  options: { dynamic?: boolean } = {}
): ImportGraph {
  const files = new Set<string>();
  const packages = new Map<string, Set<string>>();
  const parent = new Map<string, string | null>();
  const queue = [...entries];
  for (const entry of entries) parent.set(entry, null);

  while (queue.length > 0) {
    const file = queue.shift()!;
    if (files.has(file)) continue;
    let code: string;
    try {
      code = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }
    files.add(file);
    for (const spec of importSpecifiers(code, options)) {
      if (VIRTUAL_PREFIXES.some((p) => spec.startsWith(p))) continue;
      const local = resolveLocal(spec, file);
      if (local === null) {
        const pkg = spec.split("?")[0] ?? spec;
        const importers = packages.get(pkg) ?? new Set<string>();
        importers.add(file);
        packages.set(pkg, importers);
        continue;
      }
      if (!parent.has(local)) parent.set(local, file);
      queue.push(local);
    }
  }
  return { files, packages, parent };
}

/** The import chain from an entry to `file`, one repo-relative path per line. */
export function chainTo(graph: ImportGraph, file: string): string {
  const steps: string[] = [];
  let current: string | null | undefined = file;
  while (current) {
    steps.push(path.relative(REPO_ROOT, current));
    current = graph.parent.get(current) ?? null;
  }
  return steps.reverse().join("\n  → ");
}

export const repoPath = (p: string) => path.join(REPO_ROOT, p);
