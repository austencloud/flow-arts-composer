import { describe, expect, it } from "vitest";
import { canStepTurns, FLOAT_TURNS, stepTurns } from "./turns-stepping";

const SHIFT_MIN = FLOAT_TURNS;
const PLAIN_MIN = 0;

describe("stepTurns: half steps", () => {
  it("moves one notch", () => {
    expect(stepTurns(1, 0.5, PLAIN_MIN)).toBe(1.5);
    expect(stepTurns(1, -0.5, PLAIN_MIN)).toBe(0.5);
  });

  it("lets a shift drop from 0 into a float and come back", () => {
    expect(stepTurns(0, -0.5, SHIFT_MIN)).toBe(FLOAT_TURNS);
    expect(stepTurns(FLOAT_TURNS, 0.5, SHIFT_MIN)).toBe(0);
  });

  it("never raises a float when stepping down, whatever the minimum", () => {
    expect(stepTurns(FLOAT_TURNS, -0.5, PLAIN_MIN)).toBe(FLOAT_TURNS);
    expect(canStepTurns(FLOAT_TURNS, -0.5, PLAIN_MIN)).toBe(false);
  });

  it("stops a dash or static at 0 and everything at 3", () => {
    expect(stepTurns(0, -0.5, PLAIN_MIN)).toBe(0);
    expect(stepTurns(3, 0.5, PLAIN_MIN)).toBe(3);
  });
});

describe("stepTurns: whole steps", () => {
  it("adds and removes a full turn", () => {
    expect(stepTurns(0, 1, PLAIN_MIN)).toBe(1);
    expect(stepTurns(1.5, 1, SHIFT_MIN)).toBe(2.5);
    expect(stepTurns(2, -1, SHIFT_MIN)).toBe(1);
  });

  it("clamps at the top instead of refusing", () => {
    expect(stepTurns(2.5, 1, PLAIN_MIN)).toBe(3);
  });

  it("stops at 0 instead of jumping a shift into a float", () => {
    expect(stepTurns(0.5, -1, SHIFT_MIN)).toBe(0);
    expect(stepTurns(0, -1, SHIFT_MIN)).toBe(0);
  });

  it("treats a float as 0 going up and leaves it alone going down", () => {
    expect(stepTurns(FLOAT_TURNS, 1, SHIFT_MIN)).toBe(1);
    expect(stepTurns(FLOAT_TURNS, -1, SHIFT_MIN)).toBe(FLOAT_TURNS);
  });
});

describe("canStepTurns", () => {
  it("disables only the moves that would change nothing", () => {
    expect(canStepTurns(3, 1, PLAIN_MIN)).toBe(false);
    expect(canStepTurns(3, -1, PLAIN_MIN)).toBe(true);
    expect(canStepTurns(0, -1, SHIFT_MIN)).toBe(false);
    expect(canStepTurns(0, -0.5, SHIFT_MIN)).toBe(true);
    expect(canStepTurns(2.5, 1, PLAIN_MIN)).toBe(true);
  });
});
