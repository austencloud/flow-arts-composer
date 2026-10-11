import { describe, it, expect } from "vitest";
import {
  stepPhaseAt,
  timeForPhase,
} from "#lib/features/movement-map/domain/step-phase.js";

// Four moves, one second each, marked from t=10. Marks are arrivals, so there
// are five of them: the opening pose plus one per move.
const FOUR_MOVES = {
  beatTimestamps: [10, 11, 12, 13],
  endTimestamp: 14,
  stepCount: 4,
};

// The same four moves run twice without stopping, as a LOOP take actually is.
const TWO_PASSES = {
  beatTimestamps: [10, 11, 12, 13, 14, 15, 16, 17],
  endTimestamp: 18,
  stepCount: 4,
};

describe("step phase", () => {
  it("reports nothing before the first mark", () => {
    expect(stepPhaseAt(9.5, FOUR_MOVES)).toBeNull();
  });

  it("reports nothing after the final arrival", () => {
    expect(stepPhaseAt(14, FOUR_MOVES)).toBeNull();
    expect(stepPhaseAt(20, FOUR_MOVES)).toBeNull();
  });

  it("names the move being travelled to, not the one that just landed", () => {
    // Sitting on the opening pose, the body is on its way to move 1 = index 0.
    expect(stepPhaseAt(10, FOUR_MOVES)?.stepIndex).toBe(0);
    // Just after move 1 landed, the body is on its way to move 2 = index 1.
    expect(stepPhaseAt(11.1, FOUR_MOVES)?.stepIndex).toBe(1);
  });

  it("runs phase from launch to arrival across the move", () => {
    expect(stepPhaseAt(10, FOUR_MOVES)?.phase).toBeCloseTo(0);
    expect(stepPhaseAt(10.5, FOUR_MOVES)?.phase).toBeCloseTo(0.5);
    expect(stepPhaseAt(10.99, FOUR_MOVES)?.phase).toBeCloseTo(0.99);
  });

  it("treats a move's arrival as the next move's launch", () => {
    const atMark = stepPhaseAt(11, FOUR_MOVES)!;
    expect(atMark.stepIndex).toBe(1);
    expect(atMark.phase).toBeCloseTo(0);
  });

  it("wraps back to the first move on a second pass", () => {
    const secondPass = stepPhaseAt(14.5, TWO_PASSES)!;
    expect(secondPass.stepIndex).toBe(0);
    expect(secondPass.pass).toBe(2);
    expect(secondPass.phase).toBeCloseTo(0.5);
  });

  it("counts passes from one", () => {
    expect(stepPhaseAt(10.5, TWO_PASSES)?.pass).toBe(1);
    expect(stepPhaseAt(13.5, TWO_PASSES)?.pass).toBe(1);
    expect(stepPhaseAt(17.5, TWO_PASSES)?.pass).toBe(2);
  });

  it("exposes the move's own bounds so stepping stays inside it", () => {
    const position = stepPhaseAt(12.4, FOUR_MOVES)!;
    expect(position.startTime).toBe(12);
    expect(position.endTime).toBe(13);
  });

  it("converts a phase back to a time within this move", () => {
    const position = stepPhaseAt(12.4, FOUR_MOVES)!;
    expect(timeForPhase(position, 0)).toBe(12);
    expect(timeForPhase(position, 0.5)).toBe(12.5);
    expect(timeForPhase(position, 1)).toBe(13);
  });

  it("keeps a phase jump inside the move it names", () => {
    const position = stepPhaseAt(12.4, FOUR_MOVES)!;
    const halfFrame = 1 / 240;

    const launch = timeForPhase(position, 0, halfFrame);
    const arrival = timeForPhase(position, 1, halfFrame);

    expect(launch).toBeGreaterThan(12);
    expect(arrival).toBeLessThan(13);

    // The whole point: both still resolve to THIS move, at opposite ends of it.
    expect(stepPhaseAt(launch, FOUR_MOVES)?.stepIndex).toBe(2);
    expect(stepPhaseAt(arrival, FOUR_MOVES)?.stepIndex).toBe(2);
    expect(stepPhaseAt(launch, FOUR_MOVES)!.phase).toBeLessThan(0.01);
    expect(stepPhaseAt(arrival, FOUR_MOVES)!.phase).toBeGreaterThan(0.99);
  });

  it("falls back to the midpoint when a move is shorter than the margin", () => {
    const tight = { beatTimestamps: [0, 0.001], endTimestamp: 0.002, stepCount: 2 };
    const position = stepPhaseAt(0, tight)!;
    const at = timeForPhase(position, 0, 1 / 240);
    expect(at).toBeGreaterThanOrEqual(position.startTime);
    expect(at).toBeLessThanOrEqual(position.endTime);
  });

  it("survives a map with no closing arrival recorded", () => {
    const noEnd = { beatTimestamps: [10, 11, 12], stepCount: 3 };
    expect(stepPhaseAt(10.5, noEnd)?.stepIndex).toBe(0);
    // Without a closing mark the last move has no arrival to travel to.
    expect(stepPhaseAt(12.5, noEnd)).toBeNull();
  });

  it("does not divide by zero on two marks at the same instant", () => {
    const degenerate = { beatTimestamps: [5, 5], endTimestamp: 6, stepCount: 2 };
    const position = stepPhaseAt(5, degenerate);
    expect(position).not.toBeNull();
    expect(Number.isFinite(position!.phase)).toBe(true);
  });
});
