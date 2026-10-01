import { describe, expect, it } from "vitest";
import {
  buildSessionExceptionReport,
  groupSessionExceptions,
} from "$lib/features/admin/domain/session-exception-report";
import type {
  PostHogSessionEvent,
  PostHogSessionSummary,
} from "$lib/features/admin/services/types";

const session: PostHogSessionSummary = {
  source: "posthog",
  sessionId: "session-1",
  startedAt: new Date("2026-07-31T12:00:00.000Z"),
  endedAt: new Date("2026-07-31T12:04:00.000Z"),
  duration: 240_000,
  modules: ["browse", "create"],
  eventCount: 18,
  exceptionCount: 4,
  contentActionCount: 2,
  entryPath: "/browse",
  exitPath: "/create",
  browser: "Chrome",
  operatingSystem: "Windows",
  deviceType: "Desktop",
  postHogUrl: "https://us.posthog.com/project/1/replay/session-1",
};

function event(
  eventId: string,
  secondsAfterStart: number,
  exception: PostHogSessionEvent["exception"],
  path: string | null
): PostHogSessionEvent {
  return {
    eventId,
    timestamp: new Date(session.startedAt.getTime() + secondsAfterStart * 1000),
    event: exception ? "$exception" : "$pageview",
    path,
    detail: null,
    exception,
  };
}

describe("session exception reports", () => {
  it("groups repeated signatures and preserves their route and timing evidence", () => {
    const groups = groupSessionExceptions([
      event(
        "exception-2",
        180,
        {
          type: "FirebaseError",
          message: "Missing or insufficient permissions.",
        },
        "/create"
      ),
      event(
        "exception-3",
        120,
        {
          type: "TypeError",
          message: "No gesture found",
        },
        "/browse"
      ),
      event(
        "exception-1",
        60,
        {
          type: "FirebaseError",
          message: "Missing or insufficient permissions.",
        },
        "/browse"
      ),
    ]);

    expect(groups).toEqual([
      {
        type: "FirebaseError",
        message: "Missing or insufficient permissions.",
        count: 2,
        routes: ["/browse", "/create"],
        firstSeenAt: new Date("2026-07-31T12:01:00.000Z"),
        lastSeenAt: new Date("2026-07-31T12:03:00.000Z"),
      },
      {
        type: "TypeError",
        message: "No gesture found",
        count: 1,
        routes: ["/browse"],
        firstSeenAt: new Date("2026-07-31T12:02:00.000Z"),
        lastSeenAt: new Date("2026-07-31T12:02:00.000Z"),
      },
    ]);
  });

  it("builds a self-contained report and calls out incomplete coverage", () => {
    const report = buildSessionExceptionReport({
      user: {
        id: "user-1",
        displayName: "Sky Guys Quest",
        username: "@tester",
        email: "tester@example.com",
      },
      session,
      events: [
        event("pageview", 0, null, "/browse"),
        event(
          "exception-1",
          60,
          {
            type: "FirebaseError",
            message: "Missing or insufficient permissions.",
          },
          "/create"
        ),
        event(
          "exception-2",
          180,
          {
            type: "FirebaseError",
            message: "Missing or insufficient permissions.",
          },
          "/create"
        ),
        event(
          "exception-3",
          120,
          {
            type: "TypeError",
            message: "No gesture found",
          },
          "/browse"
        ),
      ],
    });

    expect(report).toContain("# TKA session exception report");
    expect(report).toContain("PostHog access is not required");
    expect(report).toContain("- Name: Sky Guys Quest");
    expect(report).toContain("- Username: @tester");
    expect(report).toContain("- User ID: user-1");
    expect(report).toContain("- Email: tester@example.com");
    expect(report).toContain("- Started: 2026-07-31T12:00:00.000Z");
    expect(report).toContain("- Duration: 4m 0s");
    expect(report).toContain("- Route: /browse -> /create");
    expect(report).toContain("- Client: Desktop | Chrome | Windows");
    expect(report).toContain("- Loaded events: 4 of 18 reported");
    expect(report).toContain("- Loaded exception events: 3 of 4 reported");
    expect(report).toContain(
      "- Coverage: Partial. 1 reported exception event is not present in the loaded trail."
    );
    expect(report).toContain("## Exception patterns (2)");
    expect(report).toContain("### 1. FirebaseError");
    expect(report).toContain(
      '- Message: "Missing or insufficient permissions."'
    );
    expect(report).toContain("- Occurrences: 2");
    expect(report).toContain("- Routes: /create");
    expect(report).toContain("- First seen: 2026-07-31T12:01:00.000Z (+1m 0s)");
    expect(report).toContain("- Last seen: 2026-07-31T12:03:00.000Z (+3m 0s)");
    expect(report).toContain("- Seen: 2026-07-31T12:02:00.000Z (+2m 0s)");
  });

  it("keeps different messages separate and labels missing exception data", () => {
    const groups = groupSessionExceptions([
      event("exception-1", 10, { type: "TypeError", message: "Alpha" }, null),
      event("exception-2", 20, { type: "TypeError", message: "Beta" }, null),
      event("exception-3", 30, { type: null, message: null }, null),
    ]);

    expect(groups.map((group) => [group.type, group.message])).toEqual([
      ["TypeError", "Alpha"],
      ["TypeError", "Beta"],
      ["Unknown exception type", "No exception message captured"],
    ]);
  });
});
