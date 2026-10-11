import { render } from "vitest-browser-svelte";
import { page } from "vitest/browser";
import { beforeEach, describe, expect, it, vi } from "vitest";
import UserActivityAnalytics from "./UserActivityAnalytics.svelte";

const service = vi.hoisted(() => ({
  getEngagementSummary: vi.fn(),
  getActivityBreakdown: vi.fn(),
  getContentMetrics: vi.fn(),
  getRecentSessions: vi.fn(),
  getSessionEvents: vi.fn(),
  getSessionReplayAccess: vi.fn(),
}));
vi.mock("#lib/features/admin/get-post-hog-user-analytics.js", () => ({
  getPostHogUserAnalytics: () => service,
}));

const emptyEngagement = {
  source: "posthog" as const,
  lastActiveAt: null,
  memberSince: null,
  sessionsCount: 0,
  avgSessionDuration: 0,
  totalTimeSpent: 0,
};
const emptyContent = {
  sequencesCreated: 0,
  sequencesSaved: 0,
  sequencesExported: 0,
  collectionsCreated: 0,
  sequencesShared: 0,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve };
}

describe("UserActivityAnalytics transitions", () => {
  beforeEach(() => {
    for (const mock of Object.values(service)) mock.mockReset();
    service.getEngagementSummary.mockResolvedValue(emptyEngagement);
    service.getActivityBreakdown.mockResolvedValue([]);
    service.getContentMetrics.mockResolvedValue(emptyContent);
    service.getRecentSessions.mockResolvedValue([]);
    service.getSessionEvents.mockResolvedValue([]);
    service.getSessionReplayAccess.mockResolvedValue({
      state: "unavailable",
      embedUrl: null,
      message: "No recording",
    });
  });

  it("preserves genuine empty analytics and reloads the selected period", async () => {
    render(UserActivityAnalytics, { userId: "uid", compact: true });
    await expect
      .element(page.getByText("No sessions in this window"))
      .toBeVisible();
    await expect
      .element(page.getByText("No page views in 7 days."))
      .toBeVisible();
    await expect.element(page.getByText("Collections")).toBeVisible();
    expect(service.getEngagementSummary).toHaveBeenCalledTimes(1);
    expect(service.getContentMetrics).toHaveBeenCalledTimes(1);
    expect(service.getRecentSessions).toHaveBeenCalledTimes(1);
    expect(service.getActivityBreakdown).toHaveBeenCalledTimes(1);

    await page.getByRole("radio", { name: "30 days" }).click();
    await expect
      .poll(() => service.getActivityBreakdown.mock.calls.at(-1)?.[1])
      .toBe("month");
    expect(service.getActivityBreakdown).toHaveBeenCalledTimes(2);
    expect(service.getEngagementSummary).toHaveBeenCalledTimes(2);
    expect(service.getContentMetrics).toHaveBeenCalledTimes(2);
    expect(service.getRecentSessions).toHaveBeenCalledTimes(2);
    expect(service.getEngagementSummary.mock.calls.at(-1)?.[1]).toBe("month");
    expect(service.getContentMetrics.mock.calls.at(-1)?.[1]).toBe("month");
    expect(service.getRecentSessions.mock.calls.at(-1)?.[1]).toBe("month");
  });

  it("shows a failure and retries instead of replacing it with data", async () => {
    service.getEngagementSummary
      .mockRejectedValueOnce(new Error("PostHog unavailable"))
      .mockResolvedValueOnce(emptyEngagement);
    render(UserActivityAnalytics, { userId: "uid" });
    await expect.element(page.getByText("PostHog unavailable")).toBeVisible();
    await page.getByRole("button", { name: "Retry" }).first().click();
    await expect
      .poll(() => service.getEngagementSummary.mock.calls.length)
      .toBe(2);
    await expect.element(page.getByText("Last active")).toBeVisible();
    expect(service.getActivityBreakdown).toHaveBeenCalledTimes(1);
    expect(service.getContentMetrics).toHaveBeenCalledTimes(1);
    expect(service.getRecentSessions).toHaveBeenCalledTimes(1);
  });

  it("does not report an empty session insight while sessions are loading", async () => {
    const pendingSessions = deferred<never[]>();
    service.getRecentSessions.mockReturnValue(pendingSessions.promise);

    render(UserActivityAnalytics, { userId: "uid" });

    await expect.element(page.getByText("Last active")).toBeVisible();
    await expect
      .element(page.getByLabelText("Loading session diagnostics"))
      .toBeVisible();
    await expect
      .element(page.getByText("No sessions to inspect"))
      .not.toBeInTheDocument();

    pendingSessions.resolve([]);
    await expect
      .element(page.getByText("No sessions to inspect"))
      .toBeVisible();
  });

  it("does not let a previous user's deferred analytics overwrite the current user", async () => {
    const oldEngagement = deferred<typeof emptyEngagement>();
    const newEngagement = deferred<typeof emptyEngagement>();
    service.getEngagementSummary.mockImplementation((uid: string) =>
      uid === "old" ? oldEngagement.promise : newEngagement.promise
    );
    const screen = render(UserActivityAnalytics, { userId: "old" });
    await screen.rerender({ userId: "new" });
    newEngagement.resolve({ ...emptyEngagement, sessionsCount: 2 });
    await expect.element(page.getByText("2", { exact: true })).toBeVisible();
    oldEngagement.resolve({ ...emptyEngagement, sessionsCount: 99 });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await expect
      .element(page.getByText("99", { exact: true }))
      .not.toBeInTheDocument();
  });

  it("drills into a session event trail with exception context", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    service.getRecentSessions.mockResolvedValue([
      {
        source: "posthog",
        sessionId: "session-1",
        startedAt: new Date("2026-07-31T12:00:00.000Z"),
        endedAt: new Date("2026-07-31T12:04:00.000Z"),
        duration: 240_000,
        modules: ["browse", "create"],
        eventCount: 18,
        exceptionCount: 1,
        contentActionCount: 2,
        entryPath: "/browse",
        exitPath: "/create",
        browser: "Chrome",
        operatingSystem: "Windows",
        deviceType: "Desktop",
        postHogUrl: "https://us.posthog.com/project/1/replay/session-1",
      },
    ]);
    service.getSessionEvents.mockResolvedValue([
      {
        eventId: "event-1",
        timestamp: new Date("2026-07-31T12:01:00.000Z"),
        event: "$exception",
        path: "/create",
        detail: null,
        exception: { type: "TypeError", message: "No gesture found" },
      },
    ]);

    render(UserActivityAnalytics, {
      userId: "uid",
      userDisplayName: "Sky Guys Quest",
      userUsername: "tester",
      userEmail: "tester@example.com",
    });
    await page.getByRole("button", { name: /Inspect session from/ }).click();
    await expect.element(page.getByText("No gesture found")).toBeVisible();
    await page
      .getByRole("button", {
        name: "Copy session exceptions as a report for AI",
      })
      .click();
    await expect.poll(() => writeText.mock.calls.length).toBe(1);
    expect(writeText.mock.calls[0]?.[0]).toContain(
      "# TKA session exception report"
    );
    expect(writeText.mock.calls[0]?.[0]).toContain("- Name: Sky Guys Quest");
    expect(writeText.mock.calls[0]?.[0]).toContain(
      '- Message: "No gesture found"'
    );
    expect(service.getSessionEvents).toHaveBeenCalledWith(
      "uid",
      "session-1",
      expect.any(AbortSignal)
    );
    expect(service.getSessionReplayAccess).toHaveBeenCalledWith(
      "session-1",
      expect.any(AbortSignal)
    );
  });

  it("shows recovered Composer evidence without requesting PostHog detail", async () => {
    service.getEngagementSummary.mockResolvedValue({
      source: "composer",
      lastActiveAt: "2026-08-19T22:21:17.007Z",
      memberSince: "2026-08-19T21:09:06.000Z",
      sessionsCount: 1,
      avgSessionDuration: 1_200_000,
      totalTimeSpent: 1_200_000,
    });
    service.getRecentSessions.mockResolvedValue([
      {
        source: "composer",
        sessionId: "composer-1",
        startedAt: new Date("2026-08-19T22:01:16.456Z"),
        endedAt: new Date("2026-08-19T22:21:17.007Z"),
        duration: 1_200_551,
        name: "Sequence 4:52:11 PM",
        status: "active",
        stepCount: 31,
        isSaved: false,
        lastAutosaveAt: new Date("2026-08-19T22:21:17.007Z"),
      },
    ]);

    render(UserActivityAnalytics, { userId: "uid" });

    await expect.element(page.getByText("31 steps")).toBeVisible();
    await expect
      .element(page.getByText("Composer autosave record"))
      .toBeVisible();
    await page.getByRole("button", { name: /Inspect session from/ }).click();
    await expect
      .element(page.getByText("Recovered from Composer storage"))
      .toBeVisible();
    expect(service.getSessionEvents).not.toHaveBeenCalled();
    expect(service.getSessionReplayAccess).not.toHaveBeenCalled();
  });

  it("opens a notification target once and leaves the session list usable", async () => {
    service.getRecentSessions.mockResolvedValue([
      {
        source: "posthog",
        sessionId: "target-session",
        startedAt: new Date("2026-08-09T12:00:00.000Z"),
        endedAt: null,
        duration: 60_000,
        modules: ["create"],
        eventCount: 5,
        exceptionCount: 0,
        contentActionCount: 1,
        entryPath: "/create",
        exitPath: "/create",
        browser: "Chrome",
        operatingSystem: "Windows",
        deviceType: "Desktop",
        postHogUrl: "https://us.posthog.com/project/1/replay/target-session",
      },
    ]);

    render(UserActivityAnalytics, {
      userId: "uid",
      targetSessionId: "target-session",
    });

    await expect.element(page.getByText("Session inspection")).toBeVisible();
    await page.getByRole("button", { name: "Sessions" }).click();
    await expect
      .element(page.getByRole("button", { name: /Inspect session from/ }))
      .toBeVisible();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await expect
      .element(page.getByRole("button", { name: /Inspect session from/ }))
      .toBeVisible();
  });

  it("opens the exact notification replay before PostHog indexes its summary", async () => {
    service.getRecentSessions.mockResolvedValue([]);

    render(UserActivityAnalytics, {
      userId: "uid",
      targetSessionId: "fresh-session",
    });

    await expect.element(page.getByText("Current session")).toBeVisible();
    await expect.element(page.getByText("Indexing")).toBeVisible();
    await expect
      .element(
        page.getByText(
          "Replay requested from the return notification. Session details will appear after PostHog indexes them."
        )
      )
      .toBeVisible();
    await expect
      .poll(() => service.getSessionReplayAccess.mock.calls.length)
      .toBe(1);
    expect(service.getSessionReplayAccess).toHaveBeenCalledWith(
      "fresh-session",
      expect.any(AbortSignal)
    );
    expect(service.getSessionEvents).toHaveBeenCalledWith(
      "uid",
      "fresh-session",
      expect.any(AbortSignal)
    );
  });
});
