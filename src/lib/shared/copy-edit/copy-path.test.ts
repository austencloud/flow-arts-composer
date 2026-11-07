import { describe, expect, it } from "vitest";
import { isEditableCopyPath } from "./copy-path";

describe("isEditableCopyPath", () => {
  it("accepts a copy.json under src", () => {
    expect(
      isEditableCopyPath("src/routes/(public)/notation/caps/copy.json")
    ).toBe(true);
  });

  for (const file of [
    "../x/copy.json",
    "src/../../x/copy.json",
    "src/x/other.json",
    "/src/x/copy.json",
    "E:/tka-platform/src/x/copy.json",
    "src\\x\\copy.json",
    "src/x/copy.json/..",
    "src/%2e%2e/%2e%2e/copy.json",
    "src/x/%2E%2E/copy.json",
    "src//copy.json",
    "src/./copy.json",
    "static/copy.json",
    "copy.json",
    "src/x/copy.json:stream",
    "",
    null,
    42,
  ]) {
    it(`rejects ${JSON.stringify(file)}`, () => {
      expect(isEditableCopyPath(file)).toBe(false);
    });
  }
});
