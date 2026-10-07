/**
 * The Create front door's Shape preview shows the corner of the page the
 * Shape Matrix opens on, then grows the chosen tile into its stage. Its
 * beats sit on the Matrix's own Surprise reveal and must fit in one turn.
 */
import { describe, expect, it } from "vitest";
import { METHOD_PREVIEW_TIMING } from "$lib/features/create/shared/state/method-preview-turns.svelte";
import {
  shapeCellRect,
  shapeLayout,
  transformOnto,
} from "$lib/features/create/shared/components/method-previews/method-preview-compositions";
import { SCENE_TAP } from "$lib/features/create/shared/components/method-previews/method-preview-run";
import {
  SHAPE_PREVIEW_TIMING,
  shapeCorner,
} from "$lib/features/create/shared/components/method-previews/method-preview-shape";
import { SHAPE_MATRIX_REVEAL } from "$lib/shared/shape-matrix/app/services/shape-matrix-reveal";
import {
  buildShapeMatrixAxis,
  flowerKey,
} from "$lib/shared/shape-matrix/domain/flower-signature";

/** The attract ghost's shortest glide (glide() in attract-ghost.svelte.ts). */
const MIN_GLIDE_MS = 300;

describe("Shape preview corner", () => {
  const axis = buildShapeMatrixAxis();

  it("shows the band the Matrix opens on: blue rows, red columns", () => {
    const corner = shapeCorner(axis, { rows: 2, columns: 4 });
    expect(corner.rows.map(flowerKey)).toEqual([
      "pro-2-in-diamond",
      "pro-2-out-diamond",
    ]);
    expect(corner.columns.map(flowerKey)).toEqual([
      "pro-2-in-diamond",
      "pro-2-out-diamond",
      "anti-2-in-diamond",
      "anti-2-out-diamond",
    ]);
  });

  it("never asks for more flowers than the band holds", () => {
    const corner = shapeCorner(axis, { rows: 6, columns: 6 });
    expect(corner.rows).toHaveLength(4);
    expect(corner.columns).toHaveLength(4);
  });

  it("fills every layout's corner, chosen tile included", () => {
    for (const [shape, width, height] of [
      ["strip", 146, 48],
      ["roomy", 308, 96],
      ["roomy", 153, 96],
      ["square", 144, 144],
      ["square", 200, 200],
    ] as const) {
      const layout = shapeLayout(shape, width, height)!;
      const corner = shapeCorner(axis, layout);
      expect(corner.rows).toHaveLength(layout.rows);
      expect(corner.columns).toHaveLength(layout.columns);
      expect(layout.chosen.row).toBeLessThan(corner.rows.length);
      expect(layout.chosen.column).toBeLessThan(corner.columns.length);
    }
  });
});

describe("Shape preview grow", () => {
  /** The transform that lays the stage over the chosen tile before it grows. */
  function chosenToStage(
    shape: "strip" | "roomy" | "square",
    width: number,
    height: number
  ) {
    const layout = shapeLayout(shape, width, height)!;
    const tile = shapeCellRect(layout, layout.chosen.row, layout.chosen.column);
    return transformOnto(layout.stage, tile);
  }

  it("starts the roomy stage on the chosen tile", () => {
    expect(chosenToStage("roomy", 308, 96)).toBe(
      "translate(-37px, 32px) scale(0.3333)"
    );
  });

  it("starts the square stage on the chosen tile", () => {
    expect(chosenToStage("square", 144, 144)).toBe(
      "translate(48px, 0px) scale(0.5)"
    );
  });

  it("does not move a stage that is the chosen tile", () => {
    expect(chosenToStage("strip", 146, 48)).toBe(
      "translate(0px, 0px) scale(1)"
    );
  });
});

describe("Shape preview beats", () => {
  it("lands the tap as the Matrix lights the chosen crossing", () => {
    const earliestTap =
      SHAPE_PREVIEW_TIMING.fingerLeavesMs +
      MIN_GLIDE_MS +
      SCENE_TAP.considerMs +
      SCENE_TAP.pressMs;
    expect(earliestTap).toBe(SHAPE_MATRIX_REVEAL.chosen.at);
  });

  it("finishes drawing with half a second of the turn to spare", () => {
    const end =
      SHAPE_MATRIX_REVEAL.chosen.at +
      SHAPE_PREVIEW_TIMING.growDelayMs +
      SHAPE_PREVIEW_TIMING.drawMs;
    expect(end).toBeLessThanOrEqual(METHOD_PREVIEW_TIMING.turnMs - 500);
  });
});
