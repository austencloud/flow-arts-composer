#!/usr/bin/env node
/**
 * Release debt report: shipped commits since the last release tag that no
 * release note covers yet.
 *
 *   node scripts/release-debt.mjs          human-readable report
 *   node scripts/release-debt.mjs --json   the same, as JSON
 *
 * "Shipped" is what the live site runs: the local main commit named by the
 * `Source:` line of the newest public snapshot on origin/main (as of the last
 * fetch; this script never fetches). Without one it falls back to HEAD and
 * says so. Read-only: no Firestore, no network, no exit code that could gate
 * anything. It always exits 0.
 */

import { execFileSync } from "node:child_process";
import {
  collectCommits,
  loadProductionModules,
} from "./lib/release-module-gate.mjs";
import { summarizeReleaseDebt } from "./lib/release-debt.mjs";

const git = (...args) =>
  execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();

function tryGit(...args) {
  try {
    return git(...args);
  } catch {
    return null;
  }
}

function shippedSource() {
  const body = tryGit("log", "-1", "--format=%B", "origin/main");
  const source = body?.match(/^Source: ([0-9a-f]{40})$/m)?.[1];
  if (source && tryGit("cat-file", "-e", `${source}^{commit}`) !== null) {
    return { ref: source, live: true };
  }
  return { ref: "HEAD", live: false };
}

/** The local main commit a commit stands for: a snapshot names it with `Source:`. */
function localCommitOf(ref) {
  const body = tryGit("log", "-1", "--format=%B", ref);
  const source = body?.match(/^Source: ([0-9a-f]{40})$/m)?.[1];
  if (source && tryGit("cat-file", "-e", `${source}^{commit}`) !== null) {
    return source;
  }
  return tryGit("rev-parse", `${ref}^{commit}`);
}

/**
 * The newest release tag whose work is inside what shipped. Recent tags sit on
 * public snapshot commits, which are not ancestors of local main, so each tag
 * is mapped back through its snapshot's `Source:` line first.
 */
function newestReleaseTag(shippedRef) {
  const tags = (tryGit("tag", "--sort=-creatordate", "--list", "v*") ?? "")
    .split(/\s+/)
    .filter(Boolean);
  for (const name of tags) {
    const local = localCommitOf(name);
    if (!local) continue;
    if (tryGit("merge-base", "--is-ancestor", local, shippedRef) !== null) {
      return { name, local };
    }
  }
  return null;
}

function main() {
  const json = process.argv.includes("--json");
  const shipped = shippedSource();
  const lastTag = newestReleaseTag(shipped.ref);
  const range = lastTag ? `${lastTag.local}..${shipped.ref}` : shipped.ref;
  const taggedAt = lastTag ? tryGit("log", "-1", "--format=%cI", lastTag.name) : null;
  const daysSinceRelease = taggedAt
    ? Math.floor((Date.now() - new Date(taggedAt).getTime()) / 86_400_000)
    : 0;

  const report = summarizeReleaseDebt({
    commits: collectCommits(range),
    productionModules: loadProductionModules(),
    daysSinceRelease,
  });

  if (json) {
    console.log(
      JSON.stringify({ lastTag: lastTag?.name ?? null, shipped: shipped.ref, live: shipped.live, ...report }, null, 2)
    );
    return;
  }

  console.log(`Release debt since ${lastTag?.name ?? "the first commit"}`);
  console.log(
    shipped.live
      ? `Shipped up to ${shipped.ref.slice(0, 10)} (newest public snapshot, as of the last fetch).`
      : "No public snapshot found on origin/main; counting local HEAD instead."
  );
  console.log("");
  for (const commit of report.userFacing) {
    const where = commit.module ? `[${commit.module}] ` : "";
    console.log(`  ${commit.hash.slice(0, 10)} ${where}${commit.subject}`);
  }
  if (report.userFacing.length) console.log("");
  console.log(
    `${report.otherCount} other commit${report.otherCount === 1 ? "" : "s"} (chores, docs, tests, dark modules) need no note.`
  );
  console.log(report.verdict);
}

try {
  main();
} catch (error) {
  // A report must never fail a caller.
  console.error(`Release debt report could not run: ${error.message}`);
}
process.exit(0);
