import { describe, it, expect } from "vitest";
import { resolveOptimisticAccessTier } from "#lib/shared/auth/domain/access-tier.js";

describe("resolveOptimisticAccessTier", () => {
  it("uses the real tier once auth has resolved", () => {
    expect(resolveOptimisticAccessTier(false, "user", "premium")).toBe("user");
  });
  it("falls back to the snapshot tier while auth is loading", () => {
    expect(resolveOptimisticAccessTier(true, "guest", "premium")).toBe("premium");
  });
  it("uses real tier while loading when there is no snapshot", () => {
    expect(resolveOptimisticAccessTier(true, "guest", null)).toBe("guest");
  });
});
