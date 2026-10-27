#!/usr/bin/env node
/**
 * test-changed — find and run the tests a change touches.
 *
 *   npm run test:changed                 # run them (main config)
 *   npm run test:changed -- --list       # print them grouped by reason
 *   npm run test:changed -- --base <ref> # compare against <ref>, not main
 *   npm run test:changed -- --committed-only   # ignore uncommitted edits
 *   npm run test:changed -- --no-build   # skip `npm run build:packages`
 *
 * The changed set is `git diff <base>...HEAD` (base defaults to the merge base
 * with main) plus, unless --committed-only, staged, unstaged and untracked
 * files. scripts/lib/test-changed-select.mjs decides the selection; this file
 * only gathers its inputs and runs the result:
 *
 *   - the candidate index is what `vitest list --filesOnly` reports for
 *     tests/config/vitest.config.ts, so the config's include/exclude globs
 *     stay the only definition of "the suite";
 *   - the import graph is Vitest's own related mode. A run hands the changed
 *     sources to `vitest related`, which walks every test's graph (about a
 *     minute for the whole index) and shares those transforms with the run;
 *     --list does the same walk through Vitest's Node API;
 *   - text mentions are prefiltered with `rg -F` when ripgrep is on PATH and
 *     confirmed per file, because contract tests read source as text.
 *
 * Before a run it rebuilds the workspace packages (`npm run build:packages`,
 * an incremental `tsc --build`, a few seconds when nothing changed). Tests that
 * load a workspace package go through its `exports`, whose `import` condition
 * is the built dist, and nothing else rebuilds dist when package sources
 * change; CI builds first for the same reason. --list builds nothing.
 *
 * wt:finish runs `--base <main sha> --committed-only` from the task worktree.
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  findMentions,
  mentionNeedles,
  normalizePath,
  selectTests,
} from "./lib/test-changed-select.mjs";

const CONFIG = "tests/config/vitest.config.ts";
const TEST_FILE = /\.(?:test|spec)\.[cm]?[jt]sx?$/;
// Windows caps a command line at 32,767 characters.
const MAX_ARGS_LENGTH = 30_000;

function argumentAfter(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : (process.argv[index + 1] ?? null);
}

const LIST = process.argv.includes("--list");
const COMMITTED_ONLY = process.argv.includes("--committed-only");
const NO_BUILD = process.argv.includes("--no-build");
const BASE_ARG = argumentAfter("--base");

function capture(executable, args, opts = {}) {
  const result = spawnSync(executable, args, {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    ...opts,
  });
  if (result.error) throw result.error;
  return result;
}

function git(args, cwd) {
  const result = capture("git", args, { cwd });
  if (result.status !== 0)
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr.trim()}`);
  return result.stdout;
}

function splitNullList(raw) {
  return raw.split("\0").filter(Boolean);
}

function seconds(since) {
  return `${((Date.now() - since) / 1000).toFixed(1)} s`;
}

/** npm and pnpm are .cmd shims on Windows; go through cmd.exe as wt:finish does. */
function runPackageScript(command, args, cwd) {
  const result =
    process.platform === "win32"
      ? spawnSync(
          process.env.ComSpec ?? "cmd.exe",
          ["/d", "/s", "/c", [command, ...args].join(" ")],
          { cwd, stdio: "inherit" }
        )
      : spawnSync(command, args, { cwd, stdio: "inherit" });
  return result.status ?? 1;
}

function changedFiles(root, base) {
  const committed = splitNullList(
    git(
      ["diff", "--name-only", "-z", "--diff-filter=ACMRD", `${base}...HEAD`],
      root
    )
  );
  if (COMMITTED_ONLY) return committed;

  const working = [];
  const entries = splitNullList(
    git(["status", "--porcelain", "-z", "--untracked-files=all"], root)
  );
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const code = entry.slice(0, 2);
    // Renames and copies carry their source path as the next entry.
    if (/[RC]/.test(code)) i++;
    // An unstaged-only deletion is skipped: a few case-colliding glyph images
    // never materialize in an NTFS worktree and show up as " D" in every one.
    if (code === " D") continue;
    working.push(entry.slice(3));
  }
  return [...committed, ...working];
}

