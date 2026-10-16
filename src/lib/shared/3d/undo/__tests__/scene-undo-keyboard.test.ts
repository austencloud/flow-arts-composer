import { afterEach, describe, expect, it, vi } from "vitest";
import { attachSceneUndoKeyboard } from "../scene-undo-keyboard";
import type { SceneUndoManager } from "../scene-undo-manager";

const undo = vi.fn(() => ({ description: "Move performer" }));
const redo = vi.fn(() => ({ description: "Move performer" }));
const manager = { undo, redo } as unknown as SceneUndoManager;
let detach: (() => void) | null = null;

function press(
  key: string,
  options: KeyboardEventInit = {},
  target: HTMLElement = document.body
) {
  const event = new KeyboardEvent("keydown", {
    key,
    ctrlKey: true,
    bubbles: true,
    cancelable: true,
    ...options,
  });
  target.dispatchEvent(event);
  return event;
}

afterEach(() => {
  detach?.();
  detach = null;
  undo.mockClear();
  redo.mockClear();
  document.body.replaceChildren();
});

describe("scene undo keyboard", () => {
  it("handles Ctrl+Z, uppercase Ctrl+Shift+Z, and Ctrl+Y", () => {
    const onUndo = vi.fn();
    const onRedo = vi.fn();
    detach = attachSceneUndoKeyboard(manager, onUndo, onRedo);

    expect(press("z").defaultPrevented).toBe(true);
    expect(press("Z", { shiftKey: true }).defaultPrevented).toBe(true);
    expect(press("y").defaultPrevented).toBe(true);
    expect(undo).toHaveBeenCalledTimes(1);
    expect(redo).toHaveBeenCalledTimes(2);
    expect(onUndo).toHaveBeenCalledWith("Move performer");
    expect(onRedo).toHaveBeenCalledTimes(2);
  });

  it("leaves editable targets alone and detaches its listener", () => {
    detach = attachSceneUndoKeyboard(manager);
    const input = document.createElement("input");
    const editable = document.createElement("div");
    Object.defineProperty(editable, "isContentEditable", { value: true });
    document.body.append(input, editable);

    expect(press("z", {}, input).defaultPrevented).toBe(false);
    expect(press("z", {}, editable).defaultPrevented).toBe(false);
    expect(undo).not.toHaveBeenCalled();

    detach();
    detach = null;
    expect(press("z").defaultPrevented).toBe(false);
    expect(undo).not.toHaveBeenCalled();
  });
});
