/**
 * The rules that decide whether the Flow Arts Knowledge connector works.
 * mcp-service-probe.mjs gathers the facts read-only; every report or alert
 * should reuse classifyMcpServiceHealth, so all surfaces agree on what "down"
 * means.
 */

export const MCP_SERVICE = Object.freeze({
  name: "FlowArtsKnowledgeMCP",
  healthUrl: "http://127.0.0.1:3333/",
  healthBody: "Flow Arts Knowledge MCP Server",
  publicHostname: "mcp.tkaflowarts.com",
});

// NSSM logs event 1014 each time the server exits on its own and NSSM restarts
// it. A deliberate restart or a reboot stops the service first and logs no
// 1014, so two within the hour mean it keeps dying, even when a check happens
// to land in the seconds a crash-looping server is up.
export const EXIT_WINDOW_MINUTES = 60;
export const EXITS_BEFORE_ALERT = 2;

// Without --metrics, cloudflared serves /config on the first free port in this
// range. Each running tunnel answers on its own port.
export const CLOUDFLARED_METRICS_PORTS = Object.freeze([
  20241, 20242, 20243, 20244, 20245,
]);

const ROUTE_MISSING = "route-missing";
const LAST_LINE_LIMIT = 240;

/** The STATE word from `sc.exe query`, "MISSING" for error 1060, else null. */
export function parseServiceState(scOutput) {
  const text = String(scOutput ?? "");
  if (/\bFAILED 1060\b/.test(text)) return "MISSING";
  const match = /^\s*STATE\s*:\s*\d+\s+([A-Z_]+)/m.exec(text);
  return match ? match[1] : null;
}

/** How many events a `wevtutil qe /f:xml` query returned. */
export function countEvents(eventXml) {
  return (String(eventXml ?? "").match(/<Event\b/g) ?? []).length;
}

/**
 * Hostnames in one cloudflared /config body, or null when the body is not a
 * cloudflared config. The catch-all rule has no hostname.
 */
export function routedHostnames(configBody) {
  try {
    const parsed =
      typeof configBody === "string" ? JSON.parse(configBody) : configBody;
    const ingress = parsed?.config?.ingress;
    if (!Array.isArray(ingress)) return null;
    return ingress
      .map((rule) => rule?.hostname)
      .filter((hostname) => typeof hostname === "string" && hostname !== "");
  } catch {
    return null;
  }
}

/**
 * The line of a stderr log that says why the server died. Node ends a crash
 * with stack frames and its version, so the last line alone says nothing;
 * prefer the last line naming an error, else the last line that is not
 * stack-trace scaffolding.
 */
export function lastErrorLine(logText) {
  const lines = String(logText ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter(
      (line) =>
        !/^at\s/.test(line) &&
        !/^Node\.js v\d/.test(line) &&
        !/^[{}]$/.test(line)
    );
  const line =
    lines.findLast((candidate) =>
      /\b[A-Za-z]*Error\b|\bFatal\b/.test(candidate)
    ) ?? lines.at(-1);
  if (!line) return null;
  return line.length > LAST_LINE_LIMIT
    ? `${line.slice(0, LAST_LINE_LIMIT - 3)}...`
    : line;
}

function describeState(serviceState) {
  switch (serviceState) {
    case "RUNNING":
      return null;
    case "MISSING":
      return {
        kind: "service-missing",
        message: `${MCP_SERVICE.name} is not installed as a Windows service.`,
      };
    case "PAUSED":
      return {
        kind: "service-paused",
        message:
          "NSSM has paused it between restarts, which means it keeps crashing on startup.",
      };
    case "STOPPED":
      return {
        kind: "service-stopped",
        message: "The service is stopped, so nothing restarts it.",
      };
    case null:
    case undefined:
      return {
        kind: "service-unknown",
        message: "Could not read the service state from sc.exe.",
      };
    default:
      return {
        kind: "service-transitional",
        message: `The service is ${serviceState}.`,
      };
  }
}

/**
 * facts.serviceState: parseServiceState result.
 * facts.health: { ok, error? } from GET MCP_SERVICE.healthUrl.
 * facts.recentExits: times NSSM restarted the server after it exited on its
 *   own within EXIT_WINDOW_MINUTES, or null when the event log was unreadable.
 * facts.tunnels: { answered, hostnames } across running cloudflared metrics
 *   servers, or undefined to skip the public route check.
 */
export function classifyMcpServiceHealth(facts) {
  const problems = [];

  const stateProblem = describeState(facts.serviceState);
  if (stateProblem) problems.push(stateProblem);

  if (!facts.health?.ok) {
    problems.push({
      kind: "health-failed",
      message: `GET ${MCP_SERVICE.healthUrl} failed: ${facts.health?.error ?? "no answer"}.`,
    });
  }

  if (
    typeof facts.recentExits === "number" &&
    facts.recentExits >= EXITS_BEFORE_ALERT
  ) {
    problems.push({
      kind: "crashing",
      message: `It exited on its own ${facts.recentExits} times in the last ${EXIT_WINDOW_MINUTES} minutes, and NSSM restarted it each time.`,
    });
  }

  if (facts.tunnels) {
    const { answered, hostnames } = facts.tunnels;
    if (!hostnames.includes(MCP_SERVICE.publicHostname)) {
      problems.push({
        kind: ROUTE_MISSING,
        message:
          answered === 0
            ? `No cloudflared tunnel is running, so claude.ai cannot reach ${MCP_SERVICE.publicHostname}.`
            : `None of the ${answered} running cloudflared tunnels routes ${MCP_SERVICE.publicHostname}, so claude.ai cannot reach the server.`,
      });
    }
  }

  return { healthy: problems.length === 0, problems };
}

/** True when a problem lies with the server itself rather than the route. */
export function hasServiceProblem(problems) {
  return problems.some((problem) => problem.kind !== ROUTE_MISSING);
}

function plural(count, noun) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/** One line of facts for a report or a log. */
export function describeFacts({ serviceState, health, recentExits, tunnels }) {
  const exits =
    typeof recentExits === "number"
      ? `${plural(recentExits, "unexpected exit")} in the last ${EXIT_WINDOW_MINUTES} min`
      : "exits unknown (event log unreadable)";
  const parts = [
    `state ${serviceState ?? "unknown"}`,
    `health ${health?.ok ? "OK" : "failing"}`,
    exits,
  ];
  if (tunnels) {
    parts.push(
      tunnels.hostnames.includes(MCP_SERVICE.publicHostname)
        ? `${MCP_SERVICE.publicHostname} routed`
        : `${MCP_SERVICE.publicHostname} not routed by ${plural(tunnels.answered, "running tunnel")}`
    );
  }
  return parts.join(" · ");
}
