import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BUUGENG_STYLES,
  BUUGENG_STYLE_OPTIONS,
  DEFAULT_BUUGENG_STYLE,
  buugengAppearanceArtwork,
  isStyledBuugengPropType,
  normalizeBuugengStyle,
  parseBuugengRenderKey,
  renderedBuugengStyle,
  resolveBuugengRenderKey,
} from "../buugeng-appearance";
import {
  basePropTypeOfRenderKey,
  propTileArtwork,
  resolvePropRenderKey,
} from "../prop-look";
import { getPropDimensions } from "#lib/shared/animation-engine/services/IPropTextureLoader.js";
import { resolvePropSvgPath } from "#lib/shared/animation-engine/services/svg-generator.js";
import { getTipPoints } from "#lib/shared/animation-engine/domain/types/prop-tip-points.js";
import { propTextureMatchesRequest } from "#lib/shared/animation-engine/services/canvas2d/prop-texture-match.js";

const STATIC = resolve(__dirname, "../../../../../../../static");
const viewBoxOf = (publicPath: string) => {
  const file = resolve(STATIC, publicPath.replace(/^\//, "").split("?")[0]!);
  return readFileSync(file, "utf8").match(/viewBox="([^"]+)"/)?.[1];
};

describe("buugeng style appearance", () => {
  it("defaults to Classic and rejects garbage", () => {
    expect(DEFAULT_BUUGENG_STYLE).toBe("classic");
    expect(normalizeBuugengStyle(undefined)).toBe("classic");
    expect(normalizeBuugengStyle("perf")).toBe("classic");
    expect(normalizeBuugengStyle(3)).toBe("classic");
    for (const style of BUUGENG_STYLES) {
      expect(normalizeBuugengStyle(style)).toBe(style);
    }
    expect(BUUGENG_STYLE_OPTIONS.map((option) => option.id)).toEqual([
      ...BUUGENG_STYLES,
    ]);
    expect(BUUGENG_STYLE_OPTIONS[0]!.label).toBe("Classic");
  });

  it("keeps a retired invented cut on a styled blade", () => {
    for (const retired of ["lune", "talon", "spike", "fang"]) {
      expect(normalizeBuugengStyle(retired)).toBe("crescent");
    }
    expect(parseBuugengRenderKey("buugeng__lune")).toBeNull();
  });

  it("only styles buugeng and big buugeng", () => {
    expect(isStyledBuugengPropType("buugeng")).toBe(true);
    expect(isStyledBuugengPropType("BigBuugeng")).toBe(true);
    expect(isStyledBuugengPropType("trigeng")).toBe(false);
    expect(isStyledBuugengPropType("staff")).toBe(false);
    expect(resolvePropRenderKey("trigeng", { buugengStyle: "fire" })).toBe(
      "trigeng"
    );
    expect(resolvePropRenderKey("staff", { buugengStyle: "fire" })).toBe(
      "staff"
    );
  });

  it("keeps Classic on the plain render key", () => {
    expect(resolvePropRenderKey("buugeng", {})).toBe("buugeng");
    expect(resolvePropRenderKey("buugeng", { buugengStyle: "classic" })).toBe(
      "buugeng"
    );
    expect(resolveBuugengRenderKey("bigbuugeng", "classic")).toBe(
      "bigbuugeng"
    );
    expect(buugengAppearanceArtwork("buugeng", "classic")).toBeNull();
  });

  it("round-trips every style's render key to the notation prop", () => {
    for (const propType of ["buugeng", "bigbuugeng"] as const) {
      for (const style of BUUGENG_STYLES.filter((s) => s !== "classic")) {
        const key = resolvePropRenderKey(propType, { buugengStyle: style });
        expect(key).toBe(`${propType}__${style}`);
        expect(parseBuugengRenderKey(key)).toEqual({ propType, style });
        expect(basePropTypeOfRenderKey(key)).toBe(propType);
        expect(
          propTextureMatchesRequest({
            loaded: key,
            requested: key,
            paramsPropType: propType,
          })
        ).toBe(true);
      }
    }
    expect(parseBuugengRenderKey("buugeng")).toBeNull();
    expect(parseBuugengRenderKey("buugeng__classic")).toBeNull();
    expect(parseBuugengRenderKey("trigeng__crescent")).toBeNull();
    expect(parseBuugengRenderKey("triangle__side")).toBeNull();
  });

  it("names a render's style only when a buugeng is drawn styled", () => {
    expect(renderedBuugengStyle("classic", ["buugeng", "buugeng"])).toBe(
      undefined
    );
    expect(renderedBuugengStyle(undefined, ["buugeng"])).toBe(undefined);
    expect(renderedBuugengStyle("crescent", ["staff", "fan"])).toBe(undefined);
    expect(renderedBuugengStyle("crescent", ["staff", "bigbuugeng"])).toBe(
      "crescent"
    );
  });

  it("draws every style on the plain buugeng's frame, box and folder", () => {
    for (const style of BUUGENG_STYLES.filter((s) => s !== "classic")) {
      for (const [propType, plainBox] of [
        ["buugeng", "0 0 262.6 135.9"],
        ["bigbuugeng", "0 0 600 293.1"],
      ] as const) {
        const key = `${propType}__${style}`;
        const sprite = resolvePropSvgPath(key);
        expect(sprite).toBe(
          `/images/props/pictograph/${propType}-${style}.svg?v=4`
        );
        expect(viewBoxOf(sprite)).toBe(plainBox);
        expect(viewBoxOf(`/images/props/pictograph/${propType}.svg`)).toBe(
          plainBox
        );
        expect(
          viewBoxOf(buugengAppearanceArtwork(propType, style, "buttons")!)
        ).toBe(viewBoxOf(`/images/props/buttons/${propType}.svg`));
        expect(
          viewBoxOf(buugengAppearanceArtwork(propType, style, "animated")!)
        ).toBe(viewBoxOf(`/images/props/animated/${propType}.svg`));
        expect(getPropDimensions(key)).toEqual(getPropDimensions(propType));
      }
    }
  });

  it("tracks a styled tip on the drawn tip, point-symmetric about the hand", () => {
    const plain = getTipPoints("buugeng").points;
    const styled = getTipPoints("buugeng__crescent").points;
    expect(styled).not.toEqual(plain);
    expect(styled).toHaveLength(2);
    expect(styled[0]!.dx).toBeCloseTo(-styled[1]!.dx);
    expect(styled[0]!.dy).toBeCloseTo(-styled[1]!.dy);
    // The +x terminal stays first, as on the plain pair.
    expect(styled[0]!.dx).toBeGreaterThan(0);
  });

  it("shows the style on the picker tile", () => {
    expect(
      propTileArtwork(
        "buugeng",
        "left",
        { buugengStyle: "fire" },
        "/images/props/buttons/buugeng.svg"
      ).href
    ).toBe("/images/props/buttons/buugeng-fire.svg?v=4");
    expect(
      propTileArtwork(
        "buugeng",
        "left",
        {},
        "/images/props/buttons/buugeng.svg"
      ).href
    ).toBe("/images/props/buttons/buugeng.svg");
  });
});
