import { describe, expect, it } from "vitest";
import { allocateTurns } from "../../../src/generation/turns/TurnAllocator.js";

describe("TurnAllocator hard output constraints", () => {
  it("uses the required turn value on every step for both hands", () => {
    expect(allocateTurns(4, 2, 2, { requiredTurns: 1 })).toEqual({
      left: [1, 1, 1, 1],
      right: [1, 1, 1, 1],
    });
  });

  it("rejects a required turn value unavailable at the requested level", () => {
    expect(() => allocateTurns(4, 1, 3, { requiredTurns: 1 })).toThrow(
      /unavailable at level 1/
    );
  });

  it("does not allocate float when a hard motion type must survive emission", () => {
    for (let sample = 0; sample < 100; sample++) {
      const allocation = allocateTurns(8, 3, 3, { allowFloat: false });
      expect(allocation.left).not.toContain("fl");
      expect(allocation.right).not.toContain("fl");
    }
  });
});

describe("allocateTurns with matchHands", () => {
  it("gives the left hand the right hand's value on every step, float included", () => {
    for (let i = 0; i < 20; i++) {
      const allocation = allocateTurns(8, 3, 3, { matchHands: true });
      expect(allocation.left).toEqual(allocation.right);
      expect(allocation.left).toHaveLength(8);
    }
  });

  it("still guarantees a turn somewhere when both lanes would roll zeros", () => {
    let zero = 0;
    const allocation = allocateTurns(4, 2, 1, {
      matchHands: true,
      random: () => (zero++ % 2 === 0 ? 0 : 0.99),
    });
    expect(allocation.left).toEqual(allocation.right);
    expect(allocation.right.some((t) => t !== 0)).toBe(true);
  });

  it("leaves the hands independent when the flag is off", () => {
    let seed = 1;
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    const allocation = allocateTurns(12, 3, 3, { random });
    expect(allocation.left).not.toEqual(allocation.right);
  });
});
