import { describe, expect, it } from "vitest";
import { resolvePostHogApiHost } from "#lib/shared/analytics/services/posthog.js";

describe("resolvePostHogApiHost", () => {
  it("migrates the missing and legacy direct production hosts to the relay", () => {
    expect(resolvePostHogApiHost(undefined, false)).toBe(
      "https://rune.tkaflowarts.com"
    );
    expect(resolvePostHogApiHost("https://us.i.posthog.com/", false)).toBe(
      "https://rune.tkaflowarts.com"
    );
  });

  it("preserves a deliberate custom production host", () => {
    expect(resolvePostHogApiHost("https://events.example.com", false)).toBe(
      "https://events.example.com"
    );
  });

  it("keeps the configured development host", () => {
    expect(resolvePostHogApiHost("https://us.i.posthog.com", true)).toBe(
      "https://us.i.posthog.com"
    );
  });
});
