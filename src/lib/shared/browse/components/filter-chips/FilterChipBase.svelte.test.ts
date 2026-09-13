import { render } from "vitest-browser-svelte";
import { page, userEvent } from "vitest/browser";
import { describe, it, expect, vi, afterEach } from "vitest";
import FilterChipBase from "./FilterChipBase.svelte";
import FilterChipDropdownTestHarness from "./FilterChipDropdownTestHarness.svelte";
import { expectNoA11yViolations } from "$test-helpers/component-a11y";

describe("FilterChipBase (toggle mode)", () => {
  it("exposes aria-pressed reflecting `active` on the toggle button", async () => {
    render(FilterChipBase, { label: "Loops", mode: "toggle", active: false });
    const chip = page.getByRole("button", { name: "Loops" });
    await expect.element(chip).toBeVisible();
    await expect.element(chip).toHaveAttribute("aria-pressed", "false");
  });

  it("fires onclick when activated, and reflects the new active prop on rerender", async () => {
    const onclick = vi.fn();
    const screen = render(FilterChipBase, {
      label: "Loops",
      mode: "toggle",
      active: false,
      onclick,
    });

    await page.getByRole("button", { name: "Loops" }).click();
    expect(onclick).toHaveBeenCalledOnce();

    // Controlled component: parent flips `active` → ARIA must follow.
    await screen.rerender({
      label: "Loops",
      mode: "toggle",
      active: true,
      onclick,
    });
    await expect
      .element(page.getByRole("button", { name: "Loops" }))
      .toHaveAttribute("aria-pressed", "true");
  });

  it("has no AAA a11y violations", async () => {
    render(FilterChipBase, { label: "Loops", mode: "toggle", active: true });
    await expectNoA11yViolations();
  });
});

describe("FilterChipBase (dropdown mode)", () => {
  it("exposes listbox popup semantics with aria-expanded", async () => {
    const screen = render(FilterChipBase, {
      label: "Sort",
      mode: "dropdown",
      expanded: false,
    });
    const chip = page.getByRole("button", { name: "Sort" });
    await expect.element(chip).toHaveAttribute("aria-haspopup", "listbox");
    await expect.element(chip).toHaveAttribute("aria-expanded", "false");

    await screen.rerender({ label: "Sort", mode: "dropdown", expanded: true });
    await expect
      .element(page.getByRole("button", { name: "Sort" }))
      .toHaveAttribute("aria-expanded", "true");
  });
});

describe("FilterChipBase (display mode)", () => {
  it("keeps chip styling without exposing a fake button", async () => {
    render(FilterChipBase, {
      label: "Rotated (quartered)",
      mode: "display",
      active: true,
      chipColor: "#36c3ff",
    });

    const chip = document.querySelector(".filter-chip");
    expect(chip?.tagName).toBe("SPAN");
    expect(chip).toHaveTextContent("Rotated (quartered)");
    expect(document.querySelector("button")).toBeNull();
  });
});

/**
 * Keyboard dismissal of a dropdown popover.
 *
 * `aria-expanded="true"` puts the chip in `LOCAL_ESCAPE_OWNER_SELECTOR`
 * (escape-shortcut-target.ts), so the global escape owner steps aside for it.
 * Before `ondismiss` existed nothing picked the key up, and an open filter
 * popover on /browse had no keyboard dismissal path at all.
 *
 * `expanded` is a controlled prop, so these assert the emitted callback — the
 * pattern docs/reference/component-testing.md prescribes for this codebase's
 * controlled primitives — plus the focus return, which the callback cannot
 * express.
 */
describe("FilterChipBase (dropdown keyboard dismissal)", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  function trigger(): HTMLButtonElement {
    const el = document.querySelector<HTMLButtonElement>(
      'button[aria-haspopup="listbox"]'
    );
    if (!el) throw new Error("chip trigger not rendered");
    return el;
  }

  it("dismisses and returns focus to the chip when Escape is pressed on the trigger", async () => {
    const ondismiss = vi.fn();
    render(FilterChipDropdownTestHarness, { expanded: true, ondismiss });

    trigger().focus();
    await userEvent.keyboard("{Escape}");

    expect(ondismiss).toHaveBeenCalledTimes(1);
    expect(document.activeElement, "focus returns to the chip").toBe(trigger());
  });

  it("dismisses when Escape is pressed on an option row inside the popover", async () => {
    const ondismiss = vi.fn();
    render(FilterChipDropdownTestHarness, { expanded: true, ondismiss });

    // The popover is a sibling of the trigger, not a descendant, so a key
    // pressed here never bubbles through the chip button.
    const option = document.querySelector<HTMLButtonElement>(
      '.chip-popover [role="option"]'
    );
    expect(option, "popover rendered its options").not.toBeNull();
    option!.focus();

    await userEvent.keyboard("{Escape}");

    expect(ondismiss).toHaveBeenCalledTimes(1);
    expect(document.activeElement, "focus returns to the chip").toBe(trigger());
  });

  it("does not consume Escape while the dropdown is closed", async () => {
    const ondismiss = vi.fn();
    render(FilterChipDropdownTestHarness, { expanded: false, ondismiss });

    trigger().focus();
    await userEvent.keyboard("{Escape}");

    // A collapsed chip owns nothing, so the press must stay available to the
    // drawer or modal behind it — escape-routing.md ownership order.
    expect(ondismiss).not.toHaveBeenCalled();
  });

  it("stops one Escape press from also reaching the layer behind the chip", async () => {
    const ondismiss = vi.fn();
    const onOuterEscape = vi.fn();
    render(FilterChipDropdownTestHarness, {
      expanded: true,
      ondismiss,
      onOuterEscape,
    });

    trigger().focus();
    await userEvent.keyboard("{Escape}");

    expect(ondismiss).toHaveBeenCalledTimes(1);
    expect(
      onOuterEscape,
      "one press dismisses exactly one layer"
    ).not.toHaveBeenCalled();
  });
});
