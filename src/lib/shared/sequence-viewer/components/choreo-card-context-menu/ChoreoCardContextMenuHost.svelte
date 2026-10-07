<!--
  ChoreoCardContextMenuHost — Orchestrates the ChoreoCard right-click context menu.
  Additive composition: optional "Pictograph" section (global visibility
  toggles for cards that live-follow the VisibilityStateManager) + "Card"
  section (columns, Re-render, Send to, Sticker Lab).
-->
<script lang="ts">
  import { onMount } from "svelte";
  import ContextMenu from "$lib/shared/components/context-menu/ContextMenu.svelte";
  import type {
    ContextMenuState,
    ContextMenuEntry,
  } from "$lib/shared/components/context-menu/context-menu-types";
  import {
    composeMenu,
    type MenuSection,
  } from "$lib/shared/components/context-menu/compose-menu";
  import { buildCardMenuSection } from "$lib/shared/choreo-card/services/card-menu-section";
  import { buildPictographContextMenuItems } from "$lib/shared/pictograph/shared/components/context-menu/pictograph-context-menu-builder";
  import { getVisibilityStateManager } from "$lib/shared/pictograph/shared/state/visibility-state.svelte";
  import { getImageCompositionManager } from "$lib/shared/share/state/image-composition-state.svelte";
  import { authState } from "$lib/shared/auth/state/auth-state.svelte";
  import type { ExportOptionsStateManager } from "$lib/shared/animation-panel/state/export-options-state.svelte";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import {
    contextMenuCloseCounts,
    instrumentContextMenuEntries,
  } from "../../services/context-menu-analytics";

  interface Props {
    sequence?: SequenceData | null;
    onSaveToLibrary?: () => void | Promise<void>;
    onRerender?: () => void;
    isExportMode?: boolean;
    exportOptions?: ExportOptionsStateManager;
    onSendTo?: () => void;
    onSendToStickerLab?: () => void;
    stepCount?: number;
    /** False when a card deliberately fixes its glyph visibility. */
    includePictographSection?: boolean;
    onAction?: (
      action: string,
      properties?: Record<string, string | number | boolean | null>,
      options?: { count?: boolean }
    ) => void;
  }

  const {
    sequence,
    onSaveToLibrary,
    onRerender,
    isExportMode = false,
    exportOptions,
    onSendTo,
    onSendToStickerLab,
    stepCount = 0,
    includePictographSection = true,
    onAction,
  }: Props = $props();

  const visibilityManager = getVisibilityStateManager();
  const imageComposition = getImageCompositionManager();

  let menuState: ContextMenuState = $state({ open: false });
  let menuVersion = $state(0);

  // Rebuild menu items (fresh checked states) whenever any visibility changes —
  // pictograph glyphs and the card-composition toggles (header, QR, theme…)
  // both live in the menu, so both managers bump it.
  onMount(() => {
    const bump = () => {
      menuVersion++;
    };
    if (includePictographSection) {
      visibilityManager.registerObserver(bump, ["all"]);
    }
    imageComposition.registerObserver(bump);
    return () => {
      if (includePictographSection) {
        visibilityManager.unregisterObserver(bump);
      }
      imageComposition.unregisterObserver(bump);
    };
  });

  function closeContextMenu(
    reason: "item" | "outside" | "dismiss" = "dismiss"
  ): void {
    if (!menuState.open) return;
    menuState = { open: false };
    onAction?.(
      "context_menu_close",
      { reason },
      { count: contextMenuCloseCounts(reason) }
    );
  }

  const menuItems: ContextMenuEntry[] = $derived.by(() => {
    void menuVersion;
    const sections: MenuSection[] = [];
    if (includePictographSection) {
      sections.push({
        header: "Pictograph",
        entries: instrumentContextMenuEntries(
          buildPictographContextMenuItems({
            visibilityManager,
            // Card step numbers read ImageComposition.addStepNumbers, not this
            // manager — the toggle would lie here.
            includeStepNumbers: false,
          }),
          "pictograph",
          onAction
        ),
      });
    }
    sections.push({
      header: "Card",
      entries: instrumentContextMenuEntries(
        buildCardMenuSection({
          visibility: {
            composition: imageComposition,
            // Dark Mode only while the card options panel is open — that's the
            // only time the preview card reads imageDarkMode.
            exportOptions: isExportMode ? exportOptions : undefined,
            // Same gate as ExportImagePanel: guests can't mint a scannable QR.
            canQRCode: authState.isAuthenticated,
          },
          sequenceForLibrarySave: sequence ?? undefined,
          onSaveToLibrary,
          onSendTo: onSendTo
            ? () => {
                closeContextMenu("item");
                onSendTo();
              }
            : undefined,
          onSendToStickerLab: onSendToStickerLab
            ? () => {
                closeContextMenu("item");
                onSendToStickerLab();
              }
            : undefined,
          onRerender: onRerender
            ? () => {
                closeContextMenu("item");
                onRerender();
              }
            : undefined,
          stepCount,
          onColumnCountChange: () => {
            menuVersion++;
          },
        }),
        "card",
        onAction
      ),
    });
    return composeMenu(sections);
  });

  export function openContextMenu(x: number, y: number): void {
    menuVersion++;
    menuState = { open: true, x, y };
    onAction?.("context_menu_open", {
      x_bucket: Math.max(0, Math.floor(x / 100)),
      y_bucket: Math.max(0, Math.floor(y / 100)),
    });
  }
</script>

<ContextMenu {menuState} items={menuItems} onClose={closeContextMenu} />
