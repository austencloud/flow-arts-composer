import { describe, expect, it } from "vitest";
import {
  GRID_JOIN_DIRECTIONS,
  JOIN_HAND_RADIUS,
  alignGridJoin,
  fromJoinedHandPoint,
  getGridJoinLayout,
  gridJoinCellResolver,
  gridJoinKey,
  gridJoinOffsets,
  gridJoinPropNudges,
  isGridJoin,
  joinedHandTransform,
  sequenceGridJoinKey,
  toJoinedHandPoint,
  type GridJoinLayout,
  type GridJoinSpec,
  type JoinPropBody,
} from "../src/calculations/grid-join-layout.js";

const EAST_1: GridJoinSpec = { toward: "e", steps: 1 };
const EAST_2: GridJoinSpec = { toward: "e", steps: 2 };
const SOUTHEAST_1: GridJoinSpec = { toward: "se", steps: 1 };
const STAFF_HALF = 252.8 / 2;
const STAFF_NUDGE = 950 / 45;

/** A card cell: any pictograph, even one carrying a stray join of its own. */
type Cell = { letter?: string; conjoined?: GridJoinSpec | null };

function countKinds(layout: GridJoinLayout) {
  const counts = { center: 0, hand: 0, outer: 0 };
  for (const point of layout.points) counts[point.kind]++;
  return counts;
}

/** Where a hand point of one grid lands in the scene, before the fit scale. */
function handPoint(
  join: GridJoinSpec,
  hand: "left" | "right",
  dx: number,
  dy: number
): { x: number; y: number } {
  const offset = gridJoinOffsets(join)[hand];
  return {
    x: 475 + offset.x + dx * JOIN_HAND_RADIUS,
    y: 475 + offset.y + dy * JOIN_HAND_RADIUS,
  };
}

function staff(
  at: { x: number; y: number },
  rotation: number,
  halfLength = STAFF_HALF
): JoinPropBody {
  return { ...at, rotation, halfLength };
}

describe("grid join values", () => {
  it("accepts only a direction other than center and one or two steps", () => {
    expect(isGridJoin(EAST_1)).toBe(true);
    expect(isGridJoin({ toward: "nw", steps: 2 })).toBe(true);
    expect(isGridJoin({ toward: "c", steps: 1 })).toBe(false);
    expect(isGridJoin({ toward: "e", steps: 3 })).toBe(false);
    expect(isGridJoin({ toward: "e" })).toBe(false);
    expect(isGridJoin(null)).toBe(false);
    expect(isGridJoin("e1")).toBe(false);
  });

  it("hands one-grid card cells back untouched", () => {
    const start: Cell = { letter: "α" };
    const step: Cell = { letter: "β" };
    const resolve = gridJoinCellResolver({});

    expect(resolve(start)).toBe(start);
    expect(resolve(step)).toBe(step);
  });

  it("gives every card cell, the start included, the sequence's one join", () => {
    const resolve = gridJoinCellResolver({ conjoined: EAST_1 });
    const cells: Cell[] = [{ letter: "α" }, { letter: "β" }, { letter: "γ" }];

    expect(cells.map((cell) => resolve(cell).conjoined)).toEqual([
      EAST_1,
      EAST_1,
      EAST_1,
    ]);
  });

  it("ignores a join a cell carries on its own", () => {
    const stray: Cell = { letter: "β", conjoined: EAST_2 };
    const strayOneGrid: Cell = { letter: "γ", conjoined: null };

    // The sequence's join replaces it...
    expect(gridJoinCellResolver({ conjoined: EAST_1 })(stray).conjoined).toBe(
      EAST_1
    );
    // ...and a one-grid sequence drops it, so the cell draws on one grid.
    const resolveOneGrid = gridJoinCellResolver({});
    expect(resolveOneGrid(stray)).toEqual({ letter: "β" });
    expect(resolveOneGrid(strayOneGrid)).toEqual({ letter: "γ" });
  });

  it("keys a sequence's pictures by its one join, and one-grid sequences by nothing", () => {
    expect(sequenceGridJoinKey({})).toBe("");
    expect(sequenceGridJoinKey({ conjoined: null })).toBe("");
    expect(sequenceGridJoinKey({ conjoined: EAST_1 })).toBe("e1");
    expect(sequenceGridJoinKey({ conjoined: EAST_2 })).toBe("e2");
  });

  it("names a join with a short stable key", () => {
    expect(gridJoinKey(EAST_1)).toBe("e1");
    expect(gridJoinKey({ toward: "sw", steps: 2 })).toBe("sw2");
  });

  it("centers the pair: each grid sits half the gap from the scene center", () => {
    const one = gridJoinOffsets(EAST_1);
    expect(one.left.x).toBeCloseTo(-71.55, 2);
    expect(one.right.x).toBeCloseTo(71.55, 2);
    expect(one.left.y).toBeCloseTo(0, 6);

    const diagonal = gridJoinOffsets({ toward: "ne", steps: 2 });
    expect(diagonal.right.x).toBeCloseTo(101.19, 2);
    expect(diagonal.right.y).toBeCloseTo(-101.19, 2);
  });
});

