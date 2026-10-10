/**
 * Nothing that the plugin's bound.ts or surfaces.ts reaches by value may import the plugin index.
 *
 * bound.ts builds the tka plugin as it loads: bound -> create-plugin -> item-kinds,
 * normalize-hooks and everything they import. surfaces.ts builds the DOM surfaces from its own
 * imports. The plugin index re-exports both files, so a value import of the index anywhere in
 * either closure closes a load-time cycle (index -> bound -> create-plugin -> ... -> index, or
 * index -> surfaces -> ... -> index), and whichever module loads second reads `undefined` exports.
 *
 * Type-only imports are erased, so they are fine. If this fails, import the value from the
 * plugin file that declares it (`$lib/shared/post-studio-plugin/item-kinds`,
 * `.../project-extension`) instead of the index.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const BOUND_FILE = "src/lib/shared/post-studio-plugin/bound.ts";
const INDEX_FILE = "src/lib/shared/post-studio-plugin/index.ts";

interface ValueEdge {
  specifier: string;
  line: number;
}

/** Whether every member of a named import or export list is marked `type` (and there is one). */
function allMembersType(
  elements: ts.NodeArray<ts.ImportSpecifier | ts.ExportSpecifier>
): boolean {
  return elements.length > 0 && elements.every((element) => element.isTypeOnly);
}

/** Whether an import declaration is erased entirely at runtime. */
function importIsTypeOnly(node: ts.ImportDeclaration): boolean {
  const clause = node.importClause;
  if (!clause) return false; // a side-effect import
  if (clause.isTypeOnly) return true;
  if (clause.name) return false; // a default import
  const bindings = clause.namedBindings;
  return (
    bindings !== undefined &&
    ts.isNamedImports(bindings) &&
    allMembersType(bindings.elements)
  );
}

/** Whether an `export ... from` declaration is erased entirely at runtime. */
function exportIsTypeOnly(node: ts.ExportDeclaration): boolean {
  if (node.isTypeOnly) return true;
  const clause = node.exportClause;
  return (
    clause !== undefined &&
    ts.isNamedExports(clause) &&
    allMembersType(clause.elements)
  );
}

/**
 * The value edges of a source file: every import and `export ... from` that is not entirely
 * type-only (an `export *` is always a value edge), and every dynamic `import("...")`.
 */
function valueEdges(source: string, fileName = "source.ts"): ValueEdge[] {
  const file = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
  const edges: ValueEdge[] = [];
  const add = (node: ts.Node, specifier: string) =>
    edges.push({
      specifier,
      line: file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1,
    });
  const visit = (node: ts.Node) => {
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      !importIsTypeOnly(node)
    ) {
      add(node, node.moduleSpecifier.text);
    } else if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier !== undefined &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      !exportIsTypeOnly(node)
    ) {
      add(node, node.moduleSpecifier.text);
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length > 0 &&
      ts.isStringLiteralLike(node.arguments[0])
    ) {
      add(node, node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return edges;
}

/**
 * The repo file a specifier names, with forward slashes, or null for a specifier that is not
 * `$lib/` or relative (packages, `$app`). An unresolvable `$lib/` or relative specifier throws.
 */
function resolveSpecifier(specifier: string, from: string): string | null {
  const bare = specifier.split("?")[0];
  let base: string;
  if (bare.startsWith("$lib/")) base = `src/lib/${bare.slice("$lib/".length)}`;
  else if (bare === "." || bare.startsWith("./") || bare.startsWith("../"))
    base = path.posix.join(path.posix.dirname(from), bare);
  else return null;
  const stem = base.replace(/\.js$/, "");
  const candidates = [
    base,
    `${stem}.ts`,
    `${base}.ts`,
    `${base}.svelte.ts`,
    `${base}.js`,
    `${base}/index.ts`,
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  throw new Error(`${from}: cannot resolve "${specifier}"`);
}

/** Walks value edges from bound.ts and surfaces.ts; the index is recorded when reached, never walked into. */
function valueClosure(): { modules: string[]; indexImports: string[] } {
  const seen = new Set<string>();
  const indexImports: string[] = [];
  const queue = [BOUND_FILE, "src/lib/shared/post-studio-plugin/surfaces.ts"];
  while (queue.length > 0) {
    const file = queue.shift()!;
    if (seen.has(file)) continue;
    seen.add(file);
    for (const edge of valueEdges(readFileSync(file, "utf8"), file)) {
      const target = resolveSpecifier(edge.specifier, file);
      if (target === null) continue;
      if (target === INDEX_FILE) {
        indexImports.push(`${file}:${edge.line} "${edge.specifier}"`);
        continue;
      }
      if (!target.endsWith(".svelte")) queue.push(target);
    }
  }
  return { modules: [...seen].sort(), indexImports };
}

describe("plugin bound.ts and surfaces.ts value closure", () => {
  it("treats a mixed declaration as a value edge and an all-type one as none", () => {
    expect(valueEdges('import { a, type B } from "./x";')).toEqual([
      { specifier: "./x", line: 1 },
    ]);
    expect(valueEdges('import type { A } from "./x";')).toEqual([]);
    expect(valueEdges('import { type A, type B } from "./x";')).toEqual([]);
    expect(valueEdges('export type { A } from "./x";')).toEqual([]);
  });

  it("treats export star, side-effect and dynamic imports as value edges", () => {
    expect(valueEdges('export * from "./x";')).toEqual([
      { specifier: "./x", line: 1 },
    ]);
    expect(valueEdges('import "./x";')).toEqual([
      { specifier: "./x", line: 1 },
    ]);
    expect(
      valueEdges('const load = () => import("$lib/x");\nexport { load };')
    ).toEqual([{ specifier: "$lib/x", line: 1 }]);
  });

  it("resolves every spelling of the plugin index to index.ts", () => {
    const inside = "src/lib/shared/post-studio-plugin/item-kinds.ts";
    for (const specifier of [".", "./index", "./index.js"]) {
      expect(resolveSpecifier(specifier, inside)).toBe(INDEX_FILE);
    }
    for (const specifier of [
      "$lib/shared/post-studio-plugin",
      "$lib/shared/post-studio-plugin/index",
    ]) {
      expect(resolveSpecifier(specifier, BOUND_FILE)).toBe(INDEX_FILE);
    }
    expect(resolveSpecifier("@austencloud/video-editor/core", BOUND_FILE)).toBe(
      null
    );
  });

  it("never reaches the plugin index by value from bound.ts or surfaces.ts", () => {
    const { modules, indexImports } = valueClosure();
    expect(modules.length).toBeGreaterThan(10);
    for (const name of [
      "alignment.ts",
      "create-plugin.ts",
      "item-kinds.ts",
      "normalize-hooks.ts",
      "surfaces.ts",
    ]) {
      expect(modules).toContain(`src/lib/shared/post-studio-plugin/${name}`);
    }
    expect(indexImports).toEqual([]);
  });
});
