import { afterEach, describe, expect, it, vi } from "vitest";
import { isEditableKeyboardTarget } from "#lib/shared/keyboard/domain/shortcut-target-resolution.js";
import { KeyboardShortcutManager } from "#lib/shared/keyboard/services/keyboard-shortcut-manager.js";
import { ShortcutRegistry } from "#lib/shared/keyboard/services/shortcut-registry.js";

let manager: KeyboardShortcutManager | null = null;

afterEach(() => {
  manager?.dispose();
  manager = null;
});

describe("isEditableKeyboardTarget", () => {
  it("recognizes text entry controls and contenteditable descendants", () => {
    const testDocument = document.implementation.createHTMLDocument();
    const input = testDocument.createElement("input");
    const textarea = testDocument.createElement("textarea");
    const select = testDocument.createElement("select");
    const editable = testDocument.createElement("div");
    const editableChild = testDocument.createElement("span");
    editable.setAttribute("contenteditable", "true");
    editable.appendChild(editableChild);

    expect(isEditableKeyboardTarget(input)).toBe(true);
    expect(isEditableKeyboardTarget(textarea)).toBe(true);
    expect(isEditableKeyboardTarget(select)).toBe(true);
    expect(isEditableKeyboardTarget(editableChild)).toBe(true);
  });

  it("does not classify non-text controls as typing targets", () => {
    const testDocument = document.implementation.createHTMLDocument();
    const button = testDocument.createElement("button");
    const checkbox = testDocument.createElement("input");
    checkbox.type = "checkbox";

    expect(isEditableKeyboardTarget(button)).toBe(false);
    expect(isEditableKeyboardTarget(checkbox)).toBe(false);
    expect(isEditableKeyboardTarget(null)).toBe(false);
  });

  it("keeps printable text input ahead of forced app shortcuts", () => {
    const action = vi.fn();
    manager = new KeyboardShortcutManager(new ShortcutRegistry());
    manager.register({
      id: "forced-letter",
      label: "Forced letter shortcut",
      key: "s",
      forceExecute: true,
      action,
    });
    const textarea = document.implementation
      .createHTMLDocument()
      .createElement("textarea");
    const event = new KeyboardEvent("keydown", {
      key: "s",
      code: "KeyS",
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(event, "target", { value: textarea });
    (
      manager as unknown as {
        handleKeydown(event: KeyboardEvent): void;
      }
    ).handleKeydown(event);

    expect(action).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it("still allows deliberate modifier shortcuts from a text field", () => {
    const action = vi.fn();
    manager = new KeyboardShortcutManager(new ShortcutRegistry());
    manager.register({
      id: "command-palette",
      label: "Command palette",
      key: "k",
      modifiers: ["ctrl"],
      forceExecute: true,
      action,
    });

    const textarea = document.implementation
      .createHTMLDocument()
      .createElement("textarea");
    const event = new KeyboardEvent("keydown", {
      key: "k",
      code: "KeyK",
      ctrlKey: true,
      cancelable: true,
    });
    Object.defineProperty(event, "target", { value: textarea });
    (
      manager as unknown as {
        handleKeydown(event: KeyboardEvent): void;
      }
    ).handleKeydown(event);

    expect(action).toHaveBeenCalledOnce();
    expect(event.defaultPrevented).toBe(true);
  });
});
