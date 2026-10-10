import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(process.cwd());

function read(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), "utf8");
}

describe("Fuse sequence actions contract", () => {
  it("opens Share on the fused result without navigating through the sequence viewer", () => {
    const layout = read("src/lib/features/fuse/components/FuseLayout.svelte");
    const shareHandler = layout.slice(
      layout.indexOf("async function handleShare()"),
      layout.indexOf("function closeShare()")
    );

    expect(shareHandler).toContain("fuseState.buildFusedSequence()");
    expect(shareHandler).toContain("shareSequence = sequence");
    expect(shareHandler).toContain("shareOpen = true");
    expect(shareHandler).not.toContain("openSequenceViewer");
    expect(layout).toContain("<WorkspaceShareSheet");
    expect(layout).toContain("sequence={shareSequence}");
    expect(layout).toContain("onClose={closeShare}");
  });

  it("composes the canonical transform grid instead of owning another action list", () => {
    const popover = read(
      "src/lib/features/fuse/components/FuseSourceActionPopover.svelte"
    );
    const createPanel = read(
      "src/lib/features/create/shared/components/sequence-actions/SequenceActionsPanel.svelte"
    );

    expect(popover).toContain(
      'import SequenceTransformActions from "#lib/shared/create/components/SequenceTransformActions.svelte"'
    );
    expect(createPanel).toContain(
      'import SequenceTransformActions from "#lib/shared/create/components/SequenceTransformActions.svelte"'
    );
    expect(popover).toContain("<SequenceTransformActions");
    expect(popover).toContain("rotationDegrees={45}");
    expect(popover).toContain("showRotationDegreesInLabel={true}");
    expect(popover).toContain('shiftStartPlacement="transform"');
    expect(popover).not.toContain("onRewind=");
    expect(popover).not.toContain("onSwap=");
    expect(popover).not.toContain("onDuration=");
  });

  it("uses the visible source card as the desktop first-step picker", () => {
    const layout = read("src/lib/features/fuse/components/FuseLayout.svelte");
    const card = read("src/lib/features/fuse/components/FuseSourceCard.svelte");

    expect(layout).toContain("inlineFirstStepSide");
    expect(layout).toContain("firstStepPickerActive={inlineFirstStepSide");
    expect(card).toContain("<FuseSourceActionPopover");
    expect(card).toContain("onStepClick={firstStepPickerActive");
    expect(card).toContain('kind: "first-step"');
  });

  it("keeps phone source actions compact and opens the canonical card viewer", () => {
    const card = read("src/lib/features/fuse/components/FuseSourceCard.svelte");
    const popover = read(
      "src/lib/features/fuse/components/FuseSourceActionPopover.svelte"
    );

    expect(card).toContain('label: "View Choreo Card"');
    expect(card).toContain("<CardInspectModal");
    expect(card).toContain('presentation="live"');
    expect(card).toContain("browseViewMode={viewMode}");
    expect(card).toContain("compactTrigger={true}");
    expect(popover).toContain("compactTrigger?: boolean");

    const compactMenu = card.slice(
      card.indexOf("const compactSourceMenuItems"),
      card.indexOf("</script>")
    );
    expect(compactMenu).not.toContain('label: "Regenerate path"');
    expect(compactMenu).not.toContain('label: "Mirror path"');
    expect(compactMenu).not.toContain('label: "Choose first step"');
  });

  it("gives desktop sources one primary action and discloses rare actions", () => {
    const card = read("src/lib/features/fuse/components/FuseSourceCard.svelte");

    expect(card).toContain('<div class="source-actions">');
    expect(card).toContain("Regenerate");
    expect(card).toContain("<FuseSourceActionPopover");
    expect(card).toContain("items={sourceMenuItems}");
    expect(card).toContain('triggerPresentation="labelled"');
    expect(card).toContain("<span>More</span>");
    expect(card).toContain('label: "Choose saved LOOP"');
    expect(card).toContain('label: "Choose a shape"');
    expect(card).toContain('label: "Build a custom path"');
    expect(card).toContain('"Save to library"');
  });

  it("keeps the live source grid inside the canonical Choreo Card contract", () => {
    const card = read("src/lib/features/fuse/components/FuseSourceCard.svelte");
    const grid = read(
      "src/lib/features/fuse/components/FuseLivePathGrid.svelte"
    );

    expect(card).toContain(
      'import ChoreoCardContextMenuHost from "#lib/shared/sequence-viewer/components/choreo-card-context-menu/ChoreoCardContextMenuHost.svelte"'
    );
    expect(card).toContain("oncontextmenu={openCardContextMenu}");
    expect(card).toContain("<ChoreoCardContextMenuHost");
    expect(card).toContain("includePictographSection={false}");
    expect(card).toContain("showReversals={true}");
    expect(grid).toContain("showReversals={true}");
    expect(card).toContain(
      'import { createCircularFuseSoloSequence } from "../services/fuse-solo-sequence"'
    );
    expect(card).toContain("createCircularFuseSoloSequence(side, solo)");
    expect(card).not.toContain("showReversals={false}");
    expect(grid).not.toContain("showReversals={false}");
  });

  it("reserves readable width for the desktop tempo control", () => {
    const preview = read(
      "src/lib/features/fuse/components/FusePreviewStage.svelte"
    );

    expect(preview).toContain(
      "grid-template-columns: clamp(110px, 14cqw, 180px) minmax(0, 1fr)"
    );
    expect(preview).toContain("min-width: 110px");
    expect(preview).toContain("@container fuse-preview (max-width: 620px)");
    expect(preview).toContain('"viewer viewer viewer"');
    expect(preview).toContain('"tempo save share"');
    expect(preview).toContain('label="Open viewer"');
    expect(preview).toContain('variant="secondary"');
  });
});