/** True when the root package.json differs from base only inside `scripts`. */
function packageJsonScriptsOnly(root, base) {
  const withoutScripts = (text) => {
    const json = JSON.parse(text);
    delete json.scripts;
    return JSON.stringify(json);
  };
  try {
    const before = git(["show", `${base}:package.json`], root);
    const after = COMMITTED_ONLY
      ? git(["show", "HEAD:package.json"], root)
      : readFileSync(join(root, "package.json"), "utf8");
    return withoutScripts(before) === withoutScripts(after);
  } catch {
    return false;
  }
}

function vitestBin(root) {
  const bin = join(root, "node_modules", "vitest", "vitest.mjs");
  if (!existsSync(bin))
    throw new Error(`vitest is not installed at ${bin}; run pnpm install`);
  return bin;
}

function testIndex(root) {
  const result = capture(
    process.execPath,
    [vitestBin(root), "list", "--filesOnly", "--config", CONFIG],
    { cwd: root }
  );
  if (result.status !== 0)
    throw new Error(`vitest list failed:\n${result.stdout}${result.stderr}`);
  return result.stdout
    .split(/\r?\n/)
    .map((line) => normalizePath(line.trim()))
    .filter((line) => TEST_FILE.test(line));
}

function hasRipgrep() {
  try {
    return capture("rg", ["--version"]).status === 0;
  } catch {
    return false;
  }
}

/** test file -> changed paths its text names. */
function mentionMap(root, changed, index) {
  const indexSet = new Set(index);
  let candidates = index;
  if (hasRipgrep()) {
    const result = capture(
      "rg",
      [
        "-l",
        "-F",
        "--no-messages",
        "-f",
        "-",
        "-g",
        "*.{test,spec}.*",
        "tests",
        "src",
      ],
      { cwd: root, input: mentionNeedles(changed).join("\n") }
    );
    // rg exits 1 when nothing matched.
    if (result.status === 0 || result.status === 1) {
      candidates = result.stdout
        .split(/\r?\n/)
        .map((line) => normalizePath(line.trim()))
        .filter((line) => indexSet.has(line));
    }
  }
  const mentions = new Map();
  for (const test of candidates) {
    let text;
    try {
      text = readFileSync(join(root, test), "utf8");
    } catch {
      continue;
    }
    const named = findMentions(text, changed);
    if (named.length) mentions.set(test, named);
  }
  return mentions;
}

function packageFacts(root, changed) {
  const facts = {};
  for (const path of changed) {
    const parts = path.split("/");
    if (parts[0] !== "packages" || parts.length < 3 || parts[1] in facts)
      continue;
    const manifest = join(root, "packages", parts[1], "package.json");
    if (!existsSync(manifest)) continue;
    const json = JSON.parse(readFileSync(manifest, "utf8"));
    facts[parts[1]] = { hasTest: Boolean(json.scripts?.test) };
  }
  return facts;
}

function componentTestFiles(root) {
  return splitNullList(
    git(
      [
        "ls-files",
        "-z",
        "--cached",
        "--others",
        "--exclude-standard",
        "--",
        "*.svelte.test.ts",
        "*.svelte.spec.ts",
      ],
      root
    )
  );
}

/**
 * The tests Vitest's related mode ties to `sources` through the import graph.
 * Vite and its Svelte plugin log every compile warning while the graph is
 * walked; that output is held back and shown only if the walk fails.
 */
