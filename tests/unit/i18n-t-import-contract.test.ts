/**
 * Every component that calls t() imports it.
 *
 * The German translation pass (2026-09-25) swapped hard-coded strings for t()
 * in 367 components and left the import out of three: the Save to Library
 * panel and dialog and the Your Work rail. Each threw "t is not defined" as
 * soon as it rendered. Nothing caught it: the Svelte compiler treats an unknown
 * name as a global, and `npm run check` has not seen components since they
 * passed TypeScript's 20 MB cap (see tsconfig.check-full.json).
 *
 * If this fails, add the import to the component; do not loosen the check.
 */
import { readdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

/** A bare `t(` call: not `i18n.t(`, `$t(`, `format(` or `items.at(`. */
const CALLS_T = /(^|[^.\w$])t\(/m;
/** `import { t }`, `import { getLocale, t }`, `import { translate as t }`. */
const IMPORTS_T = /import\s*\{[^}]*\bt\b[^}]*\}\s*from/;

function callsTWithoutImport(source: string): boolean {
  return CALLS_T.test(source) && !IMPORTS_T.test(source);
}

/**
 * Every component under src/, with forward slashes. `withFileTypes` skips the
 * screenshot directories named after test files; see
 * share-intake-host-contract.test.ts.
 */
function components(): string[] {
  return readdirSync("src", { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".svelte"))
    .map((entry) => `${entry.parentPath}/${entry.name}`.split("\\").join("/"));
}

/**
 * The paths whose contents pass `test`, read through a bounded pool so ~3,000
 * files stay well inside the timeout in the suite's single fork.
 */
async function filesMatching(
  paths: string[],
  test: (source: string) => boolean
): Promise<string[]> {
  const hits: string[] = [];
  let cursor = 0;
  const worker = async () => {
    while (cursor < paths.length) {
      const path = paths[cursor++];
      if (test(await readFile(path, "utf8"))) hits.push(path);
    }
  };
  await Promise.all(Array.from({ length: 32 }, worker));
  return hits.sort();
}

describe("t() imports", () => {
  it("flags a bare t() call with no import, and nothing else", () => {
    expect(callsTWithoutImport('<h2>{t("browse_ui_you")}</h2>')).toBe(true);
    expect(
      callsTWithoutImport(
        'import { t } from "#lib/shared/i18n/i18n.svelte.js";\n<h2>{t("x")}</h2>'
      )
    ).toBe(false);
    expect(
      callsTWithoutImport(
        'import { getLocale, t } from "#lib/shared/i18n/i18n.svelte.js";\n{t("x")}'
      )
    ).toBe(false);
    expect(
      callsTWithoutImport('{format(x)} {items.at(1)} {i18n.t("x")} {$t("x")}')
    ).toBe(false);
  });

  it("every component that calls t() imports it", async () => {
    const paths = components();
    expect(paths.length).toBeGreaterThan(1000);
    expect(await filesMatching(paths, callsTWithoutImport)).toEqual([]);
  });
});
