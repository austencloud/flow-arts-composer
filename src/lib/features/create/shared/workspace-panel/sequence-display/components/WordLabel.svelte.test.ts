import { render } from "vitest-browser-svelte";
import { page } from "vitest/browser";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { expectNoA11yViolations } from "#test-helpers/component-a11y.js";
import WordLabel from "./WordLabel.svelte";

const stubs = vi.hoisted(() => ({
  speak: vi.fn().mockResolvedValue({ source: "synthetic" }),
  cancel: vi.fn(),
  clipboardWrite: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("#lib/shared/render/get-glyph-cache.js", () => ({
  getGlyphCache: () => ({
    getGlyphDataUrl: () => null,
    loadGlyphsByLetter: () => Promise.resolve(),
  }),
}));

vi.mock("#lib/shared/pronunciation/get-pronunciation-player.js", () => ({
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
    const letters = document.querySelectorAll(".word-fit-row .letter");
    expect(letters).toHaveLength(8);
    expect(document.querySelectorAll(".word-fit-row .group-dot")).toHaveLength(
      1
    );
    expect(document.querySelector(".word-fit-row .letter.active")).toBe(
      letters[4]
    );
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

  it("keeps the measuring ruler out of sight, touch and the accessible name", async () => {
    const trigger = renderWordLabel();
    await expect.element(trigger).toBeVisible();

    const frame = document.querySelector<HTMLElement>(".word-ruler-frame");
    expect(frame).not.toBeNull();
    expect(frame!.getAttribute("aria-hidden")).toBe("true");
    expect(frame!.inert).toBe(true);
    expect(getComputedStyle(frame!).visibility).toBe("hidden");
    expect(getComputedStyle(frame!).pointerEvents).toBe("none");
    for (const img of frame!.querySelectorAll("img")) {
      expect(img.getAttribute("alt")).toBe("");
    }

    // A hit test in the button's middle lands on the button's own row.
    const button = trigger.element() as HTMLElement;
    const box = button.getBoundingClientRect();
    const hit = document.elementFromPoint(
      box.left + box.width / 2,
      box.top + box.height / 2
    );
    expect(hit && frame!.contains(hit)).toBeFalsy();
  });

  it("cuts a word that cannot fit to whole letters and one ellipsis, keeping the full word in its name", async () => {
    const word = "KIΨ-DCΨIΘX-Ω-VVYΩVX";
    const host = document.createElement("div");
    host.className = "word-label-slot";
    host.style.width = "60px";
    document.body.append(host);
    render(WordLabel, { target: host, props: { word } });

    const button = host.querySelector<HTMLButtonElement>("button.word-label")!;
    await expect.element(button).toBeVisible();
    await expect
      .poll(() => host.querySelectorAll(".word-fit-row .ellipsis").length)
      .toBe(1);

    expect(button.getAttribute("aria-label")).toContain(word);
    const shown = host.querySelectorAll(".word-fit-row .letter").length;
    expect(shown).toBeGreaterThanOrEqual(1);
    expect(shown).toBeLessThan(12);
    // Whole letters only: nothing in the row is narrower than it is drawn.
    for (const letter of host.querySelectorAll<HTMLElement>(
      ".word-fit-row .letter"
    )) {
      expect(letter.getBoundingClientRect().width).toBeGreaterThan(0);
    }
    expect(button.getBoundingClientRect().width).toBeLessThanOrEqual(
      host.getBoundingClientRect().width + 0.5
    );
    host.remove();
  });

  it("never lets a letter, dot, bar or chevron shrink", () => {
    render(WordLabel, { word: "MW-Θ-QNX-Ω-P" });
    const pieces = document.querySelectorAll<HTMLElement>(
      ".word-fit-row > .letter, .word-fit-row > .group-dot, .word-fit-row > .menu-indicator"
    );
    expect(pieces.length).toBeGreaterThan(0);
    for (const piece of pieces) {
      expect(getComputedStyle(piece).flexShrink).toBe("0");
    }
    const button = document.querySelector<HTMLElement>(".word-label.has-word")!;
    expect(getComputedStyle(button).overflow).toBe("visible");
  });

  it("has no AAA accessibility violations", async () => {
    renderWordLabel();
    await expectNoA11yViolations();
  });
});
