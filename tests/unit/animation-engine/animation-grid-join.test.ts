// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import type { GridJoin } from "@tka/tka-types";
import {
  ANIMATION_GRID_GEOMETRY,
  animationGridJoinKey,
  buildJoinedGridSvg,
  gridJoinShiftUnits,
  gridJoinShiftViewBox,
  gridPointOfElementId,
  resolveAnimationGridJoin,
  shiftPropState,
  shiftTrailPoints,
} from "$lib/shared/animation-engine/services/animation-grid-join";
import { calculatePropCenter } from "$lib/shared/animation-engine/services/prop-position-calculator";
import { AnimationVisibilityStateManager } from "$lib/shared/animation-engine/state/animation-visibility-state.svelte";
import { PIXELS_PER_UNIT } from "$lib/shared/multi-grid/domain/constants/grid-mode-offsets";
import type { PropState } from "$lib/shared/foundation/domain/types/prop-state";
import {
  JOIN_GRID_LOCATIONS,
  joinedPointKey,
  joinedPointsDrawnBy,
  planJoinedGridPoints,
} from "@tka/render-core";

const GRID_DIR = resolve(__dirname, "../../../static/images/grid");
const STORAGE_KEY = "animation-visibility-settings";
const GRID_FILES = ["diamond_grid.svg", "8point_grid.svg", "box_grid.svg"];
const DIRECTIONS: GridJoin["toward"][] = [
  "n",
  "e",
  "s",
  "w",
  "ne",
  "se",
  "sw",
  "nw",
];
const ALL_JOINS: GridJoin[] = DIRECTIONS.flatMap((toward) =>
  ([1, 2] as const).map((steps) => ({ toward, steps }))
);
const SQRT_HALF = Math.SQRT1_2;

/** Where red's grid sits from blue's, as a unit vector (screen y points down). */
const UNIT: Record<GridJoin["toward"], { x: number; y: number }> = {
  n: { x: 0, y: -1 },
  e: { x: 1, y: 0 },
  s: { x: 0, y: 1 },
  w: { x: -1, y: 0 },
  ne: { x: SQRT_HALF, y: -SQRT_HALF },
  se: { x: SQRT_HALF, y: SQRT_HALF },
  sw: { x: -SQRT_HALF, y: SQRT_HALF },
  nw: { x: -SQRT_HALF, y: -SQRT_HALF },
};

function strictGridSvg(file: string): string {
  // Mirrors generateGridSvg's strict-mode root class.
  return readFileSync(resolve(GRID_DIR, file), "utf8").replace(
    /<svg([^>]*)>/,
    '<svg$1 class="strict-mode">'
  );
}

interface DrawnElement {
  id: string;
  hand: "left" | "right";
  /** Position in grid viewBox units, after the copy's translate; circles only. */
  x?: number;
  y?: number;
  r?: number;
  className: string;
}

/** Every element with an id in each translated copy of a joined grid. */
function drawnElements(svg: string): DrawnElement[] {
  const elements: DrawnElement[] = [];
  const groups = svg.matchAll(
    /<g transform="translate\((-?[\d.]+) (-?[\d.]+)\)">([\s\S]*?)<\/g>/g
  );
  for (const [, dx, dy, body] of groups) {
    for (const [tag] of body!.matchAll(/<(?:circle|path)\b[^>]*>/g)) {
      const attr = (name: string) =>
        new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];
      const id = attr("id");
      if (!id) continue;
      const circle = tag.startsWith("<circle");
      elements.push({
        id,
        hand: id.startsWith("left_") ? "left" : "right",
        className: attr("class") ?? "",
        ...(circle && {
          x: Number(attr("cx")) + Number(dx),
          y: Number(attr("cy")) + Number(dy),
          r: Number(attr("r")),
        }),
      });
    }
  }
  return elements;
}

/** Classes the strict-mode grid style leaves unfilled. */
const UNFILLED_IN_STRICT_MODE = new Set([
  "normal-hand-point",
  "normal-layer2-point",
  "diamond-grid-invisible",
  "box-grid-invisible",
]);

function locationsOf(file: string) {
  if (file === "diamond_grid.svg") return [...JOIN_GRID_LOCATIONS.diamond];
  if (file === "box_grid.svg") return [...JOIN_GRID_LOCATIONS.box];
  return [...JOIN_GRID_LOCATIONS.diamond, ...JOIN_GRID_LOCATIONS.box];
}