describe("joined grid layout", () => {
  it("one step east: red center on blue's east hand point, crowded outer points hidden", () => {
    const layout = getGridJoinLayout(EAST_1, "diamond");
    expect(countKinds(layout)).toEqual({ center: 2, hand: 8, outer: 6 });

    const outerPoints = layout.points.filter((point) => point.kind === "outer");
    const locations = outerPoints.map((point) => point.members[0]);
    expect(locations).not.toContainEqual({ hand: "left", location: "e" });
    expect(locations).not.toContainEqual({ hand: "right", location: "w" });

    // Every outer point left standing is clear of the other grid's points.
    for (const outer of outerPoints) {
      const owner = outer.members[0]!.hand;
      for (const other of layout.points) {
        if (other.members.every((member) => member.hand === owner)) continue;
        expect(
          Math.hypot(other.x - outer.x, other.y - outer.y)
        ).toBeGreaterThanOrEqual(20);
      }
    }
    expect(layout.scale).toBeCloseTo(383 / (71.55 + 300 + 25), 4);
  });

  it("two steps east: the facing hand points meet and are drawn once", () => {
    const layout = getGridJoinLayout(EAST_2, "diamond");
    expect(countKinds(layout)).toEqual({ center: 2, hand: 7, outer: 6 });

    const shared = layout.points.filter((point) => point.members.length > 1);
    expect(shared).toHaveLength(1);
    expect(shared[0]!.x).toBeCloseTo(475, 6);
    expect(shared[0]!.y).toBeCloseTo(475, 6);
    expect(shared[0]!.members).toEqual([
      { hand: "left", location: "e" },
      { hand: "right", location: "w" },
    ]);
    expect(layout.scale).toBeCloseTo(383 / (143.1 + 300 + 25), 4);
  });

  it("box grids keep box hand points and fit without shrinking one step apart", () => {
    const layout = getGridJoinLayout(SOUTHEAST_1, "box");
    // The box pair is the diamond east pair turned 45°: same points, same fit.
    expect(countKinds(layout)).toEqual(
      countKinds(getGridJoinLayout(EAST_1, "diamond"))
    );
    const blueNortheast = layout.points.find(
      (point) =>
        point.kind === "hand" &&
        point.members[0]!.hand === "left" &&
        point.members[0]!.location === "ne"
    );
    const expected = handPoint(
      SOUTHEAST_1,
      "left",
      Math.SQRT1_2,
      -Math.SQRT1_2
    );
    expect(blueNortheast!.x).toBeCloseTo(expected.x, 6);
    expect(blueNortheast!.y).toBeCloseTo(expected.y, 6);
    expect(layout.scale).toBe(1);
  });

  it("draws skewed and other modes on diamond grids, as one grid does", () => {
    expect(getGridJoinLayout(EAST_1, "skewed")).toBe(
      getGridJoinLayout(EAST_1, "diamond")
    );
  });

  it("is memoized and frozen", () => {
    const layout = getGridJoinLayout({ toward: "s", steps: 1 }, "diamond");
    expect(getGridJoinLayout({ toward: "s", steps: 1 }, "diamond")).toBe(
      layout
    );
    expect(Object.isFrozen(layout)).toBe(true);
    expect(Object.isFrozen(layout.points)).toBe(true);
  });
});

