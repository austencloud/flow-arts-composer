import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { GridJoin } from "@tka/tka-types";
import {
  joinedPointColors,
  planJoinedGridPoints,
  JOIN_GRID_LOCATIONS,
} from "@tka/render-core";
import {
  ANIMATION_GRID_GEOMETRY,
  buildHandGridCopySvg,
  gridPointOfElementId,
  handGridCopyColor,
  shiftTrailPoints,
  shiftTrailPointsBy,
} from "$lib/shared/animation-engine/services/animation-grid-join";
import {
  CENTERED_HAND_OFFSETS,
  GridJoinTween,
  gridJoinHandOffsets,
  gridJoinLayerAlphas,
} from "$lib/shared/grid-join/grid-join-tween";

const GRID_DIR = resolve(__dirname, "../../../static/images/grid");
const EAST_ONE: GridJoin = { toward: "e", steps: 1 };
const NORTH_TWO: GridJoin = { toward: "n", steps: 2 };

describe("GridJoinTween", () => {
  it("runs from the old offsets to the new ones and reports progress", () => {
    const tween = new GridJoinTween();
    const to = gridJoinHandOffsets(EAST_ONE);
    tween.start(CENTERED_HAND_OFFSETS, to, 1000, 450);

    const first = tween.sample(1000)!;
    expect(first.t).toBe(0);
    expect(first.offsets.left).toEqual({ x: 0, y: 0 });

    const middle = tween.sample(1225)!;
    expect(middle.t).toBeCloseTo(0.5, 9);
    // Ease in-out is halfway at the halfway time.
    expect(middle.offsets.right.x).toBeCloseTo(to.right.x / 2, 9);
    expect(middle.offsets.left.x).toBeCloseTo(to.left.x / 2, 9);

    // Slow at the start: a quarter of the time covers well under a quarter.
    const early = tween.sample(1000 + 450 / 4)!;
    expect(Math.abs(early.offsets.right.x)).toBeLessThan(
      Math.abs(to.right.x) / 4
    );

    const end = tween.sample(1450)!;
    expect(end.t).toBe(1);
    expect(end.offsets).toEqual(to);
    expect(tween.sample(9999)!.offsets).toEqual(to);
  });

  it("starts a second pick from where the first slide is, with no jump", () => {
    const tween = new GridJoinTween();
    tween.start(
      CENTERED_HAND_OFFSETS,
      gridJoinHandOffsets(EAST_ONE),
      0,
      450
    );
    const before = tween.sample(200)!;
    tween.start(
      gridJoinHandOffsets(EAST_ONE),
      gridJoinHandOffsets(NORTH_TWO),
      200,
      450
    );
    const after = tween.sample(200)!;

    expect(after.id).not.toBe(before.id);
    expect(after.t).toBe(0);
    expect(after.offsets.left.x).toBeCloseTo(before.offsets.left.x, 9);
    expect(after.offsets.right.x).toBeCloseTo(before.offsets.right.x, 9);
    expect(tween.sample(650)!.offsets).toEqual(gridJoinHandOffsets(NORTH_TWO));
  });

  it("does not run at all with a zero duration (reduced motion snaps)", () => {
    const tween = new GridJoinTween();
    tween.start(CENTERED_HAND_OFFSETS, gridJoinHandOffsets(EAST_ONE), 0, 0);
    expect(tween.active).toBe(false);
    expect(tween.sample(0)).toBeNull();
  });

  it("stops on request", () => {
    const tween = new GridJoinTween();
    tween.start(CENTERED_HAND_OFFSETS, gridJoinHandOffsets(EAST_ONE), 0, 450);
    tween.stop();
    expect(tween.sample(100)).toBeNull();
  });
});

describe("gridJoinHandOffsets", () => {
  it("centers both hands for one grid and splits a join either side", () => {
    expect(gridJoinHandOffsets(null)).toEqual(CENTERED_HAND_OFFSETS);
    const east = gridJoinHandOffsets(EAST_ONE);
    expect(east.left.x).toBeCloseTo(-0.5, 9);
    expect(east.right.x).toBeCloseTo(0.5, 9);
  });
});

