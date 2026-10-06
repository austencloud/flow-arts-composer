import { describe, it, expect } from "vitest";
import type { GridJoin } from "@tka/tka-types";
import { sequenceGridJoin, withSequenceGridJoin } from "./sequence-grid-join";

const join: GridJoin = { toward: "se", steps: 2 };

describe("sequence grid join helpers", () => {
  it("reads the sequence's join, or null", () => {
    expect(sequenceGridJoin(null)).toBeNull();
    expect(sequenceGridJoin(undefined)).toBeNull();
    expect(sequenceGridJoin({ id: "a" } as never)).toBeNull();
    expect(sequenceGridJoin({ id: "a", conjoined: join } as never)).toEqual(
      join
    );
  });

  it("sets a join without touching the rest", () => {
    const seq = { id: "a", word: "AB" } as never;
    expect(withSequenceGridJoin(seq, join)).toEqual({
      id: "a",
      word: "AB",
      conjoined: join,
    });
  });

  it("returns the same object when nothing changes", () => {
    const seq = { id: "a", conjoined: { ...join } } as never;
    expect(withSequenceGridJoin(seq, join)).toBe(seq);
    const plain = { id: "a" } as never;
    expect(withSequenceGridJoin(plain, null)).toBe(plain);
  });

  it("removes the property for One grid", () => {
    const next = withSequenceGridJoin(
      { id: "a", conjoined: join } as never,
      null
    );
    expect("conjoined" in next).toBe(false);
  });
});