function pointKeyOf(id: string): string | null {
  return gridPointOfElementId(id.replace(/^(left|right)_/, ""));
}

describe("which grids the animation draws", () => {
  it("reads the join from the sequence, never from a view setting", () => {
    expect(
      resolveAnimationGridJoin({ conjoined: { toward: "nw", steps: 2 } })
    ).toEqual({ toward: "nw", steps: 2 });
    expect(resolveAnimationGridJoin({})).toBeNull();
    expect(resolveAnimationGridJoin(null)).toBeNull();
  });

  it("ignores a malformed stored join", () => {
    for (const conjoined of [
      { toward: "x", steps: 1 },
      { toward: "e", steps: 3 },
      "e1",
    ]) {
      expect(resolveAnimationGridJoin({ conjoined } as never)).toBeNull();
    }
  });

  it("keeps tunnel layers on one grid", () => {
    expect(
      resolveAnimationGridJoin({ conjoined: { toward: "e", steps: 1 } }, 2)
    ).toBeNull();
  });

  it("keys each join, and no join, distinctly", () => {
    const keys = ALL_JOINS.map(animationGridJoinKey);
    expect(new Set(keys).size).toBe(16);
    expect(animationGridJoinKey(null)).toBe("");
  });
});

describe("hand shift vectors", () => {
  it("sets east, one point, to half a hand-point step either side", () => {
    const join: GridJoin = { toward: "e", steps: 1 };
    expect(gridJoinShiftUnits(join, 0).x).toBe(-0.5);
    expect(gridJoinShiftUnits(join, 0).y).toBeCloseTo(0, 12);
    expect(gridJoinShiftUnits(join, 1)).toEqual({ x: 0.5, y: 0 });
    expect(gridJoinShiftViewBox(join, 0).x).toBe(-PIXELS_PER_UNIT / 2);
    expect(gridJoinShiftViewBox(join, 1).x).toBe(PIXELS_PER_UNIT / 2);
  });

  it.each(ALL_JOINS)(
    "puts blue back and red forward along $toward, $steps point(s) across",
    (join) => {
      const unit = UNIT[join.toward];
      const half = join.steps / 2;
      const blue = gridJoinShiftUnits(join, 0);
      const red = gridJoinShiftUnits(join, 1);

      expect(red.x).toBeCloseTo(unit.x * half, 9);
      expect(red.y).toBeCloseTo(unit.y * half, 9);
      expect(blue.x).toBeCloseTo(-unit.x * half, 9);
      expect(blue.y).toBeCloseTo(-unit.y * half, 9);
      // The two grid centers are `steps` hand-point steps apart.
      expect(Math.hypot(red.x - blue.x, red.y - blue.y)).toBeCloseTo(
        join.steps,
        9
      );
      // The view box shift is the same vector at the grid's own scale.
      const red150 = gridJoinShiftViewBox(join, 1);
      expect(red150.x).toBeCloseTo(red.x * PIXELS_PER_UNIT, 9);
      expect(red150.y).toBeCloseTo(red.y * PIXELS_PER_UNIT, 9);
    }
  );
});

describe("shiftPropState", () => {
  const config = {
    canvasSize: 500,
    propDimensions: { width: 100, height: 20 },
  };
  const pxPerUnit = (PIXELS_PER_UNIT * 500) / 950;

  it.each([
    ["angle", { centerPathAngle: 0.7, staffRotationAngle: 2.1 }],
    ["dash", { centerPathAngle: 0, staffRotationAngle: 1.2, x: 0.25, y: -0.4 }],
  ] as [string, PropState][])(
    "moves a %s prop onto its own grid for every join",
    (_kind, prop) => {
      const original = calculatePropCenter(prop, config);
      for (const join of ALL_JOINS) {
        for (const propIndex of [0, 1]) {
          const shift = gridJoinShiftUnits(join, propIndex);
          const target: PropState = {
            centerPathAngle: 0,
            staffRotationAngle: 0,
          };
          const shifted = shiftPropState(prop, shift, target);
          const center = calculatePropCenter(shifted, config);

          expect(shifted).toBe(target);
          expect(center.x).toBeCloseTo(original.x + shift.x * pxPerUnit, 9);
          expect(center.y).toBeCloseTo(original.y + shift.y * pxPerUnit, 9);
          expect(shifted.staffRotationAngle).toBe(prop.staffRotationAngle);
          expect(shifted.centerPathAngle).toBe(prop.centerPathAngle);
        }
      }
    }
  );

  it("puts blue's east hand point and red's west hand point on the same spot at east one", () => {
    const join: GridJoin = { toward: "e", steps: 1 };
    const full = {
      canvasSize: 950,
      propDimensions: { width: 100, height: 20 },
    };
    const blueEast = calculatePropCenter(
      shiftPropState(
        { centerPathAngle: 0, staffRotationAngle: 0 },
        gridJoinShiftUnits(join, 0),
        { centerPathAngle: 0, staffRotationAngle: 0 }
      ),
      full
    );
    const redWest = calculatePropCenter(
      shiftPropState(
        { centerPathAngle: Math.PI, staffRotationAngle: 0 },
        gridJoinShiftUnits(join, 1),
        { centerPathAngle: 0, staffRotationAngle: 0 }
      ),
      full
    );
    // 475 + 150 - 75 and 475 - 150 + 75: the hand points the grids share.
    expect(blueEast.x).toBeCloseTo(550, 9);
    expect(redWest.x).toBeCloseTo(400, 9);
  });
});

