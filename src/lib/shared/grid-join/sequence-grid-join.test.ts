import { describe, it, expect } from "vitest";
import type { GridJoin } from "@tka/tka-types";
import {
  sequenceGridJoin,
  withSequenceGridJoin,
  withSequenceJoinApplied,
  withSequenceJoinAppliedToAll,
} from "./sequence-grid-join";

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

describe("drawing cells with the sequence's join", () => {
  it("stamps the sequence's join on a cell without mutating it", () => {
    const cell = { id: "c" };
    const out = withSequenceJoinApplied({ conjoined: join }, cell);
    expect(out).toEqual({ id: "c", conjoined: join });
    expect(cell).toEqual({ id: "c" });
  });

  it("hands one-grid cells back untouched", () => {
    const cell = { id: "c" };
    expect(withSequenceJoinApplied({}, cell)).toBe(cell);
    expect(withSequenceJoinApplied(null, cell)).toBe(cell);
  });

  it("drops a join a cell carries when its sequence is on one grid", () => {
    const out = withSequenceJoinApplied({}, { id: "c", conjoined: join });
    expect(out).toEqual({ id: "c" });
  });

  it("gives null for a missing cell", () => {
    expect(withSequenceJoinApplied({ conjoined: join }, null)).toBeNull();
    expect(withSequenceJoinApplied({ conjoined: join }, undefined)).toBeNull();
  });

  it("stamps every cell in a list", () => {
    const out = withSequenceJoinAppliedToAll({ conjoined: join }, [
      { id: "a" },
      { id: "b" },
    ]);
    expect(out.map((c) => (c as { conjoined?: GridJoin }).conjoined)).toEqual([
      join,
      join,
    ]);
  });
});
