import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  activateEditHistoryShortcutTarget,
  canActivateEditHistoryShortcutTarget,
  getEditHistoryShortcutActionLabel,
  hasEditHistoryShortcutTarget,
  resolveEditHistoryShortcutTarget,
} from "#lib/shared/keyboard/domain/edit-history-shortcut-target.js";
import { registerEditHistoryShortcuts } from "#lib/shared/keyboard/registration/register-edit-history-shortcuts.js";
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

function appendTarget(
  action: "undo" | "redo",
  parent: HTMLElement = testDocument.body
): HTMLButtonElement {
  const target = testDocument.createElement("button");
  target.setAttribute(`data-${action}-shortcut`, "");
  makeVisible(target);
  parent.append(target);
  return target;
}

let testDocument: Document;

beforeEach(() => {
  document.body.replaceChildren();
  testDocument = document.implementation.createHTMLDocument();
});

describe("edit history shortcut target", () => {
  it("leaves native history alone without an editor target", () => {
    expect(hasEditHistoryShortcutTarget("undo", testDocument)).toBe(false);
  });

  it("activates the visible history button", () => {
    const undo = appendTarget("undo");
    const click = vi.spyOn(undo, "click");

    expect(activateEditHistoryShortcutTarget("undo", testDocument)).toBe(true);
    expect(click).toHaveBeenCalledOnce();
  });

  it("claims a disabled history target without activating it", () => {
    const undo = appendTarget("undo");
    undo.disabled = true;
    const click = vi.spyOn(undo, "click");

    expect(hasEditHistoryShortcutTarget("undo", testDocument)).toBe(true);
    expect(canActivateEditHistoryShortcutTarget("undo", testDocument)).toBe(
      false
    );
    expect(activateEditHistoryShortcutTarget("undo", testDocument)).toBe(true);
    expect(click).not.toHaveBeenCalled();
  });

  it("preserves the native undo stack while a text field has focus", () => {
    appendTarget("undo");
    const input = testDocument.createElement("input");
    testDocument.body.append(input);
    setActiveElement(input);

    expect(resolveEditHistoryShortcutTarget("undo", testDocument)).toBeNull();
  });

  it("lets the top modal own history instead of the page behind it", () => {
    appendTarget("undo");
    const dialog = testDocument.createElement("dialog");
    dialog.setAttribute("open", "");
    makeVisible(dialog);
    const modalUndo = appendTarget("undo", dialog);
    testDocument.body.append(dialog);

    expect(resolveEditHistoryShortcutTarget("undo", testDocument)).toBe(
      modalUndo
    );
  });

  it("blocks background history when the top modal has no target", () => {
    appendTarget("undo");
    const dialog = testDocument.createElement("dialog");
    dialog.setAttribute("open", "");
    makeVisible(dialog);
    testDocument.body.append(dialog);

    expect(resolveEditHistoryShortcutTarget("undo", testDocument)).toBeNull();
  });

  it("keeps a focused nested editor from falling through to its parent", () => {
    appendTarget("undo");
    const editor = testDocument.createElement("section");
    editor.setAttribute("data-edit-history-shortcut-scope", "");
    const input = testDocument.createElement("button");
    const nestedUndo = appendTarget("undo", editor);
    editor.prepend(input);
    testDocument.body.append(editor);
    setActiveElement(input);

    expect(resolveEditHistoryShortcutTarget("undo", testDocument)).toBe(
      nestedUndo
    );
  });

  it("reads the pending action label from the active target", () => {
    const undo = appendTarget("undo");
    undo.setAttribute("data-undo-shortcut-label", "Move clip");

    expect(getEditHistoryShortcutActionLabel("undo", testDocument)).toBe(
      "Move clip"
    );
  });

  it("can resolve the page action through the open command palette", () => {
    const undo = appendTarget("undo");
    const click = vi.spyOn(undo, "click");
    const palette = testDocument.createElement("dialog");
    palette.className = "command-palette-modal";
    palette.setAttribute("open", "");
    makeVisible(palette);
    const search = testDocument.createElement("input");
    palette.append(search);
    testDocument.body.append(palette);
    setActiveElement(search);

    expect(
      canActivateEditHistoryShortcutTarget("undo", testDocument, {
        fromCommandPalette: true,
      })
    ).toBe(true);
    expect(
      activateEditHistoryShortcutTarget("undo", testDocument, {
        fromCommandPalette: true,
      })
    ).toBe(true);
    expect(click).toHaveBeenCalledOnce();
  });
});

