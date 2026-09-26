import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { detectSiteMode } from "../../src/config/domains";
import {
  buildShapeMatrixAxis,
  flowerKey,
} from "../../src/lib/shared/shape-matrix/domain/flower-signature";
import { FLOWER_NAMES } from "../../src/routes/(public)/flowers/_data/flower-names";

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => false },
}));

const bootScript = [
  ...readFileSync("src/app.html", "utf8").matchAll(
    /<script>([\s\S]*?)<\/script>/g
  ),
].find((match) => match[1]?.includes("var isLanding ="))?.[1];

afterEach(() => window.history.replaceState({}, "", "/"));

describe("flower names page", () => {
  // The engine builds paths only for flowers on its axis, so a flower off
  // the axis has nothing to draw.
  it("draws only flowers the shape engine builds", () => {
    const built = new Set(buildShapeMatrixAxis().map(flowerKey));
    const missing = FLOWER_NAMES.filter(
      (entry) => !built.has(flowerKey(entry.flower))
    );
    expect(missing.map((entry) => entry.id)).toEqual([]);
  });

  it("gives every flower a unique anchor", () => {
    const ids = FLOWER_NAMES.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps a direct visit out of app initialization", () => {
    window.history.replaceState({}, "", "/flowers");
    expect(detectSiteMode()).toBe("landing");
    const bootWindow = { location: { pathname: "/flowers" } };
    expect(bootScript).toBeDefined();
    runInNewContext(bootScript!, { window: bootWindow });
    expect(bootWindow).toHaveProperty("__tkaIsLanding", true);
  });
});
