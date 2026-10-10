import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArrowSvg } from "#lib/shared/pictograph/arrow/rendering/services/arrow-svg-parser.js";

const ASSETS = ["pro", "anti", "dash", "static"].map(
  (mt) => `static/images/arrows/${mt}_half/from_radial/${mt}_half.svg`
);

describe("_half assets parse cleanly through parseArrowSvg", () => {
  for (const rel of ASSETS) {
    it(`${rel} → valid viewBox + finite center`, () => {
      const svg = readFileSync(resolve(process.cwd(), rel), "utf8");
      const dims = parseArrowSvg(svg);
      expect(dims.width).toBeGreaterThan(0);
      expect(dims.height).toBeGreaterThan(0);
      expect(dims.center).toBeDefined();
      expect(Number.isFinite(dims.center!.x)).toBe(true);
      expect(Number.isFinite(dims.center!.y)).toBe(true);
      expect(svg).toMatch(/#2e3192/i);
      expect(svg).toMatch(/viewBox\s*=/i);
    });
  }
});
