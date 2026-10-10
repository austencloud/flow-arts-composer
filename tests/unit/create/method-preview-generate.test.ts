/**
 * The Generate preview's rolls and wave. Each turn shows a new real roll;
 * when none came, turns step through the demo sequence. Cells wash in with
 * the step grid's band and stagger, the dice holding the lead slot.
 */
import { describe, expect, it } from "vitest";
import { calculateStepWaveBand } from "#lib/shared/create/utils/grid-calculations.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import { DEFAULT_ANIMATION_TIMING } from "#lib/features/create/shared/workspace-panel/sequence-display/domain/models/step-grid-display-models.js";
import { DEMO_SEQUENCE } from "#lib/features/create/shared/components/method-previews/method-preview-demo.js";
import {
  FIRST_ROLL,
  GENERATE_CLEAR_MS,
  GENERATE_LOOK_MS,
  GENERATE_READY_WAIT_MS,
  GENERATE_ROLLS_PER_TURN,
  generateCellDelayMs,
  generateRevealMs,
  nextRoll,
  rollStep,
} from "#lib/features/create/shared/components/method-previews/method-preview-generate.js";
import { SCENE_TAP } from "#lib/features/create/shared/components/method-previews/method-preview-run.js";
import { METHOD_PREVIEW_TIMING } from "#lib/features/create/shared/state/method-preview-turns.svelte.js";

/** A four-step roll cut from the demo sequence, standing in for a fresh draw. */
const fresh: SequenceData = {
  ...DEMO_SEQUENCE,
  steps: DEMO_SEQUENCE.steps.slice(4, 8),
};

describe("Generate rolls", () => {
  it("rests first on the demo sequence, a half turn on", () => {
    expect(FIRST_ROLL).toEqual({ sequence: DEMO_SEQUENCE, offset: 8 });
    expect(rollStep(FIRST_ROLL, 0)).toBe(DEMO_SEQUENCE.steps[8]);
    expect(rollStep(FIRST_ROLL, 2)).toBe(DEMO_SEQUENCE.steps[10]);
  });

  it("wraps around a roll shorter than the cells", () => {
    expect(rollStep({ sequence: fresh, offset: 0 }, 5)).toBe(fresh.steps[1]);
  });

  it("shows nothing for an empty sequence", () => {
    const empty: SequenceData = { ...DEMO_SEQUENCE, steps: [] };
    expect(rollStep({ sequence: empty, offset: 0 }, 0)).toBeNull();
  });

  it("shows a fresh roll from its first step", () => {
    expect(nextRoll(FIRST_ROLL, fresh, 3)).toEqual({
      sequence: fresh,
      offset: 0,
    });
  });

  it("steps through the demo sequence when no roll came", () => {
    expect(nextRoll(FIRST_ROLL, null, 3)).toEqual({
      sequence: DEMO_SEQUENCE,
      offset: 11,
    });
    expect(nextRoll({ sequence: DEMO_SEQUENCE, offset: 15 }, null, 3)).toEqual({
      sequence: DEMO_SEQUENCE,
      offset: 2,
    });
  });

  it("goes back to the resting picture after a fresh roll", () => {
    expect(nextRoll({ sequence: fresh, offset: 0 }, null, 3)).toEqual(
      FIRST_ROLL
    );
  });
});

describe("the Generate wave", () => {
  it("staggers each cell by its band, the dice in the lead slot", () => {
    expect([0, 1, 2].map((index) => generateCellDelayMs(index, 4))).toEqual([
      55, 110, 165,
    ]);
    expect([0, 1, 2].map((index) => generateCellDelayMs(index, 2))).toEqual([
      55, 55, 110,
    ]);
  });

  it("matches the step grid's first row in a strip", () => {
    for (let index = 0; index < 3; index++) {
      expect(generateCellDelayMs(index, 4)).toBe(
        calculateStepWaveBand(index, 4) * DEFAULT_ANIMATION_TIMING.waveBandDelay
      );
    }
  });

  it("lasts until the last cell has landed", () => {
    expect(generateRevealMs(3, 4)).toBe(545);
    expect(generateRevealMs(8, 3)).toBe(600);
    expect(generateRevealMs(3, 2)).toBe(490);
    expect(generateRevealMs(0, 4)).toBe(0);
  });
});

describe("two rolls a turn", () => {
  it("fit one turn on the longest wave, with room to wait for a slow draw", () => {
    // The longest waves: a five-slot strip and a 3×3 grid.
    const wave = Math.max(generateRevealMs(4, 5), generateRevealMs(8, 3));
    const roll =
      SCENE_TAP.considerMs + SCENE_TAP.pressMs + GENERATE_CLEAR_MS + wave;
    const looks = (GENERATE_ROLLS_PER_TURN - 1) * GENERATE_LOOK_MS;
    expect(GENERATE_ROLLS_PER_TURN).toBe(2);
    expect(GENERATE_ROLLS_PER_TURN * roll + looks).toBeLessThanOrEqual(
      METHOD_PREVIEW_TIMING.turnMs - GENERATE_READY_WAIT_MS
    );
  });
});
