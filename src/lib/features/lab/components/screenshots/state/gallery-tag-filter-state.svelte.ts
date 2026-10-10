/**
 * Gallery Tag Filter State
 *
 * Manages tag-based filtering for the screenshot gallery:
 * active/excluded tag sets, AND/OR mode, untagged-only toggle,
 * tag panel (context menu) positioning, and long-press detection.
 */

import type { HapticFeedback } from "#lib/shared/application/services/haptic-feedback.js";
import type { ScreenshotTagController } from "../../../services/screenshot-tag-controller";
import type { GalleryItem } from "../../../services/types";
import type { MediaTag, TagColor } from "@austencloud/media-tagging-types";

export interface GalleryTagFilterDeps {
  getHapticService: () => HapticFeedback | null;
  getTagController: () => ScreenshotTagController | null;
}

export function createGalleryTagFilterState(deps: GalleryTagFilterDeps) {
  let allTags = $state<MediaTag[]>([]);
  let tagUnsubscribe: (() => void) | null = null;
  let activeTagIds = $state<Set<string>>(new Set());
  let excludeTagIds = $state<Set<string>>(new Set());
  let tagMode = $state<"and" | "or">("or");
  let untaggedOnly = $state(false);
  let tagPanelTarget = $state<GalleryItem | null>(null);
  let tagPanelPosition = $state<{ x: number; y: number }>({ x: 0, y: 0 });
  let showTagCreator = $state(false);
  let sidebarOpen = $state(false);
  let showTagPicker = $state(false);

  // Long-press for mobile tagging
  let longPressTimer: ReturnType<typeof setTimeout> | null = null;
  const LONG_PRESS_MS = 500;

  function loadTags() {
    tagUnsubscribe?.();
    const controller = deps.getTagController();
    tagUnsubscribe =
      controller?.subscribeTags((tags) => {
        allTags = tags;
      }) ?? null;
  }

  function unsubscribeTags() {
    tagUnsubscribe?.();
    tagUnsubscribe = null;
    allTags = [];
  }

  async function toggleTagOnScreenshot(tagId: string) {
    if (!tagPanelTarget) return;
    const controller = deps.getTagController();
    await controller?.toggleTagOnScreenshot(tagId, tagPanelTarget.id);
  }

  async function createTag(name: string, color: TagColor, category: string) {
    const controller = deps.getTagController();
    await controller?.createTag(name, color, category);
  }

  function openTagPanel(item: GalleryItem, e: MouseEvent | TouchEvent) {
    e.preventDefault();
    e.stopPropagation();

    if ("clientX" in e) {
      tagPanelTarget = item;
      tagPanelPosition = { x: e.clientX, y: e.clientY };
    } else {
      const touch = (e as TouchEvent).touches?.[0];
      if (touch) {
        tagPanelTarget = item;
        tagPanelPosition = { x: touch.clientX, y: touch.clientY };
      }
    }
  }

  function closeTagPanel() {
    tagPanelTarget = null;
  }

  function startLongPress(item: GalleryItem, e: TouchEvent) {
    longPressTimer = setTimeout(() => {
      openTagPanel(item, e);
      longPressTimer = null;
    }, LONG_PRESS_MS);
  }

  function cancelLongPress() {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  }


  function toggleTag(tagId: string) {
    const next = new Set(activeTagIds);
    if (next.has(tagId)) {
      next.delete(tagId);
    } else {
      next.add(tagId);
    }
    activeTagIds = next;
    untaggedOnly = false;
    deps.getHapticService()?.trigger("selection");
  }

  function excludeTag(tagId: string) {
    const next = new Set(excludeTagIds);
    if (next.has(tagId)) {
      next.delete(tagId);
    } else {
      next.add(tagId);
    }
    excludeTagIds = next;
    deps.getHapticService()?.trigger("selection");
  }

  function setTagMode(mode: "and" | "or") {
    tagMode = mode;
    deps.getHapticService()?.trigger("selection");
  }

  function setUntaggedOnly(value: boolean) {
    untaggedOnly = value;
    if (value) {
      activeTagIds = new Set();
      excludeTagIds = new Set();
    }
    deps.getHapticService()?.trigger("selection");
  }

  function clearTags() {
    activeTagIds = new Set();
    excludeTagIds = new Set();
    untaggedOnly = false;
    deps.getHapticService()?.trigger("selection");
  }

  function toggleSidebar() {
    sidebarOpen = !sidebarOpen;
    deps.getHapticService()?.trigger("selection");
  }

  function openTagPicker() {
    showTagPicker = true;
  }

  function closeTagPicker() {
    showTagPicker = false;
  }

  function applyTagFilter(items: GalleryItem[]): GalleryItem[] {
    const hasFilters =
      activeTagIds.size > 0 || excludeTagIds.size > 0 || untaggedOnly;
    if (!hasFilters) return items;

    return items.filter((item) => {
      if (untaggedOnly) return item.tagIds.length === 0;

      if (excludeTagIds.size > 0) {
        for (const exId of excludeTagIds) {
          if (item.tagIds.includes(exId)) return false;
        }
      }

      if (activeTagIds.size === 0) return true;

      if (tagMode === "and") {
        for (const tid of activeTagIds) {
          if (!item.tagIds.includes(tid)) return false;
        }
        return true;
      } else {
        for (const tid of activeTagIds) {
          if (item.tagIds.includes(tid)) return true;
        }
        return false;
      }
    });
  }

  return {
    // Tags
    get allTags() {
      return allTags;
    },
    get activeTagIds() {
      return activeTagIds;
    },
    get excludeTagIds() {
      return excludeTagIds;
    },
    get tagMode() {
      return tagMode;
    },
    get untaggedOnly() {
      return untaggedOnly;
    },

    // Tag panel
    get tagPanelTarget() {
      return tagPanelTarget;
    },
    get tagPanelPosition() {
      return tagPanelPosition;
    },
    get showTagCreator() {
      return showTagCreator;
    },
    set showTagCreator(v: boolean) {
      showTagCreator = v;
    },
    get sidebarOpen() {
      return sidebarOpen;
    },
    get showTagPicker() {
      return showTagPicker;
    },

    // Actions
    loadTags,
    unsubscribeTags,
    toggleTagOnScreenshot,
    createTag,
    openTagPanel,
    closeTagPanel,
    startLongPress,
    cancelLongPress,
    toggleTag,
    excludeTag,
    setTagMode,
    setUntaggedOnly,
    clearTags,
    toggleSidebar,
    openTagPicker,
    closeTagPicker,
    applyTagFilter,
  };
}

export type GalleryTagFilterState = ReturnType<
  typeof createGalleryTagFilterState
>;
