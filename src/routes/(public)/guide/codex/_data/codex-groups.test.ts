import { describe, expect, it } from "vitest";
import {
  MotionType,
  Orientation,
} from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";
import { codexTurnData } from "../../level-2/_data/codex-turns";
import { codexData } from "./codex-groups";

const hands = (data: PictographData) => ({
  types: [data.motions.left!.motionType, data.motions.right!.motionType],
  starts: [
    data.motions.left!.startOrientation,
    data.motions.right!.startOrientation,
  ],
  ends: [data.motions.left!.endOrientation, data.motions.right!.endOrientation],
});

describe("codexData", () => {
  it("starts thumbs in and ends a 0-turn pro in, a 0-turn anti out", () => {
    const a = hands(codexData("A-0")!);
    expect(a.types).toEqual([MotionType.PRO, MotionType.PRO]);
    expect(a.starts).toEqual([Orientation.IN, Orientation.IN]);
    expect(a.ends).toEqual([Orientation.IN, Orientation.IN]);

    const b = hands(codexData("B-0")!);
    expect(b.types).toEqual([MotionType.ANTI, MotionType.ANTI]);
    expect(b.starts).toEqual([Orientation.IN, Orientation.IN]);
    expect(b.ends).toEqual([Orientation.OUT, Orientation.OUT]);
  });

  it("lets a turn layer recalculate the ends from the same start", () => {
    // One turn on each anti hand brings the thumb back in.
    const b = hands(codexTurnData("B", 1, 1)!);
    expect(b.starts).toEqual([Orientation.IN, Orientation.IN]);
    expect(b.ends).toEqual([Orientation.IN, Orientation.IN]);
  });
});
