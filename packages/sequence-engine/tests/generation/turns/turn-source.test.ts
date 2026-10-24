import { describe, expect, it } from "vitest";
import {
  allocationSource,
  growingAllocationSource,
  patternSource,
} from "../../../src/generation/turns/TurnSource.js";

describe("TurnSource", () => {
  it("reports no turn past the end of a random allocation", () => {
    // Today's behaviour, preserved: eager allocation is length-bound, so a
    // sequence longer than its allocation has steps with no turn at all.
    const source = allocationSource({ left: [1, 2], right: [0, 0.5] });
    expect(source.at(0, "left")).toBe(1);
    expect(source.at(2, "left")).toBeUndefined();
  });

  it("keeps rolling past a random allocation, once per step, for the bridges a search inserts", () => {
    let rolls = 0;
    const source = growingAllocationSource(
      { left: [1, 2], right: [0, 0.5] },
      () => {
        rolls++;
        return { left: rolls, right: -rolls };
      }
    );

    // The up-front lanes answer their own indices untouched.
    expect(source.at(1, "left")).toBe(2);
    expect(rolls).toBe(0);

    // Asking for index 3 rolls index 2 first, so the dice fall in step order
    // whichever step the search happens to look at.
    expect(source.at(3, "right")).toBe(-2);
    expect(source.at(2, "left")).toBe(1);
    expect(source.at(3, "left")).toBe(2);
    expect(rolls).toBe(2);
  });

  it("resolves at every index, however far out, when driven by a pattern", () => {
    // A period has no length. This is what lets a pattern cover bridge steps.
    const source = patternSource({ left: [0, 1.5], right: [0.5] });
    expect(source.at(0, "left")).toBe(0);
    expect(source.at(1, "left")).toBe(1.5);
    expect(source.at(2, "left")).toBe(0);
    expect(source.at(97, "left")).toBe(1.5);
    expect(source.at(97, "right")).toBe(0.5);
  });

  it("treats an empty lane as no turn rather than dividing by zero", () => {
    const source = patternSource({ left: [], right: [] });
    expect(source.at(0, "left")).toBeUndefined();
  });

  it("reads the literal blue/red turn lanes saved before hand identity migrated", () => {
    const source = patternSource({
      blue: [1, 0],
      red: [0.5],
    } as never);

    expect(source.at(0, "left")).toBe(1);
    expect(source.at(1, "left")).toBe(0);
    expect(source.at(7, "right")).toBe(0.5);
  });
});
