import { describe, expect, it } from "vitest";
import { generateStepTimestamps } from "$lib/shared/audio/bpm-analyzer";

/**
 * The analyzer moved from Compose to `shared/audio` for its second user, the
 * Post Studio music panel. Its tempo detection needs a real AudioContext;
 * the beat spacing does not.
 */
describe("generateStepTimestamps", () => {
  it("spaces beats 60 / bpm apart, from 0 through the end", () => {
    expect(generateStepTimestamps(120, 2)).toEqual([0, 0.5, 1, 1.5, 2]);
  });

  it("starts at the offset", () => {
    expect(generateStepTimestamps(120, 2, 0.25)).toEqual([
      0.25, 0.75, 1.25, 1.75,
    ]);
  });
});
