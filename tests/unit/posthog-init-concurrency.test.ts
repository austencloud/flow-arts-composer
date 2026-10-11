import { beforeEach, describe, expect, it, vi } from "vitest";

const postHogMock = vi.hoisted(() => ({
  init: vi.fn(),
  identify: vi.fn(),
  reset: vi.fn(),
  reloadFeatureFlags: vi.fn(),
}));

vi.mock("$app/env", () => ({ browser: true }));
vi.mock("$app/env/public", async () => {
  const { envModule } = await import("#test-helpers/env-module.js");
  return envModule({
    PUBLIC_POSTHOG_HOST: "https://test.posthog.com",
    PUBLIC_POSTHOG_KEY: "test-key",
    PUBLIC_POSTHOG_PROJECT_ID: "test-project",
  });
});
vi.mock("#lib/shared/foundation/services/device-id.js", () => ({
  getDeviceId: () => "device-1",
}));
vi.mock("posthog-js", () => ({ default: postHogMock }));

describe("PostHog initialization", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("shares one in-flight initialization across concurrent callers", async () => {
    const { initPostHog } =
      await import("#lib/shared/analytics/services/posthog.js");
    postHogMock.init.mockImplementation((_key, config) => {
      config.loaded(postHogMock);
    });

    const first = initPostHog();
    const second = initPostHog();
    const third = initPostHog();

    expect(second).toBe(first);
    expect(third).toBe(first);

    await Promise.all([first, second, third]);

    expect(postHogMock.init).toHaveBeenCalledOnce();
    const config = postHogMock.init.mock.calls[0]?.[1];
    expect(config).toHaveProperty("capture_dead_clicks");
    expect(config.capture_dead_clicks).toBe(config.autocapture);
    expect(postHogMock.reloadFeatureFlags).toHaveBeenCalledOnce();
  });

  it("identifies a user who signs in before PostHog is ready", async () => {
    const { identifyUser, initPostHog } =
      await import("#lib/shared/analytics/services/posthog.js");
    postHogMock.init.mockImplementation((_key, config) => {
      config.loaded(postHogMock);
    });

    identifyUser("user-1", {
      email: "person@example.com",
      role: "user",
      createdAt: new Date("2026-08-19T21:09:06Z"),
    });

    expect(postHogMock.identify).not.toHaveBeenCalled();
    await initPostHog();
    expect(postHogMock.identify).toHaveBeenCalledOnce();
    expect(postHogMock.identify).toHaveBeenCalledWith("user-1", {
      email: "person@example.com",
      name: undefined,
      username: undefined,
      role: "user",
      created_at: "2026-08-19T21:09:06.000Z",
      is_premium: undefined,
      is_tester: undefined,
      is_admin: undefined,
    });
  });

  it("does not identify a user who signs out before PostHog is ready", async () => {
    const { identifyUser, initPostHog, resetUser } =
      await import("#lib/shared/analytics/services/posthog.js");
    postHogMock.init.mockImplementation((_key, config) => {
      config.loaded(postHogMock);
    });

    identifyUser("user-1");
    resetUser();
    await initPostHog();

    expect(postHogMock.identify).not.toHaveBeenCalled();
    expect(postHogMock.reset).not.toHaveBeenCalled();
  });
});
