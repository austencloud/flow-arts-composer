import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  env: {
    PUBLIC_ENVIRONMENT: "production",
    PUBLIC_POSTHOG_KEY: "phc_test",
  } as Record<string, string>,
  requireFirebaseUser: vi.fn(),
  withRateLimit: vi.fn(),
  capture: vi.fn(),
}));

vi.mock("$app/env/public", async () => {
  const { envModule } = await import("#test-helpers/env-module.js");
  return envModule(mocks.env);
});
vi.mock("#lib/server/auth/requireFirebaseUser.js", () => ({
  requireFirebaseUser: mocks.requireFirebaseUser,
}));
vi.mock("#lib/server/security/withRateLimit.js", () => ({
  withRateLimit: mocks.withRateLimit,
}));
vi.mock("#lib/server/security/rate-limiter.js", () => ({
  RATE_LIMITS: { GENERAL: {} },
}));
vi.mock("#lib/server/analytics/posthog-lifecycle-capture.js", () => ({
  capturePostHogLifecycleEvent: mocks.capture,
}));

import { POST } from "../../src/routes/api/rune/lifecycle/+server";

function event(body: unknown, sessionId = "session-123") {
  return {
    request: new Request("https://example.test/api/rune/lifecycle", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-PostHog-Session-ID": sessionId,
      },
      body: JSON.stringify(body),
    }),
    url: new URL("https://example.test/api/rune/lifecycle"),
    getClientAddress: () => "127.0.0.1",
  };
}

const validEnvelope = {
  event: "sequence_save",
  eventId: "6a0d8c75-cf65-4c53-a378-f6533d654c73",
  occurredAt: "2026-08-21T12:00:00.000Z",
  properties: {
    sequenceId: "sequence-1",
    stepCount: 20,
    visibility: "public",
    durability: "cloud",
  },
};

describe("lifecycle event endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.env.PUBLIC_POSTHOG_KEY = "phc_test";
    mocks.env.PUBLIC_ENVIRONMENT = "production";
    mocks.requireFirebaseUser.mockResolvedValue({
      uid: "verified-uid",
      signInProvider: "google.com",
    });
    mocks.withRateLimit.mockResolvedValue(null);
    mocks.capture.mockResolvedValue(undefined);
  });

  it("captures a strict event under the verified Firebase identity", async () => {
    const response = await POST(event(validEnvelope) as never);

    expect(response.status).toBe(200);
    expect(mocks.capture).toHaveBeenCalledWith({
      apiKey: "phc_test",
      distinctId: "verified-uid",
      envelope: validEnvelope,
      sessionId: "session-123",
      isGuest: false,
    });
  });

  it("rejects unknown properties before capture", async () => {
    const response = await POST(
      event({ ...validEnvelope, distinctId: "spoofed-uid" }) as never
    );

    expect(response.status).toBe(400);
    expect(mocks.capture).not.toHaveBeenCalled();
  });

  it("returns the authentication failure without parsing the body", async () => {
    mocks.requireFirebaseUser.mockRejectedValue(
      Object.assign(new Error("expired"), { status: 401 })
    );

    const response = await POST(event(validEnvelope) as never);

    expect(response.status).toBe(401);
    expect(mocks.withRateLimit).not.toHaveBeenCalled();
    expect(mocks.capture).not.toHaveBeenCalled();
  });

  it("does not send local or preview lifecycle events to production", async () => {
    mocks.env.PUBLIC_ENVIRONMENT = "development";

    const response = await POST(event(validEnvelope) as never);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      accepted: false,
      disabled: true,
    });
    expect(mocks.capture).not.toHaveBeenCalled();
  });
});
