import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";
import { describe, expect, it, vi } from "vitest";

vi.mock("#lib/shared/application/get-haptic-feedback.js", () => ({
  getHapticFeedback: () => ({ trigger: vi.fn() }),
}));

import ViewSequenceButton from "./ViewSequenceButton.svelte";

describe("ViewSequenceButton play purpose", () => {
  it("uses the exact Play action name and dominant triangle", async () => {
    render(ViewSequenceButton, {
      purpose: "play",
      onclick: vi.fn(),
    });

    const button = page.getByRole("button", { name: "Play sequence" });
    await expect.element(button).toHaveAttribute("title", "Play sequence");
    await expect.element(button).not.toHaveAttribute("aria-pressed");
    expect(button.element().querySelector("i")).toHaveClass("fa-play");

    const bounds = button.element().getBoundingClientRect();
    expect(bounds.width).toBeGreaterThanOrEqual(48);
    expect(bounds.height).toBeGreaterThanOrEqual(48);
  });

  it("keeps the reusable viewer-launcher presentation available", async () => {
    render(ViewSequenceButton, {
      purpose: "open-viewer",
      onclick: vi.fn(),
    });

    await expect
      .element(page.getByRole("button", { name: "Open sequence viewer" }))
      .toHaveAttribute("title", "Open sequence viewer");
  });
});

describe("ViewSequenceButton on a labelled rail", () => {
  // The unfolded Z Fold is 707 wide: under the 768px phone media rules, but
  // the Create rail is wide enough to show labels. The Viewer pill must read
  // the rail's width there, or "Viewer" spills out of a 40px circle.
  it("fits its whole label below 768px when the rail shows labels", async () => {
    await page.viewport(707, 772);
    const host = document.createElement("div");
    host.style.setProperty("--min-touch-target", "40px");
    host.style.setProperty("--workspace-action-width", "auto");
    host.style.setProperty("--workspace-action-label-display", "inline");
    host.style.setProperty("--workspace-action-padding-inline", "16px");
    host.style.setProperty("--workspace-action-gap", "8px");
    host.style.setProperty("--workspace-action-radius", "999px");
    host.style.display = "flex";
    document.body.appendChild(host);

    render(ViewSequenceButton, {
      target: host,
      props: { purpose: "viewer", onclick: vi.fn() },
    });

    const button = page
      .getByRole("button", { name: "Open sequence viewer" })
      .element() as HTMLElement;
    const label = button.querySelector<HTMLElement>(".workspace-action-label");
    expect(label).not.toBeNull();
    // The whole word sits inside the pill (it spilled 14px out of a 40px
    // circle when a phone media rule pinned the width).
    const pill = button.getBoundingClientRect();
    const word = label!.getBoundingClientRect();
    expect(word.width).toBeGreaterThan(0);
    expect(word.left).toBeGreaterThanOrEqual(pill.left);
    expect(word.right).toBeLessThanOrEqual(pill.right);
    expect(pill.width).toBeGreaterThan(48);
    host.remove();
  });

  it("stays an icon-only circle when the rail hides labels", async () => {
    await page.viewport(375, 667);
    const host = document.createElement("div");
    host.style.setProperty("--min-touch-target", "40px");
    document.body.appendChild(host);
    render(ViewSequenceButton, {
      target: host,
      props: { purpose: "viewer", onclick: vi.fn() },
    });

    const button = page
      .getByRole("button", { name: "Open sequence viewer" })
      .element() as HTMLElement;
    const bounds = button.getBoundingClientRect();
    expect(bounds.width).toBe(40);
    expect(bounds.height).toBe(40);
    host.remove();
  });
});
