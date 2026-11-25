import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

import { AABB_CW } from "#lib/shared/combination/domain/demo-fixtures.js";

/**
 * Austen, 2026-11-24: AAAA cannot be done in the wall plane with normal-length
 * staffs (the arms pass through each other), and test pages kept opening on it.
 * Test and lab pages open on AABB, or on DJII for tunnel work.
 *
 * `lab-goals.ts` is the one allowed mention: it is the deck's roster of the 19
 * core TnD words (a data contract with the seeder), not a page default, and the
 * staff-grip lab opens on FALG.
 */
const ROUTES_TEST = join(process.cwd(), "src", "routes", "test");
const ALLOWED = new Set(["staff-grip/lab-goals.ts"]);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(svelte|ts)$/.test(name) ? [full] : [];
  });
}

describe("test pages never default to AAAA", () => {
  it("no file under src/routes/test names AAAA, apart from the goal roster", () => {
    const offenders = sourceFiles(ROUTES_TEST)
      .map((file) => relative(ROUTES_TEST, file).replaceAll("\\", "/"))
      .filter((rel) => !ALLOWED.has(rel))
      .filter((rel) =>
        /AAAA/.test(readFileSync(join(ROUTES_TEST, rel), "utf8"))
      );
    expect(offenders).toEqual([]);
  });

  it("the character playground opens on the AABB fixture", () => {
    const source = readFileSync(
      join(ROUTES_TEST, "character-playground", "CharacterPlayground.svelte"),
      "utf8"
    );
    expect(source).toContain("const initialSequence = AABB_CW;");
    expect(AABB_CW.word).toBe("AABB");
  });
});
