import { describe, expect, it } from "vitest";
import { planStepWidth } from "../step-width-motion";

// The step editor draws its step as wide as the step's duration. The drawing
// fits its own box at once, so if it took the new width while the card was
// still easing from the old one, the step would shrink to half size mid-move
// and grow back. Only the timing below prevents that, and nothing on screen
// says which half of it broke.
describe("planStepWidth", () => {
  const MS = 200;

  it("sizes at once when the editor opens or comes from the start", () => {
    expect(planStepWidth(null, 3, 1, MS)).toEqual({
      card: 3,
      drawn: 3,
      settledDrawn: 3,
      moving: false,
    });
  });

  it("keeps a longer step's drawing narrow until the card has grown", () => {
    expect(planStepWidth(1, 2, 1, MS)).toEqual({
      card: 2,
      drawn: 1,
      settledDrawn: 2,
      moving: true,
    });
  });

  it("narrows a shorter step's drawing before the card shrinks", () => {
    expect(planStepWidth(3, 1, 3, MS)).toEqual({
      card: 1,
      drawn: 1,
      settledDrawn: 1,
      moving: true,
    });
  });

  it("holds the narrow drawing through a second tap mid-move", () => {
    // 1 -> 2 is still growing (drawing at 1) when the person taps + again.
    expect(planStepWidth(2, 3, 1, MS).drawn).toBe(1);
    // ...or taps - straight back.
    expect(planStepWidth(2, 1, 1, MS).drawn).toBe(1);
  });

  it("does not move under reduced motion", () => {
    expect(planStepWidth(1, 4, 1, 0)).toEqual({
      card: 4,
      drawn: 4,
      settledDrawn: 4,
      moving: false,
    });
  });
});
