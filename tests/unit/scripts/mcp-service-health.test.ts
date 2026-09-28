import { describe, expect, it } from "vitest";

import {
  classifyMcpServiceHealth,
  countEvents,
  lastErrorLine,
  parseServiceState,
  RESTARTS_BEFORE_ALERT,
  routedHostnames,
} from "../../../scripts/lib/mcp-service-health.mjs";

// Captured from sc.exe, wevtutil, cloudflared, and the service's own stderr
// logs on Austen's machine (2026-07 and 2026-09 outages).
const SC_RUNNING = [
  "",
  "SERVICE_NAME: FlowArtsKnowledgeMCP ",
  "        TYPE               : 10  WIN32_OWN_PROCESS  ",
  "        STATE              : 4  RUNNING ",
  "                                (STOPPABLE, NOT_PAUSABLE, ACCEPTS_SHUTDOWN)",
  "        WIN32_EXIT_CODE    : 0  (0x0)",
].join("\r\n");
const SC_PAUSED = SC_RUNNING.replace("4  RUNNING", "7  PAUSED");
const SC_MISSING =
  "[SC] EnumQueryServicesStatus:OpenService FAILED 1060:\r\n\r\nThe specified service does not exist as an installed service.\r\n";

const START_EVENT =
  "<Event xmlns='http://schemas.microsoft.com/win/2004/08/events/event'><System><Provider Name='nssm'/><EventID Qualifiers='16384'>1008</EventID></System><EventData><Data>E:\\tka-platform\\mcp-server\\deploy\\run-mcp-http.cmd</Data><Data></Data><Data>FlowArtsKnowledgeMCP</Data></EventData></Event>";

const MODULE_CRASH = `
node:internal/modules/run_main:107
    triggerUncaughtException(
    ^
Error [ERR_MODULE_NOT_FOUND]: Cannot find package '@napi-rs/canvas' imported from E:\\tka-platform\\mcp-server\\src\\core\\standalone-renderer.ts
    at Object.getPackageJSONURL (node:internal/modules/package_json_reader:268:9)
    at nextResolve (node:internal/modules/esm/hooks:748:28) {
  code: 'ERR_MODULE_NOT_FOUND'
}

Node.js v24.8.0
`;
const AUTH_CRASH = `[MCP] Starting Flow Arts Knowledge MCP Server v3.0.0...
[MCP] Transition graph ready
[MCP] Fatal error: Error: [MCP] MCP_AUTH_ISSUER is required when MCP_HTTP_PORT is set. Refusing to start an unauthenticated HTTP transport.
    at required (E:\\tka-platform\\mcp-server\\src\\http\\auth-config.ts:50:9)
    at main (E:\\tka-platform\\mcp-server\\index.ts:82:24)
`;

const MCP_TUNNEL = {
  answered: 1,
  hostnames: ["mcp.tkaflowarts.com"],
};
const HEALTHY = {
  serviceState: "RUNNING",
  health: { ok: true },
  recentStarts: 1,
  tunnels: MCP_TUNNEL,
};

function kinds(facts: Parameters<typeof classifyMcpServiceHealth>[0]) {
  return classifyMcpServiceHealth(facts).problems.map(
    (problem) => problem.kind
  );
}

describe("parseServiceState", () => {
  it("reads the state word from sc.exe query output", () => {
    expect(parseServiceState(SC_RUNNING)).toBe("RUNNING");
    expect(parseServiceState(SC_PAUSED)).toBe("PAUSED");
  });

  it("reports a service that is not installed as MISSING", () => {
    expect(parseServiceState(SC_MISSING)).toBe("MISSING");
  });

  it("returns null instead of guessing from unrecognized output", () => {
    expect(parseServiceState("Access is denied.")).toBeNull();
    expect(parseServiceState(undefined)).toBeNull();
  });
});

describe("countEvents", () => {
  it("counts every event wevtutil returned", () => {
    expect(countEvents(START_EVENT.repeat(3))).toBe(3);
    expect(countEvents("")).toBe(0);
  });
});

