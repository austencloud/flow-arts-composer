import { describe, expect, it } from "vitest";
import { buildFlowFestJamLayout } from "#lib/features/flow-fest-sim/domain/flow-fest-jam-layout";
import {
  JAM_STAGE_PIECES,
  JAM_WARM_PIECES,
  JamReadiness,
  jamCastPieces,
} from "../../src/routes/test/flow-fest-jam/flow-fest-jam-readiness";

describe("jam loading gate", () => {
  const layout = buildFlowFestJamLayout();
  const cast = jamCastPieces(layout);

  it("expects every person the layout places, once each", () => {
    const seated = layout.stations.filter((s) => s.occupied).length;
    const rigs = layout.performers.length + layout.outsideSpinners.length;
    expect(cast.length).toBe(layout.spectators.length + seated + 2 + rigs * 3);
    expect(new Set(cast).size).toBe(cast.length);
  });

  it("waits for the set, then the cast, then the warm-up, and never goes backwards", () => {
    const gate = new JamReadiness([...JAM_STAGE_PIECES, ...cast, ...JAM_WARM_PIECES]);
    expect(gate.progress().stage).toBe("stage");
    for (const piece of JAM_STAGE_PIECES) gate.mark(piece);
    expect(gate.progress().stage).toBe("cast");
    let last = gate.progress().fraction;
    for (const piece of cast) {
      gate.mark(piece);
      gate.mark(piece);
      gate.mark("not-expected");
      const now = gate.progress().fraction;
      expect(now).toBeGreaterThanOrEqual(last);
      last = now;
    }
    expect(gate.loaded).toBe(true);
    expect(gate.complete).toBe(false);
    expect(gate.progress().stage).toBe("warm");
    expect(gate.missing()).toEqual([...JAM_WARM_PIECES]);
    for (const piece of JAM_WARM_PIECES) gate.mark(piece);
    expect(gate.complete).toBe(true);
    expect(gate.progress().fraction).toBe(1);
  });
});
