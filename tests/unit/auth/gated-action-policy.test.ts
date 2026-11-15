import { describe, it, expect } from "vitest";
import { requiresFullAccount } from "#lib/shared/auth/domain/gated-action-policy.js";

describe("requiresFullAccount", () => {
  it("publish requires a full account", () => {
    expect(requiresFullAccount("publish")).toBe(true);
  });
  it.each(["save", "favorite", "remix", "sendTo", "download"] as const)(
    "%s is allowed for anonymous guests",
    (type) => {
      expect(requiresFullAccount(type)).toBe(false);
    }
  );
});
