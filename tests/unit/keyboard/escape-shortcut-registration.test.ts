import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerEscapeShortcut } from "#lib/shared/keyboard/registration/register-escape-shortcut.js";
import { KeyboardShortcutManager } from "#lib/shared/keyboard/services/keyboard-shortcut-manager.js";
import { ShortcutRegistry } from "#lib/shared/keyboard/services/shortcut-registry.js";
import { EscapeLayerManager } from "#lib/shared/keyboard/services/implementations/EscapeLayerManager.js";

function makeVisible(element: HTMLElement): void {
  Object.defineProperty(element, "getClientRects", {
    configurable: true,
    value: () => ({ length: 1 }) as DOMRectList,
  });
}

function dispatchEscape(): KeyboardEvent {
  const event = new KeyboardEvent("keydown", {
    key: "Escape",
    bubbles: true,
    cancelable: true,
  });
  window.dispatchEvent(event);
  return event;
}

let manager: KeyboardShortcutManager | null = null;

beforeEach(() => {
  document.body.replaceChildren();
  Object.defineProperty(document, "activeElement", {
    configurable: true,
    value: document.body,
  });
  Object.defineProperty(document, "fullscreenElement", {
    configurable: true,
    value: null,
  });
});

afterEach(() => {
  manager?.dispose();
  manager = null;
  document.body.replaceChildren();
});

function setup(escapeLayers = new EscapeLayerManager()): EscapeLayerManager {
  manager = new KeyboardShortcutManager(new ShortcutRegistry());
  manager.initialize();
  registerEscapeShortcut(manager, escapeLayers);
  return escapeLayers;
}

describe("global Escape registration", () => {
  it("does not consume Escape when nothing owns it", () => {
    setup();

    const event = dispatchEscape();

    expect(event.defaultPrevented).toBe(false);
  });

  it("dismisses one registered layer and consumes the event", () => {
    const layers = setup();
    const dismiss = vi.fn();
    layers.register({
      id: "modal",
      dismiss,
      canDismiss: () => true,
    });

    const event = dispatchEscape();

    expect(dismiss).toHaveBeenCalledOnce();
    expect(event.defaultPrevented).toBe(true);
  });

  it("consumes Escape without closing a blocked layer", () => {
    const layers = setup();
    const dismiss = vi.fn();
    layers.register({
      id: "modal",
      dismiss,
      canDismiss: () => false,
    });

    const event = dispatchEscape();

    expect(dismiss).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(true);
  });

  it("activates a page target when no layer is open", () => {
    setup();
    document.body.innerHTML = "<button data-escape-shortcut>Close</button>";
    const target = document.querySelector<HTMLButtonElement>(
      "button[data-escape-shortcut]"
    )!;
    makeVisible(target);
    const click = vi.spyOn(target, "click");

    dispatchEscape();

    expect(click).toHaveBeenCalledOnce();
  });

  it("does not close a layer while a focused popup owns Escape", () => {
    const layers = setup();
    const dismiss = vi.fn();
    layers.register({
      id: "drawer",
      dismiss,
      canDismiss: () => true,
    });
    document.body.innerHTML = '<div role="menu" tabindex="-1"></div>';
    const menu = document.querySelector<HTMLElement>("[role='menu']")!;
    Object.defineProperty(document, "activeElement", {
      configurable: true,
      value: menu,
    });

    const event = dispatchEscape();

    expect(dismiss).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });
});
