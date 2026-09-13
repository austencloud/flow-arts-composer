/**
 * Accessible names on shared dialog surfaces.
 *
 * Both shared primitives mark their `<dialog>` `aria-modal="true"`
 * (Drawer.svelte:629, BaseModal.svelte:305) but neither derives a name from the
 * header the consumer already renders: `Drawer` only forwards `labelledBy` /
 * `ariaLabel`, `BaseModal` only forwards `labelledBy`, and
 * `DrawerHeader`'s `<h2>` (DrawerHeader.svelte:91) carries no `id` for a
 * consumer to point at.
 *
 * A dialog with no accessible name is announced as a bare "dialog" — WCAG 2.1
 * SC 4.1.2 Name, Role, Value.
 *
 * The harness reproduces GalleryFilterSheet.svelte's exact composition on the
 * /browse route: `<Drawer>` with no name props, `<DrawerHeader title="Filters">`
 * as its first child.
 *
 * Audit evidence, not a production gate.
 */
import { render } from "vitest-browser-svelte";
import { describe, it, expect, afterEach } from "vitest";

import HeaderOnlyDrawerHarness from "./harnesses/HeaderOnlyDrawerHarness.svelte";

function settle(ms = 150) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Resolve the accessible name of an element from the author-supplied sources a
 * dialog can use: `aria-labelledby`, `aria-label`, `title`. A native `<dialog>`
 * has no content-derived name, so an empty result here is an unnamed dialog.
 */
function accessibleName(el: Element): string {
  const labelledBy = el.getAttribute("aria-labelledby");
  if (labelledBy) {
    const text = labelledBy
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent?.trim() ?? "")
      .filter(Boolean)
      .join(" ");
    if (text) return text;
  }
  return (
    el.getAttribute("aria-label")?.trim() ||
    el.getAttribute("title")?.trim() ||
    ""
  );
}

describe("Shared dialog surfaces expose an accessible name", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("names the Browse Filters sheet from the header it already renders", async () => {
    render(HeaderOnlyDrawerHarness, { isOpen: true });
    await settle();

    const dialog =
      document.querySelector<HTMLDialogElement>("dialog.drawer-content");
    expect(dialog, "drawer dialog rendered").not.toBeNull();
    expect(dialog!.getAttribute("aria-modal")).toBe("true");

    // The visible title is right there in the DOM.
    expect(
      dialog!.querySelector("h2")?.textContent?.trim(),
      "header title is rendered"
    ).toBe("Filters");

    expect(
      accessibleName(dialog!),
      "modal dialog is announced by name, not as a bare 'dialog'"
    ).not.toBe("");
  });
});
