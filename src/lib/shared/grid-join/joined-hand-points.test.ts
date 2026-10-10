/**
 * The two drag grids (the Start step's aim grid and Assemble's builder) place
 * each hand's targets with render-core's `toJoinedHandPoint`, starting from
 * their own one-grid point tables. These checks pin those tables to the joined
 * layout, so a target always sits on the dot the joined grid draws for it.
 */
import { describe, expect, it } from "vitest";
import {
  getGridJoinLayout,
  toJoinedHandPoint,
  type GridJoinSpec,
} from "@tka/render-core";
import { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import { getPlacementGridPoints } from "#lib/shared/pictograph/grid/services/placement-grid-points.js";
import { getHitTargets } from "#lib/shared/assemble-lab/services/grid-hit-target-calculator.js";

const CASES: readonly [
  GridJoinSpec,
  typeof GridMode.DIAMOND | typeof GridMode.BOX,
][] = [
  [{ toward: "e", steps: 1 }, GridMode.DIAMOND],
  [{ toward: "n", steps: 2 }, GridMode.DIAMOND],
  [{ toward: "se", steps: 1 }, GridMode.BOX],
  [{ toward: "nw", steps: 2 }, GridMode.BOX],
];

/** Where the joined picture shows a hand's grid point, after the fit. */
function drawnDot(
  join: GridJoinSpec,
  mode: GridMode,
  hand: "left" | "right",
  location: string
) {
  const layout = getGridJoinLayout(join, mode);
  const point = layout.points.find(
    (candidate) =>
      candidate.kind === "hand" &&
      candidate.members.some(
        (member) => member.hand === hand && member.location === location
      )
  );
  if (!point) throw new Error(`no ${hand} ${location} dot`);
  return {
    x: 475 + layout.scale * (point.x - 475),
    y: 475 + layout.scale * (point.y - 475),
  };
}

describe("joined hand points", () => {
  it("puts the Start aim grid's targets on each hand's drawn dots", () => {
    for (const [join, mode] of CASES) {
      const layout = getGridJoinLayout(join, mode);
      for (const hand of ["left", "right"] as const) {
        for (const point of getPlacementGridPoints(mode)) {
          const placed = toJoinedHandPoint(layout, hand, point);
          const dot = drawnDot(join, mode, hand, point.location);
          expect(placed.x).toBeCloseTo(dot.x, 0);
          expect(placed.y).toBeCloseTo(dot.y, 0);
        }
      }
    }
  });

  it("puts Assemble's targets on each hand's drawn dots", () => {
    for (const [join, mode] of CASES) {
      const layout = getGridJoinLayout(join, mode);
      for (const hand of ["left", "right"] as const) {
        for (const target of getHitTargets(mode)) {
          const placed = toJoinedHandPoint(layout, hand, target);
          const dot = drawnDot(join, mode, hand, target.location);
          expect(placed.x).toBeCloseTo(dot.x, 0);
          expect(placed.y).toBeCloseTo(dot.y, 0);
        }
      }
    }
  });

  it("sends red's north on an east join to the right of center, above it", () => {
    const layout = getGridJoinLayout({ toward: "e", steps: 1 }, "diamond");
    const north = getPlacementGridPoints(GridMode.DIAMOND).find(
      (point) => point.location === "n"
    )!;
    const red = toJoinedHandPoint(layout, "right", north);
    expect(red.x).toBeCloseTo(544.1, 1);
    expect(red.y).toBeCloseTo(336.8, 1);
  });
});
