/**
 * Keyboard dismissal of the Browse filter-chip popovers.
 *
 * Route: /browse (the filter chip row above the gallery grid).
 *
 * The shared escape contract (docs/architecture/escape-routing.md) defers the
 * first Escape press to a focused widget that owns temporary state: an expanded
 * control matches `[aria-expanded='true']` in
 * `escape-shortcut-target.ts:LOCAL_ESCAPE_OWNER_SELECTOR`, so the global
 * `global.escape` shortcut steps aside for it. `FilterChipBase` sets
 * `aria-expanded` in dropdown mode (FilterChipBase.svelte:258), which arms that
 * deferral — but none of the four dropdown chips implements an Escape handler:
 *
 *   LengthFilterChip.svelte, LevelFilterChip.svelte,
 *   LOOPFilterChip.svelte, MaxTurnIntensityFilterChip.svelte
 *
 * all dismiss on `pointerdown` outside the wrapper and nothing else. Escape is
 * therefore dead on an open filter popover.
 *
 * Audit evidence, not a production gate.
 */
import { render } from "vitest-browser-svelte";
import { userEvent } from "vitest/browser";
import { describe, it, expect, afterEach, vi } from "vitest";

import LengthFilterChip from "$lib/shared/browse/components/filter-chips/LengthFilterChip.svelte";
import { getKeyboardShortcutManager } from "$lib/shared/keyboard/get-keyboard-shortcut-manager";
import { registerEscapeShortcut } from "$lib/shared/keyboard/registration/register-escape-shortcut";

function settle(ms = 120) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function chipButton(): HTMLButtonElement {
  const button = document.querySelector<HTMLButtonElement>(
    'button[aria-haspopup="listbox"]'
  );
  if (!button) throw new Error("chip trigger button not rendered");
  return button;
}

describe("Browse filter-chip popover: keyboard dismissal", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("closes an open chip popover when the user presses Escape", async () => {
    const manager = getKeyboardShortcutManager();
    manager.initialize();
    registerEscapeShortcut(manager);

    render(LengthFilterChip, {
      activeLength: null,
      availableLengths: [4, 8, 16],
      onSelect: vi.fn(),
    });
    await settle();

    const trigger = chipButton();
    trigger.focus();
    trigger.click();
    await settle();

    expect(
      trigger.getAttribute("aria-expanded"),
      "popover is open before Escape"
    ).toBe("true");
    expect(
      document.querySelector('[role="listbox"]'),
      "option list is rendered before Escape"
    ).not.toBeNull();

    // Focus stays on the expanded chip, which is where it lands after a
    // keyboard user presses Enter/Space to open the popover.
    expect(document.activeElement).toBe(trigger);

    await userEvent.keyboard("{Escape}");
    await settle();

    expect(
      chipButton().getAttribute("aria-expanded"),
      "Escape dismisses the chip popover"
    ).toBe("false");
  });
});
