import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  activateSaveShortcutTarget,
  hasSaveShortcutTarget,
  resolveSaveShortcutTarget,
} from "#lib/shared/keyboard/domain/save-shortcut-target.js";
import { registerSaveShortcut } from "#lib/shared/keyboard/registration/register-save-shortcut.js";
import { KeyboardShortcutManager } from "#lib/shared/keyboard/services/keyboard-shortcut-manager.js";
import { ShortcutRegistry } from "#lib/shared/keyboard/services/shortcut-registry.js";

function makeVisible(element: HTMLElement): void {
  Object.defineProperty(element, "getClientRects", {
    configurable: true,
    value: () => ({ length: 1 }) as DOMRectList,
  });
}

function setActiveElement(element: Element): void {
  Object.defineProperty(testDocument, "activeElement", {
    configurable: true,
    value: element,
  });
}

let testDocument: Document;

beforeEach(() => {
  testDocument = document.implementation.createHTMLDocument();
});

describe("save shortcut target", () => {
  it("leaves the browser shortcut available without an app Save surface", () => {
    expect(hasSaveShortcutTarget(testDocument)).toBe(false);
  });

  it("activates the visible Save button", () => {
    const save = testDocument.createElement("button");
    save.setAttribute("data-save-shortcut", "");
    makeVisible(save);
    testDocument.body.append(save);
    const click = vi.spyOn(save, "click");

    expect(activateSaveShortcutTarget(testDocument)).toBe(true);
    expect(click).toHaveBeenCalledOnce();
  });

  it("lets the top modal own Save instead of the page behind it", () => {
    const pageSave = testDocument.createElement("button");
    pageSave.setAttribute("data-save-shortcut", "");
    makeVisible(pageSave);

    const dialog = testDocument.createElement("dialog");
    dialog.setAttribute("open", "");
    makeVisible(dialog);
    const dialogSave = testDocument.createElement("button");
    dialogSave.setAttribute("data-save-shortcut", "");
    makeVisible(dialogSave);
    dialog.appendChild(dialogSave);
    testDocument.body.append(pageSave, dialog);

    expect(resolveSaveShortcutTarget(testDocument)).toBe(dialogSave);
  });

  it("does not fall through to a background Save while another modal is open", () => {
    const pageSave = testDocument.createElement("button");
    pageSave.setAttribute("data-save-shortcut", "");
    makeVisible(pageSave);

    const dialog = testDocument.createElement("dialog");
    dialog.setAttribute("open", "");
    makeVisible(dialog);
    testDocument.body.append(pageSave, dialog);

    expect(resolveSaveShortcutTarget(testDocument)).toBeNull();
  });

  it("does not fall through from a focused editor that owns its Save scope", () => {
    const pageSave = testDocument.createElement("button");
    pageSave.setAttribute("data-save-shortcut", "");
    makeVisible(pageSave);

    const editor = testDocument.createElement("section");
    editor.setAttribute("data-save-shortcut-scope", "");
    const input = testDocument.createElement("input");
    editor.appendChild(input);
    testDocument.body.append(pageSave, editor);
    setActiveElement(input);

    expect(resolveSaveShortcutTarget(testDocument)).toBeNull();
  });

  it("claims disabled Save surfaces without clicking them", () => {
    const save = testDocument.createElement("button");
    save.setAttribute("data-save-shortcut", "");
    save.disabled = true;
    makeVisible(save);
    testDocument.body.append(save);
    const click = vi.spyOn(save, "click");

    expect(activateSaveShortcutTarget(testDocument)).toBe(true);
    expect(click).not.toHaveBeenCalled();
  });

  it("chooses the inline Save nearest keyboard focus", () => {
    const first = testDocument.createElement("section");
    const firstInput = testDocument.createElement("input");
    const firstSave = testDocument.createElement("button");
    firstSave.setAttribute("data-save-shortcut", "");
    makeVisible(firstSave);
    first.appendChild(firstInput);
    first.appendChild(firstSave);

    const second = testDocument.createElement("section");
    const secondInput = testDocument.createElement("input");
    const secondSave = testDocument.createElement("button");
    secondSave.setAttribute("data-save-shortcut", "");
    makeVisible(secondSave);
    second.appendChild(secondInput);
    second.appendChild(secondSave);
    testDocument.body.append(first, second);
    setActiveElement(secondInput);

    expect(resolveSaveShortcutTarget(testDocument)).toBe(secondSave);
  });
});

describe("app-wide Save registration", () => {
  it("intercepts Ctrl+S and activates the current Save surface", () => {
    document.body.innerHTML = "<button data-save-shortcut>Save</button>";
    const save = document.querySelector<HTMLButtonElement>(
      "button[data-save-shortcut]"
    )!;
    makeVisible(save);
    const click = vi.spyOn(save, "click");
    const registry = new ShortcutRegistry();
    const manager = new KeyboardShortcutManager(registry);
    manager.initialize();
    registerSaveShortcut(manager, false);

    const event = new KeyboardEvent("keydown", {
      key: "s",
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    window.dispatchEvent(event);

    expect(click).toHaveBeenCalledOnce();
    expect(event.defaultPrevented).toBe(true);
    manager.dispose();
  });

  it("leaves Ctrl+S to the browser when no app Save surface is active", () => {
    document.body.replaceChildren();
    const registry = new ShortcutRegistry();
    const manager = new KeyboardShortcutManager(registry);
    manager.initialize();
    registerSaveShortcut(manager, false);

    const event = new KeyboardEvent("keydown", {
      key: "s",
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    manager.dispose();
  });
});
