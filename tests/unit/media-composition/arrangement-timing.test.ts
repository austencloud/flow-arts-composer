import { describe, expect, it } from "vitest";
import type { TunnelLayerConfig } from "#lib/shared/animation-engine/domain/compose-types.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { ArrangementCell } from "#lib/shared/media-composition/domain/arrangement.js";
import {
  arrangementCellCycleBeats,
  arrangementLayerStep,
} from "#lib/shared/media-composition/domain/arrangement-timing.js";

function layer(beats: number, beatOffset = 0): TunnelLayerConfig {
  return {
    sequence: {
      id: `seq-${beats}`,
      steps: Array.from({ length: beats }, () => ({ duration: 1 })),
    } as unknown as SequenceData,
    beatOffset,
    propColors: { left: "#00f", right: "#f00" },
    transformStack: [],
  };
}

function cell(
  layers: TunnelLayerConfig[],
  extra: Partial<ArrangementCell> = {}
): ArrangementCell {
  return {
    id: "cell-0-0",
    row: 0,
    col: 0,
    rowSpan: 1,
    colSpan: 1,
    layers,
    beatOffset: 0,
    mediaType: "animation",
    ...extra,
  } as ArrangementCell;
}

describe("arrangementLayerStep", () => {
  const four = layer(4);

  it("plays beat 1 at grid beat 0 when the start placement is skipped", () => {
    expect(arrangementLayerStep(0, cell([four]), four, true)).toBe(1);
    expect(arrangementLayerStep(3, cell([four]), four, true)).toBe(4);
    expect(arrangementLayerStep(4, cell([four]), four, true)).toBe(1);
  });

  it("shows the start pose at grid beat 0 when the start placement plays", () => {
    expect(arrangementLayerStep(0, cell([four]), four, false)).toBe(0);
    expect(arrangementLayerStep(4, cell([four]), four, false)).toBe(4);
    expect(arrangementLayerStep(5, cell([four]), four, false)).toBe(0);
  });

  it("delays a cell by its beat offset", () => {
    const delayed = cell([four], { beatOffset: 2 });
    // Two beats in, the delayed cell is only on its first beat.
    expect(arrangementLayerStep(2, delayed, four, true)).toBe(1);
    expect(arrangementLayerStep(3, delayed, four, true)).toBe(2);
  });

  it("wraps to the end of the cycle before the cell's first beat", () => {
    const delayed = cell([four], { beatOffset: 2 });
    expect(arrangementLayerStep(0, delayed, four, true)).toBe(3);
    expect(arrangementLayerStep(1, delayed, four, true)).toBe(4);
    expect(arrangementLayerStep(0.5, delayed, four, true)).toBeCloseTo(3.5);
  });

  it("runs a faster cell through its beats sooner", () => {
    const fast = cell([four], { speedMultiplier: 2 });
    expect(arrangementLayerStep(1, fast, four, true)).toBe(3);
    expect(arrangementLayerStep(2, fast, four, true)).toBe(1);
  });

  it("adds a layer's own offset on top of the cell's", () => {
    const shifted = layer(4, 1);
    const delayed = cell([four, shifted], { beatOffset: 1 });
    expect(arrangementLayerStep(1, delayed, four, true)).toBe(1);
    expect(arrangementLayerStep(1, delayed, shifted, true)).toBe(2);
  });
});

describe("arrangementCellCycleBeats", () => {
  it("is the layers' common cycle at the grid's rate", () => {
    expect(arrangementCellCycleBeats(cell([layer(4), layer(6)]), true)).toBe(
      12
    );
    expect(arrangementCellCycleBeats(cell([layer(4)]), false)).toBe(5);
  });

  it("shrinks with the cell's speed", () => {
    expect(
      arrangementCellCycleBeats(cell([layer(8)], { speedMultiplier: 2 }), true)
    ).toBe(4);
    expect(arrangementCellCycleBeats(cell([]), true)).toBe(0);
  });
});
