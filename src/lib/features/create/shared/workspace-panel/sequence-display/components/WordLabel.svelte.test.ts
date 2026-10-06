import { render } from "vitest-browser-svelte";
import { page } from "vitest/browser";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { expectNoA11yViolations } from "$test-helpers/component-a11y";
import WordLabel from "./WordLabel.svelte";

const stubs = vi.hoisted(() => ({
  speak: vi.fn().mockResolvedValue({ source: "synthetic" }),
  cancel: vi.fn(),
  clipboardWrite: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("$lib/shared/render/get-glyph-cache", () => ({
  getGlyphCache: () => ({
    getGlyphDataUrl: () => null,
    loadGlyphsByLetter: () => Promise.resolve(),
  }),
}));

vi.mock("$lib/shared/pronunciation/get-pronunciation-player", () => ({
  getPronunciationPlayer: () => ({
    isSupported: () => true,
    speak: stubs.speak,
    cancel: stubs.cancel,
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: stubs.clipboardWrite },
  });
});

function renderWordLabel() {
  render(WordLabel, { word: "AΣ-" });
  return page.getByRole("button", {
    name: "Current word: AΣ-. Open word actions.",
  });
}

describe("WordLabel word actions", () => {
  it("keeps inverse halves grouped while highlighting the expanded beat", () => {
    render(WordLabel, { word: "MW-Θ-QNX-Ω-P", activeStepNumber: 5 });
    const letters = document.querySelectorAll(".word-label .letter");
    expect(letters).toHaveLength(8);
    expect(document.querySelectorAll(".word-label .group-dot")).toHaveLength(1);
    expect(document.querySelector(".word-label .letter.active")).toBe(letters[4]);
  });

  it("opens the action menu and reads the exact workspace label aloud", async () => {
    const trigger = renderWordLabel();

    await trigger.click();
    await expect.element(trigger).toHaveAttribute("aria-expanded", "true");

    const readAloud = page.getByRole("menuitem", {
      name: "Read aloud",
    });
    await expect.element(readAloud).toBeVisible();
    await readAloud.click();

    expect(stubs.speak).toHaveBeenCalledTimes(1);
    expect(stubs.speak).toHaveBeenCalledWith("AΣ-");
  });

  it("copies from the menu instead of copying on the trigger click", async () => {
    const trigger = renderWordLabel();

    await trigger.click();
    expect(stubs.clipboardWrite).not.toHaveBeenCalled();

    const copyWord = page.getByRole("menuitem", {
      name: "Copy word",
    });
    await expect.element(copyWord).toBeVisible();
    await copyWord.click();

    expect(stubs.clipboardWrite).toHaveBeenCalledTimes(1);
    expect(stubs.clipboardWrite).toHaveBeenCalledWith("AΣ-");
    await expect
      .element(page.getByRole("status"))
      .toHaveTextContent("Copied “AΣ-”");
  });

  it("opens the action menu on right-click", async () => {
    const trigger = renderWordLabel();

    await trigger.click({ button: "right" });

    const readAloud = page.getByRole("menuitem", {
      name: "Read aloud",
    });
    await expect.element(readAloud).toBeVisible();
  });

  it("opens the action menu after a touch long-press", async () => {
    renderWordLabel();
    const trigger = document.querySelector<HTMLButtonElement>(
      'button[aria-label="Current word: AΣ-. Open word actions."]'
    );
    expect(trigger).not.toBeNull();

    trigger!.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        button: 0,
        clientX: 40,
        clientY: 40,
        pointerType: "touch",
      })
    );

    const readAloud = page.getByRole("menuitem", {
      name: "Read aloud",
    });
    await expect.element(readAloud).toBeVisible();

    trigger!.dispatchEvent(
      new PointerEvent("pointerup", {
        bubbles: true,
        button: 0,
        clientX: 40,
        clientY: 40,
        pointerType: "touch",
      })
    );
  });

  it("has no AAA accessibility violations", async () => {
    renderWordLabel();
    await expectNoA11yViolations();
  });
});
