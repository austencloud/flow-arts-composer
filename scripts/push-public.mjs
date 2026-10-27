#!/usr/bin/env node
// Publishes local main to GitHub as one snapshot commit.
//
// Local main's history holds commits with private prop-bridge material from
// before it moved to the private repo, so main itself is never pushed. This
// makes one commit whose tree is main's tree and whose parent is origin/main,
// checks it with private-check.mjs, and prints it. Push only what Austen
// approved (.claude/rules/private-prop-bridges.md).
//
// A publish must pass Web App CI. A red run on GitHub main skips the
// production deploy without any alert; three publishes on 2026-10-22 never
// went live that way. So --push first runs CI's validate steps on d2 against
// the snapshot (scripts/ci-replica.mjs) and refuses on red. --check runs the
// same preflight without pushing. A green tree is remembered on this machine,
// so the --push after a green --check does not run it again.
//
//   node scripts/push-public.mjs [--ref main]                build and print
//   node scripts/push-public.mjs [--ref main] --check        also run the d2 preflight
//   node scripts/push-public.mjs [--ref main] --push         preflight, push on green
//   ... --push --skip-preflight                              d2 down: push unchecked
import { execFileSync, spawnSync } from "node:child_process";

import {
  d2Reachable,
  hasGreenPreflight,
  recordGreenPreflight,
  runPreflight,
} from "./lib/publish-preflight.mjs";

const args = process.argv.slice(2);
const ref = args.includes("--ref") ? args[args.indexOf("--ref") + 1] : "main";
const doPush = args.includes("--push");
const doCheck = doPush || args.includes("--check");
const skipPreflight = args.includes("--skip-preflight");
const REMOTE = "origin";

if (skipPreflight && !doPush) {
  console.error("--skip-preflight only makes sense with --push.");
  process.exit(2);
}

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
if (!doCheck) {
  console.log(
    "Not pushed. Run again with --check for the d2 preflight, and --push after Austen's yes."
  );
  process.exit(0);
}

if (skipPreflight) {
  console.warn(
    "WARNING: --skip-preflight: publishing without the d2 CI replica. GitHub CI still gates the deploy."
  );
} else if (hasGreenPreflight(tree)) {
  console.log(
    `Preflight: tree ${tree.slice(0, 10)} already passed on d2; not running it again.`
  );
} else {
  if (!d2Reachable()) {
    console.error(
      "Refusing: d2 is unreachable, so the CI preflight cannot run.\n" +
        "Bring d2 back, or after Austen's yes run again with --push --skip-preflight\n" +
        "(GitHub CI still gates the deploy; a red run there leaves production on the old build)."
    );
    process.exit(2);
  }
  console.log(
    `Preflight: Web App CI's validate steps on d2 for snapshot ${snapshot.slice(0, 10)}.`
  );
  const { verdict, failed, steps, error } = await runPreflight(snapshot);
  if (steps.length) console.log(`\nPreflight steps:\n  ${steps.join("\n  ")}`);
  if (verdict !== "green") {
    console.error(
      verdict === "red"
        ? `Refusing: snapshot ${snapshot.slice(0, 10)} is red on d2. Failing step: ${failed.join(", ") || "(see the log above)"}.`
        : `Refusing: the d2 preflight did not finish${error ? ` (${error.message})` : ""}; see the log above.`
    );
    process.exit(1);
  }
  recordGreenPreflight(tree);
  console.log(
    `Preflight green: snapshot ${snapshot.slice(0, 10)} passed every Web App CI validate step on d2.`
  );
}

if (!doPush) {
  console.log("Not pushed. Run again with --push after Austen's yes.");
  process.exit(0);
}
const push = spawnSync("git", ["push", REMOTE, `${snapshot}:refs/heads/main`], {
  stdio: "inherit",
});
process.exit(push.status ?? 1);