async function importRelated(root, sources) {
  if (!sources.length) return [];
  const { createVitest } = await import(
    pathToFileURL(join(root, "node_modules", "vitest", "dist", "node.js")).href
  );
  const held = [];
  const writes = [process.stdout.write, process.stderr.write];
  const hold = (chunk, encoding, callback) => {
    held.push(String(chunk));
    if (typeof encoding === "function") encoding();
    else if (typeof callback === "function") callback();
    return true;
  };
  process.stdout.write = hold;
  process.stderr.write = hold;
  let vitest;
  try {
    vitest = await createVitest(
      "test",
      {
        config: resolve(root, CONFIG),
        related: sources.map((path) => resolve(root, path)),
        watch: false,
        run: true,
        passWithNoTests: true,
      },
      {},
      {}
    );
    const specs = await vitest.getRelevantTestSpecifications();
    return [
      ...new Set(
        specs.map((spec) => normalizePath(relative(root, spec.moduleId)))
      ),
    ].sort();
  } catch (error) {
    [process.stdout.write, process.stderr.write] = writes;
    process.stderr.write(held.join(""));
    throw error;
  } finally {
    await vitest?.close();
    [process.stdout.write, process.stderr.write] = writes;
  }
}

function printGroup(title, entries) {
  if (!entries.length) return;
  console.log(`\n${title} (${entries.length})`);
  for (const line of entries) console.log(`  ${line}`);
}

function describeSelection(selection) {
  const { reasons } = selection;
  const detail = (test, reason) =>
    [...reasons.get(test).get(reason)].join(", ");
  printGroup("changed-test", selection.byReason["changed-test"] ?? []);
  printGroup(
    "mentions",
    (selection.byReason.mentions ?? []).map(
      (test) => `${test}  <- ${detail(test, "mentions")}`
    )
  );
  printGroup(
    "domain",
    (selection.byReason.domain ?? []).map(
      (test) => `${test}  <- ${detail(test, "domain")}`
    )
  );
}

function describeExtras(selection) {
  printGroup(
    "package",
    selection.packages.map(
      (pkg) => `${pkg}  (pnpm --filter ./packages/${pkg} run test)`
    )
  );
  if (selection.packagesWithoutTests.length)
    console.log(
      `\npackages with no test script (nothing runs for them): ${selection.packagesWithoutTests.join(", ")}`
    );
  printGroup(
    "component tests (browser config, not run here)",
    selection.componentTests
  );
}

/** Split file arguments so no single command line passes the Windows cap. */
function chunk(files, budget) {
  const chunks = [];
  let current = [];
  let length = 0;
  for (const file of files) {
    if (current.length && length + file.length + 1 > budget) {
      chunks.push(current);
      current = [];
      length = 0;
    }
    current.push(file);
    length += file.length + 1;
  }
  if (current.length) chunks.push(current);
  return chunks;
}

function runVitest(root, args) {
  const result = spawnSync(
    process.execPath,
    [vitestBin(root), ...args, "--config", CONFIG],
    { cwd: root, stdio: "inherit" }
  );
  return result.status ?? 1;
}

function runSelection(root, selection) {
  if (selection.fullSuite.length) return runVitest(root, ["run"]);

  const { relatedSources, tests } = selection;
  if (!relatedSources.length) {
    let status = 0;
    for (const files of chunk(tests, MAX_ARGS_LENGTH))
      status ||= runVitest(root, ["run", ...files]);
    return status;
  }

  // One `related` run carries every changed source, so the import graph is
  // walked once; listing a test file there selects it by path as well.
  const sourcesLength = relatedSources.reduce((n, p) => n + p.length + 1, 0);
  const [first = [], ...rest] = chunk(
    tests,
    Math.max(MAX_ARGS_LENGTH - sourcesLength, 1)
  );
  let status = runVitest(root, [
    "related",
    "--run",
    ...relatedSources,
    ...first,
  ]);
  for (const files of rest) status ||= runVitest(root, ["run", ...files]);
  return status;
}

