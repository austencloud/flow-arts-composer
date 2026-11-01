/**
 * Focus-containment regression test for LegalSheet.
 *
 * The sheet had `role="dialog" aria-modal="true"` and an Escape handler, but
 * Tab walked out of it into the footer links underneath, and closing it left
 * focus on `<body>`. The fix wires the shared FocusTrap around the sheet and
 * gives the backdrop `role="presentation"` (not `aria-hidden`, which would
 * have hidden the dialog inside it too). This proves the mechanism: focus
 * enters the sheet, background siblings go `inert`, Tab wraps inside, and
 * focus returns to the opener when the sheet closes.
 */
import { render } from "vitest-browser-svelte";
import { page, userEvent } from "vitest/browser";
import { describe, it, expect, vi, afterEach } from "vitest";
import LegalSheet from "./LegalSheet.svelte";
import { expectNoA11yViolations } from "#test-helpers/component-a11y.js";

function appendOpener(): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.textContent = "Terms";
  document.body.appendChild(btn);
  btn.focus();
  return btn;
}

// A real key press through the browser, not a synthetic keydown: the trap
// must beat native sequential focus navigation, so that is what is tested.
async function pressTab(shift = false): Promise<void> {
  await userEvent.tab({ shift });
}

describe("LegalSheet (focus containment)", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("takes focus as a labeled modal dialog when opened", async () => {
    appendOpener();
    render(LegalSheet, { isOpen: true, type: "terms", onClose: vi.fn() });

    const dialog = page.getByRole("dialog", { name: "Terms of Service" });
    await expect.element(dialog).toHaveAttribute("aria-modal", "true");
    await expect.element(dialog).toHaveFocus();
  });

  it("keeps the backdrop out of the accessibility tree without hiding the sheet", async () => {
    render(LegalSheet, { isOpen: true, type: "privacy", onClose: vi.fn() });
    await expect.element(page.getByRole("dialog")).toBeVisible();

    const backdrop = document.querySelector<HTMLElement>(".sheet-backdrop");
    expect(backdrop!.getAttribute("role")).toBe("presentation");
    expect(backdrop!.hasAttribute("aria-hidden")).toBe(false);
  });

  it("makes the page behind it inert and restores focus to the opener on close", async () => {
    const opener = appendOpener();
    const screen = render(LegalSheet, {
      isOpen: true,
      type: "terms",
      onClose: vi.fn(),
    });
    await expect.element(page.getByRole("dialog")).toHaveFocus();
    expect(opener.inert).toBe(true);

    await screen.rerender({ isOpen: false });

    await expect.poll(() => opener.inert).toBe(false);
    await expect.poll(() => document.activeElement).toBe(opener);
  });

  it("wraps Tab inside the sheet", async () => {
    appendOpener();
    render(LegalSheet, { isOpen: true, type: "terms", onClose: vi.fn() });
    const dialog = (await vi.waitFor(() =>
      page.getByRole("dialog").element()
    )) as HTMLElement;
    await expect.element(page.elementLocator(dialog)).toHaveFocus();

    const focusable = Array.from(
      dialog.querySelectorAll<HTMLElement>("button, a[href]")
    );
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;

    last.focus();
    await pressTab();
    expect(document.activeElement).toBe(first);

    await pressTab(true);
    expect(document.activeElement).toBe(last);
  });

  for (const [width, height] of [
    [375, 667],
    [1440, 900],
  ] as const) {
    it(`has no AAA a11y violations at ${width}x${height}`, async () => {
      await page.viewport(width, height);
      render(LegalSheet, { isOpen: true, type: "terms", onClose: vi.fn() });
      await expect.element(page.getByRole("dialog")).toBeVisible();
      await expectNoA11yViolations();
    });
  }
});
