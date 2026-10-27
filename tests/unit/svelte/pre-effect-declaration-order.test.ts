/**
 * A top-level `$effect.pre` must not touch a script binding declared further
 * down the same component.
 *
 * Svelte 5 runs a pre-effect's first pass synchronously while the component's
 * `<script>` is still executing, in source order with the rest of setup. A
 * `let`/`const` declared below the effect is still in its temporal dead zone
 * at that moment, so reading or assigning it throws
 * "Cannot access 'x' before initialization". Production minifies the name
 * (2026-10-22: `z` in ShapeMatrixAppShell, whose focus-motion effect read the
 * `focusMode` derived declared below it, crashed the Create tab on a
 * client-side navigation). Type checks cannot see it, and a branch that skips
 * the read on mount only hides it until some later edit makes the branch run.
 *
 * So the rule is positional, not about what the first run happens to reach:
 * every top-level `let`/`const` (state, raw state, derived, props, plain
 * values) that a pre-effect's callback reads or writes is declared above it.
 * The scan parses each instance script with the Svelte compiler and resolves
 * scopes, so a parameter or local inside the effect that shares a name with a
 * later top-level binding is not a hit. It also follows the top-level
 * functions the effect calls, since a hoisted function that touches a later
 * binding throws just the same when the effect calls it. A callback handed to
 * a scheduler (`setTimeout`, `queueMicrotask`, `addEventListener`, a promise's
 * `then`, and the like) runs after setup has finished, so its body is not
 * scanned; naming a later binding as that callback still counts, because the
 * name itself is read on the spot.
 *
 * This is the only owner of the rule. The Shape Engine fix (2026-10-22) first
 * shipped with a directory-scoped copy of this check; it was retired once this
 * repository-wide guard reached main.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { parse } from "svelte/compiler";

// The compiler's ESTree output, kept loose: the scan only needs node shapes.
type Node = { type: string; start: number; end: number } & Record<
  string,
  unknown
>;

const isNode = (value: unknown): value is Node =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as { type?: unknown }).type === "string";

const FUNCTION_TYPES = new Set([
  "ArrowFunctionExpression",
  "FunctionExpression",
  "FunctionDeclaration",
]);

// Type-only syntax carries no runtime reads. These TS wrappers do hold one.
const TS_EXPRESSION_WRAPPERS = new Set([
  "TSAsExpression",
  "TSSatisfiesExpression",
  "TSNonNullExpression",
  "TSTypeAssertion",
  "TSInstantiationExpression",
]);

const SKIPPED_KEYS = new Set([
  "type",
  "start",
  "end",
  "loc",
  "range",
  "leadingComments",
  "trailingComments",
  "typeAnnotation",
  "returnType",
  "typeParameters",
  "typeArguments",
  "metadata",
]);

/** Names a binding pattern introduces (`a`, `{ a, b: c }`, `[d, ...e]`, `f = 1`). */
function patternNames(pattern: unknown, into: string[] = []): string[] {
  if (!isNode(pattern)) return into;
  switch (pattern.type) {
    case "Identifier":
      into.push(pattern.name as string);
      break;
    case "ObjectPattern":
      for (const property of pattern.properties as Node[]) {
        patternNames(
          property.type === "RestElement" ? property.argument : property.value,
          into
        );
      }
      break;
    case "ArrayPattern":
      for (const element of pattern.elements as unknown[]) {
        patternNames(element, into);
      }
      break;
    case "RestElement":
      patternNames(pattern.argument, into);
      break;
    case "AssignmentPattern":
      patternNames(pattern.left, into);
      break;
    case "TSParameterProperty":
      patternNames(pattern.parameter, into);
      break;
  }
  return into;
}

/** `let`/`const`/class/function names a block or program body declares directly. */
function blockDeclarations(statements: unknown[]): string[] {
  const names: string[] = [];
  for (const statement of statements) {
    if (!isNode(statement)) continue;
    const declaration =
      statement.type === "ExportNamedDeclaration" &&
      isNode(statement.declaration)
        ? statement.declaration
        : statement;
    if (declaration.type === "VariableDeclaration") {
      for (const declarator of declaration.declarations as Node[]) {
        patternNames(declarator.id, names);
      }
    } else if (
      (declaration.type === "FunctionDeclaration" ||
        declaration.type === "ClassDeclaration") &&
      isNode(declaration.id)
    ) {
      names.push(declaration.id.name as string);
    }
  }
  return names;
}

