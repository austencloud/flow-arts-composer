/**
 * The step grid's generation reveal and the Create front door's Generate
 * preview are one wave: each cell's band is its row plus its column, and
 * every cell enters with the same global `stepCascade` keyframes.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  calculateStepWaveBand,
  waveBandAt,
} from "#lib/shared/create/utils/grid-calculations.js";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");
const DISPLAY =
  "src/lib/features/create/shared/workspace-panel/sequence-display/components";

describe("one diagonal wave", () => {
  it("counts a band as zero-based row plus column", () => {
    expect(waveBandAt(0, 0)).toBe(0);
    expect(waveBandAt(0, 3)).toBe(3);
    expect(waveBandAt(2, 1)).toBe(3);
  });

  it("puts each step on its grid diagonal, wrapping past the start column", () => {
    // Four steps a row. The start placement holds column 1, so a row's steps
    // sit in columns 2 to 5 and every row starts one band further out.
    expect(calculateStepWaveBand(0, 4)).toBe(1);
    expect(calculateStepWaveBand(3, 4)).toBe(4);
    expect(calculateStepWaveBand(4, 4)).toBe(2);
    expect(calculateStepWaveBand(8, 4)).toBe(3);
    // One step a row: each step is one band further down.
    expect(calculateStepWaveBand(5, 1)).toBe(6);
  });

  it("matches a strip that leads with a start slot to the grid's first row", () => {
    const strip = [0, 1, 2, 3].map((column) => waveBandAt(0, column));
    const grid = [
      0,
      ...[0, 1, 2].map((index) => calculateStepWaveBand(index, 4)),
    ];
    expect(strip).toEqual(grid);
  });

  it("routes WorkspaceGrid's row and column bands through waveBandAt", () => {
    const source = read(`${DISPLAY}/WorkspaceGrid.svelte`);
    expect(source).not.toMatch(/cell\.row - 1 \+ \(cell\.column - 1\)/);
    expect(source).not.toMatch(/rowIndex \+ columnIndex \+ 1/);
    expect((source.match(/waveBandAt\(/g) ?? []).length).toBeGreaterThanOrEqual(
      3
    );
  });

  it("keeps stepCascade global so StepCell and previews share it", () => {
    const keyframes = read("src/lib/shared/transitions/keyframes.css");
    const stepCell = read(`${DISPLAY}/StepCell.svelte`);
    expect(keyframes).toMatch(/@keyframes stepCascade \{/);
    expect(stepCell).not.toMatch(/@keyframes stepCascade/);
    expect(stepCell).toMatch(
      /animation: stepCascade var\(--step-entrance-duration, 380ms\)/
    );
    const banner = keyframes.indexOf("REDUCED MOTION SUPPORT");
    expect(banner).toBeGreaterThan(-1);
    expect(keyframes.slice(banner)).not.toMatch(/stepCascade/);
  });
});
