import { describe, expect, it } from "vitest";
import {
  glideRotation,
  redrawsSameOption,
  turnsChangeDirection,
} from "#lib/shared/pictograph/shared/services/glide-rotation.js";
import { RotationDirection } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";

describe("glideRotation", () => {
  it("takes the short way across 0°", () => {
    expect(glideRotation(350, 10, "auto")).toBe(370);
    expect(glideRotation(10, 350, "auto")).toBe(-10);
  });

  it("stays put when the heading is unchanged", () => {
    expect(glideRotation(370, 10, "auto")).toBe(370);
  });

  it("turns the requested way for a half turn", () => {
    expect(glideRotation(0, 180, "cw")).toBe(180);
    expect(glideRotation(0, 180, "ccw")).toBe(-180);
    expect(glideRotation(90, 0, "cw")).toBe(360);
  });
});

describe("turnsChangeDirection", () => {
  const { CLOCKWISE, COUNTER_CLOCKWISE, NO_ROTATION } = RotationDirection;

  it("follows the motion when turns grow and unwinds when they shrink", () => {
    expect(turnsChangeDirection(0, 1.5, CLOCKWISE)).toBe("cw");
    expect(turnsChangeDirection(1.5, 0, CLOCKWISE)).toBe("ccw");
    expect(turnsChangeDirection(0, 0.5, COUNTER_CLOCKWISE)).toBe("ccw");
  });

  it("falls back to the short way without a turn change or direction", () => {
    expect(turnsChangeDirection(1, 1, CLOCKWISE)).toBe("auto");
    expect(turnsChangeDirection("fl", 1, CLOCKWISE)).toBe("auto");
    expect(turnsChangeDirection(0, 1, NO_ROTATION)).toBe("auto");
  });
});

describe("redrawsSameOption", () => {
  const drawing = (
    letter: string,
    left: [string, string],
    right: [string, string],
    turns = 0
  ) =>
    ({
      letter,
      motions: {
        left: { startLocation: left[0], endLocation: left[1], turns },
        right: { startLocation: right[0], endLocation: right[1], turns },
      },
    }) as unknown as Pick<PictographData, "letter" | "motions">;

  it("glides a redraw with new turns", () => {
    expect(
      redrawsSameOption(
        drawing("A", ["s", "w"], ["n", "e"]),
        drawing("A", ["s", "w"], ["n", "e"], 1.5)
      )
    ).toBe(true);
  });

  it("does not glide to another letter or another hand path", () => {
    const shown = drawing("A", ["s", "w"], ["n", "e"]);
    expect(redrawsSameOption(shown, drawing("B", ["s", "w"], ["n", "e"]))).toBe(
      false
    );
    expect(redrawsSameOption(shown, drawing("A", ["s", "e"], ["n", "e"]))).toBe(
      false
    );
  });
});
