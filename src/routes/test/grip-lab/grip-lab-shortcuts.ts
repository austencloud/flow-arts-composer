import type { ShortcutRegistrationOptions } from "$lib/shared/keyboard/domain/types/keyboard-types";
import {
  isEditableKeyboardTarget,
  isLayerOwnedKeyboardTarget,
  isWidgetOwnedKeyboardTarget,
} from "$lib/shared/keyboard/domain/shortcut-target-resolution";

export interface GripLabShortcutActions {
  onDelete: () => void;
  onAdd: () => void;
  onPlay: () => void;
  onStep: (direction: -1 | 1) => void;
  onNeighbor: (direction: -1 | 1) => void;
  onStart: () => void;
  onHelp: () => void;
}

export function shouldIgnoreGripLabKey(event: KeyboardEvent): boolean {
  if (
    event.defaultPrevented ||
    event.isComposing ||
    isEditableKeyboardTarget(event.target) ||
    isLayerOwnedKeyboardTarget(event.target)
  )
    return true;
  // Holding Delete must not erase successive keys; held arrows may scrub.
  if (event.repeat && !["ArrowLeft", "ArrowRight"].includes(event.key))
    return true;
  return (
    ["ArrowLeft", "ArrowRight", "Home"].includes(event.key) &&
    isWidgetOwnedKeyboardTarget(event.target)
  );
}

export function createGripLabShortcuts(
  actions: GripLabShortcutActions
): ShortcutRegistrationOptions[] {
  return [
    {
      id: "grip-lab.delete",
      label: "Delete keyframe",
      key: "Delete",
      alternateBindings: [{ key: "Backspace", modifiers: [] }],
      action: actions.onDelete,
    },
    {
      id: "grip-lab.add",
      label: "Add keyframe",
      key: "k",
      action: actions.onAdd,
    },
    {
      id: "grip-lab.play",
      label: "Play / pause",
      key: "Space",
      action: actions.onPlay,
    },
    {
      id: "grip-lab.previous",
      label: "Previous keyframe",
      key: "[",
      action: () => actions.onNeighbor(-1),
    },
    {
      id: "grip-lab.next",
      label: "Next keyframe",
      key: "]",
      action: () => actions.onNeighbor(1),
    },
    {
      id: "grip-lab.backward",
      label: "Back 0.01",
      key: "ArrowLeft",
      action: () => actions.onStep(-1),
    },
    {
      id: "grip-lab.forward",
      label: "Forward 0.01",
      key: "ArrowRight",
      action: () => actions.onStep(1),
    },
    {
      id: "grip-lab.start",
      label: "Start of selected segment",
      key: "Home",
      action: actions.onStart,
    },
    {
      id: "grip-lab.help",
      label: "Show shortcuts",
      key: "/",
      modifiers: ["shift"],
      action: actions.onHelp,
    },
  ];
}
