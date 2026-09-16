import { describe, expect, it } from "vitest";
import {
  ElementalType,
  MotionType,
  Orientation,
  RotationDirection,
  TnDMode,
} from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import type { MotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
import {
  buildDoubleFloatOptionRows,
  countDoubleFloatPathGroups,
} from "$lib/features/create/construct/option-picker/services/double-float-option-groups";

function floatMotion(start: string, end: string): MotionData {
  return {
    motionType: MotionType.FLOAT,
    turns: "fl",
    rotationDirection: RotationDirection.NO_ROTATION,
    startLocation: start,
    endLocation: end,
    startOrientation: Orientation.IN,
    endOrientation: Orientation.CLOCK,
  } as MotionData;
}

function option(
  letter: string,
  endPlacement: string,
  leftStart: string,
  leftEnd: string,
  rightStart: string,
  rightEnd: string,
  id = `${letter}-${endPlacement}`
): PictographData {
  return {
    id,
    letter: letter as PictographData["letter"],
    startPlacement: "gamma3" as PictographData["startPlacement"],
    endPlacement: endPlacement as PictographData["endPlacement"],
    motions: {
      left: floatMotion(leftStart, leftEnd),
      right: floatMotion(rightStart, rightEnd),
    },
  };
}

function fourContinuousPaths(): PictographData[] {
  return [
    option("M", "gamma13", "n", "e", "e", "n"),
    option("P", "gamma5", "s", "w", "w", "s"),
    option("S", "gamma5", "n", "e", "e", "s", "S-upper"),
    option("S", "gamma13", "s", "w", "w", "n", "S-lower"),
  ];
}

describe("buildDoubleFloatOptionRows", () => {
  it("puts four already-narrowed hand paths in elemental rows", () => {
    const rows = buildDoubleFloatOptionRows(fourContinuousPaths());

    expect(
      rows?.map(({ mode, elementalType }) => ({ mode, elementalType }))
    ).toEqual([
      { mode: TnDMode.QUARTER_OPP, elementalType: ElementalType.MOON },
      { mode: TnDMode.QUARTER_SAME, elementalType: ElementalType.SUN },
    ]);
    expect(rows && countDoubleFloatPathGroups(rows)).toBe(4);
    expect(
      rows?.flatMap((row) => row.options.map((item) => item.option.letter))
    ).toEqual(["M", "P", "S", "S"]);
  });

  it("preserves separate directly clickable cards when base letters share a path", () => {
    const m = option("M", "gamma13", "n", "e", "e", "n");
    const n = option("N", "gamma13", "n", "e", "e", "n");
    const o = option("O", "gamma13", "n", "e", "e", "n");

    const rows = buildDoubleFloatOptionRows([m, n, o]);

    expect(rows?.[0]?.options.map((item) => item.option.letter)).toEqual([
      "M",
      "N",
      "O",
    ]);
    expect(rows?.[0]?.options.map((item) => item.originalIndex)).toEqual([
      0, 1, 2,
    ]);
  });

  it("keeps orientation differences as separate paths", () => {
    const clockwise = option("M", "gamma13", "n", "e", "e", "n");
    const counter = {
      ...option("P", "gamma13", "n", "e", "e", "n"),
      motions: {
        left: {
          ...floatMotion("n", "e"),
          endOrientation: Orientation.COUNTER,
        },
        right: floatMotion("e", "n"),
      },
    } as PictographData;

    expect(buildDoubleFloatOptionRows([clockwise, counter])).not.toBeNull();
  });

  it("leaves mixed or single-float collections on the ordinary grid", () => {
    const numeric = {
      ...fourContinuousPaths()[0]!,
      motions: {
        left: floatMotion("n", "e"),
        right: {
          ...floatMotion("e", "n"),
          motionType: MotionType.ANTI,
          turns: 0,
        },
      },
    } as PictographData;

    expect(
      buildDoubleFloatOptionRows([fourContinuousPaths()[0]!, numeric])
    ).toBeNull();
  });
});
