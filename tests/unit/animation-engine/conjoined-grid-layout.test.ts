// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  ANIMATION_GRID_JOIN,
  CONJOINED_SHIFT_UNITS,
  CONJOINED_SHIFT_VIEWBOX,
  buildConjoinedGridSvg,
  conjoinedShiftUnits,
  effectiveGridLayout,
  shiftPropState,
  shiftTrailPoints,
  withAnimationGridJoin,
} from "$lib/shared/animation-engine/services/conjoined-grid-layout";
import { calculatePropCenter } from "$lib/shared/animation-engine/services/prop-position-calculator";
import { AnimationVisibilityStateManager } from "$lib/shared/animation-engine/state/animation-visibility-state.svelte";
import { PIXELS_PER_UNIT } from "$lib/shared/multi-grid/domain/constants/grid-mode-offsets";
import type { PropState } from "$lib/shared/foundation/domain/types/prop-state";

const GRID_DIR = resolve(__dirname, "../../../static/images/grid");
const STAFF_SVG = resolve(__dirname, "../../../static/images/props/staff.svg");
const STORAGE_KEY = "animation-visibility-settings";

function strictGridSvg(file: string): string {
  // Mirrors generateGridSvg's strict-mode root class.
  return readFileSync(resolve(GRID_DIR, file), "utf8").replace(
    /<svg([^>]*)>/,
    '<svg$1 class="strict-mode">'
  );
}

interface DrawnCircle {
  id: string;
  className: string;
  cx: number;
  cy: number;
  r: number;
}

/** Circles of each translated copy, in final canvas coordinates. */
function drawnCircles(svg: string): DrawnCircle[] {
  const circles: DrawnCircle[] = [];
  const groups = svg.matchAll(
    /<g transform="translate\((-?[\d.]+) 0\)">([\s\S]*?)<\/g>/g
  );
  for (const [, dx, body] of groups) {
    for (const [tag] of body!.matchAll(/<circle\b[^>]*>/g)) {
      const attr = (name: string) =>
        new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1] ?? "";
      circles.push({
        id: attr("id"),
        className: attr("class"),
        cx: Number(attr("cx")) + Number(dx),
        cy: Number(attr("cy")),
        r: Number(attr("r")),
      });
    }
  }
  return circles;
}

/** Classes the strict-mode grid style leaves unfilled. */
const UNFILLED_IN_STRICT_MODE = new Set([
  "normal-hand-point",
  "normal-layer2-point",
  "diamond-grid-invisible",
  "box-grid-invisible",
]);

