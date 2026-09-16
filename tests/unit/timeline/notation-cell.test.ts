import { describe, it, expect } from "vitest";
import { buildNotationCells } from "$lib/shared/timeline/notation-cell";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";

function seq(partial: Partial<SequenceData>): SequenceData {
  return {
    id: "s1", word: "AB", steps: [], thumbnails: [], sequenceLength: 0,
    level: 1, isFavorite: false, isCircular: false, loopType: null, tags: [],
    metadata: {}, ownerId: "o1",
    ...partial,
  } as SequenceData;
}

describe("buildNotationCells", () => {
  it("returns [] when the sequence has no steps", () => {
    expect(buildNotationCells(seq({ steps: [] }))).toEqual([]);
    expect(buildNotationCells(null as unknown as SequenceData)).toEqual([]);
  });

  it("emits a Start cell then one cell per beat, 1-based labels", () => {
    const s = seq({
      startPlacement: { id: "sp" } as any,
      steps: [{ letter: "A" } as any, { letter: "B" } as any],
    });
    const cells = buildNotationCells(s);
    expect(cells.map((c) => c.label)).toEqual(["Start", "1", "2"]);
    expect(cells.map((c) => c.stepNumber)).toEqual([0, 1, 2]);
    expect(cells[0].isStart).toBe(true);
    expect(cells[1].isStart).toBe(false);
    expect(cells[1].data).toBe(s.steps[0]);
  });

  it("derives a start cell from the first beat when startPlacement is absent", () => {
    const s = seq({ startPlacement: null, steps: [{ letter: "A", motions: {} } as any] });
    const cells = buildNotationCells(s);
    expect(cells[0].isStart).toBe(true);
    expect(cells).toHaveLength(2); // derived start + 1 beat
  });
});