describe("shiftTrailPoints", () => {
  it.each(ALL_JOINS)(
    "moves cached trail points as far as the props, in canvas pixels ($toward, $steps)",
    (join) => {
      const scaleFactor = 500 / 950;
      for (const propIndex of [0, 1]) {
        const points = [
          { x: 100, y: 7 },
          { x: 260, y: 9 },
        ];
        shiftTrailPoints(points, join, propIndex, scaleFactor);
        const shift = gridJoinShiftViewBox(join, propIndex);

        expect(points[0]!.x).toBeCloseTo(100 + shift.x * scaleFactor, 9);
        expect(points[0]!.y).toBeCloseTo(7 + shift.y * scaleFactor, 9);
        expect(points[1]!.x).toBeCloseTo(260 + shift.x * scaleFactor, 9);
        expect(points[1]!.y).toBeCloseTo(9 + shift.y * scaleFactor, 9);
      }
    }
  );
});

describe("gridPointOfElementId", () => {
  it("names the grid point an element draws, with the box outer ids read by position", () => {
    expect(gridPointOfElementId("center_point")).toBe("center:c");
    expect(gridPointOfElementId("e_diamond_outer_point")).toBe("outer:e");
    expect(gridPointOfElementId("w_diamond_hand_point_strict")).toBe("hand:w");
    expect(gridPointOfElementId("strict_se_box_hand_point")).toBe("hand:se");
    // The box file names outer points by the opposite corner.
    expect(gridPointOfElementId("ne_box_outer_point")).toBe("outer:nw");
    expect(gridPointOfElementId("sw_box_outer_point")).toBe("outer:se");
    expect(gridPointOfElementId("e_diamond_hand_point_normal")).toBeNull();
  });
});