/** `var` names hoisted to a function body, not crossing nested functions. */
function hoistedVars(node: unknown, into: string[] = []): string[] {
  if (!isNode(node)) return into;
  if (FUNCTION_TYPES.has(node.type)) return into;
  if (node.type === "VariableDeclaration" && node.kind === "var") {
    for (const declarator of node.declarations as Node[]) {
      patternNames(declarator.id, into);
    }
  }
  for (const [key, value] of Object.entries(node)) {
    if (SKIPPED_KEYS.has(key)) continue;
    if (Array.isArray(value))
      value.forEach((child) => hoistedVars(child, into));
    else hoistedVars(value, into);
  }
  return into;
}

// Work handed to these runs after the component's setup has finished, so a
// callback passed to one cannot reach a binding's TDZ.
const DEFERRING_SCHEDULERS = new Set([
  "setTimeout",
  "setInterval",
  "queueMicrotask",
  "requestAnimationFrame",
  "requestIdleCallback",
  "addEventListener",
  "then",
  "catch",
  "finally",
]);

type Reference = { name: string; at: number; deferred: boolean };

/**
 * Free identifiers a node reads or writes, with the position of each use.
 * Anything declared inside the node (parameters, locals, catch bindings,
 * loop variables) shadows the outer name for its whole scope.
 */
function freeReferences(root: Node): Reference[] {
  const found: Reference[] = [];
  const scopes: Set<string>[] = [];
  const shadowed = (name: string) => scopes.some((scope) => scope.has(name));

  const visitPattern = (pattern: unknown) => {
    // Only defaults and computed keys inside a binding pattern are reads.
    if (!isNode(pattern)) return;
    switch (pattern.type) {
      case "ObjectPattern":
        for (const property of pattern.properties as Node[]) {
          if (property.type === "RestElement") visitPattern(property.argument);
          else {
            if (property.computed) visit(property.key);
            visitPattern(property.value);
          }
        }
        break;
      case "ArrayPattern":
        (pattern.elements as unknown[]).forEach(visitPattern);
        break;
      case "RestElement":
        visitPattern(pattern.argument);
        break;
      case "AssignmentPattern":
        visitPattern(pattern.left);
        visit(pattern.right);
        break;
      case "TSParameterProperty":
        visitPattern(pattern.parameter);
        break;
      default:
        // An assignment target such as `obj.x = …` or `x = …`.
        visit(pattern);
    }
  };

  const withScope = (names: string[], body: () => void) => {
    scopes.push(new Set(names));
    body();
    scopes.pop();
  };

  function visitChildren(node: Node) {
    for (const [key, value] of Object.entries(node)) {
      if (SKIPPED_KEYS.has(key)) continue;
      if (Array.isArray(value)) value.forEach(visit);
      else visit(value);
    }
  }

  function visit(value: unknown): void {
    if (!isNode(value)) return;
    const node = value;
    if (node.type.startsWith("TS")) {
      if (TS_EXPRESSION_WRAPPERS.has(node.type)) visit(node.expression);
      return;
    }
    switch (node.type) {
      case "Identifier":
        if (!shadowed(node.name as string)) {
          found.push({
            name: node.name as string,
            at: node.start,
            deferred: false,
          });
        }
        return;
      case "ArrowFunctionExpression":
      case "FunctionExpression":
      case "FunctionDeclaration": {
        const names = (node.params as unknown[]).flatMap((param) =>
          patternNames(param)
        );
        if (node.type === "FunctionExpression" && isNode(node.id)) {
          names.push(node.id.name as string);
        }
        const body = node.body as Node;
        if (body.type === "BlockStatement") {
          names.push(...hoistedVars(body));
        }
        withScope(names, () => {
          (node.params as unknown[]).forEach(visitPattern);
          if (body.type === "BlockStatement") {
            withScope(blockDeclarations(body.body as unknown[]), () =>
              (body.body as unknown[]).forEach(visit)
            );
          } else visit(body);
        });
        return;
      }
      case "BlockStatement":
      case "StaticBlock":
        withScope(blockDeclarations(node.body as unknown[]), () =>
          (node.body as unknown[]).forEach(visit)
        );
        return;
      case "SwitchStatement":
        visit(node.discriminant);
        withScope(
          blockDeclarations(
            (node.cases as Node[]).flatMap((c) => c.consequent as unknown[])
          ),
          () => (node.cases as unknown[]).forEach(visit)
        );
        return;
      case "ForStatement":
      case "ForInStatement":
      case "ForOfStatement": {
        const head = (node.init ?? node.left) as unknown;
        const names =
          isNode(head) && head.type === "VariableDeclaration"
            ? (head.declarations as Node[]).flatMap((d) => patternNames(d.id))
            : [];
        withScope(names, () => visitChildren(node));
        return;
      }
      case "CatchClause":
        withScope(patternNames(node.param), () => visit(node.body));
        return;
      case "VariableDeclarator":
        visitPattern(node.id);
        visit(node.init);
        return;
      case "AssignmentExpression":
        visitPattern(node.left);
        visit(node.right);
        return;
      case "MemberExpression":
        visit(node.object);
        if (node.computed) visit(node.property);
        return;
      case "Property":
      case "PropertyDefinition":
      case "MethodDefinition":
        if (node.computed) visit(node.key);
        visit(node.value);
        return;
      case "CallExpression":
      case "NewExpression": {
        visit(node.callee);
        const callee = node.callee as Node;
        const calleeName =
          callee.type === "Identifier"
            ? callee.name
            : callee.type === "MemberExpression" && !callee.computed
              ? (callee.property as Node).name
              : null;
        const deferring = DEFERRING_SCHEDULERS.has(calleeName as string);
        for (const argument of node.arguments as Node[]) {
          if (!deferring) visit(argument);
          else if (argument.type === "Identifier") {
            // Naming a binding still reads it now; the function runs later.
            if (!shadowed(argument.name as string)) {
              found.push({
                name: argument.name as string,
                at: argument.start,
                deferred: true,
              });
            }
          } else if (!FUNCTION_TYPES.has(argument.type)) visit(argument);
        }
        return;
      }
      case "LabeledStatement":
        visit(node.body);
        return;
      case "BreakStatement":
      case "ContinueStatement":
      case "MetaProperty":
        return;
      default:
        visitChildren(node);
    }
  }

  visit(root);
  return found;
}

