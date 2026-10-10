/**
 * Static contract test for public-collection count normalization.
 *
 * public-collection-loader is the only door foreign collections enter the app
 * through, and it normalizes `sequenceCount` to PUBLIC members before anything
 * escapes (see the module invariant in
 * src/lib/features/library/services/public-collection-loader.ts and
 * docs/superpowers/specs/2026-07-10-public-collection-count-normalization-design.md).
 *
 * Before this, correctness was opt-in: each surface patched the count itself,
 * and three surfaces drifted (community cards, foreign detail header, followed
 * rail — "4 sequences" over a 1-sequence grid). This test locks the fix at the
 * source level. If it fails, fix the offending file — do not loosen it.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.."
);
const LOADER = "src/lib/features/library/services/public-collection-loader.ts";

function read(rel: string): string {
  return readFileSync(path.join(repoRoot, rel), "utf8");
}

function walk(dir: string, out: string[] = []): string[] {
  // withFileTypes, not a statSync per entry: the census covers ~8,000 files and
  // the extra syscall each is pure overhead.
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules") continue;
      walk(full, out);
    } else if (/\.(ts|svelte)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

/**
 * The subset of `paths` whose contents contain `needle`, read through a bounded
 * pool of concurrent reads.
 *
 * Serial readFileSync over the whole src census costs 7.5s on a warm cache, and
 * behind 1,800 other files in the suite's single fork this test measured
 * 29.6s against a 30s timeout — a flake waiting to happen. Overlapping the I/O
 * keeps the same file set and the same string check well inside the budget.
 */
async function filesContaining(
  paths: string[],
  needle: string
): Promise<string[]> {
  const hits: string[] = [];
  let cursor = 0;
  const worker = async () => {
    while (cursor < paths.length) {
      const file = paths[cursor++];
      if ((await readFile(file, "utf8")).includes(needle)) hits.push(file);
    }
  };
  await Promise.all(Array.from({ length: 32 }, worker));
  return hits.sort();
}

describe("public-collection count normalization contract", () => {
  it("keeps countPublicMembers module-private to the loader", () => {
    const loader = read(LOADER);
    expect(loader).toMatch(/async function countPublicMembers/);
    expect(loader).not.toMatch(
      /export\s+(async\s+)?function countPublicMembers/
    );
  });

  // The census itself is cheap: 1.4 s for the ~8,000-file walk and pooled read
  // in a three-file run on 2026-10-10. The full suite is what slows it: with 31
  // forks all reading source trees at once, the same test took 30,107 ms on
  // 2026-10-09 and timed out against the 30 s default by a tenth of a second.
  // The reads are already overlapped (filesContaining above), so no serial I/O
  // is left to remove; the test gets the 120 s budget tests/unit/3d-animation
  // gives a loaded machine instead.
  it("no file outside the loader references countPublicMembers", async () => {
    const srcRoot = path.join(repoRoot, "src");
    const loaderAbs = path.join(repoRoot, LOADER);
    const candidates = walk(srcRoot).filter((f) => f !== loaderAbs);
    const offenders = (
      await filesContaining(candidates, "countPublicMembers")
    ).map((f) => path.relative(repoRoot, f));

    // A consumer counting for itself means normalization moved back out of
    // the loader — the exact opt-in drift this contract forbids.
    expect(offenders).toEqual([]);
  }, 120_000);

  it("every public-facing getter routes through toPublicView", () => {
    const loader = read(LOADER);
    for (const getter of [
      "getUserPublicCollections",
      "getAllPublicCollections",
      "getPublicCollection",
    ]) {
      const start = loader.indexOf(`export async function ${getter}`);
      expect(start, `${getter} missing from loader`).toBeGreaterThan(-1);
      const body = loader.slice(start, loader.indexOf("\n}", start));
      expect(body, `${getter} must normalize via toPublicView`).toContain(
        "toPublicView"
      );
    }
  });

  it("every public-facing subscription routes through toPublicView", () => {
    const loader = read(LOADER);
    for (const [subscription, normalizer] of [
      ["subscribeToAllPublicCollections", "mapPublicCollectionDoc"],
      ["subscribeToPublicCollection", "toPublicView"],
    ] as const) {
      const start = loader.indexOf(`export function ${subscription}`);
      expect(start, `${subscription} missing from loader`).toBeGreaterThan(-1);
      const nextExport = loader.indexOf("\nexport ", start + 1);
      const body = loader.slice(
        start,
        nextExport === -1 ? loader.length : nextExport
      );
      expect(body, `${subscription} must normalize public counts`).toContain(
        normalizer
      );
    }
  });
});
