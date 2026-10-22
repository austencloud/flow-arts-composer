// @vitest-environment-options {"url":"https://tkaflowarts.com/learn?utm_source=newsletter&utm_medium=email"}
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("#lib/shared/analytics/services/posthog.js", () => ({
  getCurrentPostHogSessionId: vi.fn(async () => "ph-session-1"),
}));

const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));

async function freshModule() {
  vi.resetModules();
  return import("#lib/shared/analytics/services/visit-report.js");
}

function sentReports(): Array<Record<string, unknown>> {
  return fetchMock.mock.calls.map((call) => {
    const [url, init] = call as unknown as [string, RequestInit];
    expect(url).toBe("/api/visit");
    return JSON.parse(String(init.body)) as Record<string, unknown>;
  });
}

describe("reportVisit", () => {
  beforeEach(() => {
    localStorage.clear();
    fetchMock.mockClear();
    vi.stubGlobal("fetch", fetchMock);
    history.replaceState(
      null,
      "",
      "/learn?utm_source=newsletter&utm_medium=email"
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("reports a first visit with how the visitor arrived", async () => {
    const { reportVisit } = await freshModule();
    await reportVisit();

    const [report] = sentReports();
    expect(report).toMatchObject({
      landingPath: "/learn",
      utm: { source: "newsletter", medium: "email" },
      visitNumber: 1,
      sinceLastVisitMs: null,
      postHogSessionId: "ph-session-1",
    });
    // The query string stays out of the landing path; it can carry tokens.
    expect(report?.["landingPath"]).toBe("/learn");
  });

  it("counts page loads within half an hour as the same visit", async () => {
    await (await freshModule()).reportVisit();
    await (await freshModule()).reportVisit();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("numbers a later visit and says how long they were away", async () => {
    await (await freshModule()).reportVisit();
    const state = JSON.parse(localStorage.getItem("tka-visit-report") ?? "{}");
    const threeDays = 3 * 24 * 60 * 60 * 1000;
    localStorage.setItem(
      "tka-visit-report",
      JSON.stringify({ ...state, lastSeenAt: state.lastSeenAt - threeDays })
    );

    await (await freshModule()).reportVisit();

    const [, second] = sentReports();
    expect(second?.["visitNumber"]).toBe(2);
    expect(second?.["sinceLastVisitMs"]).toBeGreaterThanOrEqual(threeDays);
  });

  it("stays quiet in a browser an admin has signed in on", async () => {
    const { rememberAdminBrowser } = await freshModule();
    rememberAdminBrowser(true);

    await (await freshModule()).reportVisit();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("stays quiet for a signed-in member, but not for a guest", async () => {
    const key = "firebase:authUser:test-key:[DEFAULT]";
    localStorage.setItem(
      key,
      JSON.stringify({ uid: "u1", isAnonymous: false })
    );
    await (await freshModule()).reportVisit();
    expect(fetchMock).not.toHaveBeenCalled();

    localStorage.clear();
    localStorage.setItem(key, JSON.stringify({ uid: "g1", isAnonymous: true }));
    await (await freshModule()).reportVisit();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("leaves QR-code landings to the scan alert", async () => {
    history.replaceState(null, "", "/q/ABCD");
    await (await freshModule()).reportVisit();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
