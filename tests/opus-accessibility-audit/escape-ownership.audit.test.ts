/**
 * Escape-key ownership for shared dismissible surfaces.
 *
 * Contract under test: docs/architecture/escape-routing.md
 *   1. "Browser fullscreen and a focused input or popup keep the first Escape
 *      press."
 *   2. "The most recently opened registered modal or drawer claims the key."
 *   3. "The global registration prevents the default and stops propagation only
 *      when an owner exists. This guarantees that one Escape press never closes
 *      two layers."
 *
 * These specs drive the real `Drawer.svelte` / `BaseModal.svelte` primitives in
 * headless Chromium with the app's real global Escape owner installed. They are
 * audit evidence: each one is expected to FAIL on the audited SHA, and the
 * corresponding finding in
 * docs/reports/opus-batch-2026-09-12/accessibility-audit.md names the cause.
 */
import { render } from "vitest-browser-svelte";
import { userEvent } from "vitest/browser";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import DrawerWithInputHarness from "./harnesses/DrawerWithInputHarness.svelte";
import DrawerUnderModalHarness from "./harnesses/DrawerUnderModalHarness.svelte";
import ModalOnlyHarness from "./harnesses/ModalOnlyHarness.svelte";
import NestedDrawersHarness from "./harnesses/NestedDrawersHarness.svelte";

import { getKeyboardShortcutManager } from "$lib/shared/keyboard/get-keyboard-shortcut-manager";
import { registerEscapeShortcut } from "$lib/shared/keyboard/registration/register-escape-shortcut";

/**
 * Install the same global Escape owner the running app installs through
 * `KeyboardShortcutCoordinator.svelte`, so these specs reproduce the shipped
 * key routing instead of a primitive in a vacuum.
 */
function installGlobalEscapeOwner() {
  const manager = getKeyboardShortcutManager();
  manager.initialize();
  registerEscapeShortcut(manager);
  return manager;
}

function settle(ms = 120) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function drawerDialog(): HTMLDialogElement | null {
  return document.querySelector<HTMLDialogElement>("dialog.drawer-content");
}

/**
 * Drawer keeps the dialog mounted and `open` for its 400ms exit slide, so
 * `dialog.open` alone reports a closing drawer as still open. `data-state`
 * flips to "closed" on the same tick the close is requested, which is the
 * honest signal for "the user's Escape dismissed this surface".
 */
function drawerIsDismissed(): boolean {
  const dialog = drawerDialog();
  if (!dialog) return true;
  return dialog.dataset.state === "closed" || !dialog.open;
}

