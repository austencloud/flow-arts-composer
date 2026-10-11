import { describe, expect, it, vi } from "vitest";
import { handlePerformerCopyShortcut } from "#lib/shared/3d/domain/performer-copy-shortcuts.js";

describe("performer copy shortcuts", () => {
  it("handles Ctrl/Cmd+C and V only when the action succeeds", () => {
    const copy = vi.fn(() => true);
    const paste = vi.fn(() => false);
    const copyEvent = new KeyboardEvent("keydown", {
      key: "c",
      ctrlKey: true,
      cancelable: true,
    });
    expect(handlePerformerCopyShortcut(copyEvent, copy, paste)).toBe(true);
    expect(copyEvent.defaultPrevented).toBe(true);
    const pasteEvent = new KeyboardEvent("keydown", {
      key: "v",
      metaKey: true,
      cancelable: true,
    });
    expect(handlePerformerCopyShortcut(pasteEvent, copy, paste)).toBe(false);
    expect(pasteEvent.defaultPrevented).toBe(false);
  });

  it("leaves editable fields and modified shortcuts alone", () => {
    const copy = vi.fn(() => true);
    const input = document.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "input"
    );
    const event = new KeyboardEvent("keydown", {
      key: "c",
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    input.addEventListener("keydown", (e) =>
      handlePerformerCopyShortcut(e, copy, copy)
    );
    input.dispatchEvent(event);
    expect(copy).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
    const shifted = new KeyboardEvent("keydown", {
      key: "c",
      ctrlKey: true,
      shiftKey: true,
    });
    expect(handlePerformerCopyShortcut(shifted, copy, copy)).toBe(false);
  });

  it("defers to an open modal", () => {
    const copy = vi.fn(() => true);
    const dialog = document.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "dialog"
    );
    dialog.setAttribute("open", "");
    const button = document.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "button"
    );
    dialog.appendChild(button);
    const event = new KeyboardEvent("keydown", {
      key: "c",
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    button.addEventListener("keydown", (e) =>
      handlePerformerCopyShortcut(e, copy, copy)
    );
    button.dispatchEvent(event);
    expect(copy).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it("works in the viewer dialog but defers to a nested dialog", () => {
    const copy = vi.fn(() => true);
    const viewerDialog = document.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "dialog"
    );
    viewerDialog.setAttribute("open", "");
    const viewerShell = document.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "div"
    );
    viewerShell.setAttribute("data-sequence-viewer-shell", "");
    const viewerButton = document.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "button"
    );
    const nestedDialog = document.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "dialog"
    );
    nestedDialog.setAttribute("open", "");
    const nestedButton = document.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "button"
    );
    viewerDialog.appendChild(viewerShell);
    viewerShell.appendChild(viewerButton);
    viewerShell.appendChild(nestedDialog);
    nestedDialog.appendChild(nestedButton);
    expect(viewerButton.closest("[data-sequence-viewer-shell]")).toBe(
      viewerShell
    );
    expect(viewerButton.closest("dialog[open]")).toBe(viewerDialog);
    expect(viewerDialog.contains(viewerShell)).toBe(true);
    for (const button of [viewerButton, nestedButton]) {
      button.addEventListener("keydown", (event) =>
        handlePerformerCopyShortcut(event, copy, copy)
      );
    }

    const ownEvent = new KeyboardEvent("keydown", {
      key: "c",
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    viewerButton.dispatchEvent(ownEvent);
    expect(copy).toHaveBeenCalledTimes(1);
    expect(ownEvent.defaultPrevented).toBe(true);

    const nestedEvent = new KeyboardEvent("keydown", {
      key: "c",
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    nestedButton.dispatchEvent(nestedEvent);
    expect(copy).toHaveBeenCalledTimes(1);
    expect(nestedEvent.defaultPrevented).toBe(false);
  });
});
