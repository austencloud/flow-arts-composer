// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  VISIT_STATE_KEY,
  isInternalBrowser,
  markInternalBrowser,
} from "#lib/shared/analytics/internal-browser.js";

const postHogMock = vi.hoisted(() => ({
  init: vi.fn(),
  identify: vi.fn(),
  reset: vi.fn(),
  register: vi.fn(),
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

async function readyPostHog() {
  vi.resetModules();
  const module = await import("#lib/shared/analytics/services/posthog.js");
  postHogMock.init.mockImplementation((_key, config) => {
    config.loaded(postHogMock);
  });
  await module.initPostHog();
  return module;
}

const internalRegistrations = () =>
  postHogMock.register.mock.calls.filter(
    ([props]) => (props as Record<string, unknown>)["is_internal"] === true
  );

describe("internal browser marker", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("is off until an admin marks the browser, and keeps the visit report's fields", () => {
    localStorage.setItem(
      VISIT_STATE_KEY,
      JSON.stringify({ count: 3, lastSeenAt: 5 })
    );
    expect(isInternalBrowser()).toBe(false);

    markInternalBrowser();

    expect(isInternalBrowser()).toBe(true);
    expect(JSON.parse(localStorage.getItem(VISIT_STATE_KEY)!)).toEqual({
      count: 3,
      lastSeenAt: 5,
      admin: true,
    });
  });

  it("reads as an outside visitor when storage is broken or refused", () => {
    localStorage.setItem(VISIT_STATE_KEY, "{not json");
    expect(isInternalBrowser()).toBe(false);

    const getItem = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new DOMException("denied", "SecurityError");
      });
    expect(isInternalBrowser()).toBe(false);
    expect(() => markInternalBrowser()).not.toThrow();
    getItem.mockRestore();
  });

  it("leaves an ordinary signed-in user unmarked", async () => {
    const { identifyUser } = await readyPostHog();
    identifyUser("user-1", { email: "person@example.com", isAdmin: false });

    expect(internalRegistrations()).toHaveLength(0);
    expect(postHogMock.identify.mock.calls[0]?.[1]).not.toHaveProperty(
      "is_internal"
    );
    expect(isInternalBrowser()).toBe(false);
  });

  it("marks an admin's events and person, and keeps the mark after sign-out", async () => {
    const { identifyUser, resetUser } = await readyPostHog();
    identifyUser("admin-1", { isAdmin: true });

    expect(isInternalBrowser()).toBe(true);
    expect(internalRegistrations()).toHaveLength(1);
    expect(postHogMock.identify.mock.calls[0]?.[1]).toMatchObject({
      is_admin: true,
      is_internal: true,
    });

    // reset() wipes super properties; the mark has to come back after it.
    resetUser();
    expect(postHogMock.reset).toHaveBeenCalledOnce();
    expect(postHogMock.register.mock.invocationCallOrder.at(-1)).toBeGreaterThan(
      postHogMock.reset.mock.invocationCallOrder[0]!
    );
    expect(internalRegistrations()).toHaveLength(2);
  });

  it("tags a later signed-out visit from a marked browser on load", async () => {
    markInternalBrowser();
    await readyPostHog();
    expect(internalRegistrations()).toHaveLength(1);
  });
});
