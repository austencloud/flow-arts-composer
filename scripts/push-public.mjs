#!/usr/bin/env node
// Publishes local main to GitHub as one snapshot commit.
//
// Local main's history holds commits with private prop-bridge material from
// before it moved to the private repo, so main itself is never pushed. This
// makes one commit whose tree is main's tree and whose parent is origin/main,
// checks it with private-check.mjs, and prints it. With --push it also pushes
// that commit to GitHub main. Push only what Austen approved
// (.claude/rules/private-prop-bridges.md); run the d2 check on the printed
// commit first (scripts/d2-run.ps1 -Ref <sha>).
//
//   node scripts/push-public.mjs [--ref main] [--push]
import { execFileSync, spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const ref = args.includes("--ref") ? args[args.indexOf("--ref") + 1] : "main";
const doPush = args.includes("--push");
const REMOTE = "origin";

function git(argv, input, env) {
  return execFileSync("git", argv, {
    encoding: "utf8",
    input,
    env: env ? { ...process.env, ...env } : process.env,
    maxBuffer: 256 * 1024 * 1024,
  }).trim();
}

git(["fetch", REMOTE, "main"]);
const base = git(["rev-parse", `${REMOTE}/main`]);
const source = git(["rev-parse", ref]);
const tree = git(["rev-parse", `${source}^{tree}`]);
if (tree === git(["rev-parse", `${base}^{tree}`])) {
  console.log(
    `GitHub main already has ${ref}'s files (${source.slice(0, 10)}).`
  );
  process.exit(0);
}

// The previous snapshot names the main commit it came from, so the message
// lists what landed on main since then.
const previous = git(["log", "-1", "--format=%B", base]).match(
  /^Source: ([0-9a-f]{40})$/m
)?.[1];
let landed = [];
try {
  landed = git([
    "log",
    "--first-parent",
    "--format=- %s",
    previous ? `${previous}..${source}` : `${base}..${source}`,
  ])
    .split("\n")
    .filter(Boolean);
} catch {
  // A previous source that is no longer on this machine just drops the list.
}
const shown = landed.slice(0, 60);
const message = [
  `Publish local main ${source.slice(0, 10)}`,
  "",
  ...shown,
  ...(landed.length > shown.length
    ? [`- ...and ${landed.length - shown.length} more`]
    : []),
  "",
  `Source: ${source}`,
].join("\n");

// Dated like its source, so building it again gives the same commit: the one
// checked on d2 is the one pushed.
const date = git(["log", "-1", "--format=%cI", source]);
const snapshot = git(["commit-tree", tree, "-p", base, "-F", "-"], message, {
  GIT_AUTHOR_DATE: date,
  GIT_COMMITTER_DATE: date,
});
const check = spawnSync(
  process.execPath,
  ["scripts/private-check.mjs", "--range", `${base}..${snapshot}`],
  {
    stdio: "inherit",
  }
);
if (check.status !== 0) process.exit(check.status ?? 1);

console.log(
  `Snapshot ${snapshot} (main ${source.slice(0, 10)} onto GitHub main ${base.slice(0, 10)}).`
);
console.log(git(["diff", "--shortstat", base, snapshot]));
if (!doPush) {
  console.log(
    "Not pushed. Check it on d2, then run again with --push after Austen's yes."
  );
  process.exit(0);
}
const push = spawnSync("git", ["push", REMOTE, `${snapshot}:refs/heads/main`], {
  stdio: "inherit",
});
process.exit(push.status ?? 1);
