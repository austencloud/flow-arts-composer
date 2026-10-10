import { describe, it, expect } from "vitest";
import { resolveAccessTier, getMaxSteps, ACCESS_TIER_LABELS } from "#lib/shared/auth/domain/access-tier.js";

describe("resolveAccessTier", () => {
  it("unauthenticated → guest", () => {
    expect(resolveAccessTier(false, false, false)).toBe("guest");
  });
  it("anonymous (authenticated but anon) → guest", () => {
    expect(resolveAccessTier(true, true, false)).toBe("guest");
  });
  it("anonymous never escalates to premium", () => {
    expect(resolveAccessTier(true, true, true)).toBe("guest");
  });
  it("full non-premium → user", () => {
    expect(resolveAccessTier(true, false, false)).toBe("user");
  });
  it("full premium → premium", () => {
    expect(resolveAccessTier(true, false, true)).toBe("premium");
  });
  it("guest cap stays 8 for anonymous", () => {
    expect(getMaxSteps(resolveAccessTier(true, true, false))).toBe(8);
  });
});

describe("getMaxSteps", () => {
  it("guest cap is 8", () => expect(getMaxSteps("guest")).toBe(8));
  it("user cap is 64", () => expect(getMaxSteps("user")).toBe(64));
  it("premium cap is 64", () => expect(getMaxSteps("premium")).toBe(64));
});

describe("ACCESS_TIER_LABELS", () => {
  it("labels match product tier names", () => {
    expect(ACCESS_TIER_LABELS.guest).toBe("Guest");
    expect(ACCESS_TIER_LABELS.user).toBe("Composer");
    expect(ACCESS_TIER_LABELS.premium).toBe("Scribe");
  });
});
