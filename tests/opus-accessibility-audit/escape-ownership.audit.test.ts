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

  it("dismisses the modal, not the drawer beneath it, when a modal is stacked over an open drawer", async () => {
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

    // escape-routing.md rule 2: the most recently opened layer claims the key.
    expect(modalStillOpen, "modal (the top layer) is the layer dismissed").toBe(
      false
    );

    // escape-routing.md rule 3: one press never closes two layers, and never
    // reaches past the top layer to the surface beneath it.
    expect(
      drawerIsDismissed(),
      "drawer beneath the modal survives the modal's Escape"
    ).toBe(false);
  });
});
