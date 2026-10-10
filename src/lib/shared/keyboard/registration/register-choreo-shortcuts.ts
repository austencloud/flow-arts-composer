/**
 * Register Choreo Sheet Shortcuts
 *
 * Static registration at app startup so every binding shows up in the `?` help
 * overlay and in Settings → Keyboard Shortcuts (where it can be rebound, with
 * conflict detection). The actions are no-ops here; ChoreoSheetView re-registers
 * the same ids with real handlers when it mounts — the manager updates the action
 * of an already-registered id, which is the same seam Keyboard3DCoordinator uses.
 *
 * Side-effectful registration/orchestration — lives in registration/, not utils/.
 */

import type { KeyboardShortcutManager } from "#lib/shared/keyboard/services/keyboard-shortcut-manager.js";
import type { ShortcutRegistrationOptions } from "../domain/types/keyboard-types";

/** Every action the sheet binds. ChoreoSheetView supplies the implementations. */
export interface ChoreoShortcutHandlers {
  selectPrevRow: () => void;
  selectNextRow: () => void;
  selectRowAt: (index: number) => void;
  moveSelectedUp: () => void;
  moveSelectedDown: () => void;
  removeSelected: () => void;
  save: () => void;
  exportPdf: () => void;
  toggleActs: () => void;
  togglePlayer: () => void;
  toggleBrowse: () => void;
  toggleRail: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  zoomReset: () => void;
  pictographSizeDown: () => void;
  pictographSizeUp: () => void;
  togglePacking: () => void;
  toggleOrientation: () => void;
  toggleStepNumbers: () => void;
  cycleSeparator: () => void;
  toggleCueRail: () => void;
  toggleNoteStrips: () => void;
}

const CTX = "choreo" as const;
const noop = () => {};

/**
 * The keymap. `1`–`9` are free at the top level (the global trifecta puts
 * modules on Ctrl, props on Alt, themes on Shift), so plain digits address rows.
 */