describe("gridJoinLayerAlphas", () => {
  it("shows only the old picture at the pick and only the new one at the end", () => {
    expect(gridJoinLayerAlphas(0, true)).toEqual({
      outgoing: 1,
      moving: 0,
      composite: 0,
    });
    expect(gridJoinLayerAlphas(1, true)).toEqual({
      outgoing: 0,
      moving: 0,
      composite: 1,
    });
  });

  it("shows only the moving grids through the middle third", () => {
    const middle = gridJoinLayerAlphas(0.5, true);
    expect(middle.outgoing).toBe(0);
    expect(middle.moving).toBe(1);
    expect(middle.composite).toBe(0);
  });

  it("keeps the moving grids up while the new picture is still decoding", () => {
    expect(gridJoinLayerAlphas(1, false)).toEqual({
      outgoing: 0,
      moving: 1,
      composite: 0,
    });
  });

  it("continues a retargeted slide from the strengths last shown", () => {
    const start = gridJoinLayerAlphas(0, true, 0.4, 0.6);
    expect(start.outgoing).toBeCloseTo(0.4, 9);
    expect(start.moving).toBeCloseTo(0.6, 9);
  });
});

describe("shiftTrailPointsBy", () => {
  it("moves trail points exactly as far as shiftTrailPoints for a resting join", () => {
    const scaleFactor = 500 / 950;
    for (const propIndex of [0, 1]) {
      const a = [{ x: 100, y: 7 }];
      const b = [{ x: 100, y: 7 }];
      shiftTrailPoints(a, NORTH_TWO, propIndex, scaleFactor);
      const offsets = gridJoinHandOffsets(NORTH_TWO);
      shiftTrailPointsBy(
        b,
        propIndex === 0 ? offsets.left : offsets.right,
        scaleFactor
      );
      expect(b[0]!.x).toBeCloseTo(a[0]!.x, 9);
      expect(b[0]!.y).toBeCloseTo(a[0]!.y, 9);
    }
  });
});

describe("a hand's sliding grid copy", () => {
  it("paints every grid point one color and drops the nonradial points", () => {
    const single = readFileSync(resolve(GRID_DIR, "8point_grid.svg"), "utf8");
    const copy = buildHandGridCopySvg(single, "#123456");

    expect(copy).not.toMatch(/<[a-zA-Z]+\b[^>]*\sclass="[^"]*layer2-point/);
    const pointElements = [
      ...copy.matchAll(/<(?:circle|path)\b[^>]*\sid="([^"]+)"[^>]*\/>/g),
    ].filter(([, id]) => gridPointOfElementId(id!) !== null);
    expect(pointElements.length).toBeGreaterThan(8);
    for (const [element] of pointElements) {
      expect(element).toMatch(/style="(fill|stroke):#123456"/);
    }
  });

  it("uses the color a joined grid gives a point only that hand draws", () => {
    const paint = {
      base: "#000000",
      hands: { left: "#2e3192", right: "#ed1c24" },
    } as const;
    const plan = planJoinedGridPoints(
      { toward: "e", steps: 2 },
      [...JOIN_GRID_LOCATIONS.diamond],
      ANIMATION_GRID_GEOMETRY
    );
    const colors = joinedPointColors(plan.points, paint.base, paint.hands);
    const leftOnly = plan.points.findIndex(
      (point) =>
        point.kind === "outer" &&
        point.members.length === 1 &&
        point.members[0]!.hand === "left" &&
        point.members[0]!.location === "w"
    );
    expect(leftOnly).toBeGreaterThanOrEqual(0);
    expect(handGridCopyColor(paint, "left")).toBe(colors[leftOnly]);
  });

  it("returns markup it does not recognise unchanged", () => {
    expect(buildHandGridCopySvg("not an svg", "#fff")).toBe("not an svg");
  });
});
