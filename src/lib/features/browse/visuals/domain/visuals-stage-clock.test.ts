import { describe, expect, it } from "vitest";
import {
  STAGE_DWELL_MS,
  STAGE_READY_TIMEOUT_MS,
  spend,
  startBudget,
  whenReady,
  whenSpent,
} from "./visuals-stage-clock.js";

describe("stage clock", () => {
  it("plays the live piece for the dwell once it is ready in time", () => {
    const ready = whenReady(spend(startBudget(), 2000));
    expect(ready).toEqual({ phase: "live", left: STAGE_DWELL_MS });
    expect(whenSpent(ready)).toBeNull();
  });

  it("holds the still for the rest of the dwell when the piece is not ready in time", () => {
    const held = whenSpent(spend(startBudget(), STAGE_READY_TIMEOUT_MS));
    expect(held).toEqual({
      phase: "held",
      left: STAGE_DWELL_MS - STAGE_READY_TIMEOUT_MS,
    });
    expect(whenSpent(held!)).toBeNull();
  });

  it("ignores a ready report that arrives after the wait is over", () => {
    const held = whenSpent(startBudget())!;
    expect(whenReady(held)).toBe(held);
  });

  it("keeps what is left when time is spent in parts, and never goes negative", () => {
    const part = spend(startBudget(), 2500);
    expect(part.left).toBe(STAGE_READY_TIMEOUT_MS - 2500);
    expect(spend(part, 99999).left).toBe(0);
  });
});
