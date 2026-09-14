import { render } from "vitest-browser-svelte";
import { describe, expect, it, vi } from "vitest";
import GlyphOverlay from "./GlyphOverlay.svelte";

vi.mock("$app/environment", () => ({
  browser: true,
  building: false,
  dev: false,
  version: "test",
}));

// The Start/End words are step labels. Before this test, the overlay
// OR-exempted them from the step-numbers toggle, so turning step numbers off
// still left "Start" and "End" on the canvas.
describe("GlyphOverlay step labels", () => {
  it("shows Start while step numbers are on", async () => {
    const screen = render(GlyphOverlay, {
      stepNumbersVisible: true,
      isAtStartPosition: true,
    });
    await expect.element(screen.getByText("Start")).toBeInTheDocument();
  });

  it("hides Start when step numbers are off", async () => {
    const screen = render(GlyphOverlay, {
      stepNumbersVisible: false,
      isAtStartPosition: true,
    });
    await vi.waitFor(() =>
      expect(screen.container.querySelector(".beat-number-group")).toBeNull()
    );
    expect(screen.container.textContent).not.toContain("Start");
  });

  it("hides End when step numbers are off", async () => {
    const screen = render(GlyphOverlay, {
      stepNumbersVisible: false,
      isAtEndPosition: true,
    });
    await vi.waitFor(() =>
      expect(screen.container.querySelector(".beat-number-group")).toBeNull()
    );
    expect(screen.container.textContent).not.toContain("End");
  });
});
