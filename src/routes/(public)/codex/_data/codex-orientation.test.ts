import { describe, expect, it } from "vitest";
import {
  MotionType,
  Orientation,
} from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import {
  CODEX_DEFAULT_ORIENTATIONS,
  codexDataFrom,
  formatCodexOrientations,
  parseCodexOrientations,
} from "./codex-orientation";

const ends = (id: string, start = CODEX_DEFAULT_ORIENTATIONS) => {
  const data = codexDataFrom(id, start)!;
  return {
    types: [data.motions.left!.motionType, data.motions.right!.motionType],
    starts: [
      data.motions.left!.startOrientation,
      data.motions.right!.startOrientation,
    ],
    ends: [
      data.motions.left!.endOrientation,
      data.motions.right!.endOrientation,
    ],
  };
};

describe("Codex start orientations", () => {
  it("starts every letter thumbs in and ends a 0-turn anti thumb out", () => {
    const a = ends("A-0");
    expect(a.types).toEqual([MotionType.PRO, MotionType.PRO]);
    expect(a.starts).toEqual([Orientation.IN, Orientation.IN]);
    expect(a.ends).toEqual([Orientation.IN, Orientation.IN]);

    const b = ends("B-0");
    expect(b.types).toEqual([MotionType.ANTI, MotionType.ANTI]);
    expect(b.starts).toEqual([Orientation.IN, Orientation.IN]);
    expect(b.ends).toEqual([Orientation.OUT, Orientation.OUT]);
  });

  it("recalculates the ends from a chosen start for each hand", () => {
    const b = ends("B-0", {
      left: Orientation.OUT,
      right: Orientation.CLOCK,
    });
    expect(b.starts).toEqual([Orientation.OUT, Orientation.CLOCK]);
    expect(b.ends).toEqual([Orientation.IN, Orientation.COUNTER]);

    const a = ends("A-0", { left: Orientation.OUT, right: Orientation.IN });
    expect(a.ends).toEqual([Orientation.OUT, Orientation.IN]);
  });

  it("keeps the default out of the URL and rejects unknown values", () => {
    expect(formatCodexOrientations(CODEX_DEFAULT_ORIENTATIONS)).toBeNull();
    expect(
      formatCodexOrientations({ left: Orientation.OUT, right: Orientation.IN })
    ).toBe("out,in");
    expect(parseCodexOrientations("out,in")).toEqual({
      left: Orientation.OUT,
      right: Orientation.IN,
    });
    expect(parseCodexOrientations("sideways,in")).toEqual(
      CODEX_DEFAULT_ORIENTATIONS
    );
    expect(parseCodexOrientations(null)).toEqual(CODEX_DEFAULT_ORIENTATIONS);
  });
});
