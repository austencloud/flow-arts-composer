import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getCompositionRecipe } from "../prop-composition-recipes";
import {
  FAN_BUILDS,
  isFanPropType,
  type FanAppearance,
} from "../fan-appearance";
import { propGlyphArtwork } from "../prop-look";
import { colorPropPreview, previewArtworkPath } from "../prop-preview-color";
import {
  getAllPropTypes,
  getBasePropType,
  getPropTypeDisplayInfo,
} from "../prop-type-display-registry";
import {
  fitBoundsInBox,
  handArtworkSize,
  pairHandPlacements,
  pairPaintedBounds,
  placedHandBounds,
  svgSourceAspect,
  type PairBounds,
} from "../pair-fit";
import type { PropType } from "../enums/prop-type";

const BOXES = [
  { width: 20, height: 16 },
  { width: 26, height: 26 },
  { width: 30, height: 22 },
  { width: 36, height: 36 },
  { width: 40, height: 40 },
];

function artworkSource(href: string, type: PropType): string | null {
  const path = previewArtworkPath(href).split("?")[0]!;
  try {
    return colorPropPreview(
      readFileSync(join(process.cwd(), "static", path), "utf8"),
      type,
      "#3575e2"
    );
  } catch {
    return null;
  }
}

function looks(type: PropType): FanAppearance[] {
  const base: FanAppearance = {
    build: "fire",
    frameColor: "black",
    cover: "bare",
  };
  return isFanPropType(type)
    ? FAN_BUILDS.flatMap((build) =>
        (["bare", "covered"] as const).map((cover) => ({
          ...base,
          build,
          cover,
        }))
      )
    : [base];
}

function inside(inner: PairBounds, outer: PairBounds): boolean {
  const e = 1e-9;
  return (
    inner.x >= outer.x - e &&
    inner.y >= outer.y - e &&
    inner.x + inner.width <= outer.x + outer.width + e &&
    inner.y + inner.height <= outer.y + outer.height + e
  );
}

describe("pair box fit", () => {
  // Every prop, deactivated ones too: a saved contact ball still draws on the
  // Props button.
  const types = getAllPropTypes();

  it.each(types)(
    "%s: the crop holds both hands and the fit stays in every box",
    (type) => {
      for (const look of looks(type)) {
        const recipe = getCompositionRecipe(type, true);
        const placements = pairHandPlacements(recipe, false);
        const info = getPropTypeDisplayInfo(type);
        const hands = (["left", "right"] as const).map((side) => {
          const art = propGlyphArtwork(
            type,
            side,
            { fanAppearance: look },
            info.image
          );
          return {
            placement: placements[side]!,
            artwork: handArtworkSize(
              art.crop,
              svgSourceAspect(art.crop ? null : artworkSource(art.href, type))
            ),
          };
        });
        const bounds = pairPaintedBounds(hands)!;
        expect(bounds.width).toBeGreaterThan(0);
        expect(bounds.height).toBeGreaterThan(0);
        for (const hand of hands) {
          expect(
            inside(placedHandBounds(hand.placement, hand.artwork), bounds)
          ).toBe(true);
        }
        for (const box of BOXES) {
          const fit = fitBoundsInBox(bounds, box.width, box.height);
          expect(fit.width).toBeLessThanOrEqual(box.width + 1e-9);
          expect(fit.height).toBeLessThanOrEqual(box.height + 1e-9);
          // As large as the box allows: one side meets it.
          expect(
            Math.max(fit.width / box.width, fit.height / box.height)
          ).toBeCloseTo(1, 9);
          // Aspect kept.
          expect(fit.width / fit.height).toBeCloseTo(
            bounds.width / bounds.height,
            9
          );
        }
      }
    }
  );

  it("covers every base family's mixed and single-hand placements", () => {
    const recipe = getCompositionRecipe(getBasePropType(types[0]!), true);
    const mixed = pairHandPlacements(recipe, true);
    expect(mixed.left).toBeDefined();
    expect(mixed.right).toBeDefined();
    const single = pairHandPlacements(recipe, false, "right");
    expect(single.left).toBeUndefined();
    expect(single.right).toMatchObject({ x: 50, y: 50 });
  });

  it("crops a two-fan pair tighter than the full canvas", () => {
    const fan = types.find((t) => isFanPropType(t))!;
    const recipe = getCompositionRecipe(fan, true);
    const placements = pairHandPlacements(recipe, false);
    const art = propGlyphArtwork(
      fan,
      "left",
      { fanAppearance: looks(fan)[0]! },
      "x.svg"
    );
    const artwork = handArtworkSize(art.crop);
    const bounds = pairPaintedBounds([
      { placement: placements.left!, artwork },
      { placement: placements.right!, artwork },
    ])!;
    expect(bounds.width).toBeLessThan(100);
    expect(bounds.height).toBeLessThan(100);
  });
});

describe("svgSourceAspect", () => {
  it("reads the viewBox, then width and height, else 1", () => {
    expect(svgSourceAspect('<svg viewBox="0 0 200 50">')).toBe(4);
    expect(svgSourceAspect('<svg width="30" height="60">')).toBe(0.5);
    expect(svgSourceAspect("<svg>")).toBe(1);
    expect(svgSourceAspect(null)).toBe(1);
  });
});
