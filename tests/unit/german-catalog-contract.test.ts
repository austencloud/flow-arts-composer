import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import ts from "typescript";
import { parse } from "svelte/compiler";
import en from "../../messages/en.json";
import de from "../../messages/de.json";

const english = en as Record<string, string>;
const german = de as Record<string, string>;

function importedNames(program: ts.SourceFile): Set<string> {
  const names = new Set<string>();
  for (const statement of program.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    if (!statement.moduleSpecifier.text.includes("/i18n/")) continue;
    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    for (const specifier of bindings.elements) {
      if (["t", "tDynamic"].includes(specifier.propertyName?.text ?? specifier.name.text)) {
        names.add(specifier.name.text);
      }
    }
  }
  return names;
}

function typescriptCalls(source: string, file: string): { keys: string[]; names: Set<string> } {
  const program = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const names = importedNames(program);
  const keys: string[] = [];
  function staticKeys(node: ts.Expression): string[] {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return [node.text];
    if (ts.isConditionalExpression(node)) {
      return [...staticKeys(node.whenTrue), ...staticKeys(node.whenFalse)];
    }
    if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node)) {
      return staticKeys(node.expression);
    }
    return [];
  }
  function visit(node: ts.Node): void {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && names.has(node.expression.text)) {
      const first = node.arguments[0];
      if (first) keys.push(...staticKeys(first));
    }
    ts.forEachChild(node, visit);
  }
  visit(program);
  return { keys, names };
}

type SyntaxNode = { type?: string; [property: string]: unknown };

function svelteCalls(source: string, file: string): string[] {
  let ast: SyntaxNode;
  try {
    ast = parse(source, { modern: true }) as SyntaxNode;
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("has already been declared")) {
      throw error;
    }
    // Four existing Svelte files have duplicate imported identifiers and cannot
    // be parsed. Parse their scripts as TypeScript and scan markup expressions.
    const scripts = [...source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)];
    const keys: string[] = [];
    const names = new Set<string>();
    for (const script of scripts) {
      const found = typescriptCalls(script[1]!, file);
      keys.push(...found.keys);
      found.names.forEach((name) => names.add(name));
    }
    const markup = source
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, "")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/g, "")
      .replace(/<!--[\s\S]*?-->/g, "");
    for (const name of names) {
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      for (const match of markup.matchAll(new RegExp(`\\b${escaped}\\(\\s*['\"]([^'\"]+)['\"]`, "g"))) {
        keys.push(match[1]!);
      }
    }
    return keys;
  }

  const names = new Set<string>();
  for (const script of [ast.instance, ast.module] as SyntaxNode[]) {
    const body = (script?.content as SyntaxNode | undefined)?.body as SyntaxNode[] | undefined;
    for (const statement of body ?? []) {
      if (statement.type !== "ImportDeclaration") continue;
      const sourceValue = (statement.source as { value?: string } | undefined)?.value;
      if (!sourceValue?.includes("/i18n/")) continue;
      for (const specifier of (statement.specifiers as SyntaxNode[] | undefined) ?? []) {
        const imported = (specifier.imported as { name?: string } | undefined)?.name;
        if (imported === "t" || imported === "tDynamic") {
          const local = (specifier.local as { name?: string } | undefined)?.name;
          if (local) names.add(local);
        }
      }
    }
  }

  const keys: string[] = [];
  function staticKeys(node: SyntaxNode | undefined): string[] {
    if (!node) return [];
    if (node.type === "Literal" && typeof node.value === "string") return [node.value];
    if (node.type === "TemplateLiteral" && ((node.expressions as unknown[] | undefined)?.length ?? 0) === 0) {
      const quasi = (node.quasis as SyntaxNode[] | undefined)?.[0];
      const value = quasi?.value as { cooked?: string; raw?: string } | undefined;
      return value?.cooked === undefined ? [] : [value.cooked];
    }
    if (node.type === "ConditionalExpression") {
      return [
        ...staticKeys(node.consequent as SyntaxNode | undefined),
        ...staticKeys(node.alternate as SyntaxNode | undefined),
      ];
    }
    if (node.type === "ParenthesizedExpression" || node.type === "TSAsExpression") {
      return staticKeys(node.expression as SyntaxNode | undefined);
    }
    return [];
  }
  function visit(value: unknown): void {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    const node = value as SyntaxNode;
    if (node.type === "CallExpression") {
      const callee = node.callee as { type?: string; name?: string } | undefined;
      const first = (node.arguments as SyntaxNode[] | undefined)?.[0];
      if (callee?.type === "Identifier" && names.has(callee.name ?? "")) keys.push(...staticKeys(first));
    }
    Object.values(node).forEach(visit);
  }
  visit(ast);
  return keys;
}
const roots = [
  "src/lib/features/create",
  "src/lib/features/browse",
  "src/lib/features/creators",
  "src/lib/features/settings",
  "src/lib/features/feedback",
  "src/lib/features/learn",
  "src/lib/shared",
  "src/routes/(public)/guide",
];