const isPreEffect = (node: unknown): node is Node =>
  isNode(node) &&
  node.type === "CallExpression" &&
  isNode(node.callee) &&
  node.callee.type === "MemberExpression" &&
  isNode(node.callee.object) &&
  node.callee.object.name === "$effect" &&
  isNode(node.callee.property) &&
  node.callee.property.name === "pre";

/**
 * Every top-level `let`/`const` a top-level `$effect.pre` reaches before the
 * binding is declared, as `name` or `name (via fn())` when the touch happens
 * in a top-level function the effect calls.
 */
function lateBindingsInPreEffects(source: string): string[] {
  // Imports are initialized before any script code runs, so they never sit in
  // a TDZ. Blank them (keeping every offset) before parsing: the compiler's
  // bare parser rejects `import { type X }` beside a `const X`, which is legal
  // TypeScript that the real build strips first.
  const withoutImports = source.replace(
    /^[ \t]*import\b(?:[^;"'`])*?\bfrom\s*["'][^"']*["'];?/gm,
    (statement) => statement.replace(/[^\n]/g, " ")
  );
  const ast = parse(withoutImports, { modern: true });
  const program = ast.instance?.content as unknown as Node | undefined;
  if (!program) return [];
  const statements = program.body as Node[];

  // Top-level let/const, where each binding leaves its TDZ.
  const declaredAt = new Map<string, number>();
  // Top-level functions an effect may call: declarations and const arrows.
  const functions = new Map<string, Node>();
  for (const statement of statements) {
    if (statement.type === "FunctionDeclaration" && isNode(statement.id)) {
      functions.set(statement.id.name as string, statement);
    }
    if (statement.type !== "VariableDeclaration" || statement.kind === "var") {
      continue;
    }
    for (const declarator of statement.declarations as Node[]) {
      for (const name of patternNames(declarator.id)) {
        declaredAt.set(name, declarator.start);
      }
      if (
        isNode(declarator.id) &&
        declarator.id.type === "Identifier" &&
        isNode(declarator.init) &&
        FUNCTION_TYPES.has(declarator.init.type)
      ) {
        functions.set(declarator.id.name as string, declarator.init);
      }
    }
  }

  const hits = new Set<string>();
  for (const statement of statements) {
    if (statement.type !== "ExpressionStatement") continue;
    const effect = statement.expression;
    if (!isPreEffect(effect)) continue;
    const effectEnd = effect.end;
    const isLate = (name: string) => (declaredAt.get(name) ?? -1) > effectEnd;

    const visited = new Set<string>();
    const scan = (node: Node, via: string | null) => {
      for (const { name, deferred } of freeReferences(node)) {
        if (isLate(name)) {
          hits.add(via ? `${name} (via ${via}())` : name);
        } else if (!deferred && functions.has(name) && !visited.has(name)) {
          visited.add(name);
          scan(functions.get(name) as Node, via ?? name);
        }
      }
    };
    for (const argument of effect.arguments as Node[]) scan(argument, null);
  }
  return [...hits];
}

function svelteFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === "node_modules" ? [] : svelteFiles(path);
    }
    return entry.name.endsWith(".svelte") ? [path] : [];
  });
}

