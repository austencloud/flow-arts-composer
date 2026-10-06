import { describe, expect, it } from "vitest";
import {
  GRID_POINT_RADIUS,
  getGridPoints,
  gridPointsSvg,
  type GridPoint,
} from "../src/calculations/grid-points.js";
import { getNormalHandPointCoordinates } from "../src/calculations/grid-placement.js";
import { getGridJoinLayout } from "../src/calculations/grid-join-layout.js";

const CENTER = 475;

/** Turn a point 45° clockwise about the scene center (y grows downward). */
function turned(point: { x: number; y: number }) {
  const dx = point.x - CENTER;
  const dy = point.y - CENTER;
  return {
    x: CENTER + (dx - dy) * Math.SQRT1_2,
    y: CENTER + (dx + dy) * Math.SQRT1_2,
  };
}

function byKind(points: readonly GridPoint[], kind: GridPoint["kind"]) {
  return points.filter((point) => point.kind === kind);
}

describe("getGridPoints", () => {
  it("draws diamond_grid.svg's visible points for the diamond grid", () => {
    const points = getGridPoints("diamond");
    expect(byKind(points, "outer").map(({ location, x, y }) => [location, x, y]))
      .toEqual([
        ["n", 475, 175],
        ["e", 775, 475],
        ["s", 475, 775],
        ["w", 175, 475],
      ]);
    expect(byKind(points, "hand").map(({ location, x, y }) => [location, x, y]))
      .toEqual([
        ["n", 475, 331.9],
        ["e", 618.1, 475],
        ["s", 475, 618.1],
        ["w", 331.9, 475],
      ]);
    expect(byKind(points, "center")).toEqual([
      { kind: "center", location: "c", x: 475, y: 475 },
    ]);
  });

  it("turns every diamond point 45° clockwise for the box grid", () => {
    const diamond = getGridPoints("diamond");
    const box = getGridPoints("box");
    expect(box).toHaveLength(diamond.length);
    for (const [index, point] of diamond.entries()) {
      const expected = turned(point);
      expect(box[index]!.kind).toBe(point.kind);
      // The box hand and outer constants are rounded to 0.1 unit.
      expect(box[index]!.x).toBeCloseTo(expected.x, 0);
      expect(box[index]!.y).toBeCloseTo(expected.y, 0);
    }
  });

  it("names box points by where they land: diamond n on ne, ne on e", () => {
    const box = getGridPoints("box");
    expect(byKind(box, "hand").map((point) => point.location)).toEqual([
      "ne",
      "se",
      "sw",
      "nw",
    ]);
    expect(byKind(box, "outer").map((point) => point.location)).toEqual([
      "ne",
      "se",
      "sw",
      "nw",
    ]);
    expect(byKind(box, "nonRadial").map((point) => point.location)).toEqual([
      "e",
      "s",
      "w",
      "n",
    ]);
  });

  it("puts each hand point exactly where props are placed", () => {
    for (const mode of ["diamond", "box"] as const) {
      for (const point of byKind(getGridPoints(mode), "hand")) {
        expect({ x: point.x, y: point.y }).toEqual(
          getNormalHandPointCoordinates(point.location, mode)
        );
      }
    }
    expect(byKind(getGridPoints("box"), "hand")[0]).toMatchObject({
      x: 576.2,
      y: 373.8,
    });
  });

  it("draws the diamond grid for skewed and missing modes", () => {
    expect(getGridPoints("skewed")).toBe(getGridPoints("diamond"));
    expect(getGridPoints(undefined)).toBe(getGridPoints("diamond"));
  });

  it("sits on the same points a joined grid's own grid draws", () => {
    const box = getGridPoints("box");
    // Box grids join along their diagonals. Two hand steps apart, the blue
    // grid is centered 143.1 toward the northwest.
    const joined = getGridJoinLayout({ toward: "se", steps: 2 }, "box");
    const shift = joined.offsets.left;
    for (const point of box.filter((point) => point.kind !== "nonRadial")) {
      const match = joined.points.find(
        (candidate) =>
          candidate.kind === point.kind &&
          candidate.members.some(
            (member) =>
              member.hand === "left" && member.location === point.location
          )
      );
      if (!match) continue; // hidden beside the other grid
      expect(match.x - shift.x).toBeCloseTo(point.x, 0);
      expect(match.y - shift.y).toBeCloseTo(point.y, 0);
    }
  });
});

describe("gridPointsSvg", () => {
  it("rings box outer points and fills the rest", () => {
    const svg = gridPointsSvg(
      getGridPoints("box").filter((point) => point.kind !== "nonRadial"),
      true,
      "#000000"
    );
    expect(svg.match(/<circle/g)).toHaveLength(9);
    expect(svg.match(/fill="none" stroke="#000000" stroke-width="13"/g))
      .toHaveLength(4);
    expect(svg).toContain(
      `<circle cx="576.2" cy="373.8" r="${GRID_POINT_RADIUS.hand}" fill="#000000"/>`
    );
  });

  it("fills every diamond point", () => {
    const svg = gridPointsSvg(getGridPoints("diamond"), false, "#fff");
    expect(svg).not.toContain("stroke");
    expect(svg.match(/fill="#fff"/g)).toHaveLength(13);
  });
});
