/**
 * verify-standalone-installs: does each standalone npm project in the main
 * checkout have node_modules that match its committed package-lock.json?
 *
 * pnpm-workspace.yaml covers only packages/*, so a root `pnpm install` never
 * installs these folders, and their consumers run straight from the main
 * checkout. A lockfile merged there without a matching install broke the Flow
 * Arts Knowledge MCP service from 2026-09-18 to 09-27. `npm run wt:finish` runs
 * this after every successful finish (the postwt:finish script). On drift it
 * prints the scoped install for each folder and exits 1. It never installs.
 *
 *   node scripts/verify-standalone-installs.mjs              # main checkout
 *   node scripts/verify-standalone-installs.mjs <repo-root>  # another root
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import process from "node:process";

import { inspectLockfileInstall } from "./lib/workspace-install-health.mjs";

const STANDALONE_NPM_PROJECTS = [
  {
    directory: "mcp-server",
    consumer:
      "The FlowArtsKnowledgeMCP service runs from this folder, so its next restart can crash.",
    afterInstall:
      "The running service keeps its current code until it restarts. If npm fails with EPERM or EBUSY, a running process (likely the service) has a file open: stop the service (elevated), install, then start it.",
  },
  {
    directory: "mcp-server-pkg",
    consumer:
      "tka-domain-local runs this folder's gitignored dist/, so its next build or start can fail.",
    afterInstall:
      "Then rebuild dist/ with `npm run build` in this folder and reconnect tka-domain-local with /mcp.",
  },
];
const SHOWN_ISSUES = 8;

// The consumers run from the main checkout, so its install is the one that
// matters even when this runs from a task worktree. Git lists it first.
function mainCheckoutRoot() {
  const listing = execFileSync("git", ["worktree", "list", "--porcelain"], {
    encoding: "utf8",
  });
  const line = listing
    .split(/\r?\n/)
    .find((entry) => entry.startsWith("worktree "));
  if (!line) throw new Error("git worktree list named no main checkout");
  return line.slice("worktree ".length);
}

const repoRoot = path.resolve(process.argv[2] ?? mainCheckoutRoot());
const results = STANDALONE_NPM_PROJECTS.map((project) => {
  const projectRoot = path.join(repoRoot, project.directory);
  return {
    project,
    projectRoot,
    report: inspectLockfileInstall({ projectRoot }),
  };
});
const drifted = results.filter(({ report }) => !report.healthy);

if (drifted.length === 0) {
  const names = results.map(({ project }) => project.directory).join(", ");
  process.stdout.write(
    `[standalone-installs] ${names} match their lockfiles in ${repoRoot}.\n`
  );
} else {
  const lines = [
    "",
    `[standalone-installs] ACTION NEEDED: ${drifted.length} of ${results.length} standalone npm projects in ${repoRoot} no longer match their lockfiles.`,
  ];
  if (process.env.npm_lifecycle_event === "postwt:finish") {
    lines.push(
      "  The merge itself succeeded. Only the main checkout's installed packages need attention."
    );
  }

  for (const { project, projectRoot, report } of drifted) {
    const count = report.issues.length;
    lines.push(
      "",
      `  ${project.directory}: ${count} difference${count === 1 ? "" : "s"} from package-lock.json`
    );
    for (const issue of report.issues.slice(0, SHOWN_ISSUES)) {
      lines.push(`    - ${issue.packageName ?? issue.path}: ${issue.message}`);
    }
    if (count > SHOWN_ISSUES) {
      lines.push(`    - and ${count - SHOWN_ISSUES} more`);
    }
    lines.push(
      `    ${project.consumer}`,
      "    Fix, with Austen's OK:",
      `      npm install --no-save --ignore-scripts --prefix "${projectRoot}"`,
      `    ${project.afterInstall}`
    );
  }

  lines.push(
    "",
    "  Never run npm ci in the main checkout. It wipes node_modules, which holds junctions into packages/.",
    ""
  );
  process.stderr.write(`${lines.join("\n")}\n`);
  process.exitCode = 1;
}
