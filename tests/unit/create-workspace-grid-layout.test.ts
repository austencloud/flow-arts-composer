import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  calculateGridLayout,
  calculateGridVerticalCenterOffset,
} from "../../src/lib/shared/create/utils/grid-calculations";
import {
  WORKSPACE_BUTTON_LAYOUT,
  WORKSPACE_BUTTON_ICON,
  WORKSPACE_BUTTON_TUTORIAL,
  workspaceButtonsInZone,
} from "../../src/lib/features/create/shared/workspace-panel/shared/workspace-button-layout";

const workspaceGridSource = readFileSync(
  resolve(
    process.cwd(),
    "src/lib/features/create/shared/workspace-panel/sequence-display/components/WorkspaceGrid.svelte"
  ),
  "utf8"
);
const buttonPanelSource = readFileSync(
  resolve(
    process.cwd(),
    "src/lib/features/create/shared/workspace-panel/shared/components/ButtonPanel.svelte"
  ),
  "utf8"
);
const sequenceDisplaySource = readFileSync(
  resolve(
    process.cwd(),
    "src/lib/features/create/shared/workspace-panel/sequence-display/components/SequenceDisplay.svelte"
  ),
  "utf8"
);
const standardWorkspaceSource = readFileSync(
  resolve(
    process.cwd(),
    "src/lib/features/create/shared/components/StandardWorkspaceLayout.svelte"
  ),
  "utf8"
);
const drawerLauncherSource = readFileSync(
  resolve(
    process.cwd(),
    "src/lib/features/create/shared/components/coordinators/SequenceDrawerLauncher.svelte"
  ),
  "utf8"
);

