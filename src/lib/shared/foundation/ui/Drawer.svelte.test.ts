/**
 * Drawer keyboard ownership and naming contract.
 *
 * Both behaviors are silent when they regress — the sheet still opens, still
 * looks right, and a screen reader or a keyboard user is the only one who
 * notices — which is exactly what component-test-discipline.md asks this layer
 * to protect.
 */
import { render } from "vitest-browser-svelte";
import { userEvent } from "vitest/browser";
import { describe, it, expect, afterEach } from "vitest";

import DrawerKeyboardTestHarness from "./DrawerKeyboardTestHarness.svelte";

function settle(ms = 200) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function drawer(): HTMLDialogElement | null {
  return document.querySelector<HTMLDialogElement>("dialog.drawer-content");
}

/**
 * Drawer keeps the dialog mounted and `open` through its 400ms exit slide, so
 * `dialog.open` alone reports a closing drawer as still open. `data-state`
 * flips on the tick the close is requested.
 */
function isDismissed(): boolean {
  const dialog = drawer();
  if (!dialog) return true;
  return dialog.dataset.state === "closed" || !dialog.open;
}

describe("Drawer Escape ownership", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("leaves the first Escape press to a focused text field inside the sheet", async () => {
    render(DrawerKeyboardTestHarness, { isOpen: true, title: "Filters" });
    await settle();

    const input = document.querySelector<HTMLInputElement>("#drawer-search");
    expect(input, "harness rendered the field").not.toBeNull();
    input!.focus();

    await userEvent.keyboard("{Escape}");
    await settle(600);

    // escape-routing.md ownership rule 1. Before this guard the drawer's own
    // window handler closed the whole sheet, discarding whatever the user had
    // typed and wherever they were in it.
    expect(isDismissed(), "sheet survives Escape from a focused field").toBe(
      false
    );
  });

  it("still closes on Escape from an ordinary control inside the sheet", async () => {
    render(DrawerKeyboardTestHarness, { isOpen: true, title: "Filters" });
    await settle();

    document.querySelector<HTMLElement>('[data-testid="inside"]')?.focus();

    await userEvent.keyboard("{Escape}");
    await settle(600);

    // The deferral must not cost the drawer its ordinary dismissal.
    expect(isDismissed(), "sheet dismisses from a plain button").toBe(true);
  });
});

describe("Drawer accessible name", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("names the dialog from `title` when no other name is supplied", async () => {
    render(DrawerKeyboardTestHarness, { isOpen: true, title: "Filters" });
    await settle();

    const dialog = drawer();
    expect(dialog?.getAttribute("aria-modal")).toBe("true");
    // An aria-modal dialog with no name is announced as a bare "dialog".
    expect(dialog?.getAttribute("aria-label")).toBe("Filters");
  });

  it("prefers `labelledBy` over `title` and emits no competing aria-label", async () => {
    render(DrawerKeyboardTestHarness, {
      isOpen: true,
      title: "Filters",
      labelledBy: "drawer-header-title",
    });
    await settle();

    const dialog = drawer();
    expect(dialog?.getAttribute("aria-labelledby")).toBe("drawer-header-title");
    expect(dialog?.hasAttribute("aria-label")).toBe(false);
  });

  it("leaves the attribute off entirely when nothing names the sheet", async () => {
    render(DrawerKeyboardTestHarness, { isOpen: true });
    await settle();

    // Not a passing grade — just proof the fallback emits no empty name, which
    // would be worse than none. See the F5 census in
    // docs/reports/opus-batch-2026-09-12/accessibility-audit.md.
    expect(drawer()?.hasAttribute("aria-label")).toBe(false);
  });
});
