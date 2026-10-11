import { describe, expect, it } from "vitest";
import { resolveAdminCreatedSequenceTarget } from "#lib/shared/inbox/domain/admin-created-sequence-target.js";

describe("saved-sequence notification navigation", () => {
  it("targets the creator's private library instead of the admin's library", () => {
    expect(
      resolveAdminCreatedSequenceTarget("creator-1", "sequence-1")
    ).toEqual({
      ownerId: "creator-1",
      sequenceId: "sequence-1",
      path: "users/creator-1/sequences/sequence-1",
    });
  });

  it("rejects notifications that cannot identify the exact saved sequence", () => {
    expect(
      resolveAdminCreatedSequenceTarget(undefined, "sequence-1")
    ).toBeNull();
    expect(
      resolveAdminCreatedSequenceTarget("creator-1", undefined)
    ).toBeNull();
  });
});
