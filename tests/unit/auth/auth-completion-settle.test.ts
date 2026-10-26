import { beforeEach, describe, expect, it, vi } from "vitest";

const posthog = vi.hoisted(() => ({
  captureWhenReady: vi.fn(),
  instance: {
    register_for_session: vi.fn(),
    unregister_for_session: vi.fn(),
  },
}));

vi.mock("#lib/shared/analytics/services/posthog.js", () => ({
  captureWhenReady: posthog.captureWhenReady,
  getPostHogInstance: () => posthog.instance,
}));

import {
  disarmAuthFunnel,
  trackAuthProviderResult,
  trackAuthSurfaceOpened,
} from "#lib/shared/analytics/auth-events.js";
import {
  clearAuthSubmissionBridge,
  recordAuthSubmission,
  settleAuthSubmissionCompleted,
} from "#lib/shared/auth/services/auth-analytics-bridge.js";

function eventsNamed(name: string) {
  return posthog.captureWhenReady.mock.calls.filter(([event]) => event === name);
}

/**
 * The navigation drawer's sign-in form (surface auth_sheet, origin
 * module_navigation) showed submissions and no completions: the drawer
 * cleared the funnel the instant the account appeared, and the Google
 * button's later `completed` report was dropped. Either side may now report
 * first, and the completion is counted exactly once.
 */
describe("sign-in completion when the host settles the funnel", () => {
  beforeEach(() => {
    clearAuthSubmissionBridge();
    disarmAuthFunnel();
    posthog.captureWhenReady.mockClear();
    trackAuthSurfaceOpened({
      surface: "auth_sheet",
      origin: "module_navigation",
      auth_mode: "signin",
    });
    recordAuthSubmission("google", "signin");
  });

  it("counts one completion when the host settles before the provider reports", () => {
    settleAuthSubmissionCompleted();
    trackAuthProviderResult("google", "completed");

    const completed = eventsNamed("auth_modal_completed");
    expect(completed).toHaveLength(1);
    expect(completed[0]![1]).toMatchObject({
      surface: "auth_sheet",
      origin: "module_navigation",
      method: "google",
      outcome: "completed",
    });
    expect(eventsNamed("auth_provider_result")).toHaveLength(1);
  });

  it("counts one completion when the provider reports before the host settles", () => {
    trackAuthProviderResult("google", "completed");
    settleAuthSubmissionCompleted();

    const completed = eventsNamed("auth_modal_completed");
    expect(completed).toHaveLength(1);
    expect(completed[0]![1]).toMatchObject({
      surface: "auth_sheet",
      method: "google",
    });
    expect(eventsNamed("auth_provider_result")).toHaveLength(1);
  });

  it("only clears when nothing was submitted in this encounter", () => {
    clearAuthSubmissionBridge();
    trackAuthSurfaceOpened({ surface: "auth_sheet", origin: "module_navigation" });

    settleAuthSubmissionCompleted();

    expect(eventsNamed("auth_modal_completed")).toHaveLength(0);
  });
});
