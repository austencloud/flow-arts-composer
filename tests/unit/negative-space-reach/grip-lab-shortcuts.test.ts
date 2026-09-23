import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KeyboardShortcutManager } from "$lib/shared/keyboard/services/keyboard-shortcut-manager";
import { ShortcutRegistry } from "$lib/shared/keyboard/services/shortcut-registry";
import {
  createGripLabShortcuts,
  shouldIgnoreGripLabKey,
} from "../../../src/routes/test/grip-lab/grip-lab-shortcuts";

vi.mock("$lib/shared/keyboard/keyboard-shortcut-analytics", () => ({
  logKeyboardShortcutExecuted: vi.fn(),
  logKeyboardShortcutFailed: vi.fn(),
}));

let manager: KeyboardShortcutManager | undefined;
beforeEach(() => {
  document.body.innerHTML = "";
});
afterEach(() => {
  manager?.dispose();
  document.body.innerHTML = "";
});

function setup() {
  const actions = {
    onDelete: vi.fn(),
    onAdd: vi.fn(),
    onPlay: vi.fn(),
    onStep: vi.fn(),
    onNeighbor: vi.fn(),
    onStart: vi.fn(),
    onHelp: vi.fn(),
  };
  manager = new KeyboardShortcutManager(new ShortcutRegistry());
  for (const binding of createGripLabShortcuts(actions))
    manager.register(binding);
  manager.addInputSuppressor(shouldIgnoreGripLabKey);
  manager.initialize();
  return actions;
}
function press(target: Element, key: string, init: KeyboardEventInit = {}) {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
    ...init,
  });
  target.dispatchEvent(event);
  return event;
}

describe("Grip Lab shortcut ownership", () => {
  it("deletes from a focused keyframe, accepts Backspace, and ignores held Delete", () => {
    const actions = setup();
    document.body.innerHTML = "<button>Keyframe</button>";
    const marker = document.querySelector("button")!;
    expect(press(marker, "Delete").defaultPrevented).toBe(true);
    press(marker, "Backspace");
    press(marker, "Delete", { repeat: true });
    expect(actions.onDelete).toHaveBeenCalledTimes(2);
  });

  it("leaves text edits, slider arrows, and keys in dialogs with their controls", () => {
    const actions = setup();
    document.body.innerHTML =
      '<input type="number"><input type="range"><button>Timing</button><dialog open><button>Close</button></dialog>';
    const input = document.querySelector("input")!;
    expect(press(input, "Delete").defaultPrevented).toBe(false);
    press(input, "k");
    press(document.querySelector('input[type="range"]')!, "ArrowRight");
    press(document.querySelector("button")!, "ArrowRight");
    press(document.querySelector("dialog button")!, "Delete");
    expect(actions.onDelete).not.toHaveBeenCalled();
    expect(actions.onAdd).not.toHaveBeenCalled();
    expect(actions.onStep).not.toHaveBeenCalled();
  });

  it("scrubs only with neutral focus, navigates keys, and respects composition", () => {
    const actions = setup();
    press(document.body, "ArrowRight");
    press(document.body, "ArrowLeft", { repeat: true });
    press(document.body, "[");
    press(document.body, "]");
    press(document.body, "k", { isComposing: true });
    expect(actions.onStep.mock.calls).toEqual([[1], [-1]]);
    expect(actions.onNeighbor.mock.calls).toEqual([[-1], [1]]);
    expect(actions.onAdd).not.toHaveBeenCalled();
  });
});
