/**
 * Worker bundles build without the Svelte plugin (vite.config.ts), so a
 * `.svelte.ts` or `.svelte` module reachable from a worker can throw
 * `$state is not defined` at load. This walks every `*.worker.ts` static import
 * graph under src/ and fails if one reaches such a module.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = resolve(process.cwd(), "src");

function findWorkers(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) findWorkers(full, out);
    else if (name.endsWith(".worker.ts")) out.push(full);
  }
  return out;
}

function resolveSpecifier(from: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith("#lib/")) base = join(SRC, "lib", spec.slice(5));
  else if (spec.startsWith("$lib/")) base = join(SRC, "lib", spec.slice(5));
  else if (spec.startsWith(".")) base = resolve(dirname(from), spec);
  else return null; // bare package
  base = base.replace(/\.js$/, "");
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.svelte.ts`,
    `${base}.svelte`,
    join(base, "index.ts"),
  ];
  return (
    candidates.find((c) => existsSync(c) && statSync(c).isFile()) ?? null
  );
}

/** Static value imports/re-exports. `import type` and `export type` are erased. */
function staticSpecifiers(source: string): string[] {
  const out: string[] = [];
  const re =
    /(?:^|\n)\s*(?:import|export)\s+(?!type\b)(?:[^"';]*?\sfrom\s+)?["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) out.push(m[1]!);
  return out;
}

function svelteModulesReachableFrom(worker: string): string[] {
  const seen = new Set<string>();
  const bad: string[] = [];
  const stack = [worker];
  while (stack.length) {
    const file = stack.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    if (/\.svelte(\.ts)?$/.test(file)) {
      bad.push(file);
      continue;
    }
    for (const spec of staticSpecifiers(readFileSync(file, "utf8"))) {
      const target = resolveSpecifier(file, spec);
      if (target) stack.push(target);
    }
  }
  return bad.map((f) => f.slice(SRC.length + 1).replace(/\\/g, "/"));
}

describe("worker static import graphs", () => {
  const workers = findWorkers(SRC);

  it("finds the workers", () => {
    expect(workers.length).toBeGreaterThan(0);
  });

  for (const worker of workers) {
    const label = worker.slice(SRC.length + 1).replace(/\\/g, "/");
    it(`${label} reaches no .svelte or .svelte.ts module`, () => {
      expect(svelteModulesReachableFrom(worker)).toEqual([]);
    });
  }
});
