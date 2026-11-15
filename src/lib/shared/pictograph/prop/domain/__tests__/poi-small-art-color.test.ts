import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { HandSide } from "../../../shared/domain/enums/pictograph-enums";
import {
  applyMotionColorToSvg,
  getMotionColor,
} from "#lib/shared/utils/svg-color-utils.js";
import { applyHandColorOverride } from "../prop-preview-color";

// The small poi (data-poi-art="small") must come out of the colour pipeline
// whole in the hand's colour, while the regular drawing still colours only its
// head. Nothing on screen would flag a grey cord in a 64px picture as a bug.
// Resolved from the repo root (see prop-preview-color.test.ts).
const poiSvg = readFileSync(
  resolve("static/images/props/pictograph/poi.svg"),
  "utf8"
);

/** The loader's colouring for poi (prop-svg-loader applyColorToSvg). */
function loaderColored(hand: HandSide): string {
  return applyMotionColorToSvg(poiSvg, hand, {
    makeClassNamesUnique: true,
    themeMode: "dark",
    selectiveColorMode: true,
  });
}

function group(svg: string, art: "regular" | "small"): string {
  const match = svg.match(
    new RegExp(`<g data-poi-art="${art}"[^>]*>([\\s\\S]*?)</g>`)
  );
  if (!match) throw new Error(`no ${art} group`);
  return match[1]!;
}

function partFill(groupSvg: string, part: string): string | undefined {
  const tag = groupSvg.match(
    new RegExp(`<[a-z]+[^>]*data-poi-part="${part}"[^>]*>`)
  )?.[0];
  return tag?.match(/\sfill="([^"]+)"/)?.[1]?.toLowerCase();
}

describe("poi small art colour", () => {
  for (const hand of [HandSide.LEFT, HandSide.RIGHT]) {
    it(`paints the small cord and head in the ${hand} hand colour`, () => {
      const color = getMotionColor(hand, "dark").toLowerCase();
      const colored = loaderColored(hand);

      const small = group(colored, "small");
      expect(partFill(small, "tether")).toBe(color);
      expect(partFill(small, "head")).toBe(color);

      const regular = group(colored, "regular");
      expect(partFill(regular, "head")).toBe(color);
      expect(partFill(regular, "tether")).not.toBe(color);
      expect(partFill(regular, "knob")).not.toBe(color);
    });
  }

  it("follows a custom hand colour onto the whole small poi", () => {
    const custom = "#22c55e";
    const colored = applyHandColorOverride(
      loaderColored(HandSide.LEFT),
      HandSide.LEFT,
      "poi",
      custom
    );

    const small = group(colored, "small");
    expect(partFill(small, "tether")).toBe(custom);
    expect(partFill(small, "head")).toBe(custom);

    const regular = group(colored, "regular");
    expect(partFill(regular, "head")).toBe(custom);
    expect(partFill(regular, "tether")).not.toBe(custom);
    expect(partFill(regular, "knob")).not.toBe(custom);
  });

  it("keeps the small drawing hidden to renderers without the app's CSS", () => {
    expect(loaderColored(HandSide.LEFT)).toMatch(
      /<g data-poi-art="small" display="none">/
    );
  });
});
