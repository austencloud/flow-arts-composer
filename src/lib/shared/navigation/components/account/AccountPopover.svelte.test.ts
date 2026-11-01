/**
 * Contrast regression test for the account popover's version link.
 *
 * The "vX.Y.Z What's new" button was `rgba(255,255,255,0.4)` at
 * `opacity: 0.6` on the popover surface, about 1.6:1 for 14px text. axe's
 * `color-contrast-enhanced` (the 7:1 AAA rule the project holds body text
 * to) is what catches a slide back, so it runs here against the popover's
 * own background at both viewport tiers. Signed-out state is used because it
 * needs no auth fixture and renders the same footer.
 */
import { render } from "vitest-browser-svelte";
import { page } from "vitest/browser";
import { describe, it, expect, vi, afterEach } from "vitest";
import AccountPopover from "./AccountPopover.svelte";
import { expectNoA11yViolations } from "#test-helpers/component-a11y.js";

// Vite `define`s the version for the app build; the browser test runner has
// no such define, and the footer reads it as a bare global.
(globalThis as Record<string, unknown>).__APP_VERSION__ = "0.0.0-test";

function anchor(): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.textContent = "Account";
  btn.style.cssText =
    "position:fixed;left:16px;bottom:16px;width:200px;height:48px";
  document.body.appendChild(btn);
  return btn;
}

describe("AccountPopover (version link contrast)", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  for (const [width, height] of [
    [375, 667],
    [1440, 900],
  ] as const) {
    it(`renders the version link at AAA contrast at ${width}x${height}`, async () => {
      await page.viewport(width, height);
      render(AccountPopover, {
        isOpen: true,
        onClose: vi.fn(),
        anchorElement: anchor(),
      });

      const link = page.getByRole("menuitem", { name: /What's new/i });
      await expect.element(link).toBeVisible();
      const el = link.element() as HTMLElement;
      expect(getComputedStyle(el).opacity).toBe("1");

      await expectNoA11yViolations(
        document.querySelector(".account-popover") ?? document.body
      );
    });
  }
});
