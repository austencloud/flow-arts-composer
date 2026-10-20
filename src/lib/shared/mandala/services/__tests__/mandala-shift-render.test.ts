// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  DEFAULT_MANDALA_LOOK,
  DEFAULT_MANDALA_SHIFT,
  type MandalaLook,
} from "../../domain/mandala-shift-types";
import {
  lookStrip,
  prepareShiftingMandala,
  shiftingMandalaFrameAt,
  stripLayout,
  stripLitAt,
} from "../mandala-shift-render";
import type { MotionLike, StepLike } from "../types";

const CLOCKWISE = ["n", "e", "s", "w"] as const;

function pro(start: number): MotionLike {
  return {
    motionType: "pro",
    rotationDirection: "cw",
    startLocation: CLOCKWISE[start % 4]!,
    endLocation: CLOCKWISE[(start + 1) % 4]!,
    turns: 0,
    startOrientation: "in",
    endOrientation: "in",
  };
}

/** Both hands circling the grid, the left hand `offset` quarters ahead. */
function circle(offset: number): StepLike[] {
  return Array.from({ length: 4 }, (_, beat) => ({
    motions: { left: pro(beat + offset), right: pro(beat) },
  }));
}

const sources = [{ steps: circle(2) }, { steps: circle(1) }, { steps: circle(3) }];
const stripOn: MandalaLook = { ...DEFAULT_MANDALA_LOOK, strip: "bottom" };

describe("the strip's light", () => {
  it("is off for a look saved before the strip", () => {
    expect(lookStrip(DEFAULT_MANDALA_LOOK)).toBe("off");
    const prepared = prepareShiftingMandala(sources, "arc");
    expect(
      shiftingMandalaFrameAt(prepared, DEFAULT_MANDALA_SHIFT, DEFAULT_MANDALA_LOOK, 0, 4).strip
    ).toBeNull();
  });

  it("lights the first cell whole on the first beat", () => {
    const prepared = prepareShiftingMandala(sources, "arc");
    const frame = shiftingMandalaFrameAt(prepared, DEFAULT_MANDALA_SHIFT, stripOn, 0, 4);
    expect(frame.strip?.cells.map((cell) => cell.lit)).toEqual([1, 0, 0]);
    expect(frame.strip?.cells[0]?.paths).toBe(prepared.still(0));
  });

  it("slides the light across a steady hold", () => {
    const prepared = prepareShiftingMandala(sources, "arc");
    const frame = shiftingMandalaFrameAt(prepared, DEFAULT_MANDALA_SHIFT, stripOn, 2, 4);
    const lit = frame.strip?.cells.map((cell) => cell.lit) ?? [];
    expect(lit[0]).toBeCloseTo(0.5);
    expect(lit[1]).toBeCloseTo(0.5);
    expect(lit[2]).toBe(0);
  });

  it("jumps instead of sliding with reduced motion", () => {
    expect(stripLitAt(3, { from: 0, to: 1, morphT: 0.5 }, true)).toEqual([1, 0, 0]);
  });

  it("keeps a lone sequence lit", () => {
    expect(stripLitAt(1, { from: 0, to: 0, morphT: 0.5 })).toEqual([1]);
  });
});

describe("stripLayout", () => {
  it("keeps the figure square above a band a seventh of the height", () => {
    const layout = stripLayout(1000, 700, 3);
    expect(layout.figure).toEqual({ x: 200, y: 0, size: 600 });
    const cell = layout.cells[0]!;
    expect(cell.size).toBeCloseTo(78);
    expect(cell.y + cell.size / 2).toBeCloseTo(650);
    expect(layout.cells[2]!.x - layout.cells[1]!.x).toBeCloseTo(78 * 1.25);
    const rowCentre = (layout.cells[0]!.x + layout.cells[2]!.x + cell.size) / 2;
    expect(rowCentre).toBeCloseTo(500);
  });

  it("floors the band at 40 logical pixels in a short box", () => {
    const layout = stripLayout(400, 200, 2);
    expect(layout.figure.size).toBe(160);
    expect(layout.cells[0]!.size).toBeCloseTo(40 * 0.78);
  });

  it("shrinks the cells to fit a narrow box", () => {
    const layout = stripLayout(200, 700, 8);
    const last = layout.cells[7]!;
    expect(last.x + last.size).toBeLessThanOrEqual(200);
    expect(layout.cells[0]!.x).toBeGreaterThanOrEqual(0);
  });

  it("has no cells for an empty list", () => {
    expect(stripLayout(500, 500, 0).cells).toEqual([]);
  });
});