export function createChoreoShortcuts(
  handlers: ChoreoShortcutHandlers
): ShortcutRegistrationOptions[] {
  const rowJumps: ShortcutRegistrationOptions[] = Array.from({ length: 9 }, (_, i) => ({
    id: `choreo.select-row-${i + 1}`,
    label: `Select row ${i + 1}`,
    description: `Select the ${i + 1}${i === 0 ? "st" : i === 1 ? "nd" : i === 2 ? "rd" : "th"} sequence on the sheet`,
    key: String(i + 1),
    context: CTX,
    scope: "selection",
    action: () => handlers.selectRowAt(i),
  }));

  return [
    // ── Rows ────────────────────────────────────────────────────────────────
    {
      id: "choreo.select-prev",
      label: "Previous sequence",
      description: "Move the selection up one row",
      key: "ArrowUp",
      context: CTX,
      scope: "selection",
      priority: "high",
      action: handlers.selectPrevRow,
    },
    {
      id: "choreo.select-next",
      label: "Next sequence",
      description: "Move the selection down one row",
      key: "ArrowDown",
      context: CTX,
      scope: "selection",
      priority: "high",
      action: handlers.selectNextRow,
    },
    {
      id: "choreo.move-up",
      label: "Move sequence up",
      description: "Reorder the selected sequence one place earlier",
      key: "ArrowUp",
      modifiers: ["alt"],
      context: CTX,
      scope: "editing",
      priority: "high",
      action: handlers.moveSelectedUp,
    },
    {
      id: "choreo.move-down",
      label: "Move sequence down",
      description: "Reorder the selected sequence one place later",
      key: "ArrowDown",
      modifiers: ["alt"],
      context: CTX,
      scope: "editing",
      priority: "high",
      action: handlers.moveSelectedDown,
    },
    {
      id: "choreo.remove",
      label: "Remove sequence",
      description: "Take the selected sequence off the sheet",
      key: "Delete",
      context: CTX,
      scope: "editing",
      action: handlers.removeSelected,
    },
    {
      id: "choreo.remove-backspace",
      label: "Remove sequence (Backspace)",
      description: "Take the selected sequence off the sheet",
      key: "Backspace",
      context: CTX,
      scope: "editing",
      action: handlers.removeSelected,
    },
    ...rowJumps,

    // ── The act ─────────────────────────────────────────────────────────────
    // Unshifted single keys, NOT Ctrl combos. Ctrl+E (omnibox search) and Ctrl+O
    // (open file, and an OS binding on some Windows setups) are reserved by the
    // browser — preventDefault never gets a say — and Ctrl+S is a coin flip.
    // A shortcut that silently loses to the browser is worse than no shortcut,
    // so the act's actions take the letters that match them instead.
    {
      id: "choreo.save",
      label: "Save sheet",
      description: "Save the act",
      key: "s",
      context: CTX,
      scope: "action",
      priority: "high",
      action: handlers.save,
    },
    {
      id: "choreo.export",
      label: "Export PDF",
      description: "Export the sheet as a PDF",
      key: "e",
      context: CTX,
      scope: "action",
      priority: "high",
      action: handlers.exportPdf,
    },
    {
      id: "choreo.acts",
      label: "Saved acts",
      description: "Open or close the saved-acts drawer",
      key: "o",
      context: CTX,
      scope: "panel",
      priority: "high",
      action: handlers.toggleActs,
    },
    {
      id: "choreo.add-sequences",
      label: "Add sequences",
      description: "Open or close the sequence picker",
      key: "a",
      context: CTX,
      scope: "panel",
      action: handlers.toggleBrowse,
    },
    {
      id: "choreo.play",
      label: "Play act",
      description: "Play the whole sheet as one sequence",
      key: "Space", // Normalized name; a raw " " never matches
      context: CTX,
      scope: "playback",
      priority: "high",
      action: handlers.togglePlayer,
    },

    // ── Stage ───────────────────────────────────────────────────────────────
    {
      id: "choreo.zoom-in",
      label: "Zoom in",
      description: "Draw the page larger",
      key: "=",
      context: CTX,
      scope: "view",
      action: handlers.zoomIn,
    },
    {
      id: "choreo.zoom-out",
      label: "Zoom out",
      description: "Draw the page smaller",
      key: "-",
      context: CTX,
      scope: "view",
      action: handlers.zoomOut,
    },
    {
      id: "choreo.zoom-fit",
      label: "Fit page",
      description: "Reset the zoom so the whole page is visible",
      key: "0",
      context: CTX,
      scope: "view",
      action: handlers.zoomReset,
    },
    {
      id: "choreo.toggle-rail",
      label: "Toggle rail",
      description: "Collapse or expand the sequence rail",
      key: "r",
      context: CTX,
      scope: "view",
      action: handlers.toggleRail,
    },

    // ── Layout ──────────────────────────────────────────────────────────────
    {
      id: "choreo.size-down",
      label: "Smaller pictographs",
      description: "Step the pictograph size down (more columns)",
      key: "[",
      context: CTX,
      scope: "view",
      action: handlers.pictographSizeDown,
    },
    {
      id: "choreo.size-up",
      label: "Larger pictographs",
      description: "Step the pictograph size up (fewer columns)",
      key: "]",
      context: CTX,
      scope: "view",
      action: handlers.pictographSizeUp,
    },
    // `s` and `o` belong to Save and Open acts; the layout toggles they used to
    // hold move to the next-best letters (stYle, Turn the page).
    {
      id: "choreo.toggle-packing",
      label: "Sheet style",
      description: "Switch between Study (dense) and Annotated",
      key: "y",
      context: CTX,
      scope: "view",
      action: handlers.togglePacking,
    },
    {
      id: "choreo.toggle-orientation",
      label: "Orientation",
      description: "Switch between landscape and portrait",
      key: "t",
      context: CTX,
      scope: "view",
      action: handlers.toggleOrientation,
    },
    {
      id: "choreo.toggle-step-numbers",
      label: "Step numbers",
      description: "Show or hide the step number in each cell",
      key: "n",
      context: CTX,
      scope: "view",
      action: handlers.toggleStepNumbers,
    },
    {
      id: "choreo.cycle-separator",
      label: "Group separator",
      description: "Cycle the sequence separator: line, gap, none",
      key: "g",
      context: CTX,
      scope: "view",
      action: handlers.cycleSeparator,
    },
    {
      id: "choreo.toggle-cue-rail",
      label: "Cue rail",
      description: "Show or hide the timestamp rail",
      key: "c",
      context: CTX,
      scope: "view",
      action: handlers.toggleCueRail,
    },
    {
      id: "choreo.toggle-note-strips",
      label: "Note strips",
      description: "Show or hide the per-row note strips",
      key: "m",
      context: CTX,
      scope: "view",
      action: handlers.toggleNoteStrips,
    },
  ];
}

/** Static pass: same definitions, inert actions. */
export function registerChoreoShortcuts(service: KeyboardShortcutManager): void {
  const inert: ChoreoShortcutHandlers = {
    selectPrevRow: noop,
    selectNextRow: noop,
    selectRowAt: noop,
    moveSelectedUp: noop,
    moveSelectedDown: noop,
    removeSelected: noop,
    save: noop,
    exportPdf: noop,
    toggleActs: noop,
    togglePlayer: noop,
    toggleBrowse: noop,
    toggleRail: noop,
    zoomIn: noop,
    zoomOut: noop,
    zoomReset: noop,
    pictographSizeDown: noop,
    pictographSizeUp: noop,
    togglePacking: noop,
    toggleOrientation: noop,
    toggleStepNumbers: noop,
    cycleSeparator: noop,
    toggleCueRail: noop,
    toggleNoteStrips: noop,
  };
  for (const shortcut of createChoreoShortcuts(inert)) service.register(shortcut);
}
