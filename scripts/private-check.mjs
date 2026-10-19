#!/usr/bin/env node
// Keeps private prop-bridge material out of the public GitHub repo.
//
// Decoded vendor protocols live in the private austencloud/prop-bridges repo,
// cloned into src/lib/private/ (ignored here). Nothing from it is published
// without Austen's yes in chat, item by item (.claude/rules/private-prop-bridges.md).
// This check refuses commits that would carry it:
//
//   node scripts/private-check.mjs --push <remote> <url>   pre-push hook (refs on stdin)
//   node scripts/private-check.mjs --range <base>..<tip>   every commit in a range
//   node scripts/private-check.mjs --tree [rev]            every file in one tree
//
// A commit is refused when it adds or changes a file whose path matches the
// blocklist, or adds a line naming a blocked word. Deleting such files is
// fine. Items Austen cleared are listed as `allow: <path>` lines in
// src/lib/private/CLEARED.md and pass.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC_REMOTE =
  /github\.com[:/]austencloud\/flow-arts-composer(\.git)?$/i;
const ZERO = /^0+$/;
// The guardrail files name what they guard against.
const SELF = new Set([
  "scripts/private-check.mjs",
  "scripts/private-blocklist.txt",
  "tests/unit/scripts/private-check.test.ts",
]);

function git(args, input) {
  return execFileSync("git", args, {
    cwd: process.cwd(),
    encoding: "utf8",
    input,
    maxBuffer: 1024 * 1024 * 1024,
    stdio: [input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
  });
}

export function loadRules(root = ROOT) {
  const words = [];
  const paths = [];
  const known = new Set();
  for (const raw of readFileSync(
    join(root, "scripts/private-blocklist.txt"),
    "utf8"
  ).split("\n")) {
    const line = raw.trim();
    const m = line.match(/^(word|path|known)\s+(.+)$/);
    if (!m) continue;
    if (m[1] === "word") words.push(m[2]);
    if (m[1] === "path") paths.push(new RegExp(m[2], "i"));
    if (m[1] === "known") known.add(m[2]);
  }
  const allowed = [];
  const cleared = join(root, "src/lib/private/CLEARED.md");
  if (existsSync(cleared)) {
    for (const line of readFileSync(cleared, "utf8").split("\n")) {
      const m = line.match(/^\s*-?\s*allow:\s*`?([^`\s]+)`?/);
      if (m) allowed.push(m[1]);
    }
  }
  return { word: new RegExp(words.join("|"), "i"), paths, known, allowed };
}

function isAllowed(rules, path) {
  return (
    SELF.has(path) ||
    rules.allowed.some((a) =>
      a.endsWith("/") ? path.startsWith(a) : path === a
    )
  );
}

function blockedPath(rules, path) {
  return rules.paths.some((re) => re.test(path)) || rules.word.test(path);
}

/** Hits in `git log -p` output: added or changed private paths and added lines naming a word. */
export function scanPatch(rules, patch) {
  const hits = [];
  let commit = "";
  let file = null;
  for (const line of patch.split("\n")) {
    if (line.startsWith("@@commit ")) {
      commit = line.slice(9, 19);
      file = null;
    } else if (line.startsWith("+++ ")) {
      file = line === "+++ /dev/null" ? null : line.slice(6);
      if (file && !isAllowed(rules, file) && blockedPath(rules, file))
        hits.push({ commit, file, line: "(private path)" });
    } else if (line.startsWith("Binary files ") && line.includes(" and b/")) {
      const added = line.match(/ and b\/(.+) differ$/)?.[1];
      if (added && !isAllowed(rules, added) && blockedPath(rules, added))
        hits.push({ commit, file: added, line: "(private path)" });
    } else if (
      file &&
      line.startsWith("+") &&
      !isAllowed(rules, file) &&
      rules.word.test(line)
    ) {
      hits.push({ commit, file, line: line.slice(1).trim().slice(0, 100) });
    }
  }
  return hits;
}

function scanCommits(rules, revArgs) {
  const patch = git([
    "log",
    "-p",
    "-U0",
    "--no-color",
    "--no-renames",
    "--no-ext-diff",
    "--format=@@commit %H",
    ...revArgs,
  ]);
  return scanPatch(rules, patch);
}

export function scanTree(rules, rev = "HEAD") {
  const hits = [];
  for (const file of git(["ls-tree", "-r", "--name-only", rev])
    .split("\n")
    .filter(Boolean)) {
    if (!isAllowed(rules, file) && blockedPath(rules, file))
      hits.push({ commit: rev, file, line: "(private path)" });
  }
  let grep = "";
  try {
    grep = git(["grep", "-I", "-i", "-l", "-P", rules.word.source, rev]);
  } catch {
    // git grep exits 1 when nothing matches.
  }
  for (const entry of grep.split("\n").filter(Boolean)) {
    const file = entry.slice(entry.indexOf(":") + 1);
    if (!isAllowed(rules, file) && !rules.known.has(file))
      hits.push({ commit: rev, file, line: "(names a private bridge)" });
  }
  return hits;
}

function report(hits, what) {
  if (hits.length === 0) return 0;
  console.error(`\n  Refused: ${what} carries private prop-bridge material.\n`);
  for (const h of hits.slice(0, 25))
    console.error(`    ${h.commit.slice(0, 10)}  ${h.file}  ${h.line}`);
  if (hits.length > 25) console.error(`    ...and ${hits.length - 25} more`);
  console.error(
    [
      "",
      "  Decoded protocols stay in the private prop-bridges repo (src/lib/private/).",
      "  Publishing any of it needs Austen's yes in chat for that item; then it is",
      "  listed as `allow: <path>` in src/lib/private/CLEARED.md.",
      "  Plain pushes of local main are refused while its history holds private",
      "  commits: publish with `node scripts/push-public.mjs` instead.",
      "  See .claude/rules/private-prop-bridges.md.",
      "",
    ].join("\n")
  );
  return 1;
}

function main(argv) {
  const rules = loadRules();
  const mode = argv[0];
  if (mode === "--push") {
    const [, remote, url = ""] = argv;
    if (!PUBLIC_REMOTE.test(url.trim())) return 0;
    const lines = readFileSync(0, "utf8").split("\n").filter(Boolean);
    const hits = [];
    for (const line of lines) {
      const [localRef, localSha] = line.split(/\s+/);
      if (!localSha || ZERO.test(localSha)) continue;
      if (/^refs\/heads\/history\//.test(localRef ?? ""))
        hits.push({
          commit: localSha,
          file: localRef,
          line: "(private history branch)",
        });
      hits.push(
        ...scanCommits(rules, [localSha, "--not", `--remotes=${remote}`])
      );
    }
    return report(hits, "this push");
  }
  if (mode === "--range") return report(scanCommits(rules, [argv[1]]), argv[1]);
  if (mode === "--tree")
    return report(
      scanTree(rules, argv[1] ?? "HEAD"),
      `tree ${argv[1] ?? "HEAD"}`
    );
  console.error(
    "Usage: private-check.mjs --push <remote> <url> | --range <a>..<b> | --tree [rev]"
  );
  return 2;
}

if (
  process.argv[1] &&
  resolve(fileURLToPath(import.meta.url)).toLowerCase() ===
    resolve(process.argv[1]).toLowerCase()
) {
  process.exit(main(process.argv.slice(2)));
}
