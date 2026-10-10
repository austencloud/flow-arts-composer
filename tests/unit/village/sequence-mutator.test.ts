import { afterEach, describe, expect, it, vi } from "vitest";
import { tryInventFrom } from "#lib/features/village/services/sequence-mutator.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("tryInventFrom", () => {
  it("returns an invented sequence identity for a valid source", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);

    expect(tryInventFrom("source-sequence")).toEqual({
      success: true,
      mutationType: "mirror",
      inventedId: "source-sequence:mirror",
    });
  });

  it("returns a typed failure for an empty source identity", () => {
    expect(tryInventFrom("   ")).toEqual({
      success: false,
      reason: "invalid-source",
    });
  });
});
