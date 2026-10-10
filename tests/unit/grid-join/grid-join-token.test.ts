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
} from "#lib/shared/foundation/domain/models/grid-join-token.js";

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
  });

  it("is empty for a sequence on one grid", () => {
    expect(gridJoinToken(undefined)).toBe("");
    expect(gridJoinToken(null)).toBe("");
  });

  it("is empty for a join that is malformed", () => {
    for (const value of MALFORMED) {
      expect(gridJoinToken(value), JSON.stringify(value)).toBe("");
    }
  });

  it("matches render-core's key for a sequence", () => {
    for (const join of WELL_FORMED) {
      expect(sequenceGridJoinKey({ conjoined: join })).toBe(
        gridJoinToken(join)
      );
    }
    expect(sequenceGridJoinKey({})).toBe(gridJoinToken(undefined));
    expect(sequenceGridJoinKey({ conjoined: null })).toBe(gridJoinToken(null));
  });

  it("reads back to the join it spells", () => {
    for (const join of WELL_FORMED) {
      expect(parseGridJoinToken(gridJoinToken(join))).toEqual(join);
    }
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
    "x",
    "xx",
  ])("reads %j as no join at all", (token) => {
    expect(parseGridJoinToken(token)).toBeUndefined();
  });
});
