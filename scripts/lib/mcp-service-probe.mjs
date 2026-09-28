/**
 * Reads the facts classifyMcpServiceHealth judges, without changing anything:
 * the FlowArtsKnowledgeMCP state from sc.exe, the local health URL, NSSM's
 * restart events in the Application log, and the routes of each running
 * cloudflared. It never reads a cloudflared command line: the token-based
 * tunnel service keeps its token there. Windows only.
 */
import { execFileSync } from "node:child_process";
import { closeSync, fstatSync, openSync, readSync } from "node:fs";

import {
  CLOUDFLARED_METRICS_PORTS,
  countEvents,
  EXIT_WINDOW_MINUTES,
  lastErrorLine,
  MCP_SERVICE,
  parseServiceState,
  routedHostnames,
} from "./mcp-service-health.mjs";

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

// Event 1014 is NSSM applying its exit action after the server exited on its
// own; stops, restarts, and reboots do not log it.
function readRecentExits() {
  const windowMs = EXIT_WINDOW_MINUTES * 60_000;
  const query =
    `*[System[Provider[@Name='nssm'] and (EventID=1014) and ` +
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

/** The facts for classifyMcpServiceHealth, public route check included. */
export async function probeMcpService() {
  const [health, tunnels] = await Promise.all([readHealth(), readTunnels()]);
  return {
    serviceState: readServiceState(),
    health,
    recentExits: readRecentExits(),
    tunnels,
  };
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

/** { logPath, line } for the server's last error, or null without a log. */
export function readLastError() {
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
