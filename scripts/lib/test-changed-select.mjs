/**
 * Decide which tests a set of changed files touches. Pure: the caller (see
 * scripts/test-changed.mjs) supplies the changed paths, the test index, the
 * mention map and the package facts, so every rule here is unit-testable
 * without git or a file system.
 *
 * Reasons, each a separate way a test can be tied to a change:
 *   changed-test  the changed file is itself a test in the index
 *   mentions      the test's text names the changed file (contract tests read
 *                 source as text, so the import graph misses them)
 *   domain        the change sits in a domain that has tests/unit/<domain>/
 *   package       a workspace package changed; its own `test` script runs
 *   full-suite    test config, setup, dependencies or a root config changed
 *
 * The import-graph reason (`imports`) is not decided here. Vitest's own
 * related mode owns that, so `$lib`, `#lib` and workspace aliases resolve
 * exactly as they do in a run; `relatedSources` is what to hand it.
 */

/** Forward slashes, no leading `./`. */
export function normalizePath(path) {
  return path.replaceAll("\\", "/").replace(/^\.\//, "");
}

// Bare names too common to tie a test to one file. A test that says `index`
// or `types` is not talking about the changed `foo/index.ts`.
const GENERIC_NAMES = new Set([
  "app",
  "api",
  "config",
  "constants",
  "data",
  "defaults",
  "helpers",
  "index",
  "main",
  "mod",
  "models",
  "readme",
  "schema",
  "service",
  "setup",
  "state",
  "store",
  "styles",
  "test",
  "types",
  "utils",
]);
const MIN_BARE_NAME = 5;
const ROOT_MANIFESTS = new Set([
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "readme.md",
  "tsconfig.json",
]);

// Longest first, so `foo.svelte.ts` strips to `foo`, not `foo.svelte`.
const SOURCE_EXTENSIONS = [
  ".svelte.ts",
  ".svelte.js",
  ".test.ts",
  ".test.js",
  ".spec.ts",
  ".spec.js",
  ".svelte",
  ".d.ts",
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".mts",
  ".cts",
  ".json",
  ".md",
  ".mdx",
  ".css",
  ".yaml",
  ".yml",
];

/** The file name without directory or any of the extensions above. */
export function bareName(path) {
  const file = normalizePath(path).split("/").pop() ?? "";
  const extension = SOURCE_EXTENSIONS.find((ext) => file.endsWith(ext));
  return extension ? file.slice(0, -extension.length) : file;
}

function withoutLastExtension(path) {
  const slash = path.lastIndexOf("/");
  const dot = path.lastIndexOf(".");
  return dot > slash + 1 ? path.slice(0, dot) : path;
}

function isGeneric(name) {
  const lowered = name.toLowerCase();
  return (
    name.length < MIN_BARE_NAME ||
    GENERIC_NAMES.has(lowered) ||
    // SvelteKit route files: +page, +layout.server, +server …
    lowered.startsWith("+")
  );
}

/**
 * Every spelling a test might use for a changed file: the repo path, the path
 * without its extension (how imports name it), the `$lib`, `#lib` and
 * `$shared` aliases, and the bare file name unless it is generic. `bare`
 * marks the forms that need a word boundary on both sides.
 */
export function mentionForms(path) {
  const normalized = normalizePath(path);
  const stem = withoutLastExtension(normalized);
  // A root file's path is only its name, so it needs a boundary on both sides.
  // Root manifests are read by dozens of unrelated tests (59 read
  // package.json); their real triggers are in fullSuiteReason.
  if (!normalized.includes("/")) {
    if (ROOT_MANIFESTS.has(normalized.toLowerCase())) return [];
    return [...new Set([normalized, stem])].map((text) => ({
      text,
      bare: true,
    }));
  }
  const paths = new Set([normalized, stem]);
  for (const form of [normalized, stem]) {
    if (form.startsWith("src/lib/")) {
      const inLib = form.slice("src/lib/".length);
      paths.add(`$lib/${inLib}`);
      paths.add(`#lib/${inLib}`);
      if (inLib.startsWith("shared/"))
        paths.add(`$shared/${inLib.slice("shared/".length)}`);
    }
  }
  const forms = [...paths].map((text) => ({ text, bare: false }));
  const name = bareName(normalized);
  if (!isGeneric(name)) forms.push({ text: name, bare: true });
  return forms;
}

const WORD_CHAR = /[A-Za-z0-9_-]/;

function containsForm(text, { text: form, bare }) {
  let from = 0;
  for (;;) {
    const at = text.indexOf(form, from);
    if (at === -1) return false;
    const before = at === 0 ? "" : text[at - 1];
    const after = text[at + form.length] ?? "";
    // A path must not run on into a longer name (`bar` inside `barista`);
    // a bare name must also not be the tail of a longer one (`my-bar`).
    const endOk = !WORD_CHAR.test(after);
    const startOk = !bare || (!WORD_CHAR.test(before) && before !== ".");
    if (endOk && startOk) return true;
    from = at + 1;
  }
}

/** The changed paths whose forms appear in `text`. */
export function findMentions(text, changedPaths) {
  return changedPaths.filter((path) =>
    mentionForms(path).some((form) => containsForm(text, form))
  );
}

/** Plain strings for a fast fixed-string prefilter (`rg -F`). */
export function mentionNeedles(changedPaths) {
  return [
    ...new Set(changedPaths.flatMap((p) => mentionForms(p).map((f) => f.text))),
  ];
}

const ROOT_CONFIG_PATTERNS = [
  /^package\.json$/,
  /^pnpm-lock\.yaml$/,
  /^tsconfig[^/]*\.json$/,
  /^vite\.config\.[^/]+$/,
  /^svelte\.config\.[^/]+$/,
  /^vitest[^/]*\.config\.[^/]+$/,
];

/**
 * Why a changed path forces the whole suite, or null. A root package.json
 * whose only difference is its `scripts` block (the caller works that out)
 * changes no resolution or dependency, so it is not a trigger.
 */
export function fullSuiteReason(path, { packageJsonScriptsOnly = false } = {}) {
  const normalized = normalizePath(path);
  if (normalized.startsWith("tests/config/"))
    return "test configuration changed";
  if (normalized.startsWith("tests/setup/")) return "shared test setup changed";
  if (normalized === "package.json" && packageJsonScriptsOnly) return null;
  if (ROOT_CONFIG_PATTERNS.some((pattern) => pattern.test(normalized)))
    return "root dependency or build configuration changed";
  return null;
}

/** The domain a source path belongs to, for `tests/unit/<domain>/`. */
export function domainOf(path) {
  const parts = normalizePath(path).split("/");
  if (parts[0] !== "src") return null;
  let rest;
  if (parts[1] === "lib" && (parts[2] === "features" || parts[2] === "shared"))
    rest = parts.slice(3);
  else if (parts[1] === "routes") rest = parts.slice(2);
  else return null;
  // Route groups such as `(public)` carry no domain; take the next segment.
  while (rest.length > 1 && /^\(.*\)$/.test(rest[0])) rest = rest.slice(1);
  // A bare file (`src/routes/+page.svelte`) has no domain directory.
  return rest.length > 1 ? rest[0] : null;
}

/** The test directories a domain maps to, in the forms this repo uses. */
export function domainTestDirs(domain) {
  return [`tests/unit/${domain}/`, `tests/unit/shared/${domain}/`];
}

/** The workspace package directory a path is inside, or null. */
export function packageOf(path) {
  const parts = normalizePath(path).split("/");
  return parts[0] === "packages" && parts.length > 2 ? parts[1] : null;
}

const RELATABLE = /\.(?:[cm]?[jt]sx?|svelte)$/;

/**
 * Whether Vitest's import graph could contain this file. package.json is left
 * out on purpose: Vitest's forceRerunTriggers would turn it into a full run.
 */
export function isRelatableSource(path) {
  const normalized = normalizePath(path);
  return RELATABLE.test(normalized);
}

const COMPONENT_TEST = /\.svelte\.(?:test|spec)\.[jt]s$/;

/**
 * @param {object} input
 * @param {string[]} input.changed            repo-relative changed paths
 * @param {string[]} input.index              test files the main config runs
 * @param {Record<string,string[]>|Map<string,string[]>} [input.mentions]
 *        test file -> changed paths its text names
 * @param {Record<string,{hasTest:boolean}>} [input.packages]
 *        package dir name -> facts; a changed package missing here has no
 *        package.json
 * @param {string[]} [input.componentTests]   `*.svelte.test.ts` files
 * @param {boolean} [input.packageJsonScriptsOnly]
 */
export function selectTests({
  changed,
  index,
  mentions = {},
  packages = {},
  componentTests = [],
  packageJsonScriptsOnly = false,
}) {
  const changedPaths = [...new Set(changed.map(normalizePath))].sort();
  const indexPaths = index.map(normalizePath);
  const indexSet = new Set(indexPaths);
  const mentionEntries =
    mentions instanceof Map ? [...mentions] : Object.entries(mentions);

  /** test path -> Set of "reason: detail" */
  const tests = new Map();
  const add = (test, reason, detail) => {
    if (!tests.has(test)) tests.set(test, new Map());
    const reasons = tests.get(test);
    if (!reasons.has(reason)) reasons.set(reason, new Set());
    reasons.get(reason).add(detail);
  };

  const fullSuite = [];
  const packageRuns = new Map();
  const packagesWithoutTests = new Set();

  for (const path of changedPaths) {
    const reason = fullSuiteReason(path, { packageJsonScriptsOnly });
    if (reason) fullSuite.push({ path, reason });

    if (indexSet.has(path)) add(path, "changed-test", path);

    const domain = domainOf(path);
    if (domain) {
      const dirs = domainTestDirs(domain);
      for (const test of indexPaths)
        if (dirs.some((dir) => test.startsWith(dir)))
          add(test, "domain", domain);
    }

    const pkg = packageOf(path);
    if (pkg) {
      if (packages[pkg]?.hasTest) packageRuns.set(pkg, true);
      else packagesWithoutTests.add(pkg);
    }
  }

  for (const [test, named] of mentionEntries) {
    const normalized = normalizePath(test);
    if (!indexSet.has(normalized)) continue;
    for (const path of named) {
      const changedPath = normalizePath(path);
      // A test always names itself; that is `changed-test`, not a mention.
      if (changedPath !== normalized) add(normalized, "mentions", changedPath);
    }
  }

  // `Foo.svelte` and `foo.svelte.ts` both pair with `Foo.svelte.test.ts`.
  const subjects = new Set([
    ...changedPaths,
    ...changedPaths.map((path) => withoutLastExtension(path)),
  ]);
  const components = componentTests
    .map(normalizePath)
    .filter((test) => COMPONENT_TEST.test(test))
    .filter(
      (test) =>
        subjects.has(test) ||
        subjects.has(test.replace(/\.(?:test|spec)\.[jt]s$/, ""))
    )
    .sort();

  const byReason = {};
  for (const [test, reasons] of tests)
    for (const reason of reasons.keys()) (byReason[reason] ??= []).push(test);
  for (const list of Object.values(byReason)) list.sort();

  return {
    changed: changedPaths,
    fullSuite,
    tests: [...tests.keys()].sort(),
    reasons: tests,
    byReason,
    // Changed tests are already listed; Vitest needs only the sources.
    relatedSources: changedPaths.filter(
      (path) => isRelatableSource(path) && !indexSet.has(path)
    ),
    packages: [...packageRuns.keys()].sort(),
    packagesWithoutTests: [...packagesWithoutTests].sort(),
    componentTests: components,
  };
}
