import { describe, it, expect } from "vitest";
import { stripEscapeTestParams } from "#lib/shared/auth/config/app-availability.js";

describe("stripEscapeTestParams", () => {
  it("removes forceIAB and appLaunched, keeps everything else", () => {
    const out = stripEscapeTestParams(
      "https://tkaflowarts.com/create?forceIAB=ios&x=1&appLaunched=1#frag"
    );
    expect(out).not.toContain("forceIAB");
    expect(out).not.toContain("appLaunched");
    expect(out).toContain("x=1");
    expect(out).toContain("#frag");
  });

  it("leaves a clean url untouched", () => {
    const url = "https://tkaflowarts.com/create/construct";
    expect(stripEscapeTestParams(url)).toBe(url);
  });

  it("returns the input unchanged when it isn't a url", () => {
    expect(stripEscapeTestParams("not a url")).toBe("not a url");
  });
});
