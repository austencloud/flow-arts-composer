import { describe, expect, it } from "vitest";
import { domain } from "@tka/shape-engine";

describe("package wiring", () => {
  it("resolves the engine and domain packages from this checkout", () => {
    expect(domain.SHAPE_DOMAIN_VERSION).toBe("0.1.0");
  });
});