/** How far the staff artwork reaches from the hand, in grid viewBox units. */
function staffArtworkReach(): number {
  const svg = readFileSync(STAFF_SVG, "utf8");
  const width = Number(/viewBox="0 0 ([\d.]+) /.exec(svg)![1]);
  const handX = Number(/id="centerPoint" cx="([\d.]+)"/.exec(svg)![1]);
  expect(handX).toBeCloseTo(width / 2, 9);
  return width - handX;
}

/** Center to strict east hand point of the diamond grid, in viewBox units. */
function handPointStep(): number {
  const svg = readFileSync(resolve(GRID_DIR, "diamond_grid.svg"), "utf8");
  const cx = (id: string) =>
    Number(new RegExp(`id="${id}"[^>]*\\scx="([\\d.]+)"`).exec(svg)![1]);
  return cx("e_diamond_hand_point_strict") - cx("center_point");
}

/** Dots of the two grids closer than this, without coinciding, read as doubled. */
const NEAR_DOUBLE = PIXELS_PER_UNIT / 3;

describe("conjoined grid geometry", () => {
  it("sets the grid centers one hand-point step apart", () => {
    expect(2 * CONJOINED_SHIFT_VIEWBOX).toBeCloseTo(handPointStep(), 9);
    expect(CONJOINED_SHIFT_UNITS * PIXELS_PER_UNIT).toBeCloseTo(
      CONJOINED_SHIFT_VIEWBOX,
      9
    );
  });

  it("overlaps level staffs at north, each tip stopping short of the other hand like an inward staff stops short of the center", () => {
    const north: PropState = {
      centerPathAngle: -Math.PI / 2,
      staffRotationAngle: 0,
    };
    const config = {
      canvasSize: 950,
      propDimensions: { width: 252.8, height: 77.8 },
    };
    const [blue, red] = [0, 1].map((propIndex) =>
      calculatePropCenter(
        shiftPropState(north, conjoinedShiftUnits(propIndex), {
          centerPathAngle: 0,
          staffRotationAngle: 0,
        }),
        config
      )
    );
    const reach = staffArtworkReach();
    const singleNorth = calculatePropCenter(north, config);
    const inwardGap = 475 - (singleNorth.y + reach);

    expect(blue!.y).toBeCloseTo(325, 9);
    expect(red!.y).toBeCloseTo(325, 9);
    expect(inwardGap).toBeGreaterThan(0);
    expect(red!.x - (blue!.x + reach)).toBeCloseTo(inwardGap, 9);
    expect(red!.x - reach - blue!.x).toBeCloseTo(inwardGap, 9);
    expect(blue!.x + reach).toBeGreaterThan(red!.x - reach);
  });

  it("moves blue to the left grid and red to the right grid", () => {
    expect(conjoinedShiftUnits(0)).toBe(-CONJOINED_SHIFT_UNITS);
    expect(conjoinedShiftUnits(1)).toBe(CONJOINED_SHIFT_UNITS);
  });
});

describe("shiftPropState", () => {
  const config = {
    canvasSize: 500,
    propDimensions: { width: 100, height: 20 },
  };
  const shiftPx = CONJOINED_SHIFT_VIEWBOX * (500 / 950);

  it.each([
    ["angle", { centerPathAngle: 0.7, staffRotationAngle: 2.1 }],
    ["dash", { centerPathAngle: 0, staffRotationAngle: 1.2, x: 0.25, y: -0.4 }],
  ] as [string, PropState][])(
    "moves a %s prop onto its own grid for both hands",
    (_kind, prop) => {
      const original = calculatePropCenter(prop, config);
      for (const propIndex of [0, 1]) {
        const target: PropState = { centerPathAngle: 0, staffRotationAngle: 0 };
        const shifted = shiftPropState(
          prop,
          conjoinedShiftUnits(propIndex),
          target
        );
        const center = calculatePropCenter(shifted, config);

        expect(shifted).toBe(target);
        expect(center.x).toBeCloseTo(
          original.x + (propIndex === 0 ? -shiftPx : shiftPx),
          9
        );
        expect(center.y).toBeCloseTo(original.y, 9);
        expect(shifted.staffRotationAngle).toBe(prop.staffRotationAngle);
        expect(shifted.centerPathAngle).toBe(prop.centerPathAngle);
      }
    }
  );

  it("moves cached trail points as far as the props, in canvas pixels", () => {
    const scaleFactor = 500 / 950;
    const blue = [
      { x: 100, y: 7 },
      { x: 260, y: 9 },
    ];
    const red = [{ x: 100, y: 7 }];

    shiftTrailPoints(blue, 0, scaleFactor);
    shiftTrailPoints(red, 1, scaleFactor);

    expect(blue[0]!.x).toBeCloseTo(100 - shiftPx, 9);
    expect(blue[1]!.x).toBeCloseTo(260 - shiftPx, 9);
    expect(blue.map((p) => p.y)).toEqual([7, 9]);
    expect(red[0]!.x).toBeCloseTo(100 + shiftPx, 9);
  });
});

describe("buildConjoinedGridSvg", () => {
  it.each(["diamond_grid.svg", "8point_grid.svg", "box_grid.svg"])(
    "keeps every point of %s inside the canvas",
    (file) => {
      const circles = drawnCircles(buildConjoinedGridSvg(strictGridSvg(file)));

      expect(circles.length).toBeGreaterThan(0);
      for (const c of circles) {
        expect(c.cx - c.r, c.id).toBeGreaterThanOrEqual(0);
        expect(c.cx + c.r, c.id).toBeLessThanOrEqual(950);
      }
    }
  );

  it.each(["diamond_grid.svg", "8point_grid.svg", "box_grid.svg"])(
    "puts each %s dot exactly on, or well clear of, every dot of the other grid",
    (file) => {
      const drawn = drawnCircles(
        buildConjoinedGridSvg(strictGridSvg(file))
      ).filter((c) => !UNFILLED_IN_STRICT_MODE.has(c.className));
      const left = drawn.filter((c) => c.id.startsWith("left_"));
      const right = drawn.filter((c) => c.id.startsWith("right_"));

      expect(left.some((c) => c.id.includes("hand_point"))).toBe(true);
      expect(right).toHaveLength(left.length);
      for (const a of left) {
        for (const b of right) {
          const pair = `${a.id} / ${b.id}`;
          const distance = Math.hypot(a.cx - b.cx, a.cy - b.cy);
          if (distance < 0.01) {
            // A shared spot, never an outer dot swallowing another point.
            expect(pair).not.toContain("outer_point");
          } else {
            expect(distance, pair).toBeGreaterThan(NEAR_DOUBLE);
          }
        }
      }
    }
  );

  it("interlocks the diamond grids: each center sits on the other grid's inner hand point", () => {
    const byId = new Map(
      drawnCircles(buildConjoinedGridSvg(strictGridSvg("diamond_grid.svg"))).map(
        (c) => [c.id, c]
      )
    );
    for (const [center, handPoint] of [
      ["left_center_point", "right_w_diamond_hand_point_strict"],
      ["right_center_point", "left_e_diamond_hand_point_strict"],
    ] as const) {
      expect(byId.get(center)!.cx, center).toBeCloseTo(byId.get(handPoint)!.cx, 9);
      expect(byId.get(center)!.cy, center).toBeCloseTo(byId.get(handPoint)!.cy, 9);
    }
  });

  it.each(["diamond_grid.svg", "8point_grid.svg", "box_grid.svg"])(
    "leaves the nonradial guide points out of %s",
    (file) => {
      const single = strictGridSvg(file);

      expect(single).toMatch(/<circle\b[^>]*class="strict-layer2-point"/);
      expect(buildConjoinedGridSvg(single)).not.toMatch(
        /<[a-zA-Z]+\b[^>]*\sclass="[^"]*layer2-point/
      );
    }
  );

  it("draws two copies under one root and style", () => {
    const svg = buildConjoinedGridSvg(strictGridSvg("diamond_grid.svg"));

    expect(svg.match(/<svg\b/g)).toHaveLength(1);
    expect(svg.match(/<style>/g)).toHaveLength(1);
    expect(svg).toContain('class="strict-mode"');
    expect(svg).toContain(`translate(${-CONJOINED_SHIFT_VIEWBOX} 0)`);
    expect(svg).toContain(`translate(${CONJOINED_SHIFT_VIEWBOX} 0)`);
    expect(svg).toContain('id="left_w_diamond_outer_point"');
    expect(svg).toContain('id="right_e_diamond_outer_point"');
    expect(svg).not.toContain('id="left_e_diamond_outer_point"');
    expect(svg).not.toContain('id="right_w_diamond_outer_point"');
  });

  it("returns markup it does not recognise unchanged", () => {
    expect(buildConjoinedGridSvg("not an svg")).toBe("not an svg");
  });
});

