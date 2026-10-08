/**
 * Only the plugin's bound.ts calls the video editor's plugin-taking functions.
 *
 * The package core's createProjectSchema, createEmptyPostProject, defaultBoxFor, normalizeProject
 * and compilePostProject take the tka plugin as an argument. A file that imported them straight
 * from the package would build a core-only schema or project: no animation, moves, carousel or
 * titles kinds, none of tka's project fields, no hook migrations or motion keys on normalize, and
 * no tka kinds in the compiled preset. The render entry's evaluatePresetLayers and
 * evaluatePresetFrame take the package's FrameAlignment; a file that called them directly would
 * have to build one itself, while tka's callers pass the SequenceFrameAlignment they build today.
 * `$lib/shared/post-studio-plugin` exports the same names with the plugin already bound.
 *
 * If this fails, import the name from `$lib/shared/post-studio-plugin` instead. A whole-module
 * import (`import * as x from`, `export * from` or a dynamic `import()` of the entry) is caught
 * too, because it reaches these names without listing them.
 */
import { readdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const CORE_ENTRY = "@austencloud/video-editor/core";
const RENDER_ENTRY = "@austencloud/video-editor/render";
/** The package entries with names that only the bound file may import, and those names. */
const BOUND_ONLY: Record<string, string[]> = {
  [CORE_ENTRY]: [
    "createProjectSchema",
    "createEmptyPostProject",
    "defaultBoxFor",
    "normalizeProject",
    "compilePostProject",
  ],
  [RENDER_ENTRY]: ["evaluatePresetLayers", "evaluatePresetFrame"],
};
const BOUND_FILE = "src/lib/shared/post-studio-plugin/bound.ts";

const escapeRegExp = (text: string) =>
  text.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

/** `import { a, type b as c } from "<entry>"`, and the same with export. */
const fromEntry = (entry: string) =>
  new RegExp(
    String.raw`\b(?:import|export)\s*(?:type\s*)?\{([^}]*)\}\s*from\s*["']${escapeRegExp(entry)}["']`,
    "g"
  );

/**
 * `import * as x from "<entry>"`, `export * from` it (with or without `as`) and
 * `import("<entry>")`.
 */
const wholeEntry = (entry: string) => {
  const quoted = String.raw`["']${escapeRegExp(entry)}["']`;
  return new RegExp(
    String.raw`\bimport\s*(?:type\s+)?\*\s*as\s+[\w$]+\s*from\s*${quoted}|\bexport\s*(?:type\s+)?\*\s*(?:as\s+[\w$]+\s*)?from\s*${quoted}|\bimport\s*\(\s*${quoted}\s*\)`
  );
};

/** Whether a source file takes a whole package entry as a namespace, re-exports or loads all of it. */
function importsWholeEntry(source: string, entry: string): boolean {
  return wholeEntry(entry).test(source);
}

/** Whether a source file takes the whole package core that way. */
function importsWholeCore(source: string): boolean {
  return importsWholeEntry(source, CORE_ENTRY);
}

/** The bound-only names a source file imports from one package entry (the core by default). */
function boundNamesIn(source: string, entry: string = CORE_ENTRY): string[] {
  const found = new Set<string>();
  for (const match of source.matchAll(fromEntry(entry))) {
    for (const part of match[1].split(",")) {
      const name = part
        .trim()
        .replace(/^type\s+/, "")
        .split(/\s+as\s+/)[0]
        .trim();
      if (BOUND_ONLY[entry]?.includes(name)) found.add(name);
    }
  }
  return [...found].sort();
}

/** Each bound-only import in a source file as `<entry> <names>`, a whole-entry import as `<entry> (whole module)`. */
function boundImportsIn(source: string): string[] {
  const found: string[] = [];
  for (const entry of Object.keys(BOUND_ONLY)) {
    const names = boundNamesIn(source, entry);
    if (names.length > 0) found.push(`${entry} ${names.join(", ")}`);
    if (importsWholeEntry(source, entry)) found.push(`${entry} (whole module)`);
  }
  return found;
}

/** Every .ts and .svelte file under src/, with forward slashes. */
function sources(): string[] {
  return readdirSync("src", { recursive: true, withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() &&
        (entry.name.endsWith(".ts") || entry.name.endsWith(".svelte"))
    )
    .map((entry) => `${entry.parentPath}/${entry.name}`.split("\\").join("/"));
}

/** One line per bound-only import in the given files, `<path>: <entry> <names>`, read through a bounded pool. */
async function bindersAmong(paths: string[]): Promise<string[]> {
  const hits: string[] = [];
  let cursor = 0;
  const worker = async () => {
    while (cursor < paths.length) {
      const path = paths[cursor++];
      const source = await readFile(path, "utf8");
      for (const found of boundImportsIn(source))
        hits.push(`${path}: ${found}`);
    }
  };
  await Promise.all(Array.from({ length: 32 }, worker));
  return hits.sort();
}

describe("bound-only video editor functions", () => {
  it("finds the names in imports and re-exports, with type, as and line breaks", () => {
    expect(
      boundNamesIn(
        'import { createProjectSchema, type PostItem } from "@austencloud/video-editor/core";'
      )
    ).toEqual(["createProjectSchema"]);
    expect(
      boundNamesIn(
        'import {\n  defaultBoxFor as box,\n  createEmptyPostProject,\n} from "@austencloud/video-editor/core";'
      )
    ).toEqual(["createEmptyPostProject", "defaultBoxFor"]);
    expect(
      boundNamesIn(
        'export { createProjectSchema } from "@austencloud/video-editor/core";'
      )
    ).toEqual(["createProjectSchema"]);
  });

  it("finds the render entry's bound names and reports the entry with them", () => {
    const render =
      'import { evaluatePresetLayers, type EvaluatedFrameLayer } from "@austencloud/video-editor/render";';
    expect(boundNamesIn(render, RENDER_ENTRY)).toEqual([
      "evaluatePresetLayers",
    ]);
    expect(boundImportsIn(render)).toEqual([
      "@austencloud/video-editor/render evaluatePresetLayers",
    ]);
    expect(
      boundImportsIn(
        'import { evaluatePresetFrame as frame } from "@austencloud/video-editor/render";'
      )
    ).toEqual(["@austencloud/video-editor/render evaluatePresetFrame"]);
    expect(
      boundImportsIn(
        'import * as render from "@austencloud/video-editor/render";'
      )
    ).toEqual(["@austencloud/video-editor/render (whole module)"]);
  });

  it("ignores other names, other modules and the plugin's own exports", () => {
    expect(
      boundNamesIn(
        'import { formatTimecode, type PostProject } from "@austencloud/video-editor/core";'
      )
    ).toEqual([]);
    expect(
      boundNamesIn(
        'import { createProjectSchema } from "$lib/shared/post-studio-plugin";'
      )
    ).toEqual([]);
    expect(
      boundNamesIn(
        'import { createProjectSchema } from "@austencloud/video-editor/render";'
      )
    ).toEqual([]);
    expect(
      boundImportsIn(
        'import { createProjectSchema } from "@austencloud/video-editor/render";'
      )
    ).toEqual([]);
    expect(
      boundImportsIn(
        'import { evaluatePresetLayers } from "@austencloud/video-editor/core";'
      )
    ).toEqual([]);
    expect(
      boundImportsIn(
        'import { evaluatePresetLayers } from "$lib/shared/post-studio-plugin";'
      )
    ).toEqual([]);
  });

  it("finds a namespace import, a star re-export and a dynamic import of the core, and nothing else", () => {
    expect(
      importsWholeCore(
        'import * as core from "@austencloud/video-editor/core";'
      )
    ).toBe(true);
    expect(
      importsWholeCore(
        'import * as $core from "@austencloud/video-editor/core";'
      )
    ).toBe(true);
    expect(
      importsWholeCore('export * from "@austencloud/video-editor/core";')
    ).toBe(true);
    expect(
      importsWholeCore('export * as ns from "@austencloud/video-editor/core";')
    ).toBe(true);
    expect(
      importsWholeCore(
        'const core = await import("@austencloud/video-editor/core");'
      )
    ).toBe(true);
    expect(
      importsWholeCore(
        'import * as x from "@austencloud/video-editor/core/deep";'
      )
    ).toBe(false);
    for (const nearMiss of [
      "@austencloud/video-editor/render/deep",
      "@austencloud/video-editor/renderX",
    ]) {
      expect(
        boundNamesIn(
          `import { evaluatePresetLayers } from "${nearMiss}";`,
          RENDER_ENTRY
        )
      ).toEqual([]);
      expect(
        importsWholeEntry(`import * as x from "${nearMiss}";`, RENDER_ENTRY)
      ).toBe(false);
    }
    expect(
      importsWholeCore('import * as x from "$lib/shared/post-studio-plugin";')
    ).toBe(false);
    expect(
      importsWholeCore(
        'import { formatTimecode } from "@austencloud/video-editor/core";'
      )
    ).toBe(false);
  });

  it("only bound.ts imports them from the package entries", async () => {
    const paths = sources();
    expect(paths.length).toBeGreaterThan(1000);
    expect(paths).toContain(BOUND_FILE);
    const binders = await bindersAmong(paths);
    // A line from any other file names the file, the entry and the name.
    expect(
      binders.filter((line) => !line.startsWith(`${BOUND_FILE}: `))
    ).toEqual([]);
    // bound.ts binds the names of both entries, so the walk is seeing them.
    expect(binders.map((line) => line.split(": ")[1].split(" ")[0])).toEqual([
      CORE_ENTRY,
      RENDER_ENTRY,
    ]);
  });
});
