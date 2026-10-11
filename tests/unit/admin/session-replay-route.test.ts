import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  withRateLimit: vi.fn(),
  logAdminAction: vi.fn(),
  postHogEnv: {
    POSTHOG_PERSONAL_API_KEY: "secret",
    POSTHOG_PROJECT_ID: "project-1",
    POSTHOG_API_HOST: "us.posthog.com",
  } as Record<string, string>,
}));

vi.mock("$app/env/private", async () => {
  const { envModule } = await import("#test-helpers/env-module.js");
  return envModule(mocks.postHogEnv);
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

import { POST } from "../../../src/routes/api/admin/session-replay/+server";

function event(body: unknown) {
  return {
    request: new Request("https://example.test/api/admin/session-replay", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    getClientAddress: () => "127.0.0.1",
  } as never;
}

describe("admin session replay endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    mocks.postHogEnv.POSTHOG_PERSONAL_API_KEY = "secret";
    mocks.postHogEnv.POSTHOG_PROJECT_ID = "project-1";
    mocks.postHogEnv.POSTHOG_API_HOST = "us.posthog.com";
    mocks.requireAdmin.mockResolvedValue({ uid: "admin" });
    mocks.withRateLimit.mockResolvedValue(null);
    mocks.logAdminAction.mockResolvedValue(undefined);
  });

  it("requires the shared live-admin authorization boundary", async () => {
    const denied = Object.assign(new Error("Forbidden"), { status: 403 });
    mocks.requireAdmin.mockRejectedValue(denied);

    await expect(POST(event({ sessionId: "session-1" }))).rejects.toBe(denied);
    expect(mocks.withRateLimit).not.toHaveBeenCalled();
  });

  it("rejects invalid session IDs before calling PostHog", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(event({ sessionId: "../another-session" }));

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("honors the existing admin rate limit", async () => {
    const blocked = new Response("Rate limited", { status: 429 });
    mocks.withRateLimit.mockResolvedValue(blocked);

    await expect(POST(event({ sessionId: "session-1" }))).resolves.toBe(
      blocked
    );
  });

  it("returns only the scoped embed URL and safe audit metadata", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ access_token: "share-token" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(event({ sessionId: "session-1" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      state: "ready",
      embedUrl: "https://us.posthog.com/embedded/share-token",
      message: "Replay ready",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://us.posthog.com/api/projects/project-1/session_recordings/session-1/sharing/",
      expect.objectContaining({
        method: "PATCH",
        headers: expect.objectContaining({ Authorization: "Bearer secret" }),
        body: JSON.stringify({ enabled: true }),
      })
    );
    expect(mocks.logAdminAction).toHaveBeenCalledWith({
      uid: "admin",
      action: "session_replay_opened",
      target: "posthog-session",
      metadata: { result: "ready" },
      ip: "127.0.0.1",
    });
  });
});
