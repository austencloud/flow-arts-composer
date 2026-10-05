import { describe, expect, it } from "vitest";
import {
  JOIN_HAND_RADIUS,
  getGridJoinLayout,
  gridJoinKey,
  gridJoinOffsets,
  gridJoinPropNudges,
  isGridJoin,
  resolveStepGridJoin,
  type GridJoinLayout,
  type GridJoinSpec,
  type JoinPropBody,
} from "../src/calculations/grid-join-layout.js";

const EAST_1: GridJoinSpec = { toward: "e", steps: 1 };
const EAST_2: GridJoinSpec = { toward: "e", steps: 2 };
const STAFF_HALF = 252.8 / 2;
const STAFF_NUDGE = 950 / 45;

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

  it("lets a step keep, replace or drop the sequence's join", () => {
    expect(resolveStepGridJoin(EAST_1, undefined)).toBe(EAST_1);
    expect(resolveStepGridJoin(EAST_1, EAST_2)).toBe(EAST_2);
    expect(resolveStepGridJoin(EAST_1, null)).toBeNull();
    expect(resolveStepGridJoin(undefined, EAST_2)).toBe(EAST_2);
    expect(resolveStepGridJoin(undefined, undefined)).toBeNull();
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
    const layout = getGridJoinLayout(EAST_1, "box");
    expect(countKinds(layout)).toEqual({ center: 2, hand: 8, outer: 8 });
    const blueNortheast = layout.points.find(
      (point) =>
        point.kind === "hand" &&
        point.members[0]!.hand === "left" &&
        point.members[0]!.location === "ne"
    );
    const expected = handPoint(EAST_1, "left", Math.SQRT1_2, -Math.SQRT1_2);
    expect(blueNortheast!.x).toBeCloseTo(expected.x, 6);
    expect(blueNortheast!.y).toBeCloseTo(expected.y, 6);
    expect(layout.scale).toBe(1);
  });

  it("shrinks a diagonal two-step join to keep clear of the cell edge", () => {
    expect(getGridJoinLayout({ toward: "ne", steps: 1 }, "diamond").scale).toBe(
      1
    );
    expect(
      getGridJoinLayout({ toward: "ne", steps: 2 }, "diamond").scale
    ).toBeCloseTo(0.8987, 3);
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
