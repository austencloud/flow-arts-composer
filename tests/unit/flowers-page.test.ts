import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { detectSiteMode } from "../../src/config/domains";
import { calculate } from "../../src/lib/shared/mandala/services/mandala-geometry-calculator";
import { getMandalaPathOptions } from "../../src/lib/shared/mandala/services/mandala-path-options";
import {
  buildShapeMatrixAxis,
  flowerKey,
} from "../../src/lib/shared/shape-matrix/domain/flower-signature";
import { NAMED_SHAPES } from "../../src/routes/(public)/flowers/_data/named-shapes";
import { LEVEL2_ANCHOR_ROUTE_SLUG } from "../../src/routes/(public)/guide/level-2/_data/level2-topic-manifest";

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => false },
}));

const bootScript = [
  ...readFileSync("src/app.html", "utf8").matchAll(
    /<script>([\s\S]*?)<\/script>/g
  ),
].find((match) => match[1]?.includes("var isLanding ="))?.[1];

afterEach(() => window.history.replaceState({}, "", "/"));

describe("flowers page", () => {
  // The engine builds paths only for flowers on its axis, so a flower off
  // the axis has nothing to draw.
  it("draws only flowers the shape engine builds", () => {
    const built = new Set(buildShapeMatrixAxis().map(flowerKey));
    const missing = NAMED_SHAPES.filter(
      ({ drawing }) =>
        drawing.kind === "flower" && !built.has(flowerKey(drawing.flower))
    );
    expect(missing.map((shape) => shape.id)).toEqual([]);
  });

  // Steps the geometry cannot read come back as no paths at all, which
  // paints an empty square.
  it("traces both staff ends for every sequence shape", () => {
    const blank = NAMED_SHAPES.filter(({ drawing }) => {
      if (drawing.kind !== "sequence") return false;
      const paths = calculate(
        drawing.steps,
        undefined,
        undefined,
        getMandalaPathOptions("arc", 2)
      );
      return paths.left.length !== 2 || paths.left.some((path) => !path);
    });
    expect(blank.map((shape) => shape.id)).toEqual([]);
  });

  it("links every shape to a Guide section that exists", () => {
    const broken = NAMED_SHAPES.filter(({ link }) => {
      if (!link) return false;
      const [, slug, anchor] =
        link.href.match(/^\/guide\/level-2\/([^#]+)#(.+)$/) ?? [];
      return !anchor || LEVEL2_ANCHOR_ROUTE_SLUG[anchor] !== slug;
    });
    expect(broken.map((shape) => shape.id)).toEqual([]);
  });

  it("gives every shape a unique anchor", () => {
    const ids = NAMED_SHAPES.map((shape) => shape.id);
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
