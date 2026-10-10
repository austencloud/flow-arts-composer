/**
 * Sequence Panel State
 *
 * Manages the unified side panel system for Sequences tab:
 * - Filters panel
 * - Sequence detail panel
 * - View presets sheet (mobile)
 * - Sort/jump sheet (mobile)
 *
 * Ensures panels are mutually exclusive and handles pin state
 */

import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import { createComponentLogger } from "#lib/shared/utils/debug-logger.js";

const debug = createComponentLogger("SequencePanelState");

export type PanelType =
  | "filters"
  | "detail"
  | "viewPresets"
  | "sortJump"
  | null;

class SequencePanelManager {
  // Current open panel
  activePanel = $state<PanelType>(null);

  // Inline filter panel toggle (independent of drawer panels)
  isInlineFiltersOpen = $state(false);

  // Pin state (desktop only)
  isPinned = $state(false);

  // Expanded state for detail panel (shows animation settings sidebar)
  isDetailExpanded = $state(false);

  // Active sequence for detail panel
  activeSequence = $state<SequenceData | null>(null);

  // Variations for the active sequence (same word, different authors/props)
  activeVariations = $state<SequenceData[]>([]);

  // Current variation index within the variations array
  variationIndex = $state(0);

  // Unique ID that increments each time detail panel opens.
  // Used as a key to force component remount on reopen, ensuring
  // animation state reinitializes even when reopening the same sequence.
  viewId = $state(0);

  // Track if we're in a panel transition (prevents grid jumping)
  private isTransitioning = $state(false);

  // Computed
  get isOpen() {
    return this.activePanel !== null || this.isTransitioning;
  }

  get isFiltersOpen() {
    return this.activePanel === "filters";
  }

  get isDetailOpen() {
    return this.activePanel === "detail";
  }

  get isViewPresetsOpen() {
    return this.activePanel === "viewPresets";
  }

  get isSortJumpOpen() {
    return this.activePanel === "sortJump";
  }

  // Actions
  toggleInlineFilters() {
    this.isInlineFiltersOpen = !this.isInlineFiltersOpen;
    debug.log(`🔵 PANEL: toggleInlineFilters() → ${this.isInlineFiltersOpen}`);
  }

  openFilters() {
    debug.log("🔵 PANEL: openFilters() called");
    this.switchPanel("filters");
  }

  openDetail(sequence: SequenceData, variations?: SequenceData[]) {
    debug.log("🔵 PANEL: openDetail() called");
    // Increment viewId to force component remount on reopen.
    // This ensures animation state reinitializes even when reopening the same sequence.
    this.viewId++;
    this.activeSequence = sequence;
    this.activeVariations = variations ?? [sequence];
    // Find the index of this sequence in variations
    this.variationIndex = this.activeVariations.findIndex(
      (v) => v.id === sequence.id
    );
    if (this.variationIndex < 0) this.variationIndex = 0;
    this.switchPanel("detail");
  }

  openViewPresets() {
    debug.log("🔵 PANEL: openViewPresets() called");
    this.switchPanel("viewPresets");
  }

  openSortJump() {
    debug.log("🔵 PANEL: openSortJump() called");
    this.switchPanel("sortJump");
  }

  // Smart panel switching that handles transitions smoothly
  private switchPanel(newPanel: PanelType) {
    const previousPanel = this.activePanel;
    debug.log(`📊 SWITCH: ${previousPanel} → ${newPanel}`);

    // If we're switching from one right-side panel to another (filters ↔ detail)
    // keep grid padding stable during the crossfade
    if (
      previousPanel &&
      previousPanel !== newPanel &&
      ((previousPanel === "filters" && newPanel === "detail") ||
        (previousPanel === "detail" && newPanel === "filters"))
    ) {
      debug.log(
        "✨ TRANSITION: Detected right-side panel switch, maintaining grid padding"
      );
      // Switch immediately - drawers will crossfade
      this.activePanel = newPanel;
      this.isTransitioning = true;
      debug.log(
        `📊 STATE: activePanel=${this.activePanel}, isTransitioning=${this.isTransitioning}, isOpen=${this.isOpen}`
      );

      // Keep transition active during drawer animation to maintain grid padding
      setTimeout(() => {
        this.isTransitioning = false;
        debug.log(
          `📊 STATE (after 350ms): activePanel=${this.activePanel}, isTransitioning=${this.isTransitioning}, isOpen=${this.isOpen}`
        );
      }, 350); // Match drawer animation duration
    } else {
      debug.log("DIRECT: Direct panel switch, no transition needed");
      // Direct switch for other cases
      this.activePanel = newPanel;
      this.isTransitioning = false;
      debug.log(
        `📊 STATE: activePanel=${this.activePanel}, isTransitioning=${this.isTransitioning}, isOpen=${this.isOpen}`
      );
    }
  }

  close() {
    debug.log("🔵 PANEL: close() called");
    this.activePanel = null;
    this.isTransitioning = false;
    this.isDetailExpanded = false; // Reset expanded state
    debug.log(
      `📊 STATE: activePanel=${this.activePanel}, isTransitioning=${this.isTransitioning}, isOpen=${this.isOpen}`
    );

    // Clear sequence after animation completes
    setTimeout(() => {
      if (!this.isOpen) {
        this.activeSequence = null;
      }
    }, 400);
  }

  togglePin() {
    this.isPinned = !this.isPinned;
  }

  /**
   * Toggle expanded mode for detail panel
   * When expanded, panel is wider to show animation settings sidebar
   */
  toggleDetailExpanded() {
    this.isDetailExpanded = !this.isDetailExpanded;
    debug.log(`🔵 PANEL: toggleDetailExpanded() → ${this.isDetailExpanded}`);
  }

  /**
   * Set detail expanded state directly
   */
  setDetailExpanded(expanded: boolean) {
    this.isDetailExpanded = expanded;
    debug.log(`🔵 PANEL: setDetailExpanded(${expanded})`);
  }

  /**
   * Update the active sequence with new data
   * Used when sequence properties change (e.g., favorite status)
   */
  updateActiveSequence(updatedSequence: SequenceData) {
    if (this.activeSequence?.id === updatedSequence.id) {
      this.activeSequence = updatedSequence;
    }
  }

  /**
   * Set the current variation index and update the active sequence
   * Used when navigating between variations in the detail panel
   */
  setVariationIndex(index: number) {
    if (index >= 0 && index < this.activeVariations.length) {
      this.variationIndex = index;
      this.activeSequence = this.activeVariations[index] ?? null;
      debug.log(`🔵 PANEL: setVariationIndex(${index})`);
    }
  }

  /**
   * Select a specific variation by sequence reference
   */
  selectVariation(sequence: SequenceData) {
    const index = this.activeVariations.findIndex((v) => v.id === sequence.id);
    if (index >= 0) {
      this.setVariationIndex(index);
    }
  }
}

export const sequencePanelManager = new SequencePanelManager();
