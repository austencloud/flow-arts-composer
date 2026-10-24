import { describe, expect, it } from "vitest";
import { Orientation, RotationDirection } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import { describeCodexEdits } from "./codex-edit-summary";

const none = {
  transforms: [],
  edits: { leftTurns: 0, rightTurns: 0, leftRotation: RotationDirection.CLOCKWISE, rightRotation: RotationDirection.CLOCKWISE },
  start: { left: Orientation.IN, right: Orientation.IN },
} as const;

describe("describeCodexEdits", () => {
  it("is null with nothing changed", () => {
    expect(describeCodexEdits({ ...none })).toBeNull();
  });
  it("nets rotations and drops a full circle", () => {
    expect(describeCodexEdits({ ...none, transforms: ["rotate"] })).toBe("Rotated 45°");
    expect(describeCodexEdits({ ...none, transforms: ["rotate", "rotate", "rotate-ccw"] })).toBe("Rotated 45°");
    expect(describeCodexEdits({ ...none, transforms: Array(8).fill("rotate") })).toBeNull();
    expect(describeCodexEdits({ ...none, transforms: ["rotate-ccw"] })).toBe("Rotated 315°");
  });
  it("cancels a mirror pressed twice", () => {
    expect(describeCodexEdits({ ...none, transforms: ["mirror", "mirror"] })).toBeNull();
    expect(describeCodexEdits({ ...none, transforms: ["mirror", "swap"] })).toBe("Mirrored, Hands swapped");
  });
  it("names turns, float and spin", () => {
    expect(describeCodexEdits({ ...none, edits: { ...none.edits, leftTurns: 1 } })).toBe("1 turn blue");
    expect(describeCodexEdits({ ...none, edits: { ...none.edits, rightTurns: 0.5, rightRotation: RotationDirection.COUNTER_CLOCKWISE } })).toBe("½ turn red CCW");
    expect(describeCodexEdits({ ...none, edits: { ...none.edits, leftTurns: "fl" } })).toBe("float blue");
  });
  it("names a changed start and keeps the order transforms, turns, starts", () => {
    expect(
      describeCodexEdits({ ...none, transforms: ["rotate"], edits: { ...none.edits, leftTurns: 2 }, start: { left: Orientation.IN, right: Orientation.OUT } })
    ).toBe("Rotated 45°, 2 turns blue, red starts out");
  });
});
