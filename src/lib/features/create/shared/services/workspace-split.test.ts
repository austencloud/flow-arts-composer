import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  GENERATE_PHONE_PANEL_NEED,
  GENERATE_PHONE_ROW_FLOORS,
  MIN_TOOL_PANEL_HEIGHT,
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

  it("gives a 16-step sequence every row Generate's cards can spare on an unfolded Fold", () => {
    // Two rows left rows three and four under the rail at the 5:4 share. All
    // four (553px) would leave the cards 226px, so the workspace stops where
    // the panel keeps its 260px.
    const sequenceFloor = workspaceFloorHeight({
      width: 707,
      chromeHeight: CHROME,
      rows: sequenceRowCount(16),
    });
    const [workspace, tool] = stackedWorkspaceSplit({
      height: 779,
      preferredWorkspace: 779 * USUAL_WORKSPACE_SHARE,
      workspaceFloor: workspaceFloorHeight({
        width: 707,
        chromeHeight: CHROME,
      }),
      sequenceFloor,
    });
    expect(sequenceFloor).toBe(553);
    expect(workspace).toBe(779 - MIN_TOOL_PANEL_HEIGHT);
    expect(tool).toBe(MIN_TOOL_PANEL_HEIGHT);
  });

  it("stops where the tool panel would drop below its share", () => {
    const [, tool] = stackedWorkspaceSplit({
      height: 1100,
      preferredWorkspace: 1100 * USUAL_WORKSPACE_SHARE,
      workspaceFloor: 363,
      sequenceFloor: 2000,
    });
    expect(tool).toBe(1100 - Math.round(1100 * (1 - MIN_TOOL_PANEL_SHARE)));
  });

  it("leaves Generate's compact cards their height in the installed Fold app", () => {
    // The app's 728px gave the panel 2/7 (208px) and cut the cards in half.
    const [workspace, tool] = stackedWorkspaceSplit({
      height: 728,
      preferredWorkspace: 728 * USUAL_WORKSPACE_SHARE,
      workspaceFloor: 363,
      sequenceFloor: 549,
    });
    expect(tool).toBe(MIN_TOOL_PANEL_HEIGHT);
    expect(workspace).toBe(728 - MIN_TOOL_PANEL_HEIGHT);
  });
});

describe("Generate's panel need on a narrow phone", () => {
  // A 360 x 591 phone: 546px between the top and the bottom bar.
  const height = 546;
  const usual = height * USUAL_WORKSPACE_SHARE;

  it("adds up the narrow compact rows: 56 + 3 x 44 + 56, four gaps, padding", () => {
    expect(GENERATE_PHONE_PANEL_NEED).toBe(268);
  });

  it("gives a short phone's panel what its rows need from the workspace's share", () => {
    const [workspace, tool] = stackedWorkspaceSplit({
      height,
      preferredWorkspace: usual,
      workspaceFloor: 200,
      toolPanelNeed: GENERATE_PHONE_PANEL_NEED,
    });
    expect(tool).toBe(GENERATE_PHONE_PANEL_NEED);
    expect(workspace).toBe(height - GENERATE_PHONE_PANEL_NEED);
  });

  it("leaves a tall phone's split as it was", () => {
    const tall = 870;
    const without = stackedWorkspaceSplit({
      height: tall,
      preferredWorkspace: tall * USUAL_WORKSPACE_SHARE,
      workspaceFloor: 300,
    });
    const withNeed = stackedWorkspaceSplit({
      height: tall,
      preferredWorkspace: tall * USUAL_WORKSPACE_SHARE,
      workspaceFloor: 300,
      toolPanelNeed: GENERATE_PHONE_PANEL_NEED,
    });
    expect(withNeed).toEqual(without);
  });

  it("lets the workspace floor win on a window too short for both", () => {
    const short = 480;
    const [workspace, tool] = stackedWorkspaceSplit({
      height: short,
      preferredWorkspace: short * USUAL_WORKSPACE_SHARE,
      workspaceFloor: 250,
      toolPanelNeed: GENERATE_PHONE_PANEL_NEED,
    });
    expect(workspace).toBe(250);
    expect(tool).toBe(230);
  });

  it("matches the floors in the narrow compact CSS rule", () => {
    const css = readFileSync(
      path.resolve(
        process.cwd(),
        "src/lib/features/create/generate/components/CardBasedSettingsContainer.svelte"
      ),
      "utf8"
    );
    const start = css.indexOf(
      "@container settings-grid (width < 630px) and (height < 560px) {"
    );
    const rule = css.slice(start, css.indexOf("@container", start + 10));
    expect(rule).toContain(
      `minmax(${GENERATE_PHONE_ROW_FLOORS.generate}px, 1.15fr)`
    );
    expect(css).toContain(
      `--compact-level-row: clamp(${GENERATE_PHONE_ROW_FLOORS.level}px,`
    );
  });
});