describe("app-wide edit history registration", () => {
  function setup(isMac = false) {
    document.body.innerHTML = `
      <button data-undo-shortcut>Undo</button>
      <button data-redo-shortcut>Redo</button>
    `;
    const undo = document.querySelector<HTMLButtonElement>(
      "button[data-undo-shortcut]"
    )!;
    const redo = document.querySelector<HTMLButtonElement>(
      "button[data-redo-shortcut]"
    )!;
    makeVisible(undo);
    makeVisible(redo);
    const manager = new KeyboardShortcutManager(new ShortcutRegistry());
    manager.initialize();
    registerEditHistoryShortcuts(manager, isMac);
    return { manager, undo, redo };
  }

  it("runs Ctrl+Z through the active Undo button", () => {
    const { manager, undo } = setup();
    const click = vi.spyOn(undo, "click");
    const event = new KeyboardEvent("keydown", {
      key: "z",
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });

    window.dispatchEvent(event);

    expect(click).toHaveBeenCalledOnce();
    expect(event.defaultPrevented).toBe(true);
    manager.dispose();
  });

  it("supports Ctrl+Shift+Z and Ctrl+Y for Redo on Windows", () => {
    const { manager, redo } = setup();
    const click = vi.spyOn(redo, "click");

    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "z",
        ctrlKey: true,
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      })
    );
    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "y",
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      })
    );

    expect(click).toHaveBeenCalledTimes(2);
    manager.dispose();
  });

  it("supports Command+Shift+Z for Redo on macOS", () => {
    const { manager, redo } = setup(true);
    const click = vi.spyOn(redo, "click");

    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "z",
        metaKey: true,
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      })
    );

    expect(click).toHaveBeenCalledOnce();
    manager.dispose();
  });

  it("does not intercept text-field undo", () => {
    const { manager, undo } = setup();
    const click = vi.spyOn(undo, "click");
    const input = document.createElement("input");
    document.body.append(input);
    Object.defineProperty(document, "activeElement", {
      configurable: true,
      value: input,
    });
    const event = new KeyboardEvent("keydown", {
      key: "z",
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });

    input.dispatchEvent(event);

    expect(click).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
    manager.dispose();
  });
  it("skips a nearer bridge that has nothing to undo", () => {
    // The Stage embeds the shared 3D scene rail inside its own editor scope, so
    // two undo bridges live in one scope: the rail's, which sits deeper in the
    // tree, and the module's. When the viewer has no history its bridge is
    // disabled, and picking the nearest one regardless left Ctrl+Z doing
    // nothing at all while the Stage had edits waiting.
    const scope = testDocument.createElement("div");
    scope.setAttribute("data-edit-history-shortcut-scope", "");
    testDocument.body.append(scope);

    const moduleUndo = appendTarget("undo", scope);

    const railHost = testDocument.createElement("div");
    scope.append(railHost);
    const railUndo = appendTarget("undo", railHost);
    railUndo.disabled = true;

    const focusHost = testDocument.createElement("div");
    railHost.append(focusHost);
    setActiveElement(focusHost);

    expect(resolveEditHistoryShortcutTarget("undo", testDocument)).toBe(
      moduleUndo
    );
    expect(canActivateEditHistoryShortcutTarget("undo", testDocument)).toBe(
      true
    );
  });

  it("still picks the nearest bridge when both have history", () => {
    const scope = testDocument.createElement("div");
    scope.setAttribute("data-edit-history-shortcut-scope", "");
    testDocument.body.append(scope);

    appendTarget("undo", scope);
    const railHost = testDocument.createElement("div");
    scope.append(railHost);
    const railUndo = appendTarget("undo", railHost);

    const focusHost = testDocument.createElement("div");
    railHost.append(focusHost);
    setActiveElement(focusHost);

    expect(resolveEditHistoryShortcutTarget("undo", testDocument)).toBe(
      railUndo
    );
  });
});
