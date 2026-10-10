import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  withRateLimit: vi.fn(),
  logAdminAction: vi.fn(),
  getUser: vi.fn(),
  getAdminDb: vi.fn(),
  getComposerSessions: vi.fn(),
  posthogEnv: {
    POSTHOG_PERSONAL_API_KEY: "secret",
    POSTHOG_PROJECT_ID: "project",
  } as Record<string, string>,
}));
// The route reads $app/env/private, which Vite resolves from .env when the
// config loads — long before any beforeEach can assign process.env. So the
// process.env writes below never reached it: locally these tests passed on the
// real key from .env, and in CI (no .env) the route 500'd with
// "POSTHOG_PROJECT_ID not configured". Mocking the module the route actually
// imports makes the fixture values authoritative in both places.
vi.mock("$app/env/private", async () => {
  const { envModule } = await import("#test-helpers/env-module.js");
  return envModule(mocks.posthogEnv);
});
vi.mock("#lib/server/auth/requireAdmin.js", () => ({
  requireAdmin: mocks.requireAdmin,
}));
vi.mock("#lib/server/security/withRateLimit.js", () => ({
  withRateLimit: mocks.withRateLimit,
}));
vi.mock("#lib/server/security/rate-limiter.js", () => ({
  RATE_LIMITS: { ADMIN: {} },
}));
vi.mock("#lib/server/security/audit-logger.js", () => ({
  logAdminAction: mocks.logAdminAction,
}));
vi.mock("#lib/server/firebaseAdmin.js", () => ({
  getAdminAuth: () => ({ getUser: mocks.getUser }),
  getAdminDb: mocks.getAdminDb,
}));

import {
  _perUserResult,
  POST,
} from "../../src/routes/api/admin/analytics/+server";

