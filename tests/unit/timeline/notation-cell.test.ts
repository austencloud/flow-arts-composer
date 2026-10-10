import { describe, it, expect } from "vitest";
import { buildNotationCells } from "#lib/shared/timeline/notation-cell.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";

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

  describe("joined sequences", () => {
    const join = { toward: "e", steps: 1 } as const;
    const joined = () =>
      seq({
        startPlacement: { id: "sp" } as any,
        steps: [{ letter: "A" } as any, { letter: "B" } as any],
        conjoined: join,
      });

    it("stamps the join on the start cell and every beat cell", () => {
      const cells = buildNotationCells(joined());
      expect(cells).toHaveLength(3);
      for (const cell of cells) {
        expect((cell.data as { conjoined?: unknown }).conjoined).toEqual(join);
      }
    });

    it("never writes the join into the stored steps or start placement", () => {
      const s = joined();
      buildNotationCells(s);
      expect((s.steps[0] as { conjoined?: unknown }).conjoined).toBeUndefined();
      expect((s.startPlacement as { conjoined?: unknown }).conjoined).toBeUndefined();
    });

    it("keeps labels, step numbers and keys the same as the unjoined strip", () => {
      const plain = buildNotationCells({ ...joined(), conjoined: undefined });
      const cells = buildNotationCells(joined());
      expect(cells.map((c) => [c.key, c.label, c.stepNumber, c.isStart])).toEqual(
        plain.map((c) => [c.key, c.label, c.stepNumber, c.isStart])
      );
    });

    it("hands back the same cell data on a rebuild so strips can diff by identity", () => {
      const s = joined();
      const first = buildNotationCells(s);
      const again = buildNotationCells({ ...s });
      expect(again[1]!.data).toBe(first[1]!.data);
      expect(again[0]!.data).toBe(first[0]!.data);
    });

    it("restamps when the join changes", () => {
      const s = joined();
      const first = buildNotationCells(s);
      const moved = buildNotationCells({ ...s, conjoined: { toward: "w", steps: 2 } });
      expect((moved[1]!.data as { conjoined?: unknown }).conjoined).toEqual({
        toward: "w",
        steps: 2,
      });
      expect((first[1]!.data as { conjoined?: unknown }).conjoined).toEqual(join);
    });

    it("leaves a malformed join as one grid", () => {
      const s = seq({
        startPlacement: { id: "sp" } as any,
        steps: [{ letter: "A" } as any],
        conjoined: { toward: "nowhere", steps: 9 } as never,
      });
      const cells = buildNotationCells(s);
      expect(cells[1]!.data).toBe(s.steps[0]);
    });
  });
});