describe("calculateGridLayout workspace column selection", () => {
  it("keeps an embedded start-only preview inside the standard cell cap", () => {
    const fullWorkspace = calculateGridLayout(0, 570, 332, null);
    const embeddedPreview = calculateGridLayout(0, 570, 332, null, {
      allowFewStepOverflowOnNarrow: false,
    });

    expect(fullWorkspace.cellSize).toBeGreaterThan(200);
    expect(embeddedPreview.cellSize).toBe(200);
  });

  it("uses four step columns when a tall workspace makes them larger", () => {
    const layout = calculateGridLayout(16, 719, 450, null);
    const forcedWideLayout = calculateGridLayout(16, 719, 450, null, {
      manualColumnCount: 8,
    });

    expect(layout.columns).toBe(4);
    expect(layout.rows).toBe(4);
    expect(layout.cellSize).toBeGreaterThan(forcedWideLayout.cellSize);
  });

  it("uses eight step columns when a short workspace makes them larger", () => {
    const layout = calculateGridLayout(16, 900, 250, null);
    const forcedStandardLayout = calculateGridLayout(16, 900, 250, null, {
      manualColumnCount: 4,
    });

    expect(layout.columns).toBe(8);
    expect(layout.rows).toBe(2);
    expect(layout.cellSize).toBeGreaterThan(forcedStandardLayout.cellSize);
  });

  it("preserves an explicit LOOP-aligned column count", () => {
    const layout = calculateGridLayout(16, 719, 450, null, {
      manualColumnCount: 8,
    });

    expect(layout.columns).toBe(8);
    expect(layout.rows).toBe(2);
  });

  it("keeps wide Construct sequences at four columns without resizing for new rows", () => {
    const fourRows = calculateGridLayout(16, 900, 250, null, {
      stableColumnCount: 4,
    });
    const fiveRows = calculateGridLayout(20, 900, 250, null, {
      stableColumnCount: 4,
    });

    expect(fourRows.columns).toBe(4);
    expect(fiveRows.columns).toBe(4);
    expect(fourRows.rows).toBe(4);
    expect(fiveRows.rows).toBe(5);
    expect(fiveRows.cellSize).toBe(fourRows.cellSize);
  });

  it("fits a sixteen-step sequence in a wide short preview pane without scrolling", () => {
    // The Tunnel performer card: a fixed-height box holding a finished
    // sequence. Four pinned columns sized every cell from width and pushed
    // rows 3 and 4 below the fold.
    const containerWidth = 1051;
    const containerHeight = 444;
    const layout = calculateGridLayout(
      16,
      containerWidth,
      containerHeight,
      null,
      { fitAllSteps: true }
    );
    const pinnedLayout = calculateGridLayout(
      16,
      containerWidth,
      containerHeight,
      null,
      { stableColumnCount: 4 }
    );

    expect(layout.rows * layout.cellSize).toBeLessThanOrEqual(containerHeight);
    expect(layout.totalColumns * layout.cellSize).toBeLessThanOrEqual(
      containerWidth
    );
    expect(pinnedLayout.rows * pinnedLayout.cellSize).toBeGreaterThan(
      containerHeight
    );
  });

  it("spends leftover width on bigger cells rather than the fewest rows", () => {
    const layout = calculateGridLayout(16, 1051, 444, null, {
      fitAllSteps: true,
    });
    const twoRowLayout = calculateGridLayout(16, 1051, 444, null, {
      fitAllSteps: true,
      narrowMaxColumns: null,
      manualColumnCount: 8,
    });

    expect(layout.cellSize).toBeGreaterThan(twoRowLayout.cellSize);
  });

  it("does not strand the last row when height caps several column counts", () => {
    // 810x321 preview pane: height pins the cell at the same size for six and
    // seven step columns, and seven only empties the last row.
    const layout = calculateGridLayout(16, 810 - 32, 321 - 32, null, {
      fitAllSteps: true,
    });

    expect(layout.columns).toBe(6);
    expect(layout.rows).toBe(3);
  });

  it("keeps a two-step preview on one row", () => {
    const layout = calculateGridLayout(2, 900, 600, null, {
      fitAllSteps: true,
    });

    expect(layout.rows).toBe(1);
    expect(layout.columns).toBe(2);
  });

  it("ignores the narrow column cap, which can only shrink a fitted grid", () => {
    // 583x247 preview pane. Capped at three columns it clamps to minCellSize
    // and scrolls; free to spread it fits at well above the floor.
    const containerWidth = 583 - 32;
    const containerHeight = 247 - 32;
    const layout = calculateGridLayout(
      16,
      containerWidth,
      containerHeight,
      null,
      { fitAllSteps: true, narrowMaxColumns: 3 }
    );

    expect(layout.columns).toBeGreaterThan(3);
    expect(layout.rows * layout.cellSize).toBeLessThanOrEqual(containerHeight);
    expect(layout.totalColumns * layout.cellSize).toBeLessThanOrEqual(
      containerWidth
    );
  });

  it("keeps phone cells readable instead of fitting sixteen dots", () => {
    // A phone card can afford about 32px a cell for sixteen steps. Squeezing
    // them all in costs more than the scrollbar it saves, so fitting yields to
    // the ordinary policy and the pane keeps its big pictographs.
    const narrowPreview = {
      narrowMaxColumns: 2,
      preferWidthSizingOnNarrow: true,
    };
    const fitted = calculateGridLayout(16, 308, 101, null, {
      ...narrowPreview,
      fitAllSteps: true,
    });
    const ordinary = calculateGridLayout(16, 308, 101, null, narrowPreview);

    expect(fitted).toEqual(ordinary);
    expect(fitted.cellSize).toBeGreaterThan(60);
  });

  it("fits sixteen steps in a passive phone preview with its tighter cell floor", () => {
    // Tunnel's cards are previews, not editing targets. They can spend the
    // workbench's hover reserve and accept a smaller floor so every count stays
    // visible instead of putting steps 13-16 behind an internal scrollbar.
    const layout = calculateGridLayout(16, 321, 212, null, {
      fitAllSteps: true,
      minCellSize: 28,
      maxCellSize: 360,
      widthPaddingRatio: 1,
      heightPaddingRatio: 1,
      narrowMaxColumns: 2,
      preferWidthSizingOnNarrow: true,
    });

    expect(layout.cellSize).toBeGreaterThanOrEqual(28);
    expect(layout.rows * layout.cellSize).toBeLessThanOrEqual(212);
    expect(layout.totalColumns * layout.cellSize).toBeLessThanOrEqual(321);
  });

  it("leaves every non-preview caller on the existing sizing policy", () => {
    const before = calculateGridLayout(16, 900, 250, null);
    const after = calculateGridLayout(16, 900, 250, null, {
      fitAllSteps: false,
    });

    expect(after).toEqual(before);
    expect(after.columns).toBe(8);
  });

  it("puts a four-step non-LOOP sequence on one wide row", () => {
    const layout = calculateGridLayout(4, 900, 450, null, {
      stableColumnCount: 4,
    });

    expect(layout.columns).toBe(4);
    expect(layout.rows).toBe(1);
  });

  it("lets explicit LOOP alignment override the stable Construct columns", () => {
    const layout = calculateGridLayout(20, 900, 450, null, {
      stableColumnCount: 4,
      manualColumnCount: 5,
    });

    expect(layout.columns).toBe(5);
    expect(layout.rows).toBe(4);
  });

  it("keeps the existing responsive policy below the wide-workspace threshold", () => {
    const layout = calculateGridLayout(4, 500, 450, null, {
      stableColumnCount: 4,
    });

    expect(layout.columns).toBe(2);
    expect(layout.rows).toBe(2);
  });

  it("keeps the wide layout for sequences that exceed the fit-all row limit", () => {
    const layout = calculateGridLayout(40, 719, 450, null);

    expect(layout.columns).toBe(8);
    expect(layout.rows).toBe(5);
  });

  it("keeps Assemble pictographs readable in a narrow, shallow workspace", () => {
    const defaultLayout = calculateGridLayout(5, 295, 120, null);
    const assembleLayout = calculateGridLayout(5, 295, 120, null, {
      narrowMaxColumns: 2,
      preferWidthSizingOnNarrow: true,
    });

    expect(assembleLayout.columns).toBe(2);
    expect(assembleLayout.rows).toBe(3);
    expect(assembleLayout.cellSize).toBeGreaterThanOrEqual(88);
    expect(assembleLayout.cellSize).toBeGreaterThan(defaultLayout.cellSize);
  });

  it("caps LOOP alignment when Assemble needs larger mobile cells", () => {
    const layout = calculateGridLayout(8, 320, 180, null, {
      manualColumnCount: 4,
      narrowMaxColumns: 2,
      preferWidthSizingOnNarrow: true,
    });

    expect(layout.columns).toBe(2);
    expect(layout.rows).toBe(4);
  });

  it("fills a narrow Tunnel card with three readable step columns", () => {
    const defaultLayout = calculateGridLayout(8, 585, 402, null);
    const tunnelLayout = calculateGridLayout(8, 585, 402, null, {
      narrowMaxColumns: 3,
      preferWidthSizingOnNarrow: true,
    });

    expect(tunnelLayout.columns).toBe(3);
    expect(tunnelLayout.rows).toBe(3);
    expect(tunnelLayout.cellSize).toBeGreaterThan(defaultLayout.cellSize);
    expect(tunnelLayout.cellSize * tunnelLayout.rows).toBeGreaterThanOrEqual(
      400
    );
  });

  it("keeps long Tunnel sequences readable instead of flattening them into eight columns", () => {
    const defaultLayout = calculateGridLayout(40, 950, 349, null);
    const tunnelLayout = calculateGridLayout(40, 950, 349, null, {
      stableColumnCount: 4,
      narrowMaxColumns: 3,
      preferWidthSizingOnNarrow: true,
    });

    expect(defaultLayout.columns).toBe(8);
    expect(tunnelLayout.columns).toBe(4);
    expect(tunnelLayout.cellSize).toBeGreaterThan(defaultLayout.cellSize * 2);
  });
});

