/**
 * verify-mcp-service: is the Flow Arts Knowledge connector working right now?
 *
 * Read-only. It asks sc.exe for the FlowArtsKnowledgeMCP state, GETs the local
 * health URL, counts the times NSSM restarted the server after it exited on
 * its own in the last hour, and asks each running cloudflared which hostnames
 * it routes. It never starts, stops, or reconfigures anything, and never reads
 * a cloudflared command line. On any problem it prints what failed and exits 1.
 * watch-mcp-service.mjs runs the same check on a schedule and notifies Austen.
 *
 *   node scripts/verify-mcp-service.mjs          # report for people
 *   node scripts/verify-mcp-service.mjs --json   # report for other tools
 */
import process from "node:process";

import {
  classifyMcpServiceHealth,
  describeFacts,
  hasServiceProblem,
} from "./lib/mcp-service-health.mjs";
import { probeMcpService, readLastError } from "./lib/mcp-service-probe.mjs";

if (process.platform !== "win32") {
  process.stderr.write(
    "[mcp-service] Windows only: the service runs under NSSM on Austen's machine.\n"
  );
  process.exit(2);
}

const facts = await probeMcpService();
const { healthy, problems } = classifyMcpServiceHealth(facts);
const lastError = hasServiceProblem(problems) ? readLastError() : null;

if (process.argv.includes("--json")) {
  process.stdout.write(
    `${JSON.stringify({ checkedAt: new Date().toISOString(), healthy, problems, facts, lastError }, null, 2)}\n`
  );
} else if (healthy) {
  process.stdout.write(
    `[mcp-service] Flow Arts Knowledge connector OK: ${describeFacts(facts)}.\n`
  );
} else {
  const lines = [
    `[mcp-service] ACTION NEEDED: the Flow Arts Knowledge connector is not working.`,
    ...problems.map((problem) => `  - ${problem.message}`),
    `  Facts: ${describeFacts(facts)}.`,
  ];
  if (lastError?.line)
    lines.push(
      `  Last error in ${lastError.logPath}:`,
      `    ${lastError.line}`
    );
  lines.push(
    "  This check is read-only. Restarting or reconfiguring FlowArtsKnowledgeMCP needs Austen's OK;",
    "  see mcp-server/deploy/README.md."
  );
  process.stderr.write(`${lines.join("\n")}\n`);
}
process.exitCode = healthy ? 0 : 1;