describe("buildJoinedGridSvg", () => {
  it("draws two copies under one root and style, east one at the old picture's offsets", () => {
    const svg = buildJoinedGridSvg(strictGridSvg("diamond_grid.svg"), {
      toward: "e",
      steps: 1,
    });

    expect(svg.match(/<svg\b/g)).toHaveLength(1);
    expect(svg.match(/<style>/g)).toHaveLength(1);
    expect(svg).toContain('class="strict-mode"');
    expect(svg).toContain("translate(-75 0)");
    expect(svg).toContain("translate(75 0)");
  });

  it("hides exactly the facing outer points at east one", () => {
    const svg = buildJoinedGridSvg(strictGridSvg("diamond_grid.svg"), {
      toward: "e",
      steps: 1,
    });
    const outer = drawnElements(svg)
      .map((e) => e.id)
      .filter((id) => id.includes("diamond_outer_point"));

    expect(outer.sort()).toEqual([
      "left_n_diamond_outer_point",
      "left_s_diamond_outer_point",
      "left_w_diamond_outer_point",
      "right_e_diamond_outer_point",
      "right_n_diamond_outer_point",
      "right_s_diamond_outer_point",
    ]);
    expect(svg).not.toContain('id="left_e_diamond_outer_point"');
    expect(svg).not.toContain('id="right_w_diamond_outer_point"');
  });

  it.each(GRID_FILES)(
    "draws every point of %s where the shared planner puts it, for all 16 joins",
    (file) => {
      const single = strictGridSvg(file);
      for (const join of ALL_JOINS) {
        const svg = buildJoinedGridSvg(single, join);
        const plan = planJoinedGridPoints(
          join,
          locationsOf(file),
          ANIMATION_GRID_GEOMETRY
        );
        const elements = drawnElements(svg).filter(
          (e) => !UNFILLED_IN_STRICT_MODE.has(e.className)
        );
        const where = `${file} ${join.toward}${join.steps}`;

        for (const hand of ["left", "right"] as const) {
          const drawn = new Set(
            elements
              .filter((e) => e.hand === hand)
              .map((e) => pointKeyOf(e.id))
              .filter((key): key is string => key !== null)
          );
          expect(drawn, `${where} ${hand}`).toEqual(
            new Set(joinedPointsDrawnBy(plan.points, hand))
          );
        }

        // Circles sit where the plan says that point is (the grid files round
        // their diagonal coordinates to one decimal).
        for (const element of elements) {
          const key = pointKeyOf(element.id);
          if (element.x === undefined || key === null) continue;
          const point = plan.points.find(
            (p) =>
              joinedPointKey(p.kind, p.members[0]!.location) === key &&
              p.members[0]!.hand === element.hand
          );
          expect(point, `${where} ${element.id}`).toBeDefined();
          expect(element.x, `${where} ${element.id} x`).toBeCloseTo(
            point!.x,
            1
          );
          expect(element.y, `${where} ${element.id} y`).toBeCloseTo(
            point!.y,
            1
          );
        }
      }
    }
  );

  it.each(GRID_FILES)(
    "keeps every dot of %s inside the 950 viewBox, including two points across",
    (file) => {
      const single = strictGridSvg(file);
      for (const join of ALL_JOINS) {
        const circles = drawnElements(buildJoinedGridSvg(single, join)).filter(
          (e) => e.x !== undefined && !UNFILLED_IN_STRICT_MODE.has(e.className)
        );
        expect(circles.length).toBeGreaterThan(0);
        for (const c of circles) {
          const where = `${file} ${join.toward}${join.steps} ${c.id}`;
          expect(c.x! - c.r!, where).toBeGreaterThanOrEqual(-1e-9);
          expect(c.x! + c.r!, where).toBeLessThanOrEqual(950 + 1e-9);
          expect(c.y! - c.r!, where).toBeGreaterThanOrEqual(-1e-9);
          expect(c.y! + c.r!, where).toBeLessThanOrEqual(950 + 1e-9);
        }
      }
    }
  );

  it("interlocks the diamond grids at one point: each center sits on the other grid's facing hand point", () => {
    const circles = new Map(
      drawnElements(
        buildJoinedGridSvg(strictGridSvg("diamond_grid.svg"), {
          toward: "n",
          steps: 1,
        })
      ).map((c) => [c.id, c])
    );
    // Red is above blue: red's south hand point is blue's center.
    const center = circles.get("left_center_point")!;
    const facing = circles.get("right_s_diamond_hand_point_strict")!;
    expect(center.x).toBeCloseTo(facing.x!, 9);
    expect(center.y).toBeCloseTo(facing.y!, 9);
  });

  it.each(GRID_FILES)("leaves the nonradial guide points out of %s", (file) => {
    const single = strictGridSvg(file);

    expect(single).toMatch(/<circle\b[^>]*class="strict-layer2-point"/);
    for (const join of ALL_JOINS) {
      expect(buildJoinedGridSvg(single, join)).not.toMatch(
        /<[a-zA-Z]+\b[^>]*\sclass="[^"]*layer2-point/
      );
    }
  });

  it("returns markup it does not recognise unchanged", () => {
    expect(buildJoinedGridSvg("not an svg", { toward: "e", steps: 1 })).toBe(
      "not an svg"
    );
  });
});

describe("the visibility manager no longer owns the grid layout", () => {
  beforeEach(() => localStorage.clear());

  it("drops a stored gridLayout without erroring and never writes one", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ gridLayout: "conjoined", gridMode: "8point" })
    );
    const vm = new AnimationVisibilityStateManager();

    expect(vm.getGridMode()).toBe("8point");
    expect("gridLayout" in vm.snapshot()).toBe(false);
    vm.setGridMode("none");
    expect(
      "gridLayout" in JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}")
    ).toBe(false);
  });
});
