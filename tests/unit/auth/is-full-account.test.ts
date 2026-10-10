import { describe, it, expect } from "vitest";
import { isFullAccountUser } from "#lib/shared/auth/domain/access-tier.js";

describe("isFullAccountUser", () => {
  it("no user (unauthenticated) → false", () => {
    expect(isFullAccountUser(false, false)).toBe(false);
  });
  it("anonymous (authenticated but anon) → false", () => {
    expect(isFullAccountUser(true, true)).toBe(false);
  });
  it("full account (authenticated, not anon) → true", () => {
    expect(isFullAccountUser(true, false)).toBe(true);
  });
  it("defensive: unauthenticated but anon flag set → false", () => {
    expect(isFullAccountUser(false, true)).toBe(false);
  });
});