describe("Escape ownership across shared surfaces", () => {
  beforeEach(() => {
    installGlobalEscapeOwner();
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("leaves a focused text input inside a Drawer owning the first Escape press", async () => {
    render(DrawerWithInputHarness, { isOpen: true });
    await settle();

    const input = document.querySelector<HTMLInputElement>("#audit-search");
    expect(input, "harness rendered the drawer's search field").not.toBeNull();
    input!.focus();
    expect(document.activeElement).toBe(input);

    await userEvent.keyboard("{Escape}");
    await settle();

    // escape-routing.md rule 1: the focused input keeps the first press so the
    // user can cancel the field, not lose the whole sheet and its state.
    expect(
      drawerIsDismissed(),
      "drawer stays open while a text field inside it owns Escape"
    ).toBe(false);
  });

  it("closes only the inner sheet when one drawer is opened over another", async () => {
    render(NestedDrawersHarness);
    await settle(400);

    const dialogs = Array.from(
      document.querySelectorAll<HTMLDialogElement>("dialog.drawer-content")
    );
    expect(dialogs.length, "both drawers are mounted").toBe(2);
    expect(dialogs.every((d) => d.open), "both drawers are open").toBe(true);

    document.querySelector<HTMLElement>('[data-testid="inner-action"]')?.focus();

    await userEvent.keyboard("{Escape}");
    await settle(800);

    // A dismissed drawer is unmounted once its exit animation finishes, so an
    // absent dialog counts as dismissed.
    const stateFor = (name: string) => {
      const dialog = Array.from(
        document.querySelectorAll<HTMLDialogElement>("dialog.drawer-content")
      ).find((d) => d.getAttribute("aria-label") === name);
      if (!dialog) return { name, present: false, dismissed: true };
      return {
        name,
        present: true,
        dismissed: dialog.dataset.state === "closed" || !dialog.open,
      };
    };

    const inner = stateFor("Inner sheet");
    const outer = stateFor("Outer sheet");
    const observed = JSON.stringify([outer, inner]);

    expect(
      inner.dismissed,
      `the inner sheet is the layer dismissed — observed ${observed}`
    ).toBe(true);
    expect(
      outer.dismissed,
      `the outer sheet survives one Escape press — observed ${observed}`
    ).toBe(false);
  });

  // Control case. Establishes that BaseModal's own Escape path is sound, so a
  // failure in the stacked case belongs to the surface sharing the page with
  // it rather than to BaseModal.
  it("control: a BaseModal on its own closes on Escape from a focused field", async () => {
    render(ModalOnlyHarness);
    await settle(400);

    expect(
      document.querySelector<HTMLDialogElement>("dialog.base-modal")?.open,
      "modal is open before Escape"
    ).toBe(true);

    document.querySelector<HTMLInputElement>("#audit-modal-field")?.focus();

    await userEvent.keyboard("{Escape}");
    await settle(800);

    expect(
      Boolean(
        document.querySelector<HTMLDialogElement>("dialog.base-modal")?.open
      ),
      "a lone modal dismisses on Escape"
    ).toBe(false);
  });

  // Same stack, different focus target. The lone-modal control above passes, so
  // BaseModal's own Escape path is sound; both of these fail, which shows the
  // failure does not depend on what is focused inside the modal — it depends on
  // a Drawer being open underneath it.
  it("stacked modal is the layer dismissed — focus on a button in the modal", async () => {
    render(DrawerUnderModalHarness);
    await settle(400);

    document.querySelector<HTMLElement>('[data-testid="modal-action"]')?.focus();

    // Registered after the Drawer's own `svelte:window` handler, so it observes
    // whether that handler consumed the key. A prevented Escape keydown also
    // cancels the browser's dialog close request, which is the only Escape path
    // BaseModal has once `data-keyboard-shortcuts-ignore` (BaseModal.svelte:298)
    // has taken the global escape owner out of the picture inside a modal.
    let escapeWasConsumed: boolean | null = null;
    const probe = (event: KeyboardEvent) => {
      if (event.key === "Escape") escapeWasConsumed = event.defaultPrevented;
    };
    window.addEventListener("keydown", probe);

    await userEvent.keyboard("{Escape}");
    window.removeEventListener("keydown", probe);
    await settle(800);

    expect(
      escapeWasConsumed,
      "some handler called preventDefault on the Escape keydown"
    ).toBe(true);

    const observed = JSON.stringify({
      modalStillOpen: Boolean(
        document.querySelector<HTMLDialogElement>("dialog.base-modal")?.open
      ),
      drawerDismissed: drawerIsDismissed(),
    });

    expect(
      Boolean(
        document.querySelector<HTMLDialogElement>("dialog.base-modal")?.open
      ),
      `modal dismissed — observed ${observed}`
    ).toBe(false);
    expect(
      drawerIsDismissed(),
      `drawer beneath survives — observed ${observed}`
    ).toBe(false);
  });

  it("stacked modal is the layer dismissed — focus in the modal's text field", async () => {
    render(DrawerUnderModalHarness);
    await settle(400);

    const drawer = drawerDialog();
    const modal = document.querySelector<HTMLDialogElement>("dialog.base-modal");
    expect(drawer?.open, "drawer is open before Escape").toBe(true);
    expect(modal?.open, "modal is open on top before Escape").toBe(true);

    // Focus lands in the modal's field, exactly as it would after the user tabs
    // to the name/search input the modal exists to collect.
    document.querySelector<HTMLInputElement>("#audit-modal-field")?.focus();

    await userEvent.keyboard("{Escape}");
    // BaseModal's exit timer is 200ms and Drawer's is 400ms; wait past both.
    await settle(800);

    const modalStillOpen = Boolean(
      document.querySelector<HTMLDialogElement>("dialog.base-modal")?.open
    );
    const observed = JSON.stringify({
      modalStillOpen,
      drawerDismissed: drawerIsDismissed(),
    });

    // escape-routing.md rule 2: the most recently opened layer claims the key.
    expect(
      modalStillOpen,
      `modal (the top layer) is the layer dismissed — observed ${observed}`
    ).toBe(false);

    // escape-routing.md rule 3: one press never closes two layers, and never
    // reaches past the top layer to the surface beneath it.
    expect(
      drawerIsDismissed(),
      `drawer beneath the modal survives the modal's Escape — observed ${observed}`
    ).toBe(false);
  });
});