function event(body: unknown) {
  return {
    request: new Request("https://example.test/api/admin/analytics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    getClientAddress: () => "127.0.0.1",
  };
}

function upstream(results: unknown[][], status = 200) {
  return new Response(
    status === 200 ? JSON.stringify({ results }) : "upstream failed",
    {
      status,
      headers: { "Content-Type": "application/json" },
    }
  );
}

describe("admin analytics endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.posthogEnv.POSTHOG_PERSONAL_API_KEY = "secret";
    mocks.posthogEnv.POSTHOG_PROJECT_ID = "project";
    mocks.requireAdmin.mockResolvedValue({ uid: "admin" });
    mocks.withRateLimit.mockResolvedValue(null);
    mocks.getUser.mockResolvedValue({
      metadata: { creationTime: "2025-01-01T00:00:00Z" },
    });
    const composerQuery = {
      where: vi.fn(),
      orderBy: vi.fn(),
      limit: vi.fn(),
      get: mocks.getComposerSessions,
    };
    composerQuery.where.mockReturnValue(composerQuery);
    composerQuery.orderBy.mockReturnValue(composerQuery);
    composerQuery.limit.mockReturnValue(composerQuery);
    mocks.getComposerSessions.mockResolvedValue({ docs: [] });
    mocks.getAdminDb.mockReturnValue({
      collection: () => ({
        doc: () => ({ collection: () => composerQuery }),
      }),
    });
    vi.unstubAllGlobals();
  });

  it("loads as a valid SvelteKit route and returns named activity data", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        upstream([
          ["browse", 3],
          ["create", 1],
        ])
      )
    );
    const response = await POST(
      event({ type: "activity", userId: "uid", period: "week" }) as never
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: [
        { module: "browse", eventCount: 3, percentage: 75 },
        { module: "create", eventCount: 1, percentage: 25 },
      ],
    });
    expect(mocks.logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({ uid: "admin", target: "uid" })
    );
  });

  it("treats All Time as unbounded instead of a 365-day approximation", async () => {
    const fetchMock = vi.fn().mockResolvedValue(upstream([]));
    vi.stubGlobal("fetch", fetchMock);
    await POST(
      event({ type: "activity", userId: "uid", period: "all" }) as never
    );
    const requestBody = JSON.parse(
      String((fetchMock.mock.calls[0]?.[1] as RequestInit).body)
    ) as { query: { query: string } };
    expect(requestBody.query.query).not.toContain("365 day");
    expect(requestBody.query.query).not.toContain(
      "timestamp > now() - interval"
    );
  });

  it("queries the full PostHog person so anonymous activity follows the account", async () => {
    const fetchMock = vi.fn().mockResolvedValue(upstream([]));
    vi.stubGlobal("fetch", fetchMock);

    await POST(
      event({ type: "activity", userId: "uid", period: "all" }) as never
    );

    const requestBody = JSON.parse(
      String((fetchMock.mock.calls[0]?.[1] as RequestInit).body)
    ) as { query: { query: string } };
    const sql = requestBody.query.query;
    expect(sql).toContain("person_id IN");
    expect(sql).toContain("FROM person_distinct_ids");
    expect(sql).toContain("distinct_id = 'uid'");
    expect(sql).not.toMatch(/FROM events\s+WHERE distinct_id = 'uid'/);
  });

  it("applies the selected window to every per-user metric query", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(upstream([[null, 0, 0, 0]]))
      .mockResolvedValueOnce(upstream([]))
      .mockResolvedValueOnce(upstream([]));
    vi.stubGlobal("fetch", fetchMock);

    await POST(
      event({ type: "engagement", userId: "uid", period: "month" }) as never
    );
    await POST(
      event({ type: "content", userId: "uid", period: "month" }) as never
    );
    await POST(
      event({ type: "sessions", userId: "uid", period: "month" }) as never
    );

    for (const call of fetchMock.mock.calls) {
      const requestBody = JSON.parse(String((call[1] as RequestInit).body)) as {
        query: { query: string };
      };
      expect(requestBody.query.query).toContain(
        "timestamp > now() - interval 30 day"
      );
    }
  });

  it("returns a truthful empty engagement summary when PostHog has no sessions", async () => {
    const fetchMock = vi.fn().mockResolvedValue(upstream([[null, 0, 0, 0]]));
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(
      event({ type: "engagement", userId: "uid", period: "week" }) as never
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: {
        lastActiveAt: null,
        sessionsCount: 0,
        avgSessionDuration: 0,
        totalTimeSpent: 0,
      },
    });

    const requestBody = JSON.parse(
      String((fetchMock.mock.calls[0]?.[1] as RequestInit).body)
    ) as { query: { query: string } };
    expect(requestBody.query.query).toContain(
      "if(count() = 0, null, max(ended_at))"
    );
    expect(requestBody.query.query).toContain(
      "if(count() = 0, 0, avg(duration_ms))"
    );
  });

  it("recovers Composer sessions when PostHog captured no user activity", async () => {
    mocks.getComposerSessions.mockResolvedValue({
      docs: [
        {
          id: "composer-2",
          data: () => ({
            createdAt: new Date("2026-08-19T22:00:00Z"),
            lastModified: new Date("2026-08-19T22:20:00Z"),
            lastAutosave: new Date("2026-08-19T22:19:30Z"),
            status: "active",
            stepCount: 31,
            isSaved: false,
            name: "Sequence 2",
          }),
        },
        {
          id: "composer-1",
          data: () => ({
            createdAt: new Date("2026-08-19T21:30:00Z"),
            lastModified: new Date("2026-08-19T21:45:00Z"),
            lastAutosave: new Date("2026-08-19T21:44:30Z"),
            status: "abandoned",
            stepCount: 18,
            isSaved: false,
            name: "Sequence 1",
          }),
        },
      ],
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(upstream([[null, 0, 0, 0]]))
      .mockResolvedValueOnce(upstream([]));
    vi.stubGlobal("fetch", fetchMock);

    const engagementResponse = await POST(
      event({ type: "engagement", userId: "uid", period: "week" }) as never
    );
    const sessionsResponse = await POST(
      event({ type: "sessions", userId: "uid", period: "week" }) as never
    );

    await expect(engagementResponse.json()).resolves.toMatchObject({
      data: {
        source: "composer",
        lastActiveAt: "2026-08-19T22:20:00.000Z",
        sessionsCount: 2,
        avgSessionDuration: 1_050_000,
        totalTimeSpent: 2_100_000,
      },
    });
    await expect(sessionsResponse.json()).resolves.toMatchObject({
      data: [
        {
          source: "composer",
          sessionId: "composer-2",
          duration: 1_200_000,
          status: "active",
          stepCount: 31,
          isSaved: false,
        },
        {
          source: "composer",
          sessionId: "composer-1",
          duration: 900_000,
          status: "abandoned",
          stepCount: 18,
        },
      ],
    });
  });

  it("rejects invalid periods and limits before contacting PostHog", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const badPeriod = await POST(
      event({ type: "activity", userId: "uid", period: "forever" }) as never
    );
    const badLimit = await POST(
      event({ type: "sessions", userId: "uid", limit: 0 }) as never
    );
    expect(badPeriod.status).toBe(400);
    expect(badLimit.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("requires a bounded session ID before loading an event trail", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = await POST(
      event({ type: "session-events", userId: "uid", limit: 100 }) as never
    );
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses Auth creation time for membership rather than earliest analytics data", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(upstream([["2026-07-31T12:00:00Z", 2, 10, 20]]))
    );
    const response = await POST(
      event({ type: "engagement", userId: "uid" }) as never
    );
    await expect(response.json()).resolves.toMatchObject({
      data: { memberSince: "2025-01-01T00:00:00Z", sessionsCount: 2 },
    });
  });

  it("accepts path-safe custom Firebase UIDs", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(upstream([])));

    const response = await POST(
      event({
        type: "activity",
        userId: "tenant:sky.v2",
        period: "week",
      }) as never
    );

    expect(response.status).toBe(200);
  });

  it("returns earned 400 and upstream 502 failures without fake analytics", async () => {
    const invalid = await POST(
      event({ type: "activity", userId: "x".repeat(129) }) as never
    );
    expect(invalid.status).toBe(400);
    await expect(invalid.json()).resolves.toMatchObject({
      success: false,
      code: "read_request",
    });

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(upstream([], 503)));
    const failed = await POST(
      event({ type: "sessions", userId: "uid" }) as never
    );
    expect(failed.status).toBe(502);
    await expect(failed.json()).resolves.toMatchObject({
      success: false,
      code: "posthog",
    });
  });

  it("preserves an unavailable admin authorization response", async () => {
    mocks.requireAdmin.mockRejectedValueOnce({
      status: 503,
      body: { message: "Admin authorization is temporarily unavailable" },
    });

    const response = await POST(event({ type: "seo-scorecard" }) as never);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      success: false,
      message: "Admin authorization is temporarily unavailable",
      code: "authorize",
    });
  });

  it("retries a PostHog gateway timeout instead of failing the dashboard", async () => {
    // The SEO dashboard blanked on a one-off 504 from PostHog's query pool.
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(upstream([], 504))
      .mockResolvedValueOnce(upstream([["2026-08-01T00:00:00Z", "{}"]]));
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(event({ type: "seo-scorecard" }) as never);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      results: [["2026-08-01T00:00:00Z", "{}"]],
    });
  });

  it("gives up on a query PostHog rejects outright, with no retry", async () => {
    const fetchMock = vi.fn().mockResolvedValue(upstream([], 400));
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(event({ type: "seo-history" }) as never);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(502);
  });

  it("rejects malformed PostHog result envelopes instead of inventing zeros", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(upstream({ results: "bad" } as never))
        .mockResolvedValueOnce(upstream(["not-a-row"] as never))
    );

    const malformedResults = await POST(
      event({ type: "engagement", userId: "uid" }) as never
    );
    const malformedRow = await POST(
      event({ type: "engagement", userId: "uid" }) as never
    );
    expect(malformedResults.status).toBe(502);
    expect(malformedRow.status).toBe(502);
  });

  it("waits for the analytics audit attempt before returning success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(upstream([])));
    let releaseAudit: (() => void) | undefined;
    mocks.logAdminAction.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          releaseAudit = resolve;
        })
    );

    let settled = false;
    const responsePromise = POST(
      event({ type: "activity", userId: "uid", period: "week" }) as never
    ).then((response) => {
      settled = true;
      return response;
    });
    await vi.waitFor(() => expect(mocks.logAdminAction).toHaveBeenCalled());
    expect(settled).toBe(false);
    releaseAudit?.();
    expect((await responsePromise).status).toBe(200);
  });

  it("returns the rate limiter response before contacting PostHog", async () => {
    const blocked = new Response("blocked", { status: 429 });
    mocks.withRateLimit.mockResolvedValue(blocked);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(
      await POST(event({ type: "sessions", userId: "uid" }) as never)
    ).toBe(blocked);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("admin analytics row transformations", () => {
  it("preserves empty activity and rejects malformed sessions", () => {
    expect(_perUserResult("activity", [])).toEqual([]);
    expect(() =>
      _perUserResult("sessions", [["id", "bad", null, 1, []]])
    ).toThrow();
    expect(() =>
      _perUserResult("sessions", [["id", null, null, 1, []]])
    ).toThrow();
  });

  it("rejects missing, short, and null numeric cells", () => {
    expect(() => _perUserResult("engagement", [])).toThrow();
    expect(() => _perUserResult("engagement", [[null, 1, 2]])).toThrow();
    expect(() => _perUserResult("engagement", [[null, 1, null, 3]])).toThrow();
    expect(() => _perUserResult("activity", [["browse"]])).toThrow();
    expect(() =>
      _perUserResult("content", [["sequence_save", null]])
    ).toThrow();
    expect(() =>
      _perUserResult("sessions", [["id", "2026-07-31T12:00:00Z", null, 1]])
    ).toThrow();
  });

  it("maps session diagnostics and a direct PostHog handoff", () => {
    expect(
      _perUserResult(
        "sessions",
        [
          [
            "session-1",
            "2026-07-31T12:00:00Z",
            "2026-07-31T12:04:00Z",
            240_000,
            ["browse", "create"],
            18,
            2,
            1,
            "/browse",
            "/create",
            "Chrome",
            "Windows",
            "Desktop",
          ],
        ],
        "project"
      )
    ).toEqual([
      {
        source: "posthog",
        sessionId: "session-1",
        startedAt: "2026-07-31T12:00:00Z",
        endedAt: "2026-07-31T12:04:00Z",
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
        postHogUrl: "https://us.posthog.com/project/project/replay/session-1",
      },
    ]);
  });

  it("extracts the first PostHog exception from a session event", () => {
    expect(
      _perUserResult("session-events", [
        [
          "event-1",
          "2026-07-31T12:01:00Z",
          "$exception",
          "/create",
          "",
          JSON.stringify([{ type: "TypeError", value: "No gesture found" }]),
          null,
          null,
        ],
      ])
    ).toEqual([
      {
        eventId: "event-1",
        timestamp: "2026-07-31T12:01:00Z",
        event: "$exception",
        path: "/create",
        detail: null,
        exception: { type: "TypeError", message: "No gesture found" },
      },
    ]);
  });
});
