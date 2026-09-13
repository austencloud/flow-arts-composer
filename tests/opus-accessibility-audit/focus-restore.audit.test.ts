/**
 * Focus restoration after a shared surface is dismissed.
 *
 * WAI-ARIA APG dialog pattern: when a dialog closes, focus returns to the
 * element that invoked it. Losing it drops a keyboard user at the top of the
 * document with no idea where they were.
 *
 * Drawer owns this through `FocusTrap` (`returnFocusOnClose`, default true);
 * BaseModal owns it through `FocusRestore` (`restoreFocus`, default true).
 * Both paths are exercised here through a real trigger button.
 *
 * Audit evidence, not a production gate.
 */
import { render } from "vitest-browser-svelte";
import { userEvent } from "vitest/browser";
import { describe, it, expect, afterEach } from "vitest";

import TriggeredSurfacesHarness from "./harnesses/TriggeredSurfacesHarness.svelte";

function settle(ms = 200) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function byTestId(id: string): HTMLElement {
  const el = document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  if (!el) throw new Error(`missing [data-testid="${id}"]`);
  return el;
}

describe("Focus returns to the trigger after a shared surface closes", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("Drawer restores focus to the button that opened it", async () => {
    render(TriggeredSurfacesHarness, { surface: "drawer" });
    await settle(50);

    const trigger = byTestId("trigger");
    trigger.focus();
    trigger.click();
    await settle(300);

    expect(
      document.querySelector<HTMLDialogElement>("dialog.drawer-content")?.open,
      "drawer opened"
    ).toBe(true);

    await userEvent.keyboard("{Escape}");
    // Drawer's exit timer is 400ms and FocusTrap restores on a 0ms timeout.
    await settle(700);

    expect(
      (document.activeElement as HTMLElement)?.dataset?.testid,
      "focus is back on the trigger after the sheet closes"
    ).toBe("trigger");
  });

  it("BaseModal restores focus to the button that opened it", async () => {
    render(TriggeredSurfacesHarness, { surface: "modal" });
    await settle(50);

    const trigger = byTestId("trigger");
    trigger.focus();
    trigger.click();
    await settle(300);

    expect(
      document.querySelector<HTMLDialogElement>("dialog.base-modal")?.open,
      "modal opened"
    ).toBe(true);

    await userEvent.keyboard("{Escape}");
    await settle(700);

    expect(
      (document.activeElement as HTMLElement)?.dataset?.testid,
      "focus is back on the trigger after the modal closes"
    ).toBe("trigger");
  });
});
