import { describe, it, expect } from "vitest";
import { hashString } from "#lib/shared/foundation/services/content-hasher.js";

describe("hashString", () => {
  it("is deterministic", () => {
    expect(hashString("alpha|beta")).toBe(hashString("alpha|beta"));
  });
  it("distinguishes different inputs", () => {
    expect(hashString("alpha")).not.toBe(hashString("beta"));
  });
  it("returns a fixed-width base62 string", () => {
    expect(hashString("x")).toHaveLength(22);
  });
});
