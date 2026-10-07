import { describe, it, expect } from "vitest";
import type { GridJoin } from "@tka/tka-types";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { sequenceFirstStep } from "./sequence-first-step";
import { plaqueFirstStep } from "./plaque-pictograph";

const join: GridJoin = { toward: "n", steps: 2 };
const first = { id: "s1", letter: "A" };
const second = { id: "s2", letter: "B" };

describe("museum first step", () => {
  it("draws a joined sequence's first step on its join, leaving the stored step alone", () => {
    const seq = { steps: [first, second], conjoined: join };
    expect(sequenceFirstStep(seq)).toEqual({ ...first, conjoined: join });
    expect(first).not.toHaveProperty("conjoined");
  });

  it("returns the same step for a one-grid sequence", () => {
    expect(sequenceFirstStep({ steps: [first] })).toBe(first);
  });

  it("gives null when there is no step or no sequence", () => {
    expect(sequenceFirstStep({ steps: [] })).toBeNull();
    expect(sequenceFirstStep(undefined)).toBeNull();
  });

  it("feeds the plaque the same joined step", () => {
    const seq = { steps: [first], conjoined: join } as unknown as SequenceData;
    expect(plaqueFirstStep(seq)).toEqual({ ...first, conjoined: join });
  });
});
