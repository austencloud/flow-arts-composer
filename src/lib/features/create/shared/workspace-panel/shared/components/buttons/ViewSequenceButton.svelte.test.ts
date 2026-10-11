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
