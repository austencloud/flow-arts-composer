// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  CONJOINED_SHIFT_UNITS,
  CONJOINED_SHIFT_VIEWBOX,
  buildConjoinedGridSvg,
  conjoinedShiftUnits,
  shiftPropState,
  shiftTrailPoints,
} from "$lib/shared/animation-engine/services/conjoined-grid-layout";
import { calculatePropCenter } from "$lib/shared/animation-engine/services/prop-position-calculator";
import { AnimationVisibilityStateManager } from "$lib/shared/animation-engine/state/animation-visibility-state.svelte";
import { TOPOLOGY_PRESETS } from "$lib/shared/multi-grid/domain/constants/topology-presets";
import { PIXELS_PER_UNIT } from "$lib/shared/multi-grid/domain/constants/grid-mode-offsets";
import type { PropState } from "$lib/shared/foundation/domain/types/prop-state";

const GRID_DIR = resolve(__dirname, "../../../static/images/grid");
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
    const found = body!.matchAll(
      /<circle\b[^>]*\sid="([^"]+)"[^>]*\scx="([\d.]+)"[^>]*\scy="([\d.]+)"[^>]*\sr="([\d.]+)"/g
    );
    for (const [, id, cx, cy, r] of found) {
      circles.push({
        id: id!,
        cx: Number(cx) + Number(dx),
        cy: Number(cy),
        r: Number(r),
      });
    }
  }
  return circles;
}

describe("conjoined grid geometry", () => {
  it("matches the canonical 2 Diamond topology, centered on the canvas", () => {
    const preset = TOPOLOGY_PRESETS.find((p) => p.id === "2-row-diamond");
    const [a, b] = preset!.build().grids;
    const spanPx = (b!.center.x - a!.center.x) * PIXELS_PER_UNIT;

    expect(b!.center.y).toBe(a!.center.y);
    expect(2 * CONJOINED_SHIFT_VIEWBOX).toBe(spanPx);
    expect(CONJOINED_SHIFT_VIEWBOX).toBe(150);
    expect(CONJOINED_SHIFT_UNITS).toBe(1);
  });

  it("moves blue to the left grid and red to the right grid", () => {
    expect(conjoinedShiftUnits(0)).toBe(-CONJOINED_SHIFT_UNITS);
    expect(conjoinedShiftUnits(1)).toBe(CONJOINED_SHIFT_UNITS);
  });
});

describe("shiftPropState", () => {
  const config = { canvasSize: 500, propDimensions: { width: 100, height: 20 } };
  const shiftPx = CONJOINED_SHIFT_VIEWBOX * (500 / 950);

  it.each([
    ["angle", { centerPathAngle: 0.7, staffRotationAngle: 2.1 }],
    ["dash", { centerPathAngle: 0, staffRotationAngle: 1.2, x: 0.25, y: -0.4 }],
  ] as [string, PropState][])(
    "places a %s prop one grid over for both hands",
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
    const blue = [{ x: 100, y: 7 }, { x: 260, y: 9 }];
    const red = [{ x: 100, y: 7 }];

    shiftTrailPoints(blue, 0, scaleFactor);
    shiftTrailPoints(red, 1, scaleFactor);

    expect(blue.map((p) => p.x)).toEqual([100 - shiftPx, 260 - shiftPx]);
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

  it.each(["diamond_grid.svg", "8point_grid.svg"])(
    "shows only the center dot where %s grids meet a center",
    (file) => {
      const circles = drawnCircles(buildConjoinedGridSvg(strictGridSvg(file)));
      for (const side of ["left", "right"]) {
        const center = circles.find((c) => c.id === `${side}_center_point`)!;
        const stacked = circles.filter(
          (c) => c.cx === center.cx && c.cy === center.cy
        );
        expect(stacked.map((c) => c.id)).toEqual([`${side}_center_point`]);
      }
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
    expect(new AnimationVisibilityStateManager().getGridLayout()).toBe("single");

    const vm = new AnimationVisibilityStateManager({ ephemeral: true });
    vm.updateSettings({ gridLayout: "triple" as never });
    expect(vm.getGridLayout()).toBe("single");
  });
});