describe("joins line up with the grid", () => {
  const ALL: GridJoinSpec["toward"][] = [
    "n",
    "ne",
    "e",
    "se",
    "s",
    "sw",
    "w",
    "nw",
  ];

  it("keeps a join on the grid's own hand-point lines", () => {
    for (const toward of GRID_JOIN_DIRECTIONS.diamond) {
      const join: GridJoinSpec = { toward, steps: 2 };
      expect(alignGridJoin(join, "diamond")).toBe(join);
    }
    for (const toward of GRID_JOIN_DIRECTIONS.box) {
      const join: GridJoinSpec = { toward, steps: 1 };
      expect(alignGridJoin(join, "box")).toBe(join);
    }
  });

  it("turns a join off those lines 45° clockwise onto them", () => {
    expect(alignGridJoin({ toward: "ne", steps: 1 }, "diamond")).toEqual({
      toward: "e",
      steps: 1,
    });
    expect(alignGridJoin({ toward: "nw", steps: 2 }, "skewed")).toEqual({
      toward: "n",
      steps: 2,
    });
    expect(alignGridJoin({ toward: "e", steps: 1 }, "box")).toEqual({
      toward: "se",
      steps: 1,
    });
    expect(alignGridJoin({ toward: "n", steps: 2 }, "box")).toEqual({
      toward: "ne",
      steps: 2,
    });
  });

  it("draws a stored off-line join as its aligned join", () => {
    const stored = getGridJoinLayout({ toward: "ne", steps: 1 }, "diamond");
    expect(stored).toBe(getGridJoinLayout(EAST_1, "diamond"));
    expect(stored.join).toEqual(EAST_1);
  });

  it.each(["diamond", "box"])(
    "every %s join meets the other grid with no near-misses",
    (gridMode) => {
      for (const toward of ALL) {
        for (const steps of [1, 2] as const) {
          const { points } = getGridJoinLayout({ toward, steps }, gridMode);
          let meets = points.filter((point) => point.members.length > 1).length;
          for (const [i, a] of points.entries()) {
            for (const b of points.slice(i + 1)) {
              if (a.members[0]!.hand === b.members[0]!.hand) continue;
              const gap = Math.hypot(a.x - b.x, a.y - b.y);
              if (gap < 1) meets++;
              // Diagonal joins on a diamond grid missed by 59-84 units.
              else
                expect(gap, `${gridMode} ${toward}${steps}`).toBeGreaterThan(
                  100
                );
            }
          }
          expect(meets, `${gridMode} ${toward}${steps}`).toBeGreaterThan(0);
        }
      }
    }
  );
});

