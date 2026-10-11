import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  getArrowPath,
  getArrowSvgPath,
} from "#lib/shared/pictograph/arrow/rendering/services/arrow-path-resolver.js";
import { applyColorToSvg } from "#lib/shared/pictograph/arrow/rendering/services/arrow-svg-color-transformer.js";
import { parseArrowSvg } from "#lib/shared/pictograph/arrow/rendering/services/arrow-svg-parser.js";
import { createArrowPlacementData } from "#lib/shared/pictograph/arrow/positioning/placement/domain/create-arrow-placement-data.js";
import {
  HandSide,
  MotionType,
  Orientation,
  RotationDirection,
  SkewDirection,
} from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import { createMotionData } from "#lib/shared/pictograph/shared/domain/models/motion-data.js";

const quarterOrientations = [
  [Orientation.IN, "from_radial"],
  [Orientation.OUT, "from_radial"],
  [Orientation.CLOCK, "from_nonradial"],
  [Orientation.COUNTER, "from_nonradial"],
  [Orientation.CLOCK_IN, "from_interradial_clock_in"],
  [Orientation.COUNTER_OUT, "from_interradial_clock_in"],
  [Orientation.CLOCK_OUT, "from_interradial_clock_out"],
  [Orientation.COUNTER_IN, "from_interradial_clock_out"],
] as const;

const centerOrientations = [
  [Orientation.CENTER_N, "from_center_n"],
  [Orientation.CENTER_NE, "from_center_ne"],
  [Orientation.CENTER_E, "from_center_e"],
  [Orientation.CENTER_SE, "from_center_se"],
  [Orientation.CENTER_S, "from_center_s"],
  [Orientation.CENTER_SW, "from_center_sw"],
  [Orientation.CENTER_W, "from_center_w"],
  [Orientation.CENTER_NW, "from_center_nw"],
] as const;

describe("full quarter-turn arrow asset resolution", () => {
  it.each([
    MotionType.PRO,
    MotionType.ANTI,
    MotionType.STATIC,
    MotionType.DASH,
  ])(
    "resolves every %s start-orientation axis to authored 0.25 art",
    (motionType) => {
      for (const [startOrientation, folder] of quarterOrientations) {
        const motion = createMotionData({
          motionType,
          rotationDirection:
            motionType === MotionType.PRO
              ? RotationDirection.CLOCKWISE
              : RotationDirection.COUNTER_CLOCKWISE,
          startOrientation,
          turns: 0.25,
        });
        const expected = `/images/arrows/${motionType}/${folder}/${motionType}_0.25.svg`;

        expect(getArrowPath(createArrowPlacementData(), motion)).toBe(expected);
        expect(getArrowSvgPath(motion)).toBe(expected);
        const source = readFileSync(resolve(`static${expected}`), "utf8");
        expect(source).toContain("stroke:#2e3192");
        const dimensions = parseArrowSvg(source);
        expect(dimensions.width).toBeGreaterThan(0);
        expect(dimensions.height).toBeGreaterThan(0);
      }
    }
  );

  it.each([MotionType.STATIC, MotionType.DASH])(
    "resolves every %s center-orientation axis to authored 0.25 art",
    (motionType) => {
      for (const [startOrientation, folder] of centerOrientations) {
        const motion = createMotionData({
          motionType,
          rotationDirection: RotationDirection.CLOCKWISE,
          startOrientation,
          turns: 0.25,
        });
        const expected = `/images/arrows/${motionType}/${folder}/${motionType}_0.25.svg`;

        expect(getArrowSvgPath(motion)).toBe(expected);
        const source = readFileSync(resolve(`static${expected}`), "utf8");
        expect(source).toContain('viewBox="0 0 500 500"');
        expect(source).toContain("stroke:#2e3192");
      }
    }
  );

  it.each([SkewDirection.PLUS, SkewDirection.MINUS])(
    "does not request an absent skew%s quarter asset",
    (skewDir) => {
      const motion = createMotionData({
        motionType: MotionType.PRO,
        rotationDirection: RotationDirection.CLOCKWISE,
        startOrientation: Orientation.CLOCK_IN,
        turns: 0.25,
        skewSteps: 1,
        skewDir,
      });

      expect(getArrowSvgPath(motion)).toBe(
        "/images/arrows/pro/from_interradial_clock_in/pro_0.25.svg"
      );
    }
  );

  it("preserves interradial identity when a renderer supplies lowercase camel-case tokens", () => {
    const motion = createMotionData({
      motionType: MotionType.PRO,
      startOrientation: "clockin" as never,
      turns: 0.25,
    });

    expect(getArrowSvgPath(motion)).toBe(
      "/images/arrows/pro/from_interradial_clock_in/pro_0.25.svg"
    );
  });

  it("keeps existing half-turn filenames and folders unchanged", () => {
    const motion = createMotionData({
      motionType: MotionType.PRO,
      startOrientation: Orientation.CLOCK_IN,
      turns: 0.5,
    });

    expect(getArrowPath(createArrowPlacementData(), motion)).toBe(
      "/images/arrows/pro/from_nonradial/pro_0.5.svg"
    );
    expect(getArrowSvgPath(motion)).toBe(
      "/images/arrows/pro/from_nonradial/pro_0.5.svg"
    );
  });

  it("recolors the quarter art's strokes for the red motion", () => {
    const source = readFileSync(
      resolve("static/images/arrows/pro/from_radial/pro_0.25.svg"),
      "utf8"
    );
    const colored = applyColorToSvg(source, HandSide.RIGHT, "dark");

    expect(colored).not.toContain("stroke:#2e3192");
    expect(colored).toMatch(/stroke:#[0-9a-f]{6}/i);
  });
});
