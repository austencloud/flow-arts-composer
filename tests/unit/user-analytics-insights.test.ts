import { describe, expect, it } from "vitest";
import { buildUserAnalyticsSignals } from "#lib/features/admin/domain/user-analytics-insights.js";
import type { PostHogSessionSummary } from "#lib/features/admin/services/types.js";

function session(
  overrides: Partial<PostHogSessionSummary> = {}
): PostHogSessionSummary {
  return {
    source: "posthog",
    sessionId: "session-1",
    startedAt: new Date("2026-07-31T12:00:00Z"),
    endedAt: new Date("2026-07-31T12:05:00Z"),
    duration: 300_000,
    modules: ["create"],
    eventCount: 10,
    exceptionCount: 0,
    contentActionCount: 1,
    entryPath: "/create",
    exitPath: "/create",
    browser: "Chrome",
    operatingSystem: "Windows",
    deviceType: "Desktop",
    postHogUrl: null,
    ...overrides,
  };
}

describe("buildUserAnalyticsSignals", () => {
  it("surfaces exceptions and the dominant module from observed data", () => {
    const signals = buildUserAnalyticsSignals({
      engagement: {
        source: "posthog",
        lastActiveAt: "2026-07-31T12:05:00Z",
        memberSince: null,
        sessionsCount: 2,
        avgSessionDuration: 120_000,
        totalTimeSpent: 240_000,
      },
      activity: [
        { module: "browse", eventCount: 2, percentage: 20 },
        { module: "create", eventCount: 8, percentage: 80 },
      ],
      content: {
        sequencesCreated: 1,
        sequencesSaved: 2,
        sequencesExported: 0,
        collectionsCreated: 0,
        sequencesShared: 0,
      },
      sessions: [
        session({ exceptionCount: 2 }),
        session({ sessionId: "session-2" }),
      ],
    });

    expect(signals).toHaveLength(3);
    expect(signals[0]).toMatchObject({
      id: "exceptions",
      tone: "danger",
      title: "2 exceptions",
      detail: "1 of 2 loaded sessions",
    });
    expect(signals[2]).toMatchObject({
      id: "behavior",
      title: "Create leads activity",
      detail: "80% of page views · 8 views",
    });
  });

  it("does not turn missing analytics into a healthy claim", () => {
    const signals = buildUserAnalyticsSignals({
      engagement: null,
      activity: [],
      content: null,
      sessions: [],
    });

    expect(signals.map((signal) => signal.tone)).toEqual([
      "neutral",
      "neutral",
      "neutral",
    ]);
    expect(signals[0]?.title).toBe("No sessions to inspect");
  });

  it("flags single-event sessions instead of treating them as normal duration", () => {
    const signals = buildUserAnalyticsSignals({
      engagement: {
        source: "posthog",
        lastActiveAt: null,
        memberSince: null,
        sessionsCount: 1,
        avgSessionDuration: 0,
        totalTimeSpent: 0,
      },
      activity: [],
      content: null,
      sessions: [session({ eventCount: 1, duration: 0 })],
    });

    expect(signals[1]).toMatchObject({
      tone: "warning",
      title: "1 single-event session",
    });
  });

  it("labels recovered Composer evidence without claiming PostHog coverage", () => {
    const signals = buildUserAnalyticsSignals({
      engagement: {
        source: "composer",
        lastActiveAt: "2026-08-19T22:20:00Z",
        memberSince: null,
        sessionsCount: 1,
        avgSessionDuration: 1_200_000,
        totalTimeSpent: 1_200_000,
      },
      activity: [],
      content: null,
      sessions: [
        {
          source: "composer",
          sessionId: "composer-1",
          startedAt: new Date("2026-08-19T22:00:00Z"),
          endedAt: new Date("2026-08-19T22:20:00Z"),
          duration: 1_200_000,
          name: "Sequence 2",
          status: "active",
          stepCount: 31,
          isSaved: false,
          lastAutosaveAt: new Date("2026-08-19T22:19:30Z"),
        },
      ],
    });

    expect(signals[0]).toMatchObject({
      tone: "info",
      title: "Composer records recovered",
      detail: "PostHog exceptions were not captured for these sessions",
    });
    expect(signals[1]).toMatchObject({
      tone: "info",
      title: "1 session in this window",
    });
  });
});
