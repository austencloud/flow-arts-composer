/**
 * Single-key global shortcuts versus an open Drawer.
 *
 * `KeyboardShortcutManager.handleKeydown` dismisses the top drawer before
 * running any matching single-key shortcut that did not opt out with
 * `preserveDrawers`:
 *
 *   src/lib/shared/keyboard/services/keyboard-shortcut-manager.ts:296
 *     if (shortcut.isSingleKey && !shortcut.preserveDrawers && hasOpenDrawers())
 *       dismissTopDrawer();
 *
 * `BaseModal` opts its whole subtree out of the shortcut system with
 * `data-keyboard-shortcuts-ignore` (BaseModal.svelte:298, asserted by
 * BaseModal.svelte.test.ts:46). `Drawer.svelte` carries no such marker, so a
 * key pressed *inside* an open drawer still reaches the global manager.
 *
 * The Create module registers bare ArrowUp/Down/Left/Right as single-key
 * shortcuts (register-create-shortcuts.ts:131,153,173,192 — all with
 * `modifiers: []`, none with `preserveDrawers`, and all with stub actions).
 *
 * Note on scope, corrected in review: the prop sheet's hand switcher is a
 * `role="tablist"` with NO arrow-key handler today
 * (PropSelectionSheet.svelte:150-178), so arrows do not currently navigate
 * anything inside a drawer. The defect is that a key which does nothing useful
 * silently destroys the surface — and that it would make arrow navigation
 * inoperable the moment that tablist grows the handler APG expects.
 *
 * This spec reproduces that registration shape against the real manager and the
 * real Drawer. Audit evidence, not a production gate.
 */
import { render } from "vitest-browser-svelte";
import { userEvent } from "vitest/browser";
import { describe, it, expect, afterEach, beforeEach } from "vitest";

import DrawerWithOptionsHarness from "./harnesses/DrawerWithOptionsHarness.svelte";
import { getKeyboardShortcutManager } from "$lib/shared/keyboard/get-keyboard-shortcut-manager";

function settle(ms = 150) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function drawerIsDismissed(): boolean {
  const dialog =
    document.querySelector<HTMLDialogElement>("dialog.drawer-content");
  if (!dialog) return true;
  return dialog.dataset.state === "closed" || !dialog.open;
}

describe("Single-key shortcuts while a Drawer owns the screen", () => {
  let unregister: (() => void) | null = null;

  beforeEach(() => {
    const manager = getKeyboardShortcutManager();
    manager.initialize();
    // Same registration shape as `create.grid-nav-right`
    // (src/lib/shared/keyboard/registration/register-create-shortcuts.ts:192):
    // bare ArrowRight, no modifiers, no `preserveDrawers`.
    unregister = manager.register({
      id: "audit.grid-nav-right",
      label: "Audit grid nav right",
      key: "ArrowRight",
      modifiers: [],
      context: "global",
      action: () => {},
    });
  });

  afterEach(() => {
    unregister?.();
    unregister = null;
    document.body.innerHTML = "";
  });

  it("does not dismiss the drawer when the user arrows through options inside it", async () => {
    render(DrawerWithOptionsHarness, { isOpen: true });
    await settle();

    const firstOption = document.querySelector<HTMLButtonElement>(
      '[data-testid="option-Staff"]'
    );
    expect(firstOption, "harness rendered the option list").not.toBeNull();
    firstOption!.focus();

    await userEvent.keyboard("{ArrowRight}");
    await settle();

    expect(
      drawerIsDismissed(),
      "arrowing inside an open sheet must not dismiss the sheet"
    ).toBe(false);
  });
});
