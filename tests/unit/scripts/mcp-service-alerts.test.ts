import { describe, expect, it } from "vitest";

import {
  alertToast,
  decideAlert,
  REMINDER_INTERVAL_MS,
  toastXml,
} from "../../../scripts/lib/mcp-service-alerts.mjs";
import { classifyMcpServiceHealth } from "../../../scripts/lib/mcp-service-health.mjs";

const ROUTED = { answered: 1, hostnames: ["mcp.tkaflowarts.com"] };
const NO_TUNNEL = { answered: 0, hostnames: [] };
const HEALTHY = classifyMcpServiceHealth({
  serviceState: "RUNNING",
  health: { ok: true },
  recentExits: 0,
  tunnels: ROUTED,
});
const CRASH_LOOP_PAUSED = classifyMcpServiceHealth({
  serviceState: "PAUSED",
  health: { ok: false, error: "nothing is listening on the port" },
  recentExits: 24,
  tunnels: ROUTED,
});
// The same crash loop, checked during one of its brief runs.
const CRASH_LOOP_UP = classifyMcpServiceHealth({
  serviceState: "RUNNING",
  health: { ok: true },
  recentExits: 24,
  tunnels: ROUTED,
});
const ROUTE_ONLY = classifyMcpServiceHealth({
  serviceState: "RUNNING",
  health: { ok: true },
  recentExits: 0,
  tunnels: NO_TUNNEL,
});
const SERVER_AND_ROUTE = classifyMcpServiceHealth({
  serviceState: "PAUSED",
  health: { ok: false, error: "nothing is listening on the port" },
  recentExits: 24,
  tunnels: NO_TUNNEL,
});

const MINUTE = 60_000;
const T0 = new Date("2026-09-28T09:00:00Z");
const after = (ms: number) => new Date(T0.getTime() + ms);

describe("decideAlert", () => {
  it("stays quiet while the connector keeps working", () => {
    const first = decideAlert(null, HEALTHY, T0);
    expect(first.notify).toBeNull();
    expect(decideAlert(first.state, HEALTHY, after(15 * MINUTE))).toEqual({
      notify: null,
      state: { status: "up", since: T0.toISOString() },
    });
  });

  it("alerts when it goes down, then reminds every 6 hours", () => {
    const down = decideAlert(
      { status: "up", since: T0.toISOString() },
      CRASH_LOOP_PAUSED,
      T0
    );
    expect(down.notify).toBe("down");
    const quiet = decideAlert(
      down.state,
      CRASH_LOOP_PAUSED,
      after(REMINDER_INTERVAL_MS - MINUTE)
    );
    expect(quiet.notify).toBeNull();
    const reminder = decideAlert(
      quiet.state,
      CRASH_LOOP_PAUSED,
      after(REMINDER_INTERVAL_MS)
    );
    expect(reminder.notify).toBe("reminder");
    expect(reminder.state.since).toBe(T0.toISOString());
  });

  it("treats a crash loop's paused and running moments as one outage", () => {
    const down = decideAlert(null, CRASH_LOOP_PAUSED, T0);
    expect(
      decideAlert(down.state, CRASH_LOOP_UP, after(15 * MINUTE)).notify
    ).toBeNull();
  });

  it("alerts when the problem moves between the server and the route", () => {
    const route = decideAlert(null, ROUTE_ONLY, T0);
    const both = decideAlert(route.state, SERVER_AND_ROUTE, after(15 * MINUTE));
    expect(both.notify).toBe("changed");
    expect(both.state.since).toBe(T0.toISOString());
    expect(decideAlert(both.state, ROUTE_ONLY, after(30 * MINUTE)).notify).toBe(
      "changed"
    );
  });

  it("says once that it recovered", () => {
    const down = decideAlert(null, CRASH_LOOP_PAUSED, T0);
    const recovered = decideAlert(down.state, HEALTHY, after(135 * MINUTE));
    expect(recovered.notify).toBe("recovered");
    expect(
      decideAlert(recovered.state, HEALTHY, after(150 * MINUTE)).notify
    ).toBeNull();
  });

  it("reminds rather than going silent when the saved state is damaged", () => {
    expect(
      decideAlert(
        { status: "down", categories: ["service"] },
        CRASH_LOOP_PAUSED,
        T0
      ).notify
    ).toBe("reminder");
  });
});