describe("grid layout setting", () => {
  beforeEach(() => localStorage.clear());

  it("defaults to a single grid and persists the conjoined choice", () => {
    const vm = new AnimationVisibilityStateManager();
    expect(vm.getGridLayout()).toBe("single");

    vm.setGridLayout("conjoined");
    expect(
      JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}").gridLayout
    ).toBe("conjoined");
    expect(new AnimationVisibilityStateManager().getGridLayout()).toBe(
      "conjoined"
    );
  });

  it("reads an unknown stored or linked layout as a single grid", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ gridLayout: "triple" }));
    expect(new AnimationVisibilityStateManager().getGridLayout()).toBe(
      "single"
    );

    const vm = new AnimationVisibilityStateManager({ ephemeral: true });
    vm.updateSettings({ gridLayout: "triple" as never });
    expect(vm.getGridLayout()).toBe("single");
  });
});

describe("joined sequences", () => {
  it("names the join this layout draws: red's grid one hand-point step east", () => {
    expect(ANIMATION_GRID_JOIN).toEqual({ toward: "e", steps: 1 });
    expect(ANIMATION_GRID_JOIN.steps * handPointStep()).toBeCloseTo(
      2 * CONJOINED_SHIFT_VIEWBOX,
      9
    );
  });

  it("draws a sequence saved with that join joined, even with the switch off", () => {
    expect(
      effectiveGridLayout("single", { conjoined: ANIMATION_GRID_JOIN })
    ).toBe("conjoined");
    expect(effectiveGridLayout("single", {})).toBe("single");
    expect(effectiveGridLayout("single", null)).toBe("single");
    expect(effectiveGridLayout("conjoined", {})).toBe("conjoined");
  });

  it("leaves a join it cannot draw to the switch", () => {
    for (const conjoined of [
      { toward: "n", steps: 1 },
      { toward: "e", steps: 2 },
    ] as const) {
      expect(effectiveGridLayout("single", { conjoined })).toBe("single");
    }
  });

  it("joins a card made while the switch is on, unless the sequence has its own join", () => {
    const plain = { id: "a" };
    expect(withAnimationGridJoin(plain, "single")).toBe(plain);
    expect(withAnimationGridJoin(plain, "conjoined")).toEqual({
      id: "a",
      conjoined: ANIMATION_GRID_JOIN,
    });
    const own = { id: "b", conjoined: { toward: "n", steps: 2 } as const };
    expect(withAnimationGridJoin(own, "conjoined")).toBe(own);
  });
});
