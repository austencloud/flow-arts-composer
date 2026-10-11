// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import type { GridJoin } from "@tka/tka-types";
import {
  gridJoinShiftUnits,
  resolveAnimationGridJoin,
} from "#lib/shared/animation-engine/services/animation-grid-join.js";
import {
  CENTERED_HAND_OFFSETS,
  gridJoinHandOffsets,
} from "#lib/shared/grid-join/grid-join-tween.js";
import { MANDALA_GRID_RADIUS } from "../../domain/mandala-constants";
import type { MandalaPaths } from "../../domain/mandala-types";
import {
  mandalaGridJoinOffsets,
  mandalaOffsetsFromHandUnits,
  type MandalaHandOffsets,
} from "../mandala-grid-join";
import {
  MandalaOverlapMasks,
  paintMandalaGuide,
} from "../mandala-guide-painter";
import { renderMandalaSVG } from "../mandala-renderer";
import type { PreparedMandalaPath } from "../types";

const EAST_ONE: GridJoin = { toward: "e", steps: 1 };

/** Where the animation puts a hand's props, in mandala units. */
function propShift(join: GridJoin, propIndex: number) {
  const shift = gridJoinShiftUnits(join, propIndex);
  return {
    x: shift.x * MANDALA_GRID_RADIUS,
    y: shift.y * MANDALA_GRID_RADIUS,
  };
}

function expectVec(
  actual: { x: number; y: number },
  expected: { x: number; y: number }
) {
  expect(actual.x).toBeCloseTo(expected.x, 9);
  expect(actual.y).toBeCloseTo(expected.y, 9);
}

describe("joined mandala hand offsets", () => {
  it("leaves one grid unmoved", () => {
    expect(mandalaGridJoinOffsets(undefined, "diamond")).toBeNull();
    expect(mandalaGridJoinOffsets(null, "diamond")).toBeNull();
    expect(mandalaGridJoinOffsets({ toward: "x", steps: 3 }, null)).toBeNull();
    expect(mandalaOffsetsFromHandUnits(CENTERED_HAND_OFFSETS)).toBeNull();
    expect(mandalaOffsetsFromHandUnits(gridJoinHandOffsets(null))).toBeNull();
  });

  it("moves blue left and red right by the same units as the props (e1)", () => {
    const offsets = mandalaGridJoinOffsets(EAST_ONE, "diamond")!;
    expectVec(offsets.left, { x: -MANDALA_GRID_RADIUS / 2, y: 0 });
    expectVec(offsets.right, { x: MANDALA_GRID_RADIUS / 2, y: 0 });
    expectVec(offsets.left, propShift(EAST_ONE, 0));
    expectVec(offsets.right, propShift(EAST_ONE, 1));

    // The animation guide reads the engine's displayed offsets; at rest they
    // are the same figure positions the cards use.
    const guide = mandalaOffsetsFromHandUnits(gridJoinHandOffsets(EAST_ONE))!;
    expectVec(guide.left, offsets.left);
    expectVec(guide.right, offsets.right);
  });

  it("follows a diagonal join on the box grid, and aligns it on a diamond", () => {
    const join: GridJoin = { toward: "ne", steps: 1 };
    const half = (MANDALA_GRID_RADIUS / 2) * Math.SQRT1_2;
    const box = mandalaGridJoinOffsets(join, "box")!;
    expectVec(box.left, { x: -half, y: half });
    expectVec(box.right, { x: half, y: -half });
    expectVec(box.right, propShift(join, 1));

    // On a diamond grid the join lines up with the hand-point lines first,
    // exactly as the animation lines it up for the props.
    const aligned = resolveAnimationGridJoin({
      conjoined: join,
      gridMode: "diamond",
    })!;
    const diamond = mandalaGridJoinOffsets(join, "diamond")!;
    expectVec(diamond.left, propShift(aligned, 0));
    expectVec(diamond.right, propShift(aligned, 1));
  });
});

