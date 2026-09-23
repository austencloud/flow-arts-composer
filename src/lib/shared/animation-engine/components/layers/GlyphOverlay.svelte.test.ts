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

  // Leaving the start position, isAtStartPlacement clears a frame before
  // displayedStepNumber advances past 0. Both states render "Start", so the
  // label group must stay mounted instead of remounting a second "Start".
  it("keeps the Start group when the step number is still 0", async () => {
    const screen = render(GlyphOverlay, {
      stepNumbersVisible: true,
      isAtStartPlacement: true,
      displayedStepNumber: 0,
    });
    await expect.element(screen.getByText("Start")).toBeInTheDocument();
    const group = screen.container.querySelector(".beat-number-group");

    await screen.rerender({ isAtStartPlacement: false, displayedStepNumber: 0 });

    const groups = screen.container.querySelectorAll(".beat-number-group");
    expect(groups).toHaveLength(1);
    expect(groups[0]).toBe(group);
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

  // The brace glyphs come from the system font, so only a real rasterisation
  // shows where their ink lands. The letter stub is 80x100 at the glyph frame
  // origin (50, 800): its centre line is y 850, its left edge x 50 and its
  // right edge x 130.
  it("centres the rendered brace ink on the letter, one gap either side", async () => {
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
    const group = screen.container.querySelector("[data-skew-braces]")!;

    // Rasterise the brace group alone at one pixel per glyph unit.
    const view = { x: -50, y: 750, width: 400, height: 200 };
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${view.width}" height="${view.height}" ` +
      `viewBox="${view.x} ${view.y} ${view.width} ${view.height}">${group.outerHTML}</svg>`;
    const image = new Image();
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = view.width;
    canvas.height = view.height;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(image, 0, 0);
    const { data } = ctx.getImageData(0, 0, view.width, view.height);

    // Ink box of everything painted between two glyph-unit x bounds.
    const inkBox = (fromX: number, toX: number) => {
      let top = Infinity;
      let bottom = -Infinity;
      let left = Infinity;
      let right = -Infinity;
      for (let row = 0; row < view.height; row++) {
        for (let col = fromX - view.x; col < toX - view.x; col++) {
          if (data[(row * view.width + col) * 4 + 3]! > 96) {
            top = Math.min(top, row);
            bottom = Math.max(bottom, row + 1);
            left = Math.min(left, col);
            right = Math.max(right, col + 1);
          }
        }
      }
      return {
        centreY: view.y + (top + bottom) / 2,
        left: view.x + left,
        right: view.x + right,
      };
    };
    const open = inkBox(-50, 50);
    const close = inkBox(130, 350);

    expect(Math.abs(open.centreY - 850)).toBeLessThanOrEqual(1.5);
    expect(Math.abs(close.centreY - 850)).toBeLessThanOrEqual(1.5);
    expect(Math.abs(open.right - (50 - 14))).toBeLessThanOrEqual(1.5);
    expect(Math.abs(close.left - (130 + 14))).toBeLessThanOrEqual(1.5);
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
