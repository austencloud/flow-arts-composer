import {
  closedPathSteps,
  handIndexAt,
  posesAt,
  propIndexAt,
  revolutionsToClose,
  tracePath,
  type QftKnobs,
} from "#lib/shared/notation/qft/qft-model.js";
import { makeSpinRatio } from "../../packages/vtg-domain/src/reference/spin-ratio";
import { describe, expect, it } from "vitest";

function knobs(
  propRotations: number,
  handCycles: number,
  spin: QftKnobs["spin"] = "inspin"
): QftKnobs {
  const ratio = makeSpinRatio(propRotations, handCycles);
  return {
    radius: 1,
    downbeats:
      ratio.handCycles === 0
        ? ratio.propRotations
        : ratio.propRotations / ratio.handCycles,
    ratio,
    spin,
  };
}

describe("QfT rational ratio geometry", () => {
  it.each([
    [1, 3],
    [1, 4],
    [2, 7],
    [2, 9],
    [1, 5],
  ])("closes the %i:%i path at its exact denominator", (p, q) => {
    const model = knobs(p, q);
    const start = posesAt(model, 0);
    const end = posesAt(model, closedPathSteps(model));
    const trace = tracePath(model);

    expect(revolutionsToClose(model)).toBe(q);
    expect(end.hand.x).toBeCloseTo(start.hand.x, 10);
    expect(end.hand.y).toBeCloseTo(start.hand.y, 10);
    expect(end.head.x).toBeCloseTo(start.head.x, 10);
    expect(end.head.y).toBeCloseTo(start.head.y, 10);
    expect(trace.at(-1)!.x).toBeCloseTo(trace[0]!.x, 10);
    expect(trace.at(-1)!.y).toBeCloseTo(trace[0]!.y, 10);
  });

  it("keeps Float's prop fixed while the hand completes its circle", () => {
    const model = knobs(0, 1);

    expect(propIndexAt(model, 0)).toBe(propIndexAt(model, 4));
    expect(handIndexAt(model, 4)).not.toBe(handIndexAt(model, 0));
  });

  it("keeps the 1:0 hand fixed while the prop completes a circle", () => {
    const model = knobs(1, 0);

    expect(revolutionsToClose(model)).toBe(1);
    expect(handIndexAt(model, 4)).toBe(handIndexAt(model, 0));
    expect(propIndexAt(model, 8) - propIndexAt(model, 0)).toBe(8);
    expect(posesAt(model, 8).head.x).toBeCloseTo(posesAt(model, 0).head.x, 10);
    expect(posesAt(model, 8).head.y).toBeCloseTo(posesAt(model, 0).head.y, 10);
  });

  it("derives closure for legacy fractional downbeats without guessing eight", () => {
    expect(
      revolutionsToClose({ ...knobs(1, 1), ratio: undefined, downbeats: 1 / 3 })
    ).toBe(3);
    expect(
      revolutionsToClose({ ...knobs(1, 1), ratio: undefined, downbeats: 2 / 7 })
    ).toBe(7);
  });
});
