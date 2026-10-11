import { describe, it, expect } from "vitest";
import {
  buildTriageSessionsQuery,
  buildTriageSessionEventsQuery,
  buildFirstSeenQuery,
  toIsoUtc,
  parseTriageEventRow,
  parseTriageSessionRow,
} from "#lib/server/analytics/session-triage-queries.js";

describe("buildTriageSessionsQuery", () => {
  const sql = buildTriageSessionsQuery("2026-08-01T00:00:00Z", 20);

  it("groups by session rather than filtering to one user", () => {
    expect(sql).toContain("GROUP BY session_id");
    expect(sql).not.toContain("distinct_id = '");
  });

  it("keeps the admin exclusion filter", () => {
    expect(sql).toContain("PBp3GSBO6igCKPwJyLZNmVEmamI3");
    expect(sql).toContain("dev.tkaflowarts.com");
  });

  it("selects every signal the scorer needs", () => {
    for (const col of [
      "exception_count",
      "rage_click_count",
      "dead_click_count",
      "pageview_count",
      "content_action_count",
      "top_segments",
      "duration",
    ]) {
      expect(sql).toContain(col);
    }
  });

  it("clamps the limit to 200", () => {
    expect(buildTriageSessionsQuery("2026-08-01T00:00:00Z", 9999)).toContain("LIMIT 200");
  });

  it("escapes the since timestamp", () => {
    expect(buildTriageSessionsQuery("2026'--", 5)).toContain("2026\\'--");
  });
});

describe("buildTriageSessionEventsQuery", () => {
  it("resolves a session without needing a userId", () => {
    const sql = buildTriageSessionEventsQuery("s_9a1c", 500);
    expect(sql).toContain("s_9a1c");
    expect(sql).not.toContain("distinct_id = '");
    expect(sql).toContain("exception_message");
  });
});

describe("buildFirstSeenQuery", () => {
  it("returns the first-ever event time per uid", () => {
    const sql = buildFirstSeenQuery(["u_a", "u_b"]);
    expect(sql).toContain("min(events.timestamp)");
    expect(sql).toContain("person_distinct_ids AS identities");
    expect(sql).toContain("events.person_id = identities.person_id");
    expect(sql).toContain("'u_a'");
    expect(sql).toContain("'u_b'");
    expect(sql).toContain("GROUP BY uid");
  });

  it("backdates an identified account to its anonymous events", () => {
    const sql = buildFirstSeenQuery(["account-1"]);

    expect(sql).toContain("identities.distinct_id IN ('account-1')");
    expect(sql).not.toContain("WHERE distinct_id IN");
  });

  it("is safe with an empty uid list", () => {
    expect(buildFirstSeenQuery([])).toContain("LIMIT 0");
  });
});

describe("parseTriageSessionRow", () => {
  it("maps positional columns to the right fields", () => {
    const row = [
      "s_1", "u_1", "2026-08-01 10:00:00", "2026-08-01 10:05:00", 300000,
      20, 2, 3, 1, 4, 0,
      ["app"], ["compose"],
      "/app/compose", "/app/browse",
      "Chrome", "Windows", "Desktop",
    ];
    const p = parseTriageSessionRow(row);
    expect(p.sessionId).toBe("s_1");
    expect(p.uid).toBe("u_1");
    expect(p.durationMs).toBe(300000);
    expect(p.exceptionCount).toBe(2);
    expect(p.rageClickCount).toBe(3);
    expect(p.deadClickCount).toBe(1);
    expect(p.pageviewCount).toBe(4);
    expect(p.contentActionCount).toBe(0);
    expect(p.topSegments).toEqual(["app"]);
    expect(p.subSegments).toEqual(["compose"]);
    expect(p.entryPath).toBe("/app/compose");
    expect(p.exitPath).toBe("/app/browse");
    expect(p.browser).toBe("Chrome");
    expect(p.deviceType).toBe("Desktop");
  });
});

describe("toIsoUtc", () => {
  it("converts a ClickHouse timestamp to ISO UTC", () => {
    expect(toIsoUtc("2026-08-01 10:00:00")).toBe("2026-08-01T10:00:00Z");
  });

  it("leaves an already-ISO timestamp alone", () => {
    expect(toIsoUtc("2026-08-01T10:00:00Z")).toBe("2026-08-01T10:00:00Z");
  });

  it("adds a missing zone designator", () => {
    expect(toIsoUtc("2026-08-01T10:00:00")).toBe("2026-08-01T10:00:00Z");
  });

  it("passes an empty string through", () => {
    expect(toIsoUtc("")).toBe("");
  });

  it("parses as UTC, not local time", () => {
    expect(new Date(toIsoUtc("2026-08-01 10:00:00")).toISOString()).toBe(
      "2026-08-01T10:00:00.000Z"
    );
  });

  it("fixes the ordering inversion that would break resolve-on-silence", () => {
    // Same date, so the comparison reaches the separator: " " (0x20) sorts
    // below "T" (0x54), so the LATER ClickHouse stamp compares as older. This
    // is what would freeze lastSeen and let resolve-on-silence close a live bug.
    expect("2026-08-01 10:00:00" < "2026-08-01T00:00:00Z").toBe(true);
    // Normalized, chronological order is restored.
    expect(toIsoUtc("2026-08-01 10:00:00") > "2026-08-01T00:00:00Z").toBe(true);
  });
});

describe("parsers normalize timestamps", () => {
  it("normalizes session row timestamps", () => {
    const p = parseTriageSessionRow([
      "s_1", "u_1", "2026-08-01 10:00:00", "2026-08-01 10:05:00", 300000,
      20, 0, 0, 0, 1, 0, ["app"], ["compose"], "/a", "/b", "C", "W", "D",
    ]);
    expect(p.startedAt).toBe("2026-08-01T10:00:00Z");
    expect(p.endedAt).toBe("2026-08-01T10:05:00Z");
  });

  it("normalizes event row timestamps", () => {
    const e = parseTriageEventRow([
      "e_1", "2026-08-01 10:00:00", "$pageview", "/a", "", null, null,
    ]);
    expect(e.occurredAt).toBe("2026-08-01T10:00:00Z");
  });
});
