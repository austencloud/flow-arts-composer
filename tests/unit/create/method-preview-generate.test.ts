/**
 * The Generate preview's rolls and wave. Each turn shows a new real roll;
 * when none came, turns step through the demo sequence. Cells wash in with
 * the step grid's band and stagger, the first step leading, and the roll's
 * four steps then play their moves inside the turn.
 */
import { describe, expect, it } from "vitest";
import { calculateStepWaveBand } from "#lib/shared/create/utils/grid-calculations.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import { DEFAULT_ANIMATION_TIMING } from "#lib/features/create/shared/workspace-panel/sequence-display/domain/models/step-grid-display-models.js";
import {
  GENERATE_LOOP_STEPS,
  generateLayout,
} from "#lib/features/create/shared/components/method-previews/method-preview-compositions.js";
import { DEMO_SEQUENCE } from "#lib/features/create/shared/components/method-previews/method-preview-demo.js";
import {
  FIRST_ROLL,
  GENERATE_CLEAR_MS,
  GENERATE_READY_WAIT_MS,
  generateCellDelayMs,
  generateFirstLandMs,
  generateRevealMs,
  nextRoll,
  rollPoseBefore,
  rollStep,
} from "#lib/features/create/shared/components/method-previews/method-preview-generate.js";
import {
  PREVIEW_MOVE_MS,
  SCENE_TAP,
} from "#lib/features/create/shared/components/method-previews/method-preview-run.js";
import { methodPreviewTurnMs } from "#lib/features/create/shared/state/method-preview-turns.svelte.js";

/** A four-step roll cut from the demo sequence, standing in for a fresh draw. */
const fresh: SequenceData = {
  ...DEMO_SEQUENCE,
  steps: DEMO_SEQUENCE.steps.slice(4, 8),
};

describe("Generate rolls", () => {
  it("rests first on the demo sequence, from its eighth step", () => {
    expect(FIRST_ROLL).toEqual({ sequence: DEMO_SEQUENCE, offset: 7 });
    expect(rollStep(FIRST_ROLL, 0)).toBe(DEMO_SEQUENCE.steps[7]);
    expect(rollStep(FIRST_ROLL, 3)).toBe(DEMO_SEQUENCE.steps[10]);
  });

  it("wraps around a roll shorter than the cells", () => {
    expect(rollStep({ sequence: fresh, offset: 0 }, 5)).toBe(fresh.steps[1]);
  });

  it("shows nothing for an empty sequence", () => {
    const empty: SequenceData = { ...DEMO_SEQUENCE, steps: [] };
    expect(rollStep({ sequence: empty, offset: 0 }, 0)).toBeNull();
    expect(rollPoseBefore({ sequence: empty, offset: 0 }, 0)).toBeNull();
  });

  it("moves each cell from the pose before it", () => {
    expect(rollPoseBefore(FIRST_ROLL, 0)).toBe(DEMO_SEQUENCE.steps[6]);
    expect(rollPoseBefore(FIRST_ROLL, 3)).toBe(DEMO_SEQUENCE.steps[9]);
  });

  it("moves a sequence's first step from its start position", () => {
    const start =
      DEMO_SEQUENCE.startPlacement ?? DEMO_SEQUENCE.startingPlacement;
    expect(start).toBeTruthy();
    const roll = { sequence: fresh, offset: 0 };
    expect(rollPoseBefore(roll, 0)).toBe(start);
    expect(rollPoseBefore(roll, 1)).toBe(fresh.steps[0]);
    // A short roll wraps back to its first step, and its start.
    expect(rollPoseBefore(roll, 4)).toBe(start);
  });

  it("shows a fresh roll from its first step", () => {
    expect(nextRoll(FIRST_ROLL, fresh, 4)).toEqual({
      sequence: fresh,
      offset: 0,
    });
  });

  it("steps through the demo sequence when no roll came", () => {
    expect(nextRoll(FIRST_ROLL, null, 4)).toEqual({
      sequence: DEMO_SEQUENCE,
      offset: 11,
    });
    expect(nextRoll({ sequence: DEMO_SEQUENCE, offset: 15 }, null, 4)).toEqual({
      sequence: DEMO_SEQUENCE,
      offset: 3,
    });
  });

  it("goes back to the resting picture after a fresh roll", () => {
    expect(nextRoll({ sequence: fresh, offset: 0 }, null, 4)).toEqual(
      FIRST_ROLL
    );
  });
});

describe("the Generate wave", () => {
  it("staggers each cell by its band, the first step leading", () => {
    const cells = [0, 1, 2, 3];
    expect(cells.map((index) => generateCellDelayMs(index, 4))).toEqual([
      0, 55, 110, 165,
    ]);
    expect(cells.map((index) => generateCellDelayMs(index, 2))).toEqual([
      0, 55, 55, 110,
    ]);
  });

  it("keeps the step grid's stagger along a row", () => {
    // A step grid wide enough for the four in its first row, after the
    // start position, which the preview leaves out.
    const band = (index: number) =>
      calculateStepWaveBand(index, GENERATE_LOOP_STEPS + 1) -
      calculateStepWaveBand(0, GENERATE_LOOP_STEPS + 1);
    for (let index = 0; index < GENERATE_LOOP_STEPS; index++) {
      expect(generateCellDelayMs(index, GENERATE_LOOP_STEPS)).toBe(
        band(index) * DEFAULT_ANIMATION_TIMING.waveBandDelay
      );
    }
  });

  it("lasts until the last cell has landed", () => {
    expect(generateRevealMs(4, 4)).toBe(545);
    expect(generateRevealMs(4, 2)).toBe(490);
    expect(generateRevealMs(0, 4)).toBe(0);
  });
});

describe("a turn's roll and its moves", () => {
  const turnMs = methodPreviewTurnMs("generate");

  /** From the turn's start until the first step has landed. */
  const untilFirstLand = (drawMs: number) =>
    SCENE_TAP.considerMs +
    SCENE_TAP.pressMs +
    GENERATE_CLEAR_MS +
    drawMs +
    generateFirstLandMs(GENERATE_LOOP_STEPS);

  it("lands its first step one entrance into the wash", () => {
    const landed = DEFAULT_ANIMATION_TIMING.entranceDuration;
    expect(generateFirstLandMs(4)).toBe(landed);
    expect(generateFirstLandMs(2)).toBe(landed);
  });

  it("shows and plays a whole four-step loop, in a turn longer than the others", () => {
    expect(GENERATE_LOOP_STEPS).toBe(4);
    for (const [shape, width, height] of [
      ["strip", 146, 48],
      ["roomy", 308, 96],
      ["roomy", 2000, 96],
      ["square", 144, 144],
      ["square", 400, 400],
    ] as const) {
      expect(generateLayout(shape, width, height)?.cells).toHaveLength(4);
    }
    expect(turnMs).toBeGreaterThan(methodPreviewTurnMs("construct"));
  });

  it("ends its run inside the turn even after the longest wait for a draw", () => {
    // The run ends as its last move starts, so a slow draw is never cut.
    const lastMoveStarts =
      untilFirstLand(GENERATE_READY_WAIT_MS) +
      (GENERATE_LOOP_STEPS - 1) * PREVIEW_MOVE_MS;
    expect(lastMoveStarts).toBeLessThanOrEqual(turnMs);
  });

  it("plays every move out inside the turn, with time for the roll to draw", () => {
    // A phone took about 300 ms to draw a roll.
    const movesEnd = untilFirstLand(0) + GENERATE_LOOP_STEPS * PREVIEW_MOVE_MS;
    expect(turnMs - movesEnd).toBeGreaterThanOrEqual(300);
  });
});
