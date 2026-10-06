/**
 * The import-free grid join token module must give the same answers as
 * `@tka/render-core`, which owns what a join means. Scripts load the token
 * module under a render-core build that may predate the join helpers, so the
 * two cannot share code; this test is what keeps them from drifting apart.
 */
import { describe, expect, it } from "vitest";
import type { GridJoinDirection } from "@tka/tka-types";
import { gridJoinKey, isGridJoin, sequenceGridJoinKey } from "@tka/render-core";
import {
  GRID_JOIN_DIRECTIONS,
  gridJoinToken,
  isWellFormedGridJoin,
  parseGridJoinToken,
  sequenceGridJoinToken,
} from "$lib/shared/foundation/domain/models/grid-join-token";

const EVERY_DIRECTION: Record<GridJoinDirection, true> = {
  n: true,
  e: true,
  s: true,
  w: true,
  ne: true,
  se: true,
  sw: true,
  nw: true,
};

const WELL_FORMED = GRID_JOIN_DIRECTIONS.flatMap((toward) =>
  ([1, 2] as const).map((steps) => ({ toward, steps }))
);

const MALFORMED: readonly unknown[] = [
  undefined,
  null,
  "e1",
  7,
  true,
  [],
  {},
  { toward: "e" },
  { steps: 1 },
  { toward: "c", steps: 1 },
  { toward: "E", steps: 1 },
  { toward: "north", steps: 1 },
  { toward: "", steps: 1 },
  { toward: 1, steps: 1 },
  { toward: "e", steps: 0 },
  { toward: "e", steps: 3 },
  { toward: "e", steps: "1" },
  { toward: "e", steps: 1.5 },
  { toward: "e", steps: Number.NaN },
  { toward: "e", steps: null },
];

describe("the directions a join can lead toward", () => {
  it("are the eight grid points around the center", () => {
    expect([...GRID_JOIN_DIRECTIONS].sort()).toEqual(
      Object.keys(EVERY_DIRECTION).sort()
    );
  });

  it("are the ones render-core accepts", () => {
    const candidates = [...GRID_JOIN_DIRECTIONS, "c", "x", "", "north", "N"];

    for (const toward of candidates) {
      expect(isGridJoin({ toward, steps: 1 }), toward).toBe(
        (GRID_JOIN_DIRECTIONS as readonly string[]).includes(toward)
      );
    }
  });
});

describe("what counts as a well-formed join", () => {
  it.each(WELL_FORMED)(
    "accepts $toward $steps, as render-core does",
    (join) => {
      expect(isWellFormedGridJoin(join)).toBe(true);
      expect(isGridJoin(join)).toBe(true);
    }
  );

  it.each(MALFORMED.map((value) => [JSON.stringify(value), value] as const))(
    "rejects %s, as render-core does",
    (_label, value) => {
      expect(isWellFormedGridJoin(value)).toBe(false);
      expect(isGridJoin(value)).toBe(false);
    }
  );

  it("accepts extra fields on a join, as render-core does", () => {
    const join = { toward: "e", steps: 1, note: "kept by the model" };

    expect(isWellFormedGridJoin(join)).toBe(true);
    expect(isGridJoin(join)).toBe(true);
  });
});

describe("the token of a join", () => {
  it.each(WELL_FORMED)("spells $toward $steps as render-core's key", (join) => {
    expect(gridJoinToken(join)).toBe(gridJoinKey(join));
    expect(sequenceGridJoinToken(join)).toBe(gridJoinKey(join));
  });

  it("is x for a cell kept on one grid, which only a cell can be", () => {
    expect(gridJoinToken(null)).toBe("x");
    expect(sequenceGridJoinToken(null)).toBe("");
  });

  it("is empty for a join that follows the sequence or is malformed", () => {
    expect(gridJoinToken(undefined)).toBe("");
    expect(sequenceGridJoinToken(undefined)).toBe("");

    for (const value of MALFORMED.filter((entry) => entry !== null)) {
      expect(gridJoinToken(value as never), JSON.stringify(value)).toBe("");
      expect(sequenceGridJoinToken(value as never), JSON.stringify(value)).toBe(
        ""
      );
    }
  });

  it("matches render-core's key for a sequence with only its own join", () => {
    for (const join of WELL_FORMED) {
      expect(sequenceGridJoinKey({ conjoined: join })).toBe(
        sequenceGridJoinToken(join)
      );
    }
    expect(sequenceGridJoinKey({})).toBe(sequenceGridJoinToken(undefined));
  });

  it("reads back to the join it spells", () => {
    for (const join of WELL_FORMED) {
      expect(parseGridJoinToken(gridJoinToken(join))).toEqual(join);
    }
    expect(parseGridJoinToken("x")).toBeNull();
  });

  it.each([
    "",
    "e",
    "n",
    "ne",
    "e0",
    "e3",
    "c1",
    "E1",
    "ee1",
    "e11",
    "1",
    "e ",
    "xx",
  ])("reads %j as no join at all", (token) => {
    expect(parseGridJoinToken(token)).toBeUndefined();
  });
});
