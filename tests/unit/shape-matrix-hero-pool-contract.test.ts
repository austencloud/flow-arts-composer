/**
 * Static contract test: the landing hero pool stays Firebase-free.
 *
 * The home page boots in firebase-free "landing mode" (SiteHeader.svelte:29-40,
 * detectSiteMode in src/config/domains.ts). The shape-matrix hero pool
 * constructs realizations from statically-baked base words using transform
 * functions that were split out of their firebase-tainted host modules
 * (turn-pattern-apply / reversal-transform-apply / tnd-base-index — see
 * docs/superpowers/specs/2026-07-21-shape-matrix-hero-pool-design.md).
 *
 * This walks the STATIC import graph of the new landing modules and asserts none
 * of it reaches Firebase. Dynamic imports (`await import(...)`) are separate
 * chunks and are intentionally NOT followed — the heavy generation orchestrator
 * and the box transform are lazy on purpose. If this fails, a static import
 * pulled Firebase into the landing bundle; move it behind a dynamic import or
 * extract the pure part — do not loosen the assertion.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const srcLib = path.join(repoRoot, "src/lib");

/** Specifiers that mean "Firebase reached the bundle". */
function isFirebaseSpecifier(spec: string): boolean {
  return (
    /(^|\/)firebase(-admin)?($|\/)/.test(spec) ||
    spec.includes("shared/auth/firebase") ||
    /(^|\/)catalog-loader(\.js)?$/.test(spec)
  );
}

/** Resolve a #lib / relative import specifier to an on-disk file, or null. */
function resolveSpecifier(fromFile: string, spec: string): string | null {
  let base: string;
  // `#lib` imports name the emitted `.js` file; the source beside it is `.ts`.
  if (spec.startsWith("#lib/"))
    base = path.join(srcLib, spec.slice("#lib/".length).replace(/\.js$/, ""));
  else if (spec === "#lib") base = srcLib;
  else if (spec.startsWith(".")) base = path.resolve(path.dirname(fromFile), spec);
  else return null; // bare npm specifier — not walked (firebase caught by name)

  const candidates = [
    base,
    `${base}.ts`,
    `${base}.svelte`,
    `${base}.svelte.ts`,
    path.join(base, "index.ts"),
  ];
  return candidates.find((c) => existsSync(c) && c.endsWith(".ts")) ??
    candidates.find((c) => existsSync(c) && c.endsWith(".svelte")) ??
    null;
}

/** Strip comments so commented-out imports aren't followed. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

/**
 * Static, value-level import/re-export specifiers of a source file. Excludes
 * `import type ...` / `export type ...` (erased at build) and dynamic
 * `import(...)` (which has no `from` and never matches).
 */
function staticValueSpecifiers(src: string): string[] {
  const out: string[] = [];
  const re = /\b(?:import|export)\s+(type\s+)?[\s\S]*?\bfrom\s*["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  const clean = stripComments(src);
  while ((m = re.exec(clean))) {
    if (m[1]) continue; // whole statement is type-only
    out.push(m[2]!);
  }
  return out;
}

/** Walk the static graph from a seed file; return firebase violations found. */
function firebaseReach(seedRel: string): string[] {
  const seed = path.join(repoRoot, seedRel);
  const violations: string[] = [];
  const visited = new Set<string>();
  const stack: string[] = [seed];

  while (stack.length) {
    const file = stack.pop()!;
    if (visited.has(file)) continue;
    visited.add(file);

    const src = readFileSync(file, "utf8");
    for (const spec of staticValueSpecifiers(src)) {
      if (isFirebaseSpecifier(spec)) {
        violations.push(`${path.relative(repoRoot, file)} → "${spec}"`);
        continue;
      }
      const resolved = resolveSpecifier(file, spec);
      if (resolved && !visited.has(resolved)) stack.push(resolved);
    }
  }
  return violations;
}

const LANDING_SEEDS = [
  "src/lib/shared/landing/data/shape-matrix-hero-pool.ts",
  "src/lib/shared/landing/data/hero-act.svelte.ts",
  "src/lib/shared/landing/data/per-visit-demo.ts",
];

describe("shape-matrix hero pool — firebase-free contract", () => {
  it.each(LANDING_SEEDS)("%s reaches no Firebase via static imports", (seed) => {
    expect(firebaseReach(seed)).toEqual([]);
  });

  it("the extracted transform modules are themselves firebase-free", () => {
    expect(
      firebaseReach("src/lib/shared/create/services/turn-pattern-apply.ts"),
    ).toEqual([]);
    expect(
      firebaseReach("src/lib/features/choreo-card/services/reversal-transform-apply.ts"),
    ).toEqual([]);
    expect(
      firebaseReach("src/lib/shared/shape-matrix/services/tnd-base-index.ts"),
    ).toEqual([]);
  });

  it("applyVariationDescriptor's host (deck-variation) is firebase-free", () => {
    // The whole reason for the extraction: the landing pool calls this.
    expect(
      firebaseReach("src/lib/features/choreo-card/services/deck-variation.ts"),
    ).toEqual([]);
  });
});
