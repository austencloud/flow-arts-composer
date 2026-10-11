/**
 * Assemble Keyboard Dispatcher
 *
 * Turns a parsed {@link KeyboardAction} into the matching {@link AssembleState}
 * mutation, and wires the window keydown/keyup listeners that feed it.
 *
 * This is the single source of the numpad-building behaviour. Both the Create
 * module's Assemble tab (`AssembleToolPanel`) and the standalone lab module
 * consume it — no surface re-implements the dispatch switch or the listener.
 *
 * The pure parsing (event.code -> KeyboardAction, grid-mode filtering) lives in
 * `assemble-keyboard-handler.ts`; this module owns the side-effecting half.
 */

import { browser } from "$app/env";
import {
  HandSide,
  Orientation,
  RotationDirection,
} from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import { getKeyboardShortcutManager } from "#lib/shared/keyboard/get-keyboard-shortcut-manager.js";
import type { AssembleState } from "../state/assemble-state.svelte";
import {
  handleAssembleKeyDown,
  type KeyboardAction,
} from "./assemble-keyboard-handler";

// Turn cycling order for NumpadAdd / NumpadSubtract. Float (-0.5) sits first so
// turnUp from float lands on 0, and turnDown from 0 wraps to the top of the list.
const TURN_SEQUENCE = [-0.5, 0, 0.5, 1, 1.5, 2, 2.5, 3] as const;
type TurnValue = (typeof TURN_SEQUENCE)[number];
const isTurnValue = (value: number): value is TurnValue =>
  (TURN_SEQUENCE as readonly number[]).includes(value);

// Orientation cycling order for NumpadDivide.
const ORIENTATION_SEQUENCE = [
  Orientation.IN,
  Orientation.OUT,
  Orientation.CLOCK,
  Orientation.COUNTER,
] as const;
type OrientationValue = (typeof ORIENTATION_SEQUENCE)[number];
const isOrientationValue = (value: Orientation): value is OrientationValue =>
  (ORIENTATION_SEQUENCE as readonly Orientation[]).includes(value);

export interface AssembleKeyboardHooks {
  /**
   * Called just before a position key adds/places a prop, when the action is
   * NOT blocked by the step cap. The lab uses this to capture press timing.
   */
  onPositionKeydown?: () => void;

  /**
   * Beat/step-cap gate, mirroring InteractiveGrid's mouse path. Consulted only
   * for position keys while a prop is already placed (placing/building phase
   * with a current position). Return true to block the add and skip it.
   */
  onStepCapExceeded?: () => boolean;

  /** Forwarded keyup handler (the lab uses it to close hold-duration timing). */
  onKeyUp?: (e: KeyboardEvent) => void;

  /** When true, all keys are ignored (e.g. a modal/nudge is open). */
  isModalOpen?: () => boolean;
}

/**
 * Apply a parsed keyboard action to the builder state. Pure routing — the only
 * side effects are the optional hooks and the builderState mutations.
 */
export function dispatchAssembleKeyboardAction(
  builderState: AssembleState,
  action: KeyboardAction,
  hooks?: AssembleKeyboardHooks
): void {
  switch (action.type) {
    case "position": {
      if (!action.location) break;
      // Honour the step cap exactly where the mouse path does: only when a prop
      // is already down and we're adding a motion (not the first placement).
      if (
        hooks?.onStepCapExceeded &&
        builderState.stepEditMode === null &&
        (builderState.phase === "placing" ||
          builderState.phase === "building") &&
        builderState.currentPosition !== null
      ) {
        if (hooks.onStepCapExceeded()) break;
      }
      hooks?.onPositionKeydown?.();
      builderState.handlePointClick(action.location);
      break;
    }
    case "turnUp": {
      const turn = builderState.turnCount;
      const idx = isTurnValue(turn) ? TURN_SEQUENCE.indexOf(turn) : -1;
      const next = idx < TURN_SEQUENCE.length - 1 ? idx + 1 : 1;
      builderState.setTurnCount(TURN_SEQUENCE[next]!);
      break;
    }
    case "turnDown": {
      const turn = builderState.turnCount;
      const idx = isTurnValue(turn) ? TURN_SEQUENCE.indexOf(turn) : -1;
      const next = idx > 0 ? idx - 1 : TURN_SEQUENCE.length - 1;
      builderState.setTurnCount(TURN_SEQUENCE[next]!);
      break;
    }
    case "toggleRotation":
      builderState.setRotationDirection(
        builderState.rotationDirection === RotationDirection.CLOCKWISE
          ? RotationDirection.COUNTER_CLOCKWISE
          : RotationDirection.CLOCKWISE
      );
      break;
    case "cycleOrientation": {
      const ori = builderState.currentOrientation;
      const oriIdx = isOrientationValue(ori)
        ? ORIENTATION_SEQUENCE.indexOf(ori)
        : -1;
      const nextOri = (oriIdx + 1) % ORIENTATION_SEQUENCE.length;
      builderState.setOrientation(ORIENTATION_SEQUENCE[nextOri]!);
      break;
    }
    case "switchHand":
      builderState.switchToHand(
        builderState.activeHand === HandSide.LEFT
          ? HandSide.RIGHT
          : HandSide.LEFT
      );
      break;
    case "undo":
      builderState.undoStep();
      break;
    case "finish":
      if (builderState.canFinishHand) builderState.finishHand();
      break;
  }
}

/**
 * Attach window keydown/keyup listeners that parse numpad input and dispatch it
 * to the builder. Returns a cleanup function — call it from an `$effect` so the
 * listeners live exactly as long as keyboard mode is active and the consuming
 * component is mounted.
 */
export function attachAssembleKeyboard(
  builderState: AssembleState,
  hooks?: AssembleKeyboardHooks
): () => void {
  function onKeyDown(e: KeyboardEvent): void {
    const target = e.target as HTMLElement | null;
    const isInputFocused =
      target?.tagName === "INPUT" ||
      target?.tagName === "TEXTAREA" ||
      target?.isContentEditable === true;

    const action = handleAssembleKeyDown(e, {
      gridMode: builderState.gridMode,
      showCenter: builderState.showCenter,
      isModalOpen: hooks?.isModalOpen?.() ?? false,
      isInputFocused,
    });

    if (action) {
      e.preventDefault();
      dispatchAssembleKeyboardAction(builderState, action, hooks);
    }
  }

  function onKeyUp(e: KeyboardEvent): void {
    hooks?.onKeyUp?.(e);
  }

  // While numpad building owns the keyboard, stop the global shortcut manager
  // (capture-phase, matches by event.key) from also acting on numpad keys. With
  // NumLock OFF the numpad emits Arrow/Delete/Enter that collide with
  // create-module shortcuts — most dangerously NumpadDecimal -> Delete ->
  // "delete selected beat". Suppress by event.code, which is NumLock-independent.
  const releaseSuppressor = browser
    ? getKeyboardShortcutManager().addInputSuppressor((ev) =>
        ev.code.startsWith("Numpad")
      )
    : undefined;

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);

  return () => {
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    releaseSuppressor?.();
  };
}
