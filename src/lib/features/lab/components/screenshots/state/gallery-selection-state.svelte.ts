/**
 * Gallery Selection State
 *
 * Manages batch selection mode for the screenshot gallery:
 * enter/exit selection, toggle individual items, select all, clear,
 * and bulk tag operations on selected items.
 */

import type { HapticFeedback } from "#lib/shared/application/services/haptic-feedback.js";
import type { ScreenshotTagController } from "../../../services/screenshot-tag-controller";
import type { GalleryItem } from "../../../services/types";
import type { MediaTag } from "@austencloud/media-tagging-types";
import { createMultiSelectionState } from "#lib/shared/selection/state/create-multi-selection-state.svelte.js";

export interface GallerySelectionDeps {
  getHapticService: () => HapticFeedback | null;
  getTagController: () => ScreenshotTagController | null;
  getFlatItems: () => GalleryItem[];
}

export function createGallerySelectionState(deps: GallerySelectionDeps) {
  const selection = createMultiSelectionState({
    getAllIds: () => deps.getFlatItems().map((item) => item.id),
    onModeChange: () => deps.getHapticService()?.trigger("selection"),
  });

  function enterSelectionMode() {
    selection.enter();
  }

  function exitSelectionMode() {
    selection.exit();
  }

  function toggleSelection(itemId: string) {
    selection.toggle(itemId);
  }

  function selectAll() {
    selection.selectAll();
  }

  function clearSelection() {
    selection.clear();
  }

  async function bulkApplyTag(tag: MediaTag) {
    const ids = [...selection.selectedIds];
    const controller = deps.getTagController();
    await controller?.addTagToScreenshots(tag.id, ids);
  }

  async function bulkRemoveTag(tag: MediaTag) {
    const ids = [...selection.selectedIds];
    const controller = deps.getTagController();
    await controller?.removeTagFromScreenshots(tag.id, ids);
  }

  return {
    get selectionMode() {
      return selection.active;
    },
    get selectedIds() {
      return selection.selectedIds;
    },

    enterSelectionMode,
    exitSelectionMode,
    toggleSelection,
    selectAll,
    clearSelection,
    bulkApplyTag,
    bulkRemoveTag,
  };
}

export type GallerySelectionState = ReturnType<
  typeof createGallerySelectionState
>;