describe("alertToast", () => {
  it("leads with the service state and the server's own last error", () => {
    const toast = alertToast(
      decideAlert(null, CRASH_LOOP_PAUSED, T0),
      CRASH_LOOP_PAUSED,
      {
        lastError:
          "Error [ERR_MODULE_NOT_FOUND]: Cannot find package '@napi-rs/canvas'",
        now: T0,
      }
    );
    expect(toast.title).toBe("The Flow Arts Knowledge MCP server is down");
    expect(toast.lines).toEqual([
      "NSSM has paused it between restarts, which means it keeps crashing on startup.",
      "Last error: Error [ERR_MODULE_NOT_FOUND]: Cannot find package '@napi-rs/canvas'",
    ]);
    expect(toast.persistent).toBe(true);
  });

  it("names the route when only the tunnel is missing", () => {
    const toast = alertToast(decideAlert(null, ROUTE_ONLY, T0), ROUTE_ONLY, {
      now: T0,
    });
    expect(toast.title).toBe(
      "claude.ai cannot reach the Flow Arts Knowledge MCP"
    );
    expect(toast.lines).toEqual([
      expect.stringContaining("No cloudflared tunnel is running"),
    ]);
  });

  it("words reminders and brief-run crash loops for what they are", () => {
    const down = decideAlert(null, CRASH_LOOP_PAUSED, T0);
    const reminder = decideAlert(
      down.state,
      CRASH_LOOP_PAUSED,
      after(REMINDER_INTERVAL_MS)
    );
    expect(
      alertToast(reminder, CRASH_LOOP_PAUSED, {
        now: after(REMINDER_INTERVAL_MS),
      }).title
    ).toBe("The Flow Arts Knowledge MCP server is still down");
    expect(
      alertToast(decideAlert(null, CRASH_LOOP_UP, T0), CRASH_LOOP_UP, {
        now: T0,
      }).title
    ).toBe("The Flow Arts Knowledge MCP server keeps crashing");
  });

  it("reports how long a recovered outage lasted", () => {
    const down = decideAlert(null, CRASH_LOOP_PAUSED, T0);
    const recovered = decideAlert(down.state, HEALTHY, after(135 * MINUTE));
    expect(
      alertToast(recovered, HEALTHY, {
        previous: down.state,
        now: after(135 * MINUTE),
      })
    ).toMatchObject({
      title: "The Flow Arts Knowledge MCP works again",
      lines: ["It was down for 2 h 15 min."],
      persistent: false,
    });
  });
});

describe("toastXml", () => {
  it("keeps a problem on screen until it is dismissed", () => {
    const xml = toastXml({
      title: "Down",
      lines: ["Why"],
      attribution: "Since 9:00 AM",
      persistent: true,
    });
    expect(xml).toMatch(/^<toast scenario="reminder">/);
    expect(xml).toContain(
      '<actions><action content="Dismiss" arguments="dismiss" activationType="system"/></actions>'
    );
    expect(xml).toContain('<text placement="attribution">Since 9:00 AM</text>');
  });

  it("lets a recovery notice time out on its own", () => {
    expect(toastXml({ title: "Up", persistent: false })).toBe(
      '<toast><visual><binding template="ToastGeneric"><text>Up</text></binding></visual></toast>'
    );
  });

  it("escapes markup and drops control characters from log text", () => {
    const xml = toastXml({
      title: "a < b & c",
      lines: ["Last error: 'x' \"y\" >\u001b[31m"],
      persistent: false,
    });
    expect(xml).toContain("<text>a &lt; b &amp; c</text>");
    expect(xml).toContain(
      "<text>Last error: &apos;x&apos; &quot;y&quot; &gt;[31m</text>"
    );
  });
});