// Two simple figures well inside the standard staff fit (144 units).
const PATHS: MandalaPaths = {
  left: [{ d: "M 100 0 C 100 50, 50 100, 0 100", tipIndex: 0 }],
  right: [{ d: "M -100 0 C -100 -50, -50 -100, 0 -100", tipIndex: 0 }],
  purple: [],
};
const SVG_OPTIONS = {
  size: 200,
  style: "stroke" as const,
  show: "both" as const,
};

/** Mask and gradient ids count up per render; compare markup without them. */
function withoutIds(svg: string): string {
  return svg.replace(/(bom|feather|bloom|gBlue|gRed|gPurple)\d+/g, "$1");
}

function svgScale(svg: string): number {
  return Number(/scale\(([\d.]+)\)/.exec(svg)![1]);
}

describe("static mandala on joined grids", () => {
  const joined = mandalaGridJoinOffsets(EAST_ONE, "diamond");

  it("renders one grid exactly as before", () => {
    expect(
      withoutIds(renderMandalaSVG(PATHS, { ...SVG_OPTIONS, handOffsets: null }))
    ).toBe(withoutIds(renderMandalaSVG(PATHS, SVG_OPTIONS)));
  });

  it("draws each hand on its own grid and fits the pair in the box", () => {
    const one = renderMandalaSVG(PATHS, SVG_OPTIONS);
    const two = renderMandalaSVG(PATHS, {
      ...SVG_OPTIONS,
      handOffsets: joined,
    });
    expect(two).toContain('<g transform="translate(-40.00, 0.00)">');
    expect(two).toContain('<g transform="translate(40.00, 0.00)">');
    // One figure fits 144 units; the joined pair reaches 40 further.
    expect(svgScale(two) / svgScale(one)).toBeCloseTo(144 / 184, 3);
  });

  it("keeps a one-hand view centered", () => {
    const left = { ...SVG_OPTIONS, show: "left" as const };
    expect(
      withoutIds(renderMandalaSVG(PATHS, { ...left, handOffsets: joined }))
    ).toBe(withoutIds(renderMandalaSVG(PATHS, left)));
  });
});

describe("animation guide painter on joined grids", () => {
  function paint(handOffsets: MandalaHandOffsets | null) {
    const calls: string[] = [];
    let strokeStyle = "";
    const context = {
      save: () => calls.push("save"),
      restore: () => calls.push("restore"),
      setTransform: () => undefined,
      clearRect: () => undefined,
      translate: (x: number, y: number) => calls.push(`translate ${x} ${y}`),
      scale: () => undefined,
      setLineDash: () => undefined,
      stroke: () => calls.push(`stroke ${strokeStyle}`),
      set strokeStyle(value: string) {
        strokeStyle = value;
      },
    } as unknown as CanvasRenderingContext2D;
    const path = (hand: "left" | "right", color: string) =>
      ({ path2d: {}, totalLength: 1, color, hand }) as PreparedMandalaPath;
    paintMandalaGuide(
      { context, pixelWidth: 100, pixelHeight: 100, dpr: 1 },
      {
        paths: [path("left", "blue"), path("right", "red")],
        scale: 1,
        strokeWidth: 2,
        handOffsets,
      },
      // No OffscreenCanvas here: the overlap pass is skipped.
      new MandalaOverlapMasks()
    );
    return calls;
  }

  it("strokes one grid around the canvas center only", () => {
    expect(paint(null)).toEqual([
      "save",
      "translate 50 50",
      "stroke blue",
      "stroke red",
      "restore",
    ]);
  });

  it("moves each hand's figure with that hand's props", () => {
    const calls = paint(
      mandalaOffsetsFromHandUnits(gridJoinHandOffsets(EAST_ONE))
    );
    expect(calls).toEqual([
      "save",
      "translate 50 50",
      "save",
      "translate -40 0",
      "stroke blue",
      "restore",
      "save",
      "translate 40 0",
      "stroke red",
      "restore",
      "restore",
    ]);
  });
});