async function main() {
  const root = normalizePath(git(["rev-parse", "--show-toplevel"]).trim());
  const base = BASE_ARG ?? git(["merge-base", "main", "HEAD"], root).trim();
  const baseLabel = BASE_ARG ?? `merge-base main (${base.slice(0, 10)})`;

  const locateStart = Date.now();
  const changed = [...new Set(changedFiles(root, base).map(normalizePath))];
  if (!changed.length) {
    console.log(`test:changed — no changed files since ${baseLabel}`);
    return 0;
  }
  const index = testIndex(root);
  const selection = selectTests({
    changed,
    index,
    mentions: mentionMap(root, changed, index),
    packages: packageFacts(root, changed),
    componentTests: componentTestFiles(root),
    packageJsonScriptsOnly:
      changed.includes("package.json") && packageJsonScriptsOnly(root, base),
  });

  console.log(
    `test:changed — ${changed.length} changed file(s) since ${baseLabel}${COMMITTED_ONLY ? ", committed only" : ", including uncommitted"}; ${index.length} tests in the index`
  );

  if (selection.fullSuite.length) {
    console.log("\nfull-suite: the whole main config runs because");
    for (const { path, reason } of selection.fullSuite)
      console.log(`  ${path}: ${reason}`);
  } else {
    describeSelection(selection);
  }
  if (changed.includes("package.json") && !selection.fullSuite.length)
    console.log(
      "\npackage.json changed only in `scripts`: not a full-suite trigger"
    );
  console.log(`\nlocated in ${seconds(locateStart)}`);

  if (LIST) {
    if (!selection.fullSuite.length) {
      const importStart = Date.now();
      const imports = (
        await importRelated(root, selection.relatedSources)
      ).filter((test) => !selection.changed.includes(test));
      printGroup("imports", imports);
      console.log(
        `\nimport graph of ${selection.relatedSources.length} changed source(s) walked in ${seconds(importStart)}`
      );
      if (
        !imports.length &&
        !selection.tests.length &&
        !selection.packages.length
      )
        console.log(`\nno tests touch these ${changed.length} changed files`);
    }
    describeExtras(selection);
    return 0;
  }

  describeExtras(selection);
  if (
    !selection.fullSuite.length &&
    !selection.tests.length &&
    !selection.relatedSources.length &&
    !selection.packages.length
  ) {
    console.log(`\nno tests touch these ${changed.length} changed files`);
    return 0;
  }

  if (NO_BUILD) {
    console.log("\ntest:changed build:packages skipped (--no-build)");
  } else {
    const buildStart = Date.now();
    console.log("\ntest:changed build:packages (workspace package dist)");
    const buildStatus = runPackageScript(
      "npm",
      ["run", "build:packages"],
      root
    );
    console.log(
      `test:changed build:packages finished in ${seconds(buildStart)} (exit ${buildStatus})`
    );
    if (buildStatus !== 0) return buildStatus;
  }

  let status = 0;
  if (
    selection.fullSuite.length ||
    selection.tests.length ||
    selection.relatedSources.length
  ) {
    if (selection.relatedSources.length && !selection.fullSuite.length)
      console.log(
        `\nimports: Vitest related mode adds the tests whose import graph reaches the ${selection.relatedSources.length} changed source(s)`
      );
    const runStart = Date.now();
    status = runSelection(root, selection);
    console.log(
      `\ntest:changed vitest run finished in ${seconds(runStart)} (exit ${status})`
    );
  }
  for (const pkg of selection.packages) {
    const runStart = Date.now();
    const pkgStatus = runPackageScript(
      "pnpm",
      ["--filter", `./packages/${pkg}`, "run", "test"],
      root
    );
    console.log(
      `test:changed package ${pkg} finished in ${seconds(runStart)} (exit ${pkgStatus})`
    );
    status ||= pkgStatus;
  }
  return status;
}

main().then(
  (status) => {
    process.exitCode = status;
  },
  (error) => {
    console.error(`test-changed failed: ${error.message}`);
    process.exitCode = 2;
  }
);
