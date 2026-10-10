import { beforeEach, describe, expect, it, vi } from "vitest";

const captureWhenReady = vi.hoisted(() => vi.fn());

vi.mock("#lib/shared/analytics/services/posthog.js", () => ({
  captureWhenReady,
}));

import {
  disarmAuthFunnel,
  trackAuthModalAbandoned,
  trackAuthModalSubmitted,
  trackAuthProviderResult,
  trackAuthSurfaceOpened,
} from "#lib/shared/analytics/auth-events.js";

describe("auth encounter analytics", () => {
  beforeEach(() => {
    captureWhenReady.mockClear();
    disarmAuthFunnel();
  });

  it("carries the opening surface and origin through submission and completion", () => {
    trackAuthSurfaceOpened({
      surface: "guest_nudge_modal",
      origin: "guest-first-save",
      auth_mode: "signup",
    });
    trackAuthModalSubmitted("google", "signup");
    trackAuthProviderResult("google", "completed");

    expect(captureWhenReady.mock.calls).toEqual([
      [
        "auth_modal_opened",
        {
          surface: "guest_nudge_modal",
          origin: "guest-first-save",
          auth_mode: "signup",
        },
      ],
      [
        "auth_modal_submitted",
        {
          surface: "guest_nudge_modal",
          origin: "guest-first-save",
          auth_mode: "signup",
          method: "google",
        },
      ],
      [
        "auth_provider_result",
        expect.objectContaining({ outcome: "completed", method: "google" }),
      ],
      [
        "auth_modal_completed",
        expect.objectContaining({ outcome: "completed", method: "google" }),
      ],
    ]);
  });

  it("does not invent downstream events without a measured opening", () => {
    trackAuthModalSubmitted("password", "signin");
    trackAuthProviderResult("password", "failed", "auth/invalid-credential");
    trackAuthModalAbandoned("unmounted");

    expect(captureWhenReady).not.toHaveBeenCalled();
  });
});