describe("workspace grid vertical centering", () => {
  it("moves existing rows upward by half a cell when a new row is added", () => {
    const oneRowOffset = calculateGridVerticalCenterOffset(632, 1, 100, 32);
    const twoRowOffset = calculateGridVerticalCenterOffset(632, 2, 100, 32);

    expect(oneRowOffset).toBe(250);
    expect(twoRowOffset).toBe(200);
    expect(oneRowOffset - twoRowOffset).toBe(50);
  });

  it("pins the grid to the top once its rows need to scroll", () => {
    expect(calculateGridVerticalCenterOffset(632, 7, 100, 32)).toBe(0);
  });
});

describe("WorkspaceGrid mandala placement", () => {
  it("shares capped mandala placement across both workspace layouts", () => {
    expect(workspaceGridSource.match(/getMandalaPlacements\(\{/g)).toHaveLength(
      2
    );
    expect(workspaceGridSource).not.toContain("applyVariantCycling");
    expect(workspaceGridSource).toContain("{#if cell.show !== null}");
  });
});

describe("Create workspace action rail contract", () => {
  it("uses the Play glyph for the sequence viewer", () => {
    expect(WORKSPACE_BUTTON_ICON.view.icon).toBe("fa-play");
    expect(WORKSPACE_BUTTON_ICON.view.actionLabel).toBe("Play sequence");
    expect(WORKSPACE_BUTTON_TUTORIAL.view.label).toBe(
      WORKSPACE_BUTTON_ICON.view.actionLabel
    );
    expect(buttonPanelSource).toContain('purpose="play"');
    expect(drawerLauncherSource).toContain("playOnOpen: true");
  });

  it("keeps recovery in the leading header and four controls below it", () => {
    expect(
      workspaceButtonsInZone("header-leading").map((button) => button.id)
    ).toEqual(["undo", "redo"]);
    expect(workspaceButtonsInZone("right").map((button) => button.id)).toEqual([
      "sequence-actions",
      "share",
    ]);
    expect(
      workspaceButtonsInZone("header-trailing").map((button) => button.id)
    ).toEqual(["save"]);
    expect(WORKSPACE_BUTTON_ICON.share).toEqual({
      icon: "fa-share-nodes",
      iconType: "fa",
      actionLabel: "Share",
      visibleLabel: "Share",
    });
    expect(WORKSPACE_BUTTON_TUTORIAL.share.label).toBe("Share");
    expect(WORKSPACE_BUTTON_TUTORIAL.share.description).toContain(
      "send the sequence in Flow Arts Composer"
    );
    expect(buttonPanelSource).toContain("<SequenceActionsButton");
    expect(buttonPanelSource).toContain("<ShareButton");
    expect(buttonPanelSource).not.toContain("<UndoButton");
    expect(buttonPanelSource).not.toContain("<SaveToLibraryButton");
    expect(standardWorkspaceSource).toContain("<UndoButton");
    expect(standardWorkspaceSource).toContain('direction="redo"');
    expect(standardWorkspaceSource).not.toMatch(
      /\{#if isAssembleTab\}[\s\S]*direction="redo"/
    );
    expect(sequenceDisplaySource).not.toContain("<UndoButton");
    expect(sequenceDisplaySource).not.toContain("<SequenceActionsButton");
    expect(sequenceDisplaySource).not.toContain("<SaveToLibraryButton");
    expect(standardWorkspaceSource).toContain("<SaveToLibraryButton");
  });

  it("keeps layout, icon, and tutorial maps in lockstep", () => {
    const layoutIds = WORKSPACE_BUTTON_LAYOUT.map((button) => button.id).sort();
    expect(Object.keys(WORKSPACE_BUTTON_ICON).sort()).toEqual(layoutIds);
    expect(Object.keys(WORKSPACE_BUTTON_TUTORIAL).sort()).toEqual(layoutIds);
  });

  it("keeps Play centered in the single-row phone layout", () => {
    expect(buttonPanelSource).toMatch(
      /grid-template-columns:\s*minmax\(0, 1fr\)\s*50px\s*minmax\(0, 1fr\)/
    );
    expect(buttonPanelSource).not.toMatch(
      /grid-template-areas:\s*"\. center \."\s*"left \. right"/
    );
    expect(buttonPanelSource).toMatch(
      /grid-template-areas:\s*"left left left"\s*"\. center \."\s*"right right right"/
    );
  });

  it("keeps each side group packed instead of spacing buttons into equal cells", () => {
    expect(buttonPanelSource).toMatch(
      /\.left-zone,\s*\.right-zone\s*\{[^}]*display:\s*flex;[^}]*width:\s*max-content;[^}]*gap:\s*var\(--settings-workspace-action-gap\);/s
    );
    expect(buttonPanelSource).not.toContain(
      "grid-template-columns: repeat(3, minmax(0, 1fr));"
    );
    expect(buttonPanelSource).not.toContain(
      "grid-template-columns: repeat(2, minmax(0, 1fr));"
    );
  });
});
