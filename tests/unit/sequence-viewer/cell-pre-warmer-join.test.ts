/**
 * A joined sequence is drawn joined everywhere, so the pre-warmer must warm the
 * joined cells: same stamped data, therefore the same cache keys the card reads.
 */
import { describe, it, expect } from "vitest";
import { CellPreWarmer } from "$lib/shared/sequence-viewer/services/cell-pre-warmer";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";

type Tasks = { pictographData: { conjoined?: unknown }; cacheKey: string }[];

function buildTasks(sequence: SequenceData): Tasks {
  const warmer = new CellPreWarmer() as unknown as {
    buildCellTasks(s: SequenceData, o: object, dark: boolean): Tasks;
  };
  return warmer.buildCellTasks(sequence, { size: 240 }, false);
}

function seq(partial: Partial<SequenceData> = {}): SequenceData {
  return {
    id: "s1",
    word: "AB",
    startPlacement: { letter: "α", motions: {} },
    steps: [
      { letter: "A", motions: {} },
      { letter: "B", motions: {} },
    ],
    ...partial,
  } as unknown as SequenceData;
}

describe("CellPreWarmer.buildCellTasks with a grid join", () => {
  const join = { toward: "e", steps: 1 } as const;

  it("stamps the join on the start cell and every beat", () => {
    const tasks = buildTasks(seq({ conjoined: join }));
    expect(tasks).toHaveLength(3);
    for (const task of tasks) expect(task.pictographData.conjoined).toEqual(join);
  });

  it("warms differently keyed cells than the one-grid sequence", () => {
    const plain = buildTasks(seq());
    const joined = buildTasks(seq({ conjoined: join }));
    joined.forEach((task, i) => expect(task.cacheKey).not.toBe(plain[i]!.cacheKey));
  });

  it("leaves one-grid cells untouched", () => {
    const s = seq();
    const tasks = buildTasks(s);
    expect(tasks[1]!.pictographData).toBe(s.steps[0]);
    expect(tasks[1]!.pictographData.conjoined).toBeUndefined();
  });

  it("never writes the join into the stored steps", () => {
    const s = seq({ conjoined: join });
    buildTasks(s);
    expect((s.steps[0] as { conjoined?: unknown }).conjoined).toBeUndefined();
  });
});
