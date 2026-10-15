// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

/** What the boot screen's nav hold waits on: auth, then flags for an account. */
const auth = vi.hoisted(() => ({
  isInitialized: false,
  isAuthenticated: false,
  isAnonymous: false,
}));
const flags = vi.hoisted(() => ({ isInitialized: false }));

vi.mock("#lib/shared/auth/state/auth-state.svelte", () => ({
  authState: auth,
}));
vi.mock(
  "#lib/shared/auth/services/post-hog-feature-flag-service.svelte",
  () => ({
    featureFlagService: flags,
    featureFlagState: { flagsVersion: 0 },
  })
);
vi.mock("#lib/shared/analytics/services/posthog-activity-logger.js", () => ({
  logModuleView: vi.fn(async () => {}),
}));
vi.mock("#lib/shared/analytics/services/posthog", () => ({
  captureEvent: vi.fn(),
}));
vi.mock("$app/env", () => ({
  browser: true,
  dev: true,
  building: false,
  version: "test",
}));
vi.mock("$app/navigation", () => ({ goto: vi.fn() }));

const { isModuleListFinal } =
  await import("#lib/shared/navigation-coordinator/navigation-coordinator.svelte");

describe("isModuleListFinal", () => {
  beforeEach(() => {
    Object.assign(auth, {
      isInitialized: false,
      isAuthenticated: false,
      isAnonymous: false,
    });
    flags.isInitialized = false;
  });

  it("is not final before auth has resolved", () => {
    flags.isInitialized = true;
    expect(isModuleListFinal()).toBe(false);
  });

  it("is final for a guest once auth resolves, without the flags' round trip", () => {
    auth.isInitialized = true;
    expect(isModuleListFinal()).toBe(true);

    auth.isAuthenticated = true;
    auth.isAnonymous = true;
    expect(isModuleListFinal()).toBe(true);
  });

  it("waits for the feature flags for a signed-in account", () => {
    Object.assign(auth, { isInitialized: true, isAuthenticated: true });
    expect(isModuleListFinal()).toBe(false);
    flags.isInitialized = true;
    expect(isModuleListFinal()).toBe(true);
  });
});
