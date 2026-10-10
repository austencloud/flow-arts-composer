import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("#lib/shared/auth/firebase.js", () => ({
  auth: { currentUser: { getIdToken: vi.fn().mockResolvedValue("token") } },
}));

import {
  AnalyticsResponseError,
  PostHogUserAnalytics,
} from "#lib/features/admin/services/post-hog-user-analytics.js";

function response(data: unknown, status = 200) {
  return new Response(
    JSON.stringify(
      status === 200
        ? { success: true, data }
        : { success: false, message: "PostHog unavailable" }
    ),
    { status, headers: { "Content-Type": "application/json" } }
  );
}

describe("PostHogUserAnalytics", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("preserves a genuine empty activity result", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response([])));
    await expect(
      new PostHogUserAnalytics().getActivityBreakdown("uid", "week")
    ).resolves.toEqual([]);
  });

  it("rejects malformed session rows instead of inventing replacements", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        response([
          {
            source: "posthog",
            sessionId: "session",
            startedAt: "2026-07-31T12:00:00.000Z",
            endedAt: null,
            duration: 100,
            modules: "browse",
            eventCount: 2,
            exceptionCount: 0,
            contentActionCount: 0,
            entryPath: "/browse",
            exitPath: "/browse",
            browser: "Chrome",
            operatingSystem: "Windows",
            deviceType: "Desktop",
            postHogUrl: null,
          },
        ])
      )
    );
    await expect(
      new PostHogUserAnalytics().getRecentSessions("uid", "week")
    ).rejects.toBeInstanceOf(AnalyticsResponseError);
  });

  it("rejects a null session start instead of constructing Invalid Date", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        response([
          {
            source: "posthog",
            sessionId: "session",
            startedAt: null,
            endedAt: null,
            duration: 100,
            modules: [],
            eventCount: 1,
            exceptionCount: 0,
            contentActionCount: 0,
            entryPath: null,
            exitPath: null,
            browser: null,
            operatingSystem: null,
            deviceType: null,
            postHogUrl: null,
          },
        ])
      )
    );
    await expect(
      new PostHogUserAnalytics().getRecentSessions("uid", "week")
    ).rejects.toThrow("session start");
  });

  it("parses diagnostic session context without inventing replay availability", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      response([
        {
          source: "posthog",
          sessionId: "session-1",
          startedAt: "2026-07-31T12:00:00.000Z",
          endedAt: "2026-07-31T12:04:00.000Z",
          duration: 240_000,
          modules: ["browse", "create"],
          eventCount: 18,
          exceptionCount: 2,
          contentActionCount: 1,
          entryPath: "/browse",
          exitPath: "/create",
          browser: "Chrome",
          operatingSystem: "Windows",
          deviceType: "Desktop",
          postHogUrl: "https://us.posthog.com/project/1/replay/session-1",
        },
      ])
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      new PostHogUserAnalytics().getRecentSessions("uid", "month", 8)
    ).resolves.toEqual([
      expect.objectContaining({
        sessionId: "session-1",
        exceptionCount: 2,
        entryPath: "/browse",
        exitPath: "/create",
      }),
    ]);
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      type: "sessions",
      userId: "uid",
      period: "month",
      limit: 8,
    });
  });

  it("parses recovered Composer session evidence without PostHog fields", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        response([
          {
            source: "composer",
            sessionId: "composer-1",
            startedAt: "2026-08-19T21:10:34.228Z",
            endedAt: "2026-08-19T21:30:02.316Z",
            duration: 1_168_088,
            name: "Sequence 4:10:02 PM",
            status: "abandoned",
            stepCount: 20,
            isSaved: false,
            lastAutosaveAt: "2026-08-19T21:29:33.383Z",
          },
        ])
      )
    );

    await expect(
      new PostHogUserAnalytics().getRecentSessions("uid", "week")
    ).resolves.toEqual([
      expect.objectContaining({
        source: "composer",
        sessionId: "composer-1",
        status: "abandoned",
        stepCount: 20,
        lastAutosaveAt: new Date("2026-08-19T21:29:33.383Z"),
      }),
    ]);
  });

  it("parses exception details from a session event trail", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        response([
          {
            eventId: "event-1",
            timestamp: "2026-07-31T12:01:00.000Z",
            event: "$exception",
            path: "/create",
            detail: null,
            exception: { type: "TypeError", message: "No gesture found" },
          },
        ])
      )
    );

    const result = await new PostHogUserAnalytics().getSessionEvents(
      "uid",
      "session-1"
    );
    expect(result[0]).toEqual(
      expect.objectContaining({
        eventId: "event-1",
        event: "$exception",
        exception: { type: "TypeError", message: "No gesture found" },
      })
    );
    expect(result[0]?.timestamp).toBeInstanceOf(Date);
  });

  it("surfaces proxy failures and forwards cancellation", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(null, 502));
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();
    await expect(
      new PostHogUserAnalytics().getEngagementSummary(
        "uid",
        "week",
        controller.signal
      )
    ).rejects.toThrow("PostHog unavailable");
    expect(fetchMock.mock.calls[0]?.[1]?.signal).toBe(controller.signal);
  });
});