describe("joined prop nudge", () => {
  const blueOnRedCenter = handPoint(EAST_1, "left", 1, 0);
  const redOnBlueCenter = handPoint(EAST_1, "right", -1, 0);
  const distances = { left: STAFF_NUDGE, right: STAFF_NUDGE };
  // One step apart, a prop this long ends 43 short of the other hand: still
  // overlapping, but not touching it.
  const SHORT_HALF = 100;

  it("moves two overlapping props on one line apart by their beta distance", () => {
    const nudges = gridJoinPropNudges(
      EAST_2,
      staff(handPoint(EAST_2, "left", 1, 0), 0),
      staff(handPoint(EAST_2, "right", -1, 0), 0),
      distances
    );
    // The join runs along the line, so red goes up and blue down.
    expect(nudges!.right.x).toBeCloseTo(0, 6);
    expect(nudges!.right.y).toBeCloseTo(-STAFF_NUDGE, 6);
    expect(nudges!.left.y).toBeCloseTo(STAFF_NUDGE, 6);
  });

  it("moves each prop by its own distance", () => {
    const nudges = gridJoinPropNudges(
      EAST_2,
      staff(handPoint(EAST_2, "left", 1, 0), 0),
      staff(handPoint(EAST_2, "right", -1, 0), 0),
      { left: 950 / 60, right: STAFF_NUDGE }
    );
    expect(nudges!.left.y).toBeCloseTo(950 / 60, 6);
    expect(nudges!.right.y).toBeCloseTo(-STAFF_NUDGE, 6);
  });

  it("sends blue toward its own grid when the join crosses the line", () => {
    const redNorth = handPoint(EAST_1, "right", 0, -1);
    expect(redNorth.x).toBeCloseTo(blueOnRedCenter.x, 6);
    const nudges = gridJoinPropNudges(
      EAST_1,
      staff(blueOnRedCenter, 90, SHORT_HALF),
      staff(redNorth, 90, SHORT_HALF),
      distances
    );
    expect(nudges!.left.x).toBeCloseTo(-STAFF_NUDGE, 6);
    expect(nudges!.right.x).toBeCloseTo(STAFF_NUDGE, 6);
    expect(nudges!.right.y).toBeCloseTo(0, 6);
  });

  it("does not depend on which way either artwork faces", () => {
    const facing = gridJoinPropNudges(
      EAST_1,
      staff(blueOnRedCenter, 0, SHORT_HALF),
      staff(redOnBlueCenter, 0, SHORT_HALF),
      distances
    );
    const turned = gridJoinPropNudges(
      EAST_1,
      staff(blueOnRedCenter, 180, SHORT_HALF),
      staff(redOnBlueCenter, 0, SHORT_HALF),
      distances
    );
    expect(turned!.right.x).toBeCloseTo(facing!.right.x, 6);
    expect(turned!.right.y).toBeCloseTo(facing!.right.y, 6);
  });

  it("leaves a tip resting on the other prop's hand point alone", () => {
    // Each staff's tip stops 16.7 short of the other hand.
    expect(
      gridJoinPropNudges(
        EAST_1,
        staff(blueOnRedCenter, 0),
        staff(redOnBlueCenter, 0),
        distances
      )
    ).toBeNull();
    expect(
      gridJoinPropNudges(
        EAST_1,
        staff(blueOnRedCenter, 0, SHORT_HALF),
        staff(redOnBlueCenter, 0, SHORT_HALF),
        distances
      )
    ).not.toBeNull();
  });

  it("leaves crossing, side-by-side and separate props alone", () => {
    const at = handPoint(EAST_2, "left", 1, 0);
    expect(
      gridJoinPropNudges(EAST_2, staff(at, 0), staff(at, 90), distances)
    ).toBeNull();
    expect(
      gridJoinPropNudges(
        EAST_2,
        staff(at, 0),
        staff({ x: at.x, y: at.y + 50 }, 0),
        distances
      )
    ).toBeNull();
    expect(
      gridJoinPropNudges(
        EAST_2,
        staff(at, 0),
        staff({ x: at.x + 300, y: at.y }, 0),
        distances
      )
    ).toBeNull();
  });
});

