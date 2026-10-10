/**
 * Register Stage Shortcuts
 *
 * Static registration at app startup so every binding shows up in the `?` help
 * overlay and in Settings → Keyboard Shortcuts (where it can be rebound, with
 * conflict detection). The actions are no-ops here; StageModule re-registers the
 * same ids with real handlers when it mounts — the manager updates the action of
 * an already-registered id. Same seam register-choreo-shortcuts.ts uses.
 *
 * Looping is not here either: the Stage transport has no loop yet
 * (stage-choreography-state's toggleLoop is a documented v1 no-op), and a
 * binding listed in Settings that does nothing is worse than no binding.
 *
 * Undo and redo are NOT here: Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y are owned globally
 * by register-edit-history-shortcuts.ts, which routes to whichever editor is on
 * screen through EditHistoryShortcutBridge. The Stage renders that bridge.
 *
 * Side-effectful registration/orchestration — lives in registration/, not utils/.
 */

import type { KeyboardShortcutManager } from "#lib/shared/keyboard/services/keyboard-shortcut-manager.js";
import type { ShortcutRegistrationOptions } from "../domain/types/keyboard-types";

/** Every action the Stage binds. StageModule supplies the implementations. */
export interface StageShortcutHandlers {
  togglePlay: () => void;
  stepBack: () => void;
  stepForward: () => void;
  jumpBack: () => void;
  jumpForward: () => void;
  firstCount: () => void;
  lastCount: () => void;
  previousSet: () => void;
  nextSet: () => void;
  toggleChart: () => void;
  addSet: () => void;
  deleteSelection: () => void;
}

const CTX = "stage" as const;
const noop = () => {};

/**
 * The keymap. A show is read in counts, so the arrows walk the playhead and
 * the brackets jump between sets — the same relationship the timeline draws.
 *
 * Arrow keys are shared with the drill chart, where they nudge a focused spot
 * a quarter metre. The chart's spots carry `data-keyboard-shortcuts-ignore`,
 * so a focused spot owns the arrows and the playhead only moves when nothing
 * in the chart has focus.
 */
export function createStageShortcuts(
  handlers: StageShortcutHandlers
): ShortcutRegistrationOptions[] {
  return [
    // ── Playback ────────────────────────────────────────────────────────────
    {
      id: "stage.play",
      label: "Play / pause",
      description: "Run the show from the playhead, or stop it",
      key: "Space", // Normalized name; a raw " " never matches
      context: CTX,
      scope: "playback",
      priority: "high",
      action: handlers.togglePlay,
    },
    {
      id: "stage.step-back",
      label: "Back one count",
      description: "Move the playhead back a single count",
      key: "ArrowLeft",
      context: CTX,
      scope: "playback",
      priority: "high",
      action: handlers.stepBack,
    },
    {
      id: "stage.step-forward",
      label: "Forward one count",
      description: "Move the playhead on a single count",
      key: "ArrowRight",
      context: CTX,
      scope: "playback",
      priority: "high",
      action: handlers.stepForward,
    },
    // Eight counts, because that is the unit a drill is written in.
    {
      id: "stage.jump-back",
      label: "Back eight counts",
      description: "Move the playhead back a full eight",
      key: "ArrowLeft",
      modifiers: ["shift"],
      context: CTX,
      scope: "playback",
      priority: "high",
      action: handlers.jumpBack,
    },
    {
      id: "stage.jump-forward",
      label: "Forward eight counts",
      description: "Move the playhead on a full eight",
      key: "ArrowRight",
      modifiers: ["shift"],
      context: CTX,
      scope: "playback",
      priority: "high",
      action: handlers.jumpForward,
    },
    {
      id: "stage.first-count",
      label: "Top of the show",
      description: "Send the playhead to count one",
      key: "Home",
      context: CTX,
      scope: "playback",
      action: handlers.firstCount,
    },
    {
      id: "stage.last-count",
      label: "End of the show",
      description: "Send the playhead to the final count",
      key: "End",
      context: CTX,
      scope: "playback",
      action: handlers.lastCount,
    },

    // ── Sets ────────────────────────────────────────────────────────────────
    {
      id: "stage.previous-set",
      label: "Previous set",
      description: "Jump the playhead to the set before this one",
      key: "[",
      context: CTX,
      scope: "selection",
      action: handlers.previousSet,
    },
    {
      id: "stage.next-set",
      label: "Next set",
      description: "Jump the playhead to the set after this one",
      key: "]",
      context: CTX,
      scope: "selection",
      action: handlers.nextSet,
    },
    {
      id: "stage.add-set",
      label: "Add a set",
      description: "Drop a set on the playhead with the cast where it stands",
      key: "s",
      context: CTX,
      scope: "editing",
      action: handlers.addSet,
    },
    {
      // Keep the historical id so a customized binding survives the command
      // becoming selection-aware.
      id: "stage.remove-set",
      label: "Delete selection",
      description: "Remove the selected performer, sequence, set, or timing",
      key: "Delete",
      context: CTX,
      scope: "editing",
      action: handlers.deleteSelection,
    },
    {
      id: "stage.remove-set-backspace",
      label: "Delete selection (Backspace)",
      description: "Remove the selected performer, sequence, set, or timing",
      key: "Backspace",
      context: CTX,
      scope: "editing",
      action: handlers.deleteSelection,
    },

    // ── The chart ───────────────────────────────────────────────────────────
    {
      id: "stage.chart",
      label: "Drill chart",
      description: "Raise or lower the overhead chart of the stage",
      key: "t",
      context: CTX,
      scope: "view",
      priority: "high",
      action: handlers.toggleChart,
    },
  ];
}

/**
 * The do-nothing set. Boot registers these so the bindings are listed and
 * rebindable before any Stage exists, and an unmounting StageModule puts them
 * back so its handlers cannot outlive its document.
 */
export function createInertStageHandlers(): StageShortcutHandlers {
  return {
    togglePlay: noop,
    stepBack: noop,
    stepForward: noop,
    jumpBack: noop,
    jumpForward: noop,
    firstCount: noop,
    lastCount: noop,
    previousSet: noop,
    nextSet: noop,
    toggleChart: noop,
    addSet: noop,
    deleteSelection: noop,
  };
}

/** Static pass: same definitions, inert actions. */
export function registerStageShortcuts(service: KeyboardShortcutManager): void {
  const inert = createInertStageHandlers();
  // Skip anything a live Stage has already bound. Boot registration and a
  // mounted StageModule can land in the same tick on a route that renders both
  // (the /test/stage harness does), and the inert pass must never win that
  // race and leave the keys doing nothing.
  for (const shortcut of createStageShortcuts(inert)) {
    if (!service.isRegistered(shortcut.id)) service.register(shortcut);
  }
}
