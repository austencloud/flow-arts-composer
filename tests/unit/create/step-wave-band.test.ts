/**
 * The step grid's generation reveal and the Create front door's Generate
 * preview are one wave: each cell's band is its row plus its column, and
 * every cell enters with the same global `stepCascade` keyframes.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  calculateStepPosition,
  calculateStepWaveBand,
  waveBandAt,
} from "$lib/shared/create/utils/grid-calculations";

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

  it("gives every step cell the band of its grid position", () => {
    for (const columns of [1, 3, 4, 8]) {
      for (let index = 0; index < 20; index++) {
        const { row, column } = calculateStepPosition(index, columns);
        expect(calculateStepWaveBand(index, columns)).toBe(
          waveBandAt(row - 1, column - 1)
        );
      }
    }
  });

  it("matches a strip that leads with a start slot to the grid's first row", () => {
    const strip = [0, 1, 2, 3].map((column) => waveBandAt(0, column));
    const grid = [
      0,
      ...[0, 1, 2].map((index) => calculateStepWaveBand(index, 4)),
    ];
    expect(strip).toEqual(grid);
  });

  it("routes every WorkspaceGrid band through waveBandAt", () => {
    const source = read(`${DISPLAY}/WorkspaceGrid.svelte`);
    expect(source).not.toMatch(/cell\.row - 1 \+ \(cell\.column - 1\)/);
    expect(source).not.toMatch(/rowIndex \+ columnIndex \+ 1/);
    expect(source.match(/waveBandAt\(/g)?.length).toBe(3);
  });

  it("keeps stepCascade global so StepCell and previews share it", () => {
    const keyframes = read("src/lib/shared/transitions/keyframes.css");
    const stepCell = read(`${DISPLAY}/StepCell.svelte`);
    expect(keyframes).toMatch(/@keyframes stepCascade \{/);
    expect(stepCell).not.toMatch(/@keyframes stepCascade/);
    expect(stepCell).toMatch(
      /animation: stepCascade var\(--step-entrance-duration, 380ms\)/
    );
    const reducedList = keyframes.slice(
      keyframes.indexOf("REDUCED MOTION SUPPORT")
    );
    expect(reducedList).not.toMatch(/stepCascade/);
  });
});