describe("joined hand points", () => {
  /** Applies a `translate(..) scale(..) translate(..)` transform string. */
  function applyTransform(transform: string, point: { x: number; y: number }) {
    const ops = [...transform.matchAll(/(translate|scale)\(([^)]*)\)/g)].map(
      ([, op, args]) => ({ op, args: args!.trim().split(/\s+/).map(Number) })
    );
    let { x, y } = point;
    for (const { op, args } of ops.reverse()) {
      if (op === "translate") {
        x += args[0]!;
        y += args[1] ?? 0;
      } else {
        x *= args[0]!;
        y *= args[1] ?? args[0]!;
      }
    }
    return { x, y };
  }

  it("puts red's north hand point on red's grid, shrunk with the fit (east, one step, diamond)", () => {
    const layout = getGridJoinLayout(EAST_1, "diamond");
    expect(layout.scale).toBeCloseTo(0.96583, 4);
    const north = { x: 475, y: 475 - JOIN_HAND_RADIUS };
    const red = toJoinedHandPoint(layout, "right", north);
    // Red's grid sits 71.55 east of center; the whole picture scales about 475.
    expect(red.x).toBeCloseTo(475 + 0.96583 * 71.55, 2);
    expect(red.y).toBeCloseTo(475 - 0.96583 * 143.1, 2);
    const blue = toJoinedHandPoint(layout, "left", north);
    expect(blue.x).toBeCloseTo(475 - 0.96583 * 71.55, 2);
    expect(blue.y).toBeCloseTo(red.y, 6);
  });

  it("lands every hand's point on the dot the joined grid draws for it", () => {
    for (const [join, mode, locations] of [
      [EAST_1, "diamond", ["n", "e", "s", "w"]],
      [EAST_2, "diamond", ["n", "e", "s", "w"]],
      [SOUTHEAST_1, "box", ["ne", "se", "sw", "nw"]],
    ] as const) {
      const layout = getGridJoinLayout(join, mode);
      for (const hand of ["left", "right"] as const) {
        for (const location of locations) {
          const drawn = layout.points.find(
            (point) =>
              point.kind === "hand" &&
              point.members.some(
                (member) => member.hand === hand && member.location === location
              )
          );
          expect(drawn, `${hand} ${location}`).toBeDefined();
          // One-grid hand point: the layout's own point less this hand's offset.
          const oneGrid = {
            x: drawn!.x - layout.offsets[hand].x,
            y: drawn!.y - layout.offsets[hand].y,
          };
          const placed = toJoinedHandPoint(layout, hand, oneGrid);
          expect(placed.x).toBeCloseTo(
            475 + layout.scale * (drawn!.x - 475),
            6
          );
          expect(placed.y).toBeCloseTo(
            475 + layout.scale * (drawn!.y - 475),
            6
          );
        }
      }
    }
  });

  it("meets hand to hand where the two grids share a point (east, two steps)", () => {
    const layout = getGridJoinLayout(EAST_2, "diamond");
    const east = { x: 475 + JOIN_HAND_RADIUS, y: 475 };
    const west = { x: 475 - JOIN_HAND_RADIUS, y: 475 };
    const blueEast = toJoinedHandPoint(layout, "left", east);
    const redWest = toJoinedHandPoint(layout, "right", west);
    expect(blueEast.x).toBeCloseTo(475, 6);
    expect(redWest.x).toBeCloseTo(475, 6);
  });

  it("inverts the mapping for each hand", () => {
    const layout = getGridJoinLayout(SOUTHEAST_1, "box");
    const pointer = { x: 612.4, y: 288.9 };
    for (const hand of ["left", "right"] as const) {
      const local = fromJoinedHandPoint(layout, hand, pointer);
      const back = toJoinedHandPoint(layout, hand, local);
      expect(back.x).toBeCloseTo(pointer.x, 9);
      expect(back.y).toBeCloseTo(pointer.y, 9);
    }
    const shrunk = getGridJoinLayout(EAST_2, "diamond");
    const local = fromJoinedHandPoint(shrunk, "right", { x: 475, y: 475 });
    // Scene center on red's grid is its west hand point.
    expect(local.x).toBeCloseTo(475 - JOIN_HAND_RADIUS, 6);
    expect(local.y).toBeCloseTo(475, 6);
  });

  it("gives the same move as an SVG transform", () => {
    const layout = getGridJoinLayout(EAST_2, "diamond");
    const point = { x: 331.9, y: 475 };
    for (const hand of ["left", "right"] as const) {
      const viaTransform = applyTransform(
        joinedHandTransform(layout, hand),
        point
      );
      const viaPoint = toJoinedHandPoint(layout, hand, point);
      expect(viaTransform.x).toBeCloseTo(viaPoint.x, 9);
      expect(viaTransform.y).toBeCloseTo(viaPoint.y, 9);
    }
  });
});
