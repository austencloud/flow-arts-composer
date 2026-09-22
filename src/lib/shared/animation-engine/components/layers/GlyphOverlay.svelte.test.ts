import { render } from "vitest-browser-svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
      isAtStartPlacement: true,
    });
    await expect.element(screen.getByText("Start")).toBeInTheDocument();
  });

  it("hides Start when step numbers are off", async () => {
    const screen = render(GlyphOverlay, {
      stepNumbersVisible: false,
      isAtStartPlacement: true,
    });
    await vi.waitFor(() =>
      expect(screen.container.querySelector(".beat-number-group")).toBeNull()
    );
    expect(screen.container.textContent).not.toContain("Start");
  });

  it("hides End when step numbers are off", async () => {
    const screen = render(GlyphOverlay, {
      stepNumbersVisible: false,
      isAtEndPlacement: true,
    });
    await vi.waitFor(() =>
      expect(screen.container.querySelector(".beat-number-group")).toBeNull()
    );
    expect(screen.container.textContent).not.toContain("End");
  });
});

// A skewed-frame beat (one hand cardinal, the other intercardinal) wears
// braces around its letter on the pictograph and in the hidden GlyphRenderer
// that feeds exports. The on-screen overlay is a separate Svelte tree, and it
// mounted only the letter and turns, so a rotate-45 fuse played without the
// braces the header and the pictographs were showing.
describe("GlyphOverlay skewed-frame braces", () => {
  // The component test server does not serve the static letter images, and
  // the braces lay themselves out against the letter's measured size, so the
  // letter fetch answers with a small SVG that carries a real viewBox.
  const LETTER_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 100"><rect width="80" height="100"/></svg>';
  let realFetch: typeof fetch;

  beforeEach(() => {
    realFetch = globalThis.fetch;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      if (url.includes("/images/letters_trimmed/")) {
        return new Response(LETTER_SVG, {
          status: 200,
          headers: { "Content-Type": "image/svg+xml" },
        });
      }
      return realFetch(input, init);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const skewedStep = {
    letter: "S",
    motions: {
      left: {
        hand: "left",
        motionType: "pro",
        startLocation: "n",
        endLocation: "e",
        startOrientation: "in",
        endOrientation: "in",
        propRotationDirection: "cw",
        turns: 0,
        isVisible: true,
      },
      right: {
        hand: "right",
        motionType: "pro",
        startLocation: "ne",
        endLocation: "se",
        startOrientation: "in",
        endOrientation: "in",
        propRotationDirection: "cw",
        turns: 0,
        isVisible: true,
      },
    },
  };

  const pureStep = {
    ...skewedStep,
    motions: {
      left: { ...skewedStep.motions.left, startLocation: "n", endLocation: "e" },
      right: { ...skewedStep.motions.right, startLocation: "s", endLocation: "w" },
    },
  };

  it("draws braces around the letter of a skewed-frame beat", async () => {
    const screen = render(GlyphOverlay, {
      letter: "S" as never,
      stepData: skewedStep as never,
      tkaGlyphVisible: true,
    });
    await vi.waitFor(
      () =>
        expect(
          screen.container.querySelector(".glyph-group [data-skew-braces]")
        ).not.toBeNull(),
      { timeout: 4000 }
    );
    const texts = [
      ...screen.container.querySelectorAll("[data-skew-braces] text"),
    ].map((el) => el.textContent);
    expect(texts).toEqual(["{", "}"]);
  });

  it("draws no braces for a pure-frame beat", async () => {
    const screen = render(GlyphOverlay, {
      letter: "S" as never,
      stepData: pureStep as never,
      tkaGlyphVisible: true,
    });
    await vi.waitFor(() =>
      expect(screen.container.querySelector(".glyph-group")).not.toBeNull()
    );
    expect(screen.container.querySelector("[data-skew-braces]")).toBeNull();
  });
});
