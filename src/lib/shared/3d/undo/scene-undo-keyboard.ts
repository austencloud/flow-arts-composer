import type { SceneUndoManager } from "./scene-undo-manager";

const TEXT_INPUT_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

export function attachSceneUndoKeyboard(
  manager: SceneUndoManager,
  onUndo?: (description: string) => void,
  onRedo?: (description: string) => void
): () => void {
  function handler(e: KeyboardEvent) {
    if (TEXT_INPUT_TAGS.has((e.target as HTMLElement)?.tagName)) return;
    if ((e.target as HTMLElement)?.isContentEditable) return;

    const isCtrlOrMeta = e.ctrlKey || e.metaKey;
    if (!isCtrlOrMeta) return;
    const key = e.key.toLowerCase();

    if (key === "z" && !e.shiftKey) {
      e.preventDefault();
      const result = manager.undo();
      if (result) onUndo?.(result.description);
    } else if ((key === "z" && e.shiftKey) || (key === "y" && !e.shiftKey)) {
      e.preventDefault();
      const result = manager.redo();
      if (result) onRedo?.(result.description);
    }
  }

  window.addEventListener("keydown", handler);
  return () => window.removeEventListener("keydown", handler);
}
