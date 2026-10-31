import { describe, expect, it } from "vitest";
import {
  MIN_TOOL_PANEL_SHARE,
  sequenceRowCount,
  stackedWorkspaceSplit,
  USUAL_WORKSPACE_SHARE,
  workspaceFloorHeight,
} from "./workspace-split";

// Measured on the unfolded Fold: a 72px sequence header and a 60px rail.
const CHROME = 72 + 60;

describe("workspaceFloorHeight", () => {
  it("budgets the chrome plus two rows of 94px pictographs on an unfolded Fold", () => {
    // 2px frame + 132px chrome + a 229px grid host (two 94px rows with their
    // gap, padding and edge reserve).
    expect(workspaceFloorHeight({ width: 707, chromeHeight: CHROME })).toBe(
      363
    );
  });

  it("uses the smaller cell a phone's width affords", () => {
    // Five 94px cells do not fit 375px; the width's 65px cell sets it.
    expect(workspaceFloorHeight({ width: 375, chromeHeight: CHROME })).toBe(
      305
    );
  });

  it("waits for a real measurement", () => {
    expect(workspaceFloorHeight({ width: 0, chromeHeight: CHROME })).toBe(0);
  });
});

describe("stackedWorkspaceSplit", () => {
  it("lifts the step editor's third to the legible floor on an unfolded Fold", () => {
    // The step editor's 1:2 split left 260px: two rows of 48px cells.
    const floor = workspaceFloorHeight({ width: 707, chromeHeight: CHROME });
    const [workspace, editor] = stackedWorkspaceSplit({
      height: 779,
      preferredWorkspace: 779 / 3,
      workspaceFloor: floor,
    });
    expect(workspace).toBe(floor);
    expect(workspace + editor).toBe(779);
  });

  it("keeps a preferred share that is already larger", () => {
    const [workspace] = stackedWorkspaceSplit({
      height: 1136,
      preferredWorkspace: 1136 * USUAL_WORKSPACE_SHARE,
      workspaceFloor: 363,
    });
    expect(workspace).toBe(Math.round(1136 * USUAL_WORKSPACE_SHARE));
  });

  it("never lets the floor take more than the usual 5:4 share", () => {
    const [workspace, tool] = stackedWorkspaceSplit({
      height: 360,
      preferredWorkspace: 100,
      workspaceFloor: 305,
    });
    expect(workspace).toBe(200);
    expect(tool).toBe(160);
  });
});

describe("whole-sequence floor", () => {
  it("counts four steps to a row", () => {
    expect(sequenceRowCount(0)).toBe(1);
    expect(sequenceRowCount(8)).toBe(2);
    expect(sequenceRowCount(16)).toBe(4);
    expect(sequenceRowCount(17)).toBe(5);
  });

  it("gives a 16-step sequence all four rows on an unfolded Fold", () => {
    // Two rows left rows three and four under the rail at the 5:4 share.
    const sequenceFloor = workspaceFloorHeight({
      width: 707,
      chromeHeight: CHROME,
      rows: sequenceRowCount(16),
    });
    const [workspace, tool] = stackedWorkspaceSplit({
      height: 779,
      preferredWorkspace: 779 * USUAL_WORKSPACE_SHARE,
      workspaceFloor: workspaceFloorHeight({ width: 707, chromeHeight: CHROME }),
      sequenceFloor,
    });
    expect(workspace).toBe(sequenceFloor);
    expect(tool).toBeGreaterThanOrEqual(Math.floor(779 * MIN_TOOL_PANEL_SHARE));
  });

  it("stops where the tool panel would drop below its share", () => {
    const [, tool] = stackedWorkspaceSplit({
      height: 779,
      preferredWorkspace: 779 * USUAL_WORKSPACE_SHARE,
      workspaceFloor: 363,
      sequenceFloor: 2000,
    });
    expect(tool).toBe(779 - Math.round(779 * (1 - MIN_TOOL_PANEL_SHARE)));
  });
});
