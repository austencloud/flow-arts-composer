import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "#lib/shared/sequence-viewer/tunnel/tunnel-config.js";
import {
  balancedTunnelStageArms,
  createExplicitTunnelStage,
  fitTunnelStageToFormation,
} from "#lib/shared/sequence-viewer/tunnel/tunnel-stage.js";

describe("tunnel stage", () => {
  it("balances three occupied positions across a four-position frame", () => {
    expect(balancedTunnelStageArms(3, 4)).toEqual([0, 1, 3]);
  });

  it("keeps stage identity and assignment while the frame changes", () => {
    const stage = createExplicitTunnelStage(
      ["p1", "p2", "p3"],
      { ...DEFAULT_CONFIG, fold: 4 },
      (performerId) => `instance-${performerId}`
    );

    const fitted = fitTunnelStageToFormation(stage, {
      ...DEFAULT_CONFIG,
      fold: 8,
    });

    expect(fitted?.instances).toEqual([
      { id: "instance-p1", performerId: "p1", arm: 0 },
      { id: "instance-p2", performerId: "p2", arm: 3 },
      { id: "instance-p3", performerId: "p3", arm: 5 },
    ]);
  });

  it("refuses a frame that cannot hold every explicit appearance", () => {
    const stage = createExplicitTunnelStage(["p1", "p2", "p3"], {
      ...DEFAULT_CONFIG,
      fold: 4,
    });

    expect(
      fitTunnelStageToFormation(stage, { ...DEFAULT_CONFIG, fold: 2 })
    ).toBeNull();
  });
});
