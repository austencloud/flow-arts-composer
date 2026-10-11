import { describe, expect, it } from "vitest";
import { shouldMirrorProp } from "./canvas-2d-transform-helper";
import { pictographKeyHasher } from "./pictograph-key-hasher";
import type { DirectRenderOptions } from "./IDirectRenderer";
import type { PreparedPictographData } from "#lib/shared/pictograph/shared/domain/models/prepared-pictograph-data.js";
import type { PictographVisibilityOptions } from "#lib/shared/render/utils/pictograph-to-svg.js";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import { HandSide } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";

// The rasterized path (choreo-card cells, exports, card fronts) draws props
// through shouldMirrorProp, while the live SVG pictograph draws them through
// PropSvg's shouldMirror. Only PropSvg honored the buugeng chirality setting,
// so a flipped buugeng showed one handedness in the 2D animation canvas and
// the opposite one in the Choreo card. These lock the two paths together.

const pictograph = {
  letter: "G",
  motions: {
    left: {
      motionType: "pro",
      startLocation: "e",
      endLocation: "s",
      startOrientation: "in",
      endOrientation: "in",
      rotationDirection: "cw",
      turns: 0,
      propType: PropType.BUUGENG,
    },
    right: {
      motionType: "pro",
      startLocation: "w",
      endLocation: "s",
      startOrientation: "in",
      endOrientation: "in",
      rotationDirection: "ccw",
      turns: 0,
      propType: PropType.BUUGENG,
    },
  },
} as unknown as PreparedPictographData;

function options(
  visibility: Partial<PictographVisibilityOptions>
): DirectRenderOptions {
  return {
    size: 480,
    visibility: {
      leftPropType: PropType.BUUGENG,
      rightPropType: PropType.BUUGENG,
      ...visibility,
    },
  };
}

describe("shouldMirrorProp — buugeng chirality", () => {
  it("does not mirror either prop when neither is flipped", () => {
    const o = options({});
    expect(shouldMirrorProp(HandSide.LEFT, pictograph, o)).toBe(false);
    expect(shouldMirrorProp(HandSide.RIGHT, pictograph, o)).toBe(false);
  });

  it("mirrors only the flipped blue prop", () => {
    const o = options({ leftBuugengFlipped: true });
    expect(shouldMirrorProp(HandSide.LEFT, pictograph, o)).toBe(true);
    expect(shouldMirrorProp(HandSide.RIGHT, pictograph, o)).toBe(false);
  });

  it("mirrors only the flipped red prop", () => {
    const o = options({ rightBuugengFlipped: true });
    expect(shouldMirrorProp(HandSide.LEFT, pictograph, o)).toBe(false);
    expect(shouldMirrorProp(HandSide.RIGHT, pictograph, o)).toBe(true);
  });

  it("ignores chirality for props outside the buugeng family", () => {
    const o = options({
      leftPropType: PropType.STAFF,
      rightPropType: PropType.STAFF,
      leftBuugengFlipped: true,
      rightBuugengFlipped: true,
    });
    expect(shouldMirrorProp(HandSide.LEFT, pictograph, o)).toBe(false);
    expect(shouldMirrorProp(HandSide.RIGHT, pictograph, o)).toBe(false);
  });

  it("still mirrors the red HAND prop", () => {
    const o = options({
      leftPropType: PropType.HAND,
      rightPropType: PropType.HAND,
    });
    expect(shouldMirrorProp(HandSide.RIGHT, pictograph, o)).toBe(true);
    expect(shouldMirrorProp(HandSide.LEFT, pictograph, o)).toBe(false);
  });
});

describe("pictograph cache key — buugeng chirality", () => {
  const base: PictographVisibilityOptions = {
    leftPropType: PropType.BUUGENG,
    rightPropType: PropType.BUUGENG,
  };

  it("gives a flipped render its own key", () => {
    const unflipped = pictographKeyHasher.deriveKey(pictograph, base);
    const flipped = pictographKeyHasher.deriveKey(pictograph, {
      ...base,
      leftBuugengFlipped: true,
    });
    expect(flipped).not.toBe(unflipped);
  });

  it("distinguishes blue-flipped from red-flipped", () => {
    expect(
      pictographKeyHasher.deriveKey(pictograph, {
        ...base,
        leftBuugengFlipped: true,
      })
    ).not.toBe(
      pictographKeyHasher.deriveKey(pictograph, {
        ...base,
        rightBuugengFlipped: true,
      })
    );
  });

  it("leaves the established key untouched when nothing is flipped", () => {
    expect(
      pictographKeyHasher.deriveKey(pictograph, {
        ...base,
        leftBuugengFlipped: false,
        rightBuugengFlipped: false,
      })
    ).toBe(pictographKeyHasher.deriveKey(pictograph, base));
  });

  it("does not re-key a non-buugeng prop whose flip flag happens to be set", () => {
    const staff: PictographVisibilityOptions = {
      leftPropType: PropType.STAFF,
      rightPropType: PropType.STAFF,
    };
    expect(
      pictographKeyHasher.deriveKey(pictograph, {
        ...staff,
        leftBuugengFlipped: true,
        rightBuugengFlipped: true,
      })
    ).toBe(pictographKeyHasher.deriveKey(pictograph, staff));
  });
});
