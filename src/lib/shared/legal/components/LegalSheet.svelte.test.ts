/**
 * LegalSheet focus containment (accessibility-fixes spec, issue 10).
 *
 * The sheet said aria-modal but let Tab walk out into the page behind it,
 * and its window Escape handler called onClose even while the sheet was
 * closed. Neither shows in a screenshot.
 */
import { render } from "vitest-browser-svelte";
import { page, userEvent } from "vitest/browser";
import { describe, it, expect, vi } from "vitest";
import LegalSheet from "./LegalSheet.svelte";

function appendOpener(): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.textContent = "open terms";
  document.body.appendChild(btn);
  btn.focus();
  return btn;
}

describe("LegalSheet (focus trap)", () => {
  it("moves focus into the dialog and keeps Tab and Shift+Tab inside", async () => {
    const opener = appendOpener();
    render(LegalSheet, { isOpen: true, type: "terms", onClose: vi.fn() });

    const dialog = page.getByRole("dialog");
    await expect.element(dialog).toHaveFocus();
    const sheet = dialog.element();

    for (let i = 0; i < 6; i++) {
      await userEvent.keyboard("{Tab}");
      expect(sheet.contains(document.activeElement)).toBe(true);
    }
    for (let i = 0; i < 6; i++) {
      await userEvent.keyboard("{Shift>}{Tab}{/Shift}");
      expect(sheet.contains(document.activeElement)).toBe(true);
    }
    expect(opener.inert).toBe(true);

    opener.remove();
  });

  it("closes on Escape and returns focus to the opener", async () => {
    const opener = appendOpener();
    const onClose = vi.fn();
    const screen = render(LegalSheet, {
      isOpen: true,
      type: "privacy",
      onClose,
    });
    await expect.element(page.getByRole("dialog")).toHaveFocus();

    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);

    await screen.rerender({ isOpen: false });
    await expect.poll(() => opener.inert).toBe(false);
    await expect.poll(() => document.activeElement).toBe(opener);

    opener.remove();
  });

  it("ignores Escape while closed", async () => {
    const onClose = vi.fn();
    render(LegalSheet, { isOpen: false, onClose });

    await userEvent.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();
  });
});
