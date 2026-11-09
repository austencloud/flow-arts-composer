/**
 * Release debt: shipped work that no release note describes yet.
 *
 * A report, never a gate. Nothing here blocks a push or hooks into
 * push-public.mjs; it only answers "is it time to release?" so un-noted work
 * stays visible. Pure so it unit-tests without git.
 */

import { classifyCommit, parseConventional } from "./release-module-gate.mjs";

/** Commit types a reader could notice. */
const USER_FACING_TYPES = new Set(["feat", "fix", "perf"]);
/** Commit types a reader never sees. */
const INTERNAL_TYPES = new Set([
  "chore", "docs", "test", "tests", "refactor", "ci", "build", "style",
]);
const TEST_FILE = /(^tests\/|\.test\.|\.spec\.)/;

/**
 * Plain-sentence subjects carry no type, so the files decide: a change to app
 * code under src/ (not a test) is something a reader could notice.
 *
 * @param {string | null} type
 * @param {string[]} files
 */
function looksUserFacing(type, files) {
  if (type && USER_FACING_TYPES.has(type)) return true;
  if (type && INTERNAL_TYPES.has(type)) return false;
  return files.some((f) => f.startsWith("src/") && !TEST_FILE.test(f));
}

/** At or past this many waiting changes, a release is worth cutting. */
export const DEBT_COUNT_THRESHOLD = 10;
/** Any waiting change this old is worth a release too. */
export const DEBT_DAYS_THRESHOLD = 14;

/**
 * @param {{
 *   commits: Array<{ hash: string, subject: string, files?: string[] }>,
 *   productionModules: Record<string, boolean>,
 *   daysSinceRelease: number,
 * }} input
 * @returns {{ userFacing: Array<{ hash: string, subject: string, module: string | null }>, otherCount: number, daysSinceRelease: number, verdict: string }}
 */
export function summarizeReleaseDebt({
  commits,
  productionModules,
  daysSinceRelease,
}) {
  const userFacing = [];
  let otherCount = 0;
  for (const commit of commits) {
    const { type } = parseConventional(commit.subject);
    const classified = classifyCommit(commit, { productionModules });
    // Work behind a dark module or flag is not something a reader can see.
    if (
      looksUserFacing(type, commit.files ?? []) &&
      classified.released !== false
    ) {
      userFacing.push({
        hash: commit.hash,
        subject: commit.subject,
        module: classified.module,
      });
    } else {
      otherCount += 1;
    }
  }
  return {
    userFacing,
    otherCount,
    daysSinceRelease,
    verdict: debtVerdict(userFacing.length, daysSinceRelease),
  };
}

/**
 * @param {number} count
 * @param {number} days
 */
export function debtVerdict(count, days) {
  const span = `${days} day${days === 1 ? "" : "s"}`;
  if (count === 0) {
    return `Nothing user-facing has shipped without a note in ${span}.`;
  }
  const changes = `${count} user-facing commit${count === 1 ? "" : "s"}`;
  if (count >= DEBT_COUNT_THRESHOLD || days >= DEBT_DAYS_THRESHOLD) {
    return `${changes} over ${span}: worth cutting a release.`;
  }
  return `${changes} over ${span}: a release can wait.`;
}
