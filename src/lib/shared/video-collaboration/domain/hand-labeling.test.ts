import { describe, expect, it } from "vitest";
import {
  DEFAULT_HAND_LABELING,
  isHandLabeling,
  resolveHandLabeling,
} from "./hand-labeling";

describe("hand labeling", () => {
  it("defaults to mirror me", () => {
    expect(DEFAULT_HAND_LABELING).toBe("mirror-me");
    expect(resolveHandLabeling(undefined)).toBe("mirror-me");
    expect(resolveHandLabeling({})).toBe("mirror-me");
    expect(resolveHandLabeling({ handLabeling: undefined })).toBe("mirror-me");
  });

  it("keeps an explicit choice", () => {
    expect(resolveHandLabeling({ handLabeling: "as-performed" })).toBe(
      "as-performed"
    );
    expect(resolveHandLabeling({ handLabeling: "mirror-me" })).toBe(
      "mirror-me"
    );
  });

  it("recognises only the two values", () => {
    expect(isHandLabeling("mirror-me")).toBe(true);
    expect(isHandLabeling("as-performed")).toBe(true);
    expect(isHandLabeling("mirrored")).toBe(false);
    expect(isHandLabeling(null)).toBe(false);
  });
});
