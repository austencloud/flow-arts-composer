import { describe, expect, it } from "vitest";
import { derivePropElementalType } from "../src/core/prop-tnd.js";
import {
  getStandaloneRenderer,
  type PictographInput,
} from "../src/core/standalone-renderer.js";

// Letter A from alpha1: both hands pro, one turn each, props pointing in.
// The props start half a rotation apart and spin the same way: split-same.
const LETTER_A: PictographInput = {
  letter: "A",
  startPosition: "alpha1",
  endPosition: "alpha3",
  gridMode: "diamond",
  leftMotion: {
    motionType: "pro",
    startLocation: "s",
    endLocation: "w",
    rotationDirection: "cw",
    hand: "left",
    turns: 1,
    startOrientation: "in",
  },
  rightMotion: {
    motionType: "pro",
    startLocation: "n",
    endLocation: "e",
    rotationDirection: "cw",
    hand: "right",
    turns: 1,
    startOrientation: "in",
  },
} as PictographInput;

const START_POSITION: PictographInput = {
  letter: "α",
  startPosition: "alpha1",
  endPosition: "alpha1",
  gridMode: "diamond",
  leftMotion: {
    motionType: "static",
    startLocation: "s",
    endLocation: "s",
    rotationDirection: "no_rotation",
    hand: "left",
    turns: 0,
    startOrientation: "in",
  },
  rightMotion: {
    motionType: "static",
    startLocation: "n",
    endLocation: "n",
    rotationDirection: "no_rotation",
    hand: "right",
    turns: 0,
    startOrientation: "in",
  },
} as PictographInput;

function propGroup(svg: string): string | null {
  const match = svg.match(
    /<g class="svg-glyph svg-glyph-prop-tnd">[\s\S]*?<\/g>\s*<\/g>/
  );
  return match ? match[0] : null;
}

describe("prop timing-and-direction element", () => {
  it("classifies letter A's props as split-same (water)", () => {
    expect(
      derivePropElementalType(LETTER_A.leftMotion, LETTER_A.rightMotion)
    ).toBe("water");
  });

  it("gives a static start position no element", () => {
    expect(
      derivePropElementalType(
        START_POSITION.leftMotion,
        START_POSITION.rightMotion
      )
    ).toBeNull();
  });

  it("gives unequal turn rates or a float no element", () => {
    expect(
      derivePropElementalType(LETTER_A.leftMotion, {
        ...LETTER_A.rightMotion,
        turns: 2,
      })
    ).toBeNull();
    expect(
      derivePropElementalType(LETTER_A.leftMotion, {
        ...LETTER_A.rightMotion,
        turns: "fl",
      })
    ).toBeNull();
  });
});

describe("standalone renderer prop TnD glyph", () => {
  it("is off by default", async () => {
    const svg = await getStandaloneRenderer().renderToSvg(LETTER_A, {
      showTKA: false,
    });
    expect(propGroup(svg)).toBeNull();
  });

  it("draws the element inside a dashed spin ring in the top-right slot", async () => {
    const svg = await getStandaloneRenderer().renderToSvg(LETTER_A, {
      showTKA: false,
      showPropTnD: true,
    });
    const group = propGroup(svg);
    expect(group).not.toBeNull();
    expect(group).toContain('stroke-dasharray="14 10"');
    expect(group).toContain('preserveAspectRatio="xMidYMid meet"');
  });

  it("draws nothing for a start position even when requested", async () => {
    const svg = await getStandaloneRenderer().renderToSvg(START_POSITION, {
      showTKA: false,
      showPropTnD: true,
    });
    expect(propGroup(svg)).toBeNull();
  });
});
