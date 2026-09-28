/**
 * verify-mcp-service: is the Flow Arts Knowledge connector working right now?
 *
 * Read-only. It asks sc.exe for the FlowArtsKnowledgeMCP state, GETs the local
 * health URL, counts NSSM starts in the last hour from the Application event
 * log, and asks each running cloudflared which hostnames it routes. It never
 * starts, stops, or reconfigures anything, and never reads a cloudflared
 * command line: the token-based tunnel service keeps its token there. On any
 * problem it prints what failed and exits 1.
 *
 *   node scripts/verify-mcp-service.mjs          # report for people
 *   node scripts/verify-mcp-service.mjs --json   # report for other tools
 */
import { execFileSync } from "node:child_process";
import { closeSync, fstatSync, openSync, readSync } from "node:fs";
import process from "node:process";

import {
  classifyMcpServiceHealth,
  CLOUDFLARED_METRICS_PORTS,
  countEvents,
  lastErrorLine,
  MCP_SERVICE,
  parseServiceState,
  RESTART_WINDOW_MINUTES,
  routedHostnames,
} from "./lib/mcp-service-health.mjs";

const HEALTH_TIMEOUT_MS = 3000;
const METRICS_TIMEOUT_MS = 1000;
const LOG_TAIL_BYTES = 8192;
const PARAMETERS_KEY = `HKLM\\SYSTEM\\CurrentControlSet\\Services\\${MCP_SERVICE.name}\\Parameters`;

function capture(command, args) {
  return execFileSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
}

function readServiceState() {
  try {
    return parseServiceState(capture("sc.exe", ["query", MCP_SERVICE.name]));
  } catch (error) {
    // A missing service exits 1060 but still explains itself on stdout.
    return parseServiceState(error.stdout);
  }
}

function readRecentStarts() {
  const windowMs = RESTART_WINDOW_MINUTES * 60_000;
  const query =
    `*[System[Provider[@Name='nssm'] and (EventID=1008) and ` +
    `TimeCreated[timediff(@SystemTime) <= ${windowMs}]] and ` +
    `EventData[Data='${MCP_SERVICE.name}']]`;
  try {
    return countEvents(
      capture("wevtutil.exe", ["qe", "Application", `/q:${query}`, "/f:xml"])
    );
  } catch {
    return null;
  }
}

function describeFetchFailure(error) {
  if (error?.name === "TimeoutError") return "no answer within 3 s";
  const code = error?.cause?.code;
  if (code === "ECONNREFUSED") return "nothing is listening on the port";
  return code ?? error?.message ?? String(error);
}

async function readHealth() {
  try {
    const response = await fetch(MCP_SERVICE.healthUrl, {
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
    });
    const body = await response.text();
    if (!response.ok)
      return { ok: false, error: `it answered ${response.status}` };
    if (!body.includes(MCP_SERVICE.healthBody)) {
      return { ok: false, error: "it answered, but not as the MCP server" };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, error: describeFetchFailure(error) };
  }
}

async function readTunnels() {
  const configs = await Promise.all(
    CLOUDFLARED_METRICS_PORTS.map(async (port) => {
      try {
        const response = await fetch(`http://127.0.0.1:${port}/config`, {
          signal: AbortSignal.timeout(METRICS_TIMEOUT_MS),
        });
        return response.ok ? routedHostnames(await response.text()) : null;
      } catch {
        return null;
      }
    })
  );
  const answering = configs.filter(Array.isArray);
  return { answered: answering.length, hostnames: answering.flat() };
}

// NSSM records where it sends the server's stderr; the service's own setting
// is the only path that stays right if the checkout ever moves.
function readStderrPath() {
  try {
    const output = capture("reg.exe", [
      "query",
      PARAMETERS_KEY,
      "/v",
      "AppStderr",
    ]);
    return (
      /AppStderr\s+REG_(?:EXPAND_)?SZ\s+(.+)$/m.exec(output)?.[1].trim() ?? null
    );
  } catch {
    return null;
  }
}

function readLastError() {
  const logPath = readStderrPath();
  if (!logPath) return null;
  let descriptor;
  try {
    descriptor = openSync(logPath, "r");
    const { size } = fstatSync(descriptor);
    const length = Math.min(size, LOG_TAIL_BYTES);
    const tail = Buffer.alloc(length);
    readSync(descriptor, tail, 0, length, size - length);
    return { logPath, line: lastErrorLine(tail.toString("utf8")) };
  } catch {
    return { logPath, line: null };
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function plural(count, noun) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function describeFacts({ serviceState, health, recentStarts, tunnels }) {
  const starts =
    recentStarts === null
      ? "starts unknown (event log unreadable)"
      : `${plural(recentStarts, "start")} in the last ${RESTART_WINDOW_MINUTES} min`;
  const route = tunnels.hostnames.includes(MCP_SERVICE.publicHostname)
    ? `${MCP_SERVICE.publicHostname} routed`
    : `${MCP_SERVICE.publicHostname} not routed by ${plural(tunnels.answered, "running tunnel")}`;
  return `state ${serviceState ?? "unknown"} · health ${health.ok ? "OK" : "failing"} · ${starts} · ${route}`;
}

if (process.platform !== "win32") {
  process.stderr.write(
    "[mcp-service] Windows only: the service runs under NSSM on Austen's machine.\n"
  );
  process.exit(2);
}

const [health, tunnels] = await Promise.all([readHealth(), readTunnels()]);
const facts = {
  serviceState: readServiceState(),
  health,
  recentStarts: readRecentStarts(),
  tunnels,
};
const { healthy, problems } = classifyMcpServiceHealth(facts);
const serviceProblem = problems.some(
  (problem) => problem.kind !== "route-missing"
);
const lastError = serviceProblem ? readLastError() : null;

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
