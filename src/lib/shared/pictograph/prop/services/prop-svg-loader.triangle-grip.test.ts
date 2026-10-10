import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";

import { PropSvgLoader } from "./prop-svg-loader";
import type { MotionData } from "../../shared/domain/models/motion-data";
import type { PropPlacementData } from "../domain/models/prop-placement-data";
import { HandSide } from "../../shared/domain/enums/pictograph-enums";
import { getMotionColor } from "#lib/shared/utils/svg-color-utils.js";

// The pictographs draw the triangle grip the animator draws. The loader used
// to resolve the triangle without the grip, so a side-grip player saw the
// side grip on the canvas and the corner grip on every pictograph and card.

const root = process.cwd();

class StaticFileLoader extends PropSvgLoader {
  readonly fetched: string[] = [];
  override async fetchSvgContent(href: string): Promise<string> {
    this.fetched.push(href);
    const file = href.replace(/\?.*$/, "");
    return fs.readFileSync(path.join(root, "static", file), "utf8");
  }
}

const placement: PropPlacementData = {
  positionX: 475,
  positionY: 475,
  rotationAngle: 0,
} as PropPlacementData;

function motion(propType: string, hand: HandSide): MotionData {
  return { propType, hand } as unknown as MotionData;
}

let loader: StaticFileLoader;

beforeEach(() => {
  loader = new StaticFileLoader();
  // The loader's caches are module-level, shared by every instance.
  loader.clearCache();
});

describe("PropSvgLoader triangle grip", () => {
  it("draws the side-grip glyph in the hand color on the corner glyph's box", async () => {
    const result = await loader.loadPropSvg(
      placement,
      motion("triangle", HandSide.LEFT),
      false,
      { themeMode: "dark", triangleGrip: "side" }
    );

    expect(loader.fetched).toEqual([
      "/images/props/appearances/triangle-side.svg?v=1",
    ]);
    const svg = result.svgData!.svgContent;
    // Selective recolor: the tube takes the hand color, the hardware and the
    // gold grip band keep theirs.
    expect(svg).toContain(getMotionColor(HandSide.LEFT, "dark"));
    expect(svg).not.toContain("#9A9A9A");
    expect(svg).toContain("#C9AC68");
    expect(result.svgData!.viewBox).toEqual({ width: 283.3, height: 162.17 });
    expect(result.svgData!.center).toEqual({ x: 141.65, y: 81.085 });
  });

  it("draws the side-grip capture under the Realistic look, turned like the corner one", async () => {
    const side = await loader.loadPropSvg(
      placement,
      motion("triangle", HandSide.RIGHT),
      false,
      { themeMode: "dark", propLook: "model", triangleGrip: "side" }
    );
    const corner = await loader.loadPropSvg(
      placement,
      motion("triangle", HandSide.RIGHT),
      false,
      { themeMode: "dark", propLook: "model" }
    );

    expect(loader.fetched).toEqual([
      expect.stringMatching(
        /^\/images\/props\/appearances\/model\/triangle_side-red\.svg\?v=/
      ),
      expect.stringMatching(
        /^\/images\/props\/appearances\/model\/triangle-red\.svg\?v=/
      ),
    ]);
    // Both captures paint on -x while the glyphs and tip tables reach +x.
    const turn = '<g transform="rotate(180 141.65 81.085)">';
    expect(side.svgData!.svgContent).toContain(turn);
    expect(corner.svgData!.svgContent).toContain(turn);
    expect(side.svgData!.svgContent).toContain(
      "triangle_side 3D model sprite (red)"
    );
  });

  it("keeps the corner glyph for the corner grip and ignores the grip for other props", async () => {
    const unset = await loader.loadPropSvg(
      placement,
      motion("triangle", HandSide.LEFT),
      false,
      { themeMode: "dark" }
    );
    const corner = await loader.loadPropSvg(
      placement,
      motion("triangle", HandSide.LEFT),
      false,
      { themeMode: "dark", triangleGrip: "corner" }
    );
    await loader.loadPropSvg(placement, motion("staff", HandSide.LEFT), false, {
      themeMode: "dark",
      triangleGrip: "side",
    });

    expect(loader.fetched).toEqual([
      "/images/props/pictograph/triangle.svg",
      "/images/props/pictograph/staff.svg",
    ]);
    expect(corner.svgData!.svgContent).toEqual(unset.svgData!.svgContent);
  });

  it("does not serve the corner triangle's cached artwork for the side grip", async () => {
    const corner = await loader.loadPropSvg(
      placement,
      motion("triangle", HandSide.LEFT),
      false,
      { themeMode: "dark" }
    );
    const side = await loader.loadPropSvg(
      placement,
      motion("triangle", HandSide.LEFT),
      false,
      { themeMode: "dark", triangleGrip: "side" }
    );

    expect(side.svgData!.svgContent).not.toEqual(corner.svgData!.svgContent);
  });
});
