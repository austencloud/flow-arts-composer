import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  activateEscapeShortcutTarget,
  hasEscapeShortcutTarget,
  resolveEscapeShortcutTarget,
  shouldDeferEscapeShortcut,
} from "#lib/shared/keyboard/domain/escape-shortcut-target.js";

function makeVisible(element: HTMLElement): void {
  Object.defineProperty(element, "getClientRects", {
    configurable: true,
    value: () => ({ length: 1 }) as DOMRectList,
  });
}

function setActiveElement(document: Document, element: Element): void {
  Object.defineProperty(document, "activeElement", {
    configurable: true,
    value: element,
  });
}

function appendTarget(
  document: Document,
  parent: HTMLElement = document.body
): HTMLButtonElement {
  const target = document.createElement("button");
  target.setAttribute("data-escape-shortcut", "");
  makeVisible(target);
  parent.append(target);
  return target;
}

let testDocument: Document;

beforeEach(() => {
  testDocument = document.implementation.createHTMLDocument();
});

describe("Escape shortcut target", () => {
  it("activates the visible page-level owner", () => {
    const target = appendTarget(testDocument);
    const click = vi.spyOn(target, "click");

    expect(activateEscapeShortcutTarget(testDocument)).toBe(true);
    expect(click).toHaveBeenCalledOnce();
  });

  it("blocks background targets when a modal owns the page", () => {
    appendTarget(testDocument);
    const dialog = testDocument.createElement("dialog");
    dialog.setAttribute("open", "");
    makeVisible(dialog);
    testDocument.body.append(dialog);

    expect(resolveEscapeShortcutTarget(testDocument)).toBeNull();
  });

  it("lets a focused expanded control handle Escape first", () => {
    appendTarget(testDocument);
    const trigger = testDocument.createElement("button");
    trigger.setAttribute("aria-expanded", "true");
    testDocument.body.append(trigger);
    setActiveElement(testDocument, trigger);

    expect(shouldDeferEscapeShortcut(testDocument)).toBe(true);
    expect(hasEscapeShortcutTarget(testDocument)).toBe(false);
  });

  it("lets a focused input keep its local cancellation behavior", () => {
    appendTarget(testDocument);
    const input = testDocument.createElement("input");
    testDocument.body.append(input);
    setActiveElement(testDocument, input);

    expect(resolveEscapeShortcutTarget(testDocument)).toBeNull();
  });

  it("defers the first Escape press to browser fullscreen", () => {
    appendTarget(testDocument);
    Object.defineProperty(testDocument, "fullscreenElement", {
      configurable: true,
      value: testDocument.body,
    });

    expect(shouldDeferEscapeShortcut(testDocument)).toBe(true);
    expect(resolveEscapeShortcutTarget(testDocument)).toBeNull();
  });

  it("keeps a focused nested view from closing its parent", () => {
    appendTarget(testDocument);
    const child = testDocument.createElement("section");
    child.setAttribute("data-escape-shortcut-scope", "");
    const focusTarget = testDocument.createElement("button");
    child.append(focusTarget);
    testDocument.body.append(child);
    setActiveElement(testDocument, focusTarget);

    expect(resolveEscapeShortcutTarget(testDocument)).toBeNull();
  });
});
