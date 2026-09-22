import { describe, expect, it } from "vitest";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import {
  derivePropElementalType,
  derivePropRelationship,
} from "$lib/shared/shape-matrix/domain/prop-relationship";
import { RotationDirection } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import type { Flower } from "$lib/shared/shape-matrix/domain/flower-signature";

function flower(turns: number, style: "pro" | "anti" = "pro"): Flower {
  return {
    style,
    turns,
    ori: "in",
    grid: "diamond",
    petals: style === "pro" ? turns * 2 : turns * 2 + 2,
  };
}

type RawMotion = {
  motionType: "static";
  rotationDirection: "cw" | "ccw" | "noRotation";
  startLocation: "s" | "n" | "e" | "w";
  endLocation: "s" | "n" | "e" | "w";
  startOrientation: "in" | "out";
  endOrientation: "in" | "out";
  turns: number;
};

// A one-beat motion that holds its start bearing, so the engine classifier
// reads the same timing at the start and the end of the beat.
function motion(
  rotationDirection: RawMotion["rotationDirection"],
  location: RawMotion["startLocation"],
  orientation: RawMotion["startOrientation"] = "in"
): RawMotion {
  return {
    motionType: "static",
    rotationDirection,
    startLocation: location,
    endLocation: location,
    startOrientation: orientation,
    endOrientation: orientation,
    turns: 0,
  };
}

function sequence(left: RawMotion, right: RawMotion): SequenceData {
  return {
    steps: [{ motions: { left, right } }],
  } as unknown as SequenceData;
}

describe("prop relationship", () => {
  it("keeps direction but withholds timing when turn amounts differ", () => {
    expect(
      derivePropRelationship(sequence(motion("cw", "s"), motion("cw", "n")), {
        left: flower(1),
        right: flower(1.5),
      })
    ).toEqual({
      kind: "direction-only",
      direction: "same",
      timing: null,
      element: null,
    });
  });

  it("classifies equal-rate rotating props with their own element", () => {
    const result = derivePropRelationship(
      sequence(motion("cw", "s"), motion("cw", "n")),
      { left: flower(1), right: flower(1) }
    );
    expect(result.kind).toBe("full");
    if (result.kind === "full") expect(result.element.element).toBe("water");
  });

  it("adapts a sequence directly for ordinary viewer annotations", () => {
    expect(
      derivePropElementalType(sequence(motion("cw", "s"), motion("cw", "n")))
    ).toBe("water");
  });

  it("does not invent direction or timing for float", () => {
    const float: Flower = {
      style: "float",
      turns: "fl",
      ori: "in",
      grid: "diamond",
      petals: 0,
    };
    expect(
      derivePropRelationship(
        sequence(motion("noRotation", "s"), motion("noRotation", "n")),
        { left: float, right: float }
      )
    ).toEqual({ kind: "float", direction: null, timing: null, element: null });
  });

  it("reads opposite-spin timing against the mirror, not the difference", () => {
    // Both props point at the center from east and west and spin opposite
    // ways, so a quarter turn later both point north: together, not split.
    const result = derivePropRelationship(
      sequence(motion("cw", "e"), motion("ccw", "w")),
      { left: flower(1), right: flower(1) }
    );
    expect(result).toMatchObject({
      kind: "full",
      direction: "opp",
      timing: "tog",
    });
  });
});
