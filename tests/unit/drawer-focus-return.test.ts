import { afterEach, describe, expect, it, vi } from "vitest";
import { FocusTrap } from "$lib/shared/foundation/ui/drawer/focus-trap";

// Shared test setup mocks createElement for canvas; this test needs real focus.
function createReal<K extends keyof HTMLElementTagNameMap>(
  tag: K
): HTMLElementTagNameMap[K] {
  return Document.prototype.createElement.call(
    document,
    tag
  ) as HTMLElementTagNameMap[K];
}

describe("drawer focus return", () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.useRealTimers();
  });

  it("returns to the opener when native dialog opening has already moved focus", () => {
    vi.useFakeTimers();
    const opener = createReal("button");
    const dialog = createReal("dialog");
    const close = createReal("button");
    dialog.append(close);
    document.body.append(opener, dialog);
    opener.focus();
    const returnTarget = document.activeElement as HTMLElement;
    // Native dialog.show() focuses a control before Drawer activates its trap.
    close.focus();
    const trap = new FocusTrap({ setInertOnSiblings: false });
    trap.activate(dialog, returnTarget);
    trap.deactivate();
    vi.runAllTimers();
    expect(document.activeElement).toBe(opener);
  });
});
