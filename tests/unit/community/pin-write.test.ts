import { describe, expect, it } from "vitest";
import { pinWriteFor } from "#lib/features/community/domain/pin-write.js";

describe("pinWriteFor", () => {
  it("writes a listed person's pin public, with no mark", () => {
    expect(pinWriteFor({})).toEqual({ visibility: "public" });
    expect(pinWriteFor({ isHidden: false, isDisabled: null })).toEqual({
      visibility: "public",
    });
    expect(pinWriteFor(null)).toEqual({ visibility: "public" });
  });

  it("writes a hidden or disabled person's pin private and marked", () => {
    const marked = { visibility: "private", hiddenByFlag: true };
    expect(pinWriteFor({ isHidden: true })).toEqual(marked);
    expect(pinWriteFor({ isDisabled: true })).toEqual(marked);
    expect(pinWriteFor({ isHidden: true, isDisabled: true })).toEqual(marked);
  });
});
