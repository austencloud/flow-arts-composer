import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The composition worker's module graph must not reach `$app/*`.
 *
 * The worker build leaves `$app/*` as bare external specifiers (vite.config.ts,
 * `worker.rolldownOptions.external`), which a browser worker cannot resolve.
 * One static path to them makes the worker's whole `import()` of its pipeline
 * reject. That happened in production: canvas-2d-direct-renderer statically
 * imported posthog.ts, which imports `$app/env`, so every worker on /shop
 * failed at startup and cards fell back to the main thread. A unit test with
 * mocked modules cannot see this, so walk the real source imports.
 */

const SRC_LIB = resolve(__dirname, "../../../..");
const WORKER = resolve(__dirname, "../composition.worker.ts");

// Value imports only: `import type` and `export type` vanish at build time.
const STATIC_IMPORT =
  /^\s*(?:import|export)\s+(?!type\s)(?:[^"'`;]*?\sfrom\s*)?["']([^"']+)["']/gm;
// `import("x").Type` in a type position is not a load; skip it.
const DYNAMIC_IMPORT = /import\(\s*["']([^"']+)["']\s*\)(?!\.[A-Z])/g;

function resolveSpecifier(from: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith("#lib/")) base = join(SRC_LIB, spec.slice("#lib/".length));
  else if (spec.startsWith(".")) base = resolve(dirname(from), spec);
  else return null; // a package; `$app/*` is checked before this
  const stem = base.replace(/\.js$/, "");
  for (const candidate of [
    base,
    `${stem}.ts`,
    `${stem}.svelte.ts`,
    join(stem, "index.ts"),
  ]) {
    if (/\.(ts|js)$/.test(candidate) && existsSync(candidate)) return candidate;
  }
  return null;
}

/** Every `$app/*` import statically reachable from `entries`, with its chain. */
function findAppImports(entries: string[]): { found: string[]; visited: number } {
  const parent = new Map<string, string | null>(entries.map((e) => [e, null]));
  const queue = [...entries];
  const found: string[] = [];
  const chain = (file: string): string => {
    const out: string[] = [];
    for (let cur: string | null = file; cur; cur = parent.get(cur) ?? null) {
      out.unshift(relative(SRC_LIB, cur).replace(/\\/g, "/"));
    }
    return out.join(" -> ");
  };
  while (queue.length) {
    const file = queue.shift()!;
    const source = readFileSync(file, "utf8");
    for (const [, spec] of source.matchAll(STATIC_IMPORT)) {
      if (spec!.startsWith("$app/")) {
        found.push(`${chain(file)} imports ${spec}`);
        continue;
      }
      const target = resolveSpecifier(file, spec!);
      if (target && !parent.has(target)) {
        parent.set(target, file);
        queue.push(target);
      }
    }
  }
  return { found, visited: parent.size };
}

describe("composition worker import graph", () => {
  it("reaches no $app/* module from anything the worker imports", () => {
    const workerSource = readFileSync(WORKER, "utf8");
    const loaded = [...workerSource.matchAll(DYNAMIC_IMPORT)]
      .map(([, spec]) => resolveSpecifier(WORKER, spec!))
      .filter((file): file is string => file !== null);

    // Guard against the walk silently checking nothing.
    expect(loaded.length).toBeGreaterThanOrEqual(8);
    expect(loaded.some((f) => f.endsWith("canvas-2d-direct-renderer.ts"))).toBe(true);

    const { found, visited } = findAppImports([WORKER, ...loaded]);
    expect(visited).toBeGreaterThan(50);
    expect(found).toEqual([]);
  });
});
