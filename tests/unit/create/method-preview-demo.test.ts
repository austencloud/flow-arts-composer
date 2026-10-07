/**
 * Previews draw the home page's demo sequence (MYΩN four times).
 */
import { describe, expect, it } from "vitest";
import {
  DEMO_SEQUENCE,
  openingSteps,
  startPictograph,
} from "$lib/features/create/shared/components/method-previews/method-preview-demo";

describe("method preview demo data", () => {
  it("reads the start placement and the opening steps", () => {
    expect(startPictograph(DEMO_SEQUENCE)?.letter).toBe("γ");
    expect(openingSteps(DEMO_SEQUENCE, 4).map((step) => step.letter)).toEqual([
      "M",
      "Y",
      "Ω",
      "N",
    ]);
    expect(openingSteps(DEMO_SEQUENCE, -1)).toEqual([]);
  });
});
