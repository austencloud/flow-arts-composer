import { describe, expect, it, vi } from "vitest";
import { handlePerformerCopyShortcut } from "$lib/shared/3d/domain/performer-copy-shortcuts";

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
    const input = document.createElement("input");
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
    const dialog = document.createElement("dialog");
    dialog.setAttribute("open", "");
    const button = document.createElement("button");
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
});
