/**
 * Previews draw the home page's demo sequence (MYΩN four times).
 */
import { describe, expect, it } from "vitest";
import {
  CONSTRUCT_MAX_SLOTS,
  fuseLayout,
  generateLayout,
} from "#lib/features/create/shared/components/method-previews/method-preview-compositions.js";
import {
  DEMO_SEQUENCE,
  DEMO_STEP_START,
  openingSteps,
  startPictograph,
} from "#lib/features/create/shared/components/method-previews/method-preview-demo.js";
import { ASSEMBLE_STEPS } from "#lib/features/create/shared/components/method-previews/method-preview-assemble.js";

const range = (from: number, count: number) =>
  Array.from({ length: count }, (_, offset) => from + offset);
// Construct shows the start position and the steps after it.
const construct = range(DEMO_STEP_START.construct, CONSTRUCT_MAX_SLOTS - 1);
const fuse = range(
  DEMO_STEP_START.fuse,
  fuseLayout("strip", 146, 48)!.combined.length
);

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

  it("gives each resting card its own steps, none shown twice", () => {
    // Generate fills the most cells any of its layouts draws: a strip wide
    // enough for its most slots, and the square's 3x3 grid.
    const generate = range(
      DEMO_STEP_START.generate,
      Math.max(
        ...(
          [
            ["strip", 2000, 48],
            ["square", 400, 400],
          ] as const
        ).map(
          ([shape, width, height]) =>
            generateLayout(shape, width, height)?.cells.length ?? 0
        )
      )
    );

    const shown = [...construct, ...fuse, ...generate];
    expect(new Set(shown).size).toBe(shown.length);
    // Every step is inside the sequence, with no wrapping past its end.
    expect(Math.min(...shown)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...shown)).toBeLessThan(DEMO_SEQUENCE.steps.length);
  });

  it("gives Assemble's beats steps no card shares but Generate's biggest", () => {
    const assemble = range(DEMO_STEP_START.assemble, ASSEMBLE_STEPS.count);
    expect(Math.max(...assemble)).toBeLessThan(DEMO_SEQUENCE.steps.length);
    expect(
      assemble.filter((step) => [...construct, ...fuse].includes(step))
    ).toEqual([]);
    // Every N and M pair is some card's (see DEMO_STEP_START). Generate's
    // usual strips and its 2x2 square show none of these; only its widest
    // strip and its grid of eight do, until its first roll.
    for (const [shape, width, height] of [
      ["strip", 146, 48],
      ["roomy", 308, 96],
      ["square", 144, 144],
    ] as const) {
      const cells = generateLayout(shape, width, height)!.cells.length;
      const generate = range(DEMO_STEP_START.generate, cells);
      expect(generate.filter((step) => assemble.includes(step))).toEqual([]);
    }
  });
});
