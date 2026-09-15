/**
 * card-menu-section.ts
 *
 * THE canonical "Card" context-menu section. Every surface that right-clicks a
 * choreo card composes this section (usually via composeMenu, often alongside
 * the pictograph section). Replaces the two builders that drifted apart:
 * card-designer-context-menu-builder.ts (columns/send-to/re-render) and
 * choreo-card-context-menu.ts (admin image actions) — both absorbed here.
 *
 * Entries appear only when their dep is provided, so each surface gets exactly
 * the actions it wires. Seam note: the three-tier start-position layout
 * feature (feedback 3IPLlE7L) adds its tier submenu to these deps later.
 */

import type {
  ContextMenuEntry,
  ContextMenuItem,
} from "$lib/shared/components/context-menu/context-menu-types";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { getCanonicalCardStepColumnCounts } from "$lib/shared/render/services/card-step-column-options";
import { getImageCompositionManager } from "$lib/shared/share/state/image-composition-state.svelte";
import { buildVisualSequenceSaveMenuItem } from "$lib/shared/library/services/visual-sequence-save-menu-item";
import {
  buildCardVisibilityMenuItems,
  type CardVisibilityMenuDeps,
} from "./card-visibility-menu";

export interface CardMenuSectionDeps {
  /** Step count of the sequence — enables the columns submenu (>=4 steps). */
  stepCount?: number;
  /** Called after a column-count change so the host can rebuild the menu. */
  onColumnCountChange?: () => void;
  onRerender?: () => void;
  onSendTo?: () => void;
  onSendToStickerLab?: () => void;
  onSaveToLibrary?: () => void | Promise<void>;
  /** The sequence represented by this card, enabling the canonical library action. */
  sequenceForLibrarySave?: SequenceData;
  /** Admin image actions (Save/Copy/Copy for Claude) target this sequence. */
  sequenceForImageActions?: SequenceData;
  /** Gate for the image actions — they render only when this is true. */
  isAdmin?: boolean;
  /** Card-composition toggles (header, QR, mandala, theme) — the twin of the
   *  animation canvas's Visibility submenu. Listed first when provided. */
  visibility?: CardVisibilityMenuDeps;
}

export function buildCardMenuSection(deps: CardMenuSectionDeps): ContextMenuEntry[] {
  const items: ContextMenuEntry[] = [];

  if (deps.visibility) {
    items.push({
      id: "card-visibility-submenu",
      label: "Visibility",
      icon: "fa-eye",
      children: buildCardVisibilityMenuItems(deps.visibility),
    });
  }

  if (deps.sequenceForLibrarySave) {
    items.push(
      buildVisualSequenceSaveMenuItem(
        deps.sequenceForLibrarySave,
        {},
        deps.onSaveToLibrary
      )
    );
  }

  // Columns submenu (only for 4+ steps)
  if (deps.stepCount && deps.stepCount >= 4) {
    const composition = getImageCompositionManager();
    const currentCols = composition.getColumnCountForStepCount(deps.stepCount);
    const stepCount = deps.stepCount;

    const columnChoices = getCanonicalCardStepColumnCounts(stepCount);

    if (columnChoices.length > 0) {
      const children: ContextMenuItem[] = [
        {
          id: "cols-auto",
          label: "Auto",
          checked: currentCols === null,
          keepOpen: true,
          action: () => {
            composition.setColumnCountForStepCount(stepCount, null);
            deps.onColumnCountChange?.();
          },
        },
        ...columnChoices.map((n) => ({
          id: `cols-${n}`,
          label: `${n} columns`,
          checked: currentCols === n,
          keepOpen: true,
          action: () => {
            composition.setColumnCountForStepCount(stepCount, n);
            deps.onColumnCountChange?.();
          },
        })),
      ];

      items.push({
        id: "columns-submenu",
        label: `${stepCount}-Count Columns`,
        icon: "fa-columns",
        children,
      });
    }
  }

  if (deps.onRerender) {
    items.push({
      id: "rerender",
      label: "Re-render",
      icon: "fa-sync-alt",
      action: deps.onRerender,
    });
  }

  if (deps.onSendTo) {
    items.push({
      id: "send-to",
      label: "Send to…",
      icon: "fa-paper-plane",
      action: deps.onSendTo,
    });
  }

  if (deps.onSendToStickerLab) {
    items.push({
      id: "send-to-sticker-lab",
      label: "Send to Sticker Lab",
      icon: "fa-sticky-note",
      action: deps.onSendToStickerLab,
    });
  }

  if (deps.isAdmin && deps.sequenceForImageActions) {
    const sequence = deps.sequenceForImageActions;
    if (items.length > 0) items.push({ type: "separator" });
    items.push(
      {
        id: "copy-sequence-data",
        label: "Copy sequence data",
        icon: "fa-code",
        async action() {
          const { toast } = await import("$lib/shared/toast/state/toast-state.svelte");
          try {
            const { copyToClipboard } = await import(
              "$lib/features/create/shared/services/sequence-json-exporter"
            );
            const ok = await copyToClipboard(sequence);
            toast[ok ? "success" : "error"](
              ok ? "Sequence data copied" : "Failed to copy sequence data",
            );
          } catch (err) {
            console.error("Copy sequence data failed:", err);
            toast.error("Failed to copy sequence data");
          }
        },
      },
      {
        id: "save-image",
        label: "Save image",
        icon: "fa-download",
        async action() {
          try {
            const { toast } = await import("$lib/shared/toast/state/toast-state.svelte");
            const { DEFAULT_SHARE_OPTIONS } = await import("$lib/shared/share/domain/models/share-options");
            const { getSharer } = await import("$lib/shared/share/get-sharer");
            await getSharer().downloadImage(sequence, { ...DEFAULT_SHARE_OPTIONS, format: "PNG" });
            toast.success("Image saved");
          } catch (err) {
            console.error("Save image failed:", err);
            const { toast } = await import("$lib/shared/toast/state/toast-state.svelte");
            toast.error("Failed to save image");
          }
        },
      },
      {
        id: "copy-image",
        label: "Copy image",
        icon: "fa-copy",
        async action() {
          try {
            const { toast } = await import("$lib/shared/toast/state/toast-state.svelte");
            const { DEFAULT_SHARE_OPTIONS } = await import("$lib/shared/share/domain/models/share-options");
            const { getSharer } = await import("$lib/shared/share/get-sharer");
            const blob = await getSharer().getImageBlob(sequence, { ...DEFAULT_SHARE_OPTIONS, format: "PNG" });
            await navigator.clipboard.write([
              new ClipboardItem({ "image/png": blob }),
            ]);
            toast.success("Image copied to clipboard");
          } catch (err) {
            console.error("Copy image failed:", err);
            const { toast } = await import("$lib/shared/toast/state/toast-state.svelte");
            toast.error("Failed to copy image");
          }
        },
      },
      {
        id: "copy-for-claude",
        label: "Copy for Claude",
        icon: "fa-robot",
        async action() {
          try {
            const { toast } = await import("$lib/shared/toast/state/toast-state.svelte");
            const { getClaudeCodeCopier } = await import("$lib/shared/browse/get-claude-code-copier");
            const copier = getClaudeCodeCopier();
            const result = await copier.copyForClaude(sequence);
            if (result.success) {
              toast.success("Copied for Claude");
            } else {
              toast.error("Failed to copy for Claude");
            }
          } catch (err) {
            console.error("Copy for Claude failed:", err);
            const { toast } = await import("$lib/shared/toast/state/toast-state.svelte");
            toast.error("Failed to copy for Claude");
          }
        },
      },
    );
  }

  return items;
}
