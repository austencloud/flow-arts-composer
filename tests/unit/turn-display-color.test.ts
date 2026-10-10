import { describe, expect, it } from "vitest";
import {
  BLUE_HEX,
  RED_HEX,
  resolveTurnDisplayColor,
} from "#lib/shared/pictograph/tka-glyph/services/turn-color-interpreter.js";
import { getMotionColor } from "#lib/shared/utils/svg-color-utils.js";
import { HandSide } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";

/**
 * A turn number is painted in the same color as the prop and arrow of the hand
 * it belongs to. The interpreter reports the hand as the dark-palette hex, so
 * a light-theme card must not leak that dark hex into the digits.
 */
describe("resolveTurnDisplayColor", () => {
  it("uses the light hand palette on light cards", () => {
    expect(resolveTurnDisplayColor(BLUE_HEX, false)).toBe(
      getMotionColor(HandSide.LEFT, "light")
    );
    expect(resolveTurnDisplayColor(RED_HEX, false)).toBe(
      getMotionColor(HandSide.RIGHT, "light")
    );
    expect(resolveTurnDisplayColor(BLUE_HEX, false)).not.toBe(BLUE_HEX);
  });

  it("uses the dark hand palette on dark cards", () => {
    expect(resolveTurnDisplayColor(BLUE_HEX, true)).toBe(BLUE_HEX);
    expect(resolveTurnDisplayColor(RED_HEX, true)).toBe(RED_HEX);
  });

  it("follows the user prop colors when they override the palette", () => {
    const custom = { left: "#00aa55", right: "#aa0055" };
    expect(resolveTurnDisplayColor(BLUE_HEX, false, custom)).toBe("#00aa55");
    expect(resolveTurnDisplayColor(RED_HEX, true, custom)).toBe("#aa0055");
  });
});
