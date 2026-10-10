/**
 * The scan-card warm pass uploads the cells a scanned card asks for. A joined
 * card asks for cells set to the sequence's one join, and the join is part of
 * each cell's cloud key, so the warm has to hash and render those same cells
 * or every joined scan misses the cloud cache.
 */
import { describe, expect, it } from "vitest";
import { canonicalCellKeyString } from "#lib/shared/render/services/cloud-cell-key.js";
import { getCanonicalSequenceCells } from "#lib/shared/render/services/warm-sequence-cells.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import { TRANSITION_REVIEW_SEQUENCE } from "../../../src/routes/test/sequence-viewer-transitions/transition-review-fixture";

const EAST_1 = { toward: "e", steps: 1 } as const;
const SOUTH_2 = { toward: "s", steps: 2 } as const;
const ONE_GRID = TRANSITION_REVIEW_SEQUENCE;
const JOINED: SequenceData = { ...ONE_GRID, conjoined: EAST_1 };

function keys(sequence: SequenceData): string[] {
  return getCanonicalSequenceCells(sequence).map(({ data, options }) =>
    canonicalCellKeyString(data, true, options)
  );
}

describe("scan-cell warm for joined grids", () => {
  it("warms every cell of a joined sequence, start included, under its join", () => {
    const cells = getCanonicalSequenceCells(JOINED);
    expect(cells[0]?.cell).toBe("start");
    expect(cells.length).toBe(ONE_GRID.steps.length + 1);
    for (const { data } of cells) expect(data.conjoined).toEqual(EAST_1);
  });

  it("gives a joined sequence different cell keys from the one-grid card", () => {
    const joined = keys(JOINED);
    const single = keys(ONE_GRID);
    joined.forEach((key, index) => expect(key).not.toBe(single[index]));
  });

  it("leaves one-grid cells and their keys as they were, dropping stray step joins", () => {
    const stray: SequenceData = {
      ...ONE_GRID,
      steps: ONE_GRID.steps.map((step, index) =>
        index === 1 ? ({ ...step, conjoined: SOUTH_2 } as typeof step) : step
      ),
    };
    for (const { data } of getCanonicalSequenceCells(stray)) {
      expect(data.conjoined).toBeUndefined();
    }
    expect(keys(stray)).toEqual(keys(ONE_GRID));
  });
});