describe("German translation contracts", () => {
  it("ignores documentation examples and recognizes imported translation aliases", () => {
    const script = `
      import { t as translate } from "$lib/shared/i18n/i18n.svelte.js";
      /** Example only: t("invalid_key") */
      const label = translate("real_key");
      const quoted = 't("also_invalid")';
    `;
    expect(typescriptCalls(script, "example.ts").keys).toEqual(["real_key"]);
    expect(svelteCalls(`<script lang="ts">${script}</script><p>{translate("markup_key")}</p>`, "example.svelte").sort())
      .toEqual(["markup_key", "real_key"]);
  });

  it("collects static ternary branches and plain template keys without treating conditions as keys", () => {
    const script = [
      'import { t as translate } from "$lib/shared/i18n/i18n.svelte.js";',
      'const one = translate(count === "comparison_only" ? "key_one" : "key_many");',
      'const two = translate(`plain_template`);',
      'const three = translate(flag ? `first_branch` : nested ? "second_branch" : `third_branch`);',
      'const dynamic = translate(`prefix_${id}`);',
    ].join("\n");
    const expected = ["key_one", "key_many", "plain_template", "first_branch", "second_branch", "third_branch"];
    expect(typescriptCalls(script, "example.ts").keys).toEqual(expected);
    const markup = '<p>{translate(count === "markup_comparison_only" ? `markup_one` : "markup_many")}</p>';
    expect(svelteCalls(`<script lang="ts">${script}</script>${markup}`, "example.svelte").sort())
      .toEqual([...expected, "markup_one", "markup_many"].sort());
  });

  it("does not silently fall back to English for literal translation calls in audited surfaces", () => {
    const missing = new Set<string>();
    for (const root of roots) {
      for (const file of readdirSync(root, { recursive: true }) as string[]) {
        if (!/\.(svelte|ts)$/.test(file) || /\.(test|spec)\./.test(file)) continue;
        const fullPath = path.join(root, file);
        const source = readFileSync(fullPath, "utf8");
        // Literal calls are syntax nodes, so examples in comments and strings
        // cannot masquerade as UI lookups. Dynamic registries have their own test.
        const keys = file.endsWith(".svelte")
          ? svelteCalls(source, fullPath)
          : typescriptCalls(source, fullPath).keys;
        for (const key of keys) {
          if (!english[key] || !german[key] || german[key] === key) {
            missing.add(`${fullPath}: ${key}`);
          }
        }
      }
    }
    expect([...missing]).toEqual([]);
  }, 90_000);

  it("preserves interpolation parameters throughout the German catalog", () => {
    const parameters = (text: string) => [...new Set([...text.matchAll(/\{(\w+)\}/g)].map(m => m[1]))].sort();
    const mismatches = Object.entries(german)
      .filter(([key, value]) => english[key] && JSON.stringify(parameters(value)) !== JSON.stringify(parameters(english[key]!)))
      .map(([key]) => key);
    expect(mismatches).toEqual([]);
  });

  it("translates boot checkpoints before the main locale bundle loads", () => {
    const html = readFileSync("src/app.html", "utf8");
    const dictionary = html.match(/var __tkaBootGerman = (\{[\s\S]*?\n\s*\});/);
    expect(dictionary).not.toBeNull();
    const boot = Function(`return (${dictionary![1]})`)() as Record<string, string>;
    const source = readFileSync("src/lib/shared/application/components/MainApplication.svelte", "utf8");
    const messages = [english.app_loading_services!, ...[...source.matchAll(/__tkaLoadProgress\?\.\(\d+, "([^"]+)"\)/g)].map(m => m[1]!)];
    for (const message of messages) {
      expect(boot[message], message).toBeTruthy();
      expect(boot[message], message).not.toBe(message);
    }
  });
});
