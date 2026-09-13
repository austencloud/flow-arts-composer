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
 * STATUS: partially fixed. `Drawer` now accepts a `title` prop that becomes the
 * dialog's `aria-label` (covered by the colocated, CI-gated
 * src/lib/shared/foundation/ui/Drawer.svelte.test.ts), and
 * GalleryFilterSheet.svelte adopted it — /browse's Filters sheet is named.
 *
 * This spec now stands for the REMAINING debt: the other unnamed callsites in
 * the F5 census, which still render the `<Drawer>` + `<DrawerHeader>` shape with
 * no name prop at all. It is expected to fail until those callsites adopt
 * `title`, and it fails for the callsites, not for the primitive.
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
 * dialog can use: `aria-labelledby`, `aria-label`, `title`.
 *
 * LIMIT, stated plainly: this inspects DOM attributes. It does NOT read the
 * browser's computed accessibility tree. For a native `<dialog>` those three
 * attributes are the complete set of author-supplied naming paths (a dialog
 * derives no name from its contents under accname), so an empty result is a
 * well-founded conclusion — but an authoritative check would need a CDP
 * accessibility snapshot or `getComputedAccessibleNode()`, neither of which this
 * harness exposes. Do not quote a result here as an AX-tree finding.
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

  it("the remaining unnamed callsites still produce a nameless modal dialog", async () => {
    render(HeaderOnlyDrawerHarness, { isOpen: true });
    await settle();

    const dialog =
      document.querySelector<HTMLDialogElement>("dialog.drawer-content");
    expect(dialog, "drawer dialog rendered").not.toBeNull();
    expect(dialog!.getAttribute("aria-modal")).toBe("true");

    // The visible title is right there in the DOM, and since the fix the
    // primitive can consume it — these callsites just do not pass it yet.
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
