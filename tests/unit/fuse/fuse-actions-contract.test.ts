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
    const screen = read(
      "src/lib/features/fuse/components/FuseEditPathScreen.svelte"
    );
    const createPanel = read(
      "src/lib/features/create/shared/components/sequence-actions/SequenceActionsPanel.svelte"
    );

    expect(screen).toContain(
      'import SequenceTransformActions from "#lib/shared/create/components/SequenceTransformActions.svelte"'
    );
    expect(createPanel).toContain(
      'import SequenceTransformActions from "#lib/shared/create/components/SequenceTransformActions.svelte"'
    );
    expect(screen).toContain("<SequenceTransformActions");
    expect(screen).toContain("rotationDegrees={45}");
    // The tiles carry the same words as Construct's sequence actions.
    expect(screen).not.toContain("showRotationDegreesInLabel");
    expect(screen).toContain('kind: "rewind"');
    // Swapping hands, changing timing or rewriting turns can break the LOOP
    // seam or the pair, so those Construct actions stay out of Fuse.
    expect(screen).not.toContain("onSwap=");
    expect(screen).not.toContain("onDuration=");
    expect(screen).not.toContain("onTurnPattern=");
    expect(screen).not.toContain("onRotationDirection=");
  });

  it("edits the path on a screen of its own, start picker included", () => {
    const layout = read("src/lib/features/fuse/components/FuseLayout.svelte");
    const card = read("src/lib/features/fuse/components/FuseSourceCard.svelte");
    const screen = read(
      "src/lib/features/fuse/components/FuseEditPathScreen.svelte"
    );

    expect(layout).toContain("<FuseEditPathScreen");
    expect(layout).toContain("inert={editSide !== null}");
    expect(card).toContain("onEditPath(side)");
    expect(screen).toContain("onStepClick={picking");
    expect(screen).toContain('kind: "first-step"');
  });

  it("keeps phone source actions compact and opens the canonical card viewer", () => {
    const card = read("src/lib/features/fuse/components/FuseSourceCard.svelte");

    expect(card).toContain(`label: t("fuse_card_menu_view_card")`);
    expect(card).toContain("<CardInspectModal");
    expect(card).toContain('presentation="live"');
    expect(card).toContain("browseViewMode={viewMode}");
    expect(card).not.toContain("compact-edit-trigger");

    const compactMenu = card.slice(
      card.indexOf("const compactSourceMenuItems"),
      card.indexOf("</script>")
    );
    expect(compactMenu).toContain(`label: t("fuse_card_edit_path")`);
    expect(compactMenu).toContain(`label: t("fuse_settings_new_paths_aria")`);
    expect(compactMenu).not.toContain('label: "Regenerate path"');
    expect(compactMenu).not.toContain('label: "Mirror path"');
    expect(compactMenu).not.toContain('label: "Choose first step"');
  });

  it("joins each hand's settings for new paths to its Regenerate", () => {
    const card = read("src/lib/features/fuse/components/FuseSourceCard.svelte");
    const regenerate = card.slice(
      card.indexOf('<div class="shuffle-slot">'),
      card.indexOf('<div class="edit-slot">')
    );

    expect(card).toContain('<div class="source-actions">');
    expect(regenerate).toContain("fuse_card_regenerate");
    expect(regenerate).toContain('class="regenerate-settings"');
    expect(regenerate).toContain("fuse_settings_title_left");
    expect(regenerate).toContain("onOpenSettings(side)");
    expect(card).toContain("items={sourceMenuItems}");
    expect(card).toContain('triggerPresentation="labelled"');
    expect(card).toContain(`<span>{t("fuse_card_more")}</span>`);
    expect(card).toContain(`label: t("fuse_card_menu_choose_saved")`);
    expect(card).toContain(`label: t("fuse_card_menu_choose_shape")`);
    expect(card).toContain(`label: t("fuse_card_menu_build_custom")`);
    expect(card).toContain("fuse_card_menu_save");
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
    expect(preview).toContain(`label={t("fuse_preview_open_viewer")}`);
    expect(preview).toContain('variant="secondary"');
  });

  // A fixed tip-effect map on the preview wins over the person's effects
  // state, so the Effects panel would change nothing on screen while every
  // control in it still looked like it worked.
  it("draws the effects the shared effects state holds, not a fixed map", () => {
    const layout = read("src/lib/features/fuse/components/FuseLayout.svelte");
    const preview = read(
      "src/lib/features/fuse/components/FuseAnimationPreview.svelte"
    );

    expect(layout).toContain("setEffectsConfigContext(");
    expect(preview).toContain("{effectsConfigState}");
    expect(preview).not.toMatch(/tipEffectMap=/);
  });
});