describe("routedHostnames", () => {
  it("lists hostname rules and skips the catch-all", () => {
    const body = JSON.stringify({
      version: 2,
      config: {
        ingress: [
          {
            hostname: "dev.cirqueaflame.com",
            service: "http://localhost:5174",
          },
          { service: "http_status:404" },
        ],
      },
    });
    expect(routedHostnames(body)).toEqual(["dev.cirqueaflame.com"]);
  });

  it("returns null for anything that is not a cloudflared config", () => {
    expect(routedHostnames("not json")).toBeNull();
    expect(routedHostnames(JSON.stringify({ status: "ok" }))).toBeNull();
  });
});

describe("lastErrorLine", () => {
  it("finds the cause of a Node crash above the stack and version lines", () => {
    expect(lastErrorLine(MODULE_CRASH)).toMatch(
      /^Error \[ERR_MODULE_NOT_FOUND\]: Cannot find package '@napi-rs\/canvas'/
    );
  });

  it("finds the server's own fatal error", () => {
    expect(lastErrorLine(AUTH_CRASH)).toMatch(
      /^\[MCP\] Fatal error: .*MCP_AUTH_ISSUER is required/
    );
  });

  it("falls back to the last line when nothing names an error", () => {
    expect(
      lastErrorLine(
        "[MCP] Server connected and ready\r\n[MCP-HTTP] Listening on 127.0.0.1:3333/mcp\r\n"
      )
    ).toBe("[MCP-HTTP] Listening on 127.0.0.1:3333/mcp");
    expect(lastErrorLine("")).toBeNull();
  });

  it("shortens a long line for a one-line report", () => {
    const line = lastErrorLine(`Error: ${"x".repeat(500)}`);
    expect(line).toHaveLength(240);
    expect(line?.endsWith("...")).toBe(true);
  });
});

describe("classifyMcpServiceHealth", () => {
  it("passes a running, answering, routed service", () => {
    expect(classifyMcpServiceHealth(HEALTHY)).toEqual({
      healthy: true,
      problems: [],
    });
  });

  it("flags a crash loop caught while NSSM waits between restarts", () => {
    expect(
      kinds({
        serviceState: "PAUSED",
        health: { ok: false, error: "nothing is listening on the port" },
        recentStarts: 24,
        tunnels: MCP_TUNNEL,
      })
    ).toEqual(["service-paused", "health-failed", "restarting"]);
  });

  // The probe can land in the seconds a crash-looping server is up, when the
  // state and the health URL both look fine.
  it("flags a crash loop caught during one of its brief runs", () => {
    expect(kinds({ ...HEALTHY, recentStarts: RESTARTS_BEFORE_ALERT })).toEqual([
      "restarting",
    ]);
    expect(
      kinds({ ...HEALTHY, recentStarts: RESTARTS_BEFORE_ALERT - 1 })
    ).toEqual([]);
  });

  it("does not invent a restart problem when the event log was unreadable", () => {
    expect(kinds({ ...HEALTHY, recentStarts: null })).toEqual([]);
  });

  it("flags stopped, missing, and in-between service states", () => {
    expect(kinds({ ...HEALTHY, serviceState: "STOPPED" })).toEqual([
      "service-stopped",
    ]);
    expect(kinds({ ...HEALTHY, serviceState: "MISSING" })).toEqual([
      "service-missing",
    ]);
    expect(kinds({ ...HEALTHY, serviceState: "START_PENDING" })).toEqual([
      "service-transitional",
    ]);
    expect(kinds({ ...HEALTHY, serviceState: null })).toEqual([
      "service-unknown",
    ]);
  });

  it("flags a healthy server that no running tunnel routes", () => {
    const report = classifyMcpServiceHealth({
      ...HEALTHY,
      tunnels: { answered: 2, hostnames: ["dev.tkaflowarts.com"] },
    });
    expect(report.healthy).toBe(false);
    expect(report.problems).toEqual([
      expect.objectContaining({
        kind: "route-missing",
        message: expect.stringContaining(
          "None of the 2 running cloudflared tunnels"
        ),
      }),
    ]);
    expect(
      classifyMcpServiceHealth({
        ...HEALTHY,
        tunnels: { answered: 0, hostnames: [] },
      }).problems[0].message
    ).toContain("No cloudflared tunnel is running");
  });

  it("skips the route when the caller did not check tunnels", () => {
    expect(kinds({ ...HEALTHY, tunnels: undefined })).toEqual([]);
  });
});
