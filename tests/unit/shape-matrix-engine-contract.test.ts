/**
 * Static contract test for the shape-matrix engine extraction (Phase 0 of
 * docs/superpowers/specs/2026-07-18-notation-shape-matrix-destination-design.md).
 *
 * The engine (grid, drill, realization services, flower domain) was moved out
 * of the internal, disposable `src/lib/features/lab/vtg-lab/` feature into
 * `src/lib/shared/shape-matrix/` so public marketing routes can consume it
 * without reaching into lab internals. This test locks that boundary: no file
 * under `src/routes/(public)/` may import a deep `vtg-lab` path, and the lab
 * dev harness route imports the engine from its new shared home.
 *
 * If this test fails, fix the importer — do not loosen the assertions.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const PUBLIC_ROUTES_DIR = "src/routes/(public)";
const LAB_HARNESS_ROUTE = "src/routes/test/shape-matrix/+page.svelte";
const SHAPE_MATRIX_MODULE_DIR = "src/lib/shared/shape-matrix";

const VTG_LAB_DEEP_IMPORT = /#lib\/features\/lab\/vtg-lab\//;
const FEATURES_LAB_IMPORT = /#lib\/features\/lab\//;

// Documented, deliberate exceptions (see shape-matrix/README.md "Known
// lab-side dependencies"): these two helpers drag in lab-only domain modules
// shared with other genuinely lab-only consumers, so extracting them is out
// of scope. Any OTHER `#lib/features/lab/` import inside the module is a
// violation.
const ALLOWED_LAB_IMPORT_LINES = new Set([
  'import { bakeVariationFront, bakeVariationBack } from "#lib/features/lab/vtg-lab/services/resolve-rotation-style-matrices.js";',
  'import { resolveRotationStyleMatrices } from "#lib/features/lab/vtg-lab/services/resolve-rotation-style-matrices.js";',
  'import { buildFlowerSequence } from "#lib/features/lab/vtg-lab/services/build-flower-sequence.js";',
]);

function read(rel: string): string {
  return readFileSync(path.join(repoRoot, rel), "utf8");
}

function walk(rel: string): string[] {
  const abs = path.join(repoRoot, rel);
  const entries = readdirSync(abs);
  const out: string[] = [];
  for (const entry of entries) {
    const entryRel = path.join(rel, entry);
    const entryAbs = path.join(repoRoot, entryRel);
    const st = statSync(entryAbs);
    if (st.isDirectory()) {
      out.push(...walk(entryRel));
    } else if (/\.(svelte|ts)$/.test(entry)) {
      out.push(entryRel);
    }
  }
  return out;
}

describe("shape-matrix engine contract", () => {
  it("public engine module exists at its extracted home", () => {
    expect(() => read("src/lib/shared/shape-matrix/services/shape-matrix-flowers.ts")).not.toThrow();
    expect(() => read("src/lib/shared/shape-matrix/components/ShapeMatrixGrid.svelte")).not.toThrow();
    expect(() => read("src/lib/shared/shape-matrix/domain/flower-signature.ts")).not.toThrow();
    expect(() => read("src/lib/shared/shape-matrix/domain/matrix-size-preset.ts")).not.toThrow();
  });

  it("no file under src/routes/(public)/ imports deep vtg-lab paths", () => {
    const files = walk(PUBLIC_ROUTES_DIR);
    const violations = files.filter((f) => VTG_LAB_DEEP_IMPORT.test(read(f)));
    expect(violations).toEqual([]);
  });

  it("the lab dev harness route imports the engine from its shared home", () => {
    const source = read(LAB_HARNESS_ROUTE);
    expect(source).toContain("#lib/shared/shape-matrix/services/shape-matrix-flowers.js");
    expect(source).toContain("#lib/shared/shape-matrix/components/ShapeMatrixGrid.svelte");
    expect(source).toContain("#lib/shared/shape-matrix/domain/filter-flower-axis.js");
    // The lab route legitimately still imports its own diagnostic harness
    // (ShapeMatrixDrillModal/ShapeMatrixFilters, which stayed in vtg-lab) —
    // only the moved engine symbols must no longer resolve to the old path.
    expect(source).not.toContain("#lib/features/lab/vtg-lab/services/shape-matrix-flowers");
    expect(source).not.toContain("#lib/features/lab/vtg-lab/components/ShapeMatrixGrid.svelte");
    expect(source).not.toContain("#lib/features/lab/vtg-lab/domain/filter-flower-axis");
  });

  it("src/lib/shared/shape-matrix/** has no undocumented imports from src/lib/features/lab/", () => {
    const files = walk(SHAPE_MATRIX_MODULE_DIR);
    const violations: string[] = [];
    for (const f of files) {
      const lines = read(f).split("\n");
      for (const line of lines) {
        if (FEATURES_LAB_IMPORT.test(line) && !ALLOWED_LAB_IMPORT_LINES.has(line.trim())) {
          violations.push(`${f}: ${line.trim()}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