/**
 * Real hits whose fix is committed on another branch that has not reached
 * main yet. Each entry names that branch; delete it once the fix is merged.
 * Nothing else belongs here: a new hit is fixed by moving the declaration
 * above the effect, not listed. Empty since the 2026-10-22 Shape Engine fix
 * (ShapeMatrixAppShell `focusMode`) landed on main.
 */
const FIXED_ON_ANOTHER_BRANCH = new Set<string>([]);

const script = (...lines: string[]) =>
  ['<script lang="ts">', ...lines, "</script>"].join("\n");

describe("pre-effect declaration order", () => {
  it("flags a read of a derived declared below the effect", () => {
    const source = script(
      "  $effect.pre(() => {",
      "    const next = focusMode;",
      "  });",
      "  const focusMode = $derived(true);"
    );
    expect(lateBindingsInPreEffects(source)).toEqual(["focusMode"]);
  });

  it("flags a write to state declared below the effect, even behind a branch", () => {
    const source = script(
      "  let open = $state(false);",
      "  $effect.pre(() => {",
      "    if (!open) untrack(() => { confirmOpen = false; });",
      "  });",
      "  let confirmOpen = $state(false);"
    );
    expect(lateBindingsInPreEffects(source)).toEqual(["confirmOpen"]);
  });

  it("flags a later binding reached through a top-level function the effect calls", () => {
    const source = script(
      "  $effect.pre(() => {",
      "    reload();",
      "  });",
      "  function reload() {",
      "    count = 0;",
      "  }",
      "  let count = $state(1);"
    );
    expect(lateBindingsInPreEffects(source)).toEqual(["count (via reload())"]);
  });

  it("ignores parameters, locals and properties that share a later name", () => {
    const source = script(
      "  let items = $state<{ size: number }[]>([]);",
      "  $effect.pre(() => {",
      "    const size = items.length;",
      "    items.forEach((total) => total.size + size);",
      "    for (const label of []) void label;",
      "    try { void 0; } catch (status) { void status; }",
      "    const obj = { total: 1, label: 2 };",
      "    void obj.status;",
      "  });",
      "  const size = 3;",
      "  const total = $derived(size);",
      "  let label = $state('');",
      "  let status = $state.raw('');"
    );
    expect(lateBindingsInPreEffects(source)).toEqual([]);
  });

  it("skips callbacks handed to a scheduler, but not the name passed to it", () => {
    const deferred = script(
      "  $effect.pre(() => {",
      "    arm();",
      "    queueMicrotask(() => { count = 2; });",
      "  });",
      "  function arm() {",
      "    setTimeout(settle, 10);",
      "  }",
      "  function settle() {",
      "    count = 0;",
      "  }",
      "  let count = $state(1);"
    );
    expect(lateBindingsInPreEffects(deferred)).toEqual([]);

    const namedLate = script(
      "  $effect.pre(() => {",
      "    setTimeout(settle, 10);",
      "  });",
      "  const settle = () => {};"
    );
    expect(lateBindingsInPreEffects(namedLate)).toEqual(["settle"]);
  });

  it("ignores bindings declared above the effect and plain effects", () => {
    const source = script(
      "  const ready = $derived(true);",
      "  $effect.pre(() => {",
      "    void ready;",
      "  });",
      "  $effect(() => {",
      "    void later;",
      "  });",
      "  const later = $derived.by(() => 1);"
    );
    expect(lateBindingsInPreEffects(source)).toEqual([]);
  });

  it("keeps every pre-effect in src/ below the bindings it touches", () => {
    const offenders = svelteFiles(resolve("src"))
      .flatMap((file) =>
        lateBindingsInPreEffects(readFileSync(file, "utf8")).map(
          (name) =>
            `${relative(process.cwd(), file).replace(/\\/g, "/")}: ${name}`
        )
      )
      .filter((offender) => !FIXED_ON_ANOTHER_BRANCH.has(offender));
    expect(offenders).toEqual([]);
    // Reads every .svelte file in src/; timed out at 30 s in a loaded d2 run.
  }, 120_000);
});
