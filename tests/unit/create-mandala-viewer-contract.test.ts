import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

// German i18n work (commits b11df1a24d, 245d999978) moved the mandala click
// target and motion/hand control labels behind t() keys backed by
// messages/en.json. Check the source calls the key AND messages/en.json still
// carries the identical original English copy.
function readEnglishMessages(): Record<string, string> {
  return JSON.parse(source("messages/en.json")) as Record<string, string>;
}

const workspaceGrid = source(
  "src/lib/features/create/shared/workspace-panel/sequence-display/components/WorkspaceGrid.svelte"
);
const sequenceDisplay = source(
  "src/lib/features/create/shared/workspace-panel/sequence-display/components/SequenceDisplay.svelte"
);
const coordinator = source(
  "src/lib/features/create/shared/components/coordinators/StepEditorCoordinator.svelte"
);
const mandalaPanel = source(
  "src/lib/features/create/shared/components/sequence-actions/MandalaViewerPanel.svelte"
);
const mandalaControls = source(
  "src/lib/shared/sequence-viewer/components/mandala/MandalaCategoryControl.svelte"
);
const mandalaDock = source(
  "src/lib/shared/sequence-viewer/components/MandalaControlDock.svelte"
);
const mandalaPane = source(
  "src/lib/shared/sequence-viewer/components/MandalaPane.svelte"
);
const mandalaController = source(
  "src/lib/shared/sequence-viewer/state/mandala-viewer-controller.svelte.ts"
);
const displayTilePreview = source(
  "src/lib/shared/animation-engine/components/settings-panels/DisplayTilePreview.svelte"
);

describe("Create workspace mandala viewer contract", () => {
  it("makes both workspace mandala layouts accessible click targets", () => {
    expect(
      workspaceGrid.match(/aria-label=\{t\("create_ui_open_mandala"\)\}/g)
    ).toHaveLength(2);
    expect(workspaceGrid.match(/{#if onMandalaClick}/g)).toHaveLength(2);
    expect(
      workspaceGrid.match(/onclick=\{\(\) => onMandalaClick\(/g)
    ).toHaveLength(2);

    const en = readEnglishMessages();
    expect(en["create_ui_open_mandala"]).toBe("Open mandala");
  });

  it("routes the click through panel state and reuses the editor drawer", () => {
    expect(sequenceDisplay).toContain("panelState.openMandalaViewer");
    expect(coordinator.match(/<CreatePanelDrawer/g)).toHaveLength(1);
    expect(coordinator).toContain("<Crossfade key={drawerMode}");
    expect(coordinator).toContain("<MandalaViewerPanel");
  });

  it("uses the shared animated pane and collection save path", () => {
    expect(mandalaPanel).toContain("<MandalaPane");
    expect(mandalaPanel).toContain("showDownload={false}");
    expect(mandalaPanel).toContain("dockAction={saveAction}");
    expect(mandalaPanel).toContain("saveMandalaToCollection");
  });

  it("shares one motion-path policy with the animation canvas", () => {
    expect(workspaceGrid).toContain("getAnimationVisibilityManager");
    expect(workspaceGrid).toContain(
      "toMandalaPathShape(visibilityManager.getPathPolicy())"
    );
    expect(workspaceGrid).toContain("visibilityManager.registerObserver(sync)");
    expect(workspaceGrid).toContain("visibilityManager.setPathPolicy(");
    expect(workspaceGrid).not.toContain('$state<MandalaPathShape>("arc")');
    expect(displayTilePreview).toContain("pathShape={mandalaPathShape}");
  });

  it("keeps motion and hand visibility inside the existing bottom controls", () => {
    expect(mandalaPanel).not.toContain('class="viewer-options"');
    expect(mandalaControls).toContain(
      '{ value: "static", label: t("viewer_ui_static") }'
    );
    expect(mandalaControls).toContain(
      '{ value: "animated", label: t("viewer_ui_animated") }'
    );
    expect(mandalaControls).toContain(
      '{ value: "left", label: t("viewer_ui_left"), tone: "blue" }'
    );
    expect(mandalaControls).toContain(
      '{ value: "both", label: t("viewer_ui_both"), tone: "accent" }'
    );
    expect(mandalaControls).toContain(
      '{ value: "right", label: t("viewer_ui_right"), tone: "red" }'
    );
    expect(mandalaControls).not.toContain('label: "Purple"');
    expect(mandalaPanel).toContain("ctrl.show = variant");
    expect(mandalaPanel).toContain("variant: ctrl.show");
    expect(mandalaPane).toContain("show={renderedHands}");
    expect(mandalaController).toContain("show: this.show");

    const en = readEnglishMessages();
    expect(en["viewer_ui_static"]).toBe("Static");
    expect(en["viewer_ui_animated"]).toBe("Animated");
    expect(en["viewer_ui_left"]).toBe("Left");
    expect(en["viewer_ui_both"]).toBe("Both");
    expect(en["viewer_ui_right"]).toBe("Right");
  });

  it("puts Add to collection in the shared bottom dock", () => {
    expect(mandalaPanel).toContain('icon: "fa-folder-plus"');
    expect(mandalaPanel).not.toContain("AddToLibraryButton");
    expect(mandalaPanel).not.toContain("actionButtons=");
    expect(mandalaDock).toContain("<ControlDock");
    expect(mandalaDock).toContain("trailingAction={dockAction}");
  });

  it("edits the shared custom pair without replacing the full Mandala look", () => {
    expect(mandalaPanel).not.toContain("customBlue:");
    expect(mandalaPanel).not.toContain("customRed:");
    expect(mandalaPanel).toContain('colorMode: "solid"');
    expect(mandalaPanel).toContain("persistViewState: false");
    expect(mandalaPanel).toContain("persistCustomColors: true");
  });
});
