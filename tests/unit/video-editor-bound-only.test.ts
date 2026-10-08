/**
 * Only the plugin's bound.ts calls the video editor's plugin-taking functions.
 *
 * The package's createProjectSchema, createEmptyPostProject and defaultBoxFor take the tka plugin
 * as an argument. A file that imported them straight from the package would build a core-only
 * schema or project: no animation, moves, carousel or titles kinds, and none of tka's project
 * fields. `$lib/shared/post-studio-plugin` exports the same names with the plugin already bound.
 *
 * If this fails, import the name from `$lib/shared/post-studio-plugin` instead.
 */
import { readdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

// Tasks 7 and 8 append normalizeProject and compilePostProject, which also take the plugin.
const BOUND_ONLY = [
  "createProjectSchema",
  "createEmptyPostProject",
  "defaultBoxFor",
];
const BOUND_FILE = "src/lib/shared/post-studio-plugin/bound.ts";

/** `import { a, type b as c } from "@austencloud/video-editor/core"`, and the same with export. */
const FROM_CORE =
  /\b(?:import|export)\s*(?:type\s*)?\{([^}]*)\}\s*from\s*["']@austencloud\/video-editor\/core["']/g;

/** The bound-only names a source file imports from the package core. */
function boundNamesIn(source: string): string[] {
  const found = new Set<string>();
  for (const match of source.matchAll(FROM_CORE)) {
    for (const part of match[1].split(",")) {
      const name = part
        .trim()
        .replace(/^type\s+/, "")
        .split(/\s+as\s+/)[0]
        .trim();
      if (BOUND_ONLY.includes(name)) found.add(name);
    }
  }
  return [...found].sort();
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

/** The paths whose contents bind a bound-only name, read through a bounded pool. */
async function bindersAmong(paths: string[]): Promise<string[]> {
  const hits: string[] = [];
  let cursor = 0;
  const worker = async () => {
    while (cursor < paths.length) {
      const path = paths[cursor++];
      const source = await readFile(path, "utf8");
      if (boundNamesIn(source).length > 0) hits.push(path);
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
  });

  it("only bound.ts imports them from the package core", async () => {
    const paths = sources();
    expect(paths.length).toBeGreaterThan(1000);
    expect(paths).toContain(BOUND_FILE);
    expect(await bindersAmong(paths)).toEqual([BOUND_FILE]);
  });
});
