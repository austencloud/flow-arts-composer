import { describe, expect, it } from "vitest";
import {
  mapPostHogSharingResponse,
  postHogAppOrigin,
} from "#lib/server/analytics/posthog-replay-access.js";

describe("PostHog replay access", () => {
  it.each([{ access_token: "snake-token" }, { accessToken: "camel-token" }])(
    "builds an official embed URL from %#",
    (body) => {
      const result = mapPostHogSharingResponse(
        200,
        body,
        "https://us.posthog.com"
      );

      expect(result.state).toBe("ready");
      expect(result.embedUrl).toMatch(
        /^https:\/\/us\.posthog\.com\/embedded\/(snake|camel)-token$/
      );
    }
  );

  it("maps missing API scopes without exposing PostHog's response body", () => {
    const result = mapPostHogSharingResponse(
      403,
      { detail: "private upstream detail" },
      "https://us.posthog.com"
    );

    expect(result.state).toBe("configuration");
    expect(result.message).not.toContain("private upstream detail");
  });

  it("treats a recording that is not available yet as processing", () => {
    expect(
      mapPostHogSharingResponse(404, null, "https://us.posthog.com").state
    ).toBe("processing");
  });

  it("normalizes the configured PostHog application host", () => {
    expect(postHogAppOrigin("us.posthog.com")).toBe("https://us.posthog.com");
    expect(() => postHogAppOrigin("http://us.posthog.com")).toThrow(
      "must use HTTPS"
    );
  });
});
