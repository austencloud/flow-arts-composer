import { render } from "vitest-browser-svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";
import WordHeader from "./WordHeader.svelte";
import { measureHtmlBraceInk } from "$lib/shared/pictograph/tka-glyph/utils/__tests__/html-brace-ink";

const glyphCacheState = vi.hoisted(() => ({
  loaded: new Set<string>(),
  loadCalls: [] as string[][],
  pendingLetters: [] as string[],
  resolvePending: null as (() => void) | null,
}));

vi.mock("$app/environment", () => ({
  browser: true,
  building: false,
  dev: false,
  version: "test",
}));

vi.mock("$lib/shared/render/get-glyph-cache", () => ({
  getGlyphCache: () => ({
    getGlyphDataUrl: (letter: string) =>
      glyphCacheState.loaded.has(letter) ? "/test-glyph.svg" : null,
    loadGlyphsByLetter: (letters: string[]) => {
      glyphCacheState.loadCalls.push([...letters]);
      glyphCacheState.pendingLetters = [...letters];

      return new Promise<void>((resolve) => {
        glyphCacheState.resolvePending = () => {
          for (const letter of glyphCacheState.pendingLetters) {
            glyphCacheState.loaded.add(letter);
          }
          resolve();
        };
      });
    },
  }),
}));

beforeEach(() => {
  glyphCacheState.loaded.clear();
  glyphCacheState.loadCalls.length = 0;
  glyphCacheState.pendingLetters = [];
  glyphCacheState.resolvePending = null;
});

describe("WordHeader glyph loading", () => {
  it("keeps a Greek letter visible while loading and repaints from the cache", async () => {
    render(WordHeader, {
      word: "γ",
      visible: true,
    });

    await vi.waitFor(() => {
      expect(document.querySelector(".letter")?.textContent).toContain("γ");
    });

    const fallback = document.querySelector(".letter") as HTMLElement;
    expect(getComputedStyle(fallback).fontFamily).toContain("TKA Letters");
    await vi.waitFor(() => {
      expect(glyphCacheState.loadCalls).toEqual([["γ"]]);
    });

    glyphCacheState.resolvePending?.();

    await vi.waitFor(() => {
      expect(document.querySelector('img[alt="γ"]')).not.toBeNull();
    });
  });
});

describe("WordHeader glyph sizing", () => {
  /**
   * The bug this locks: `.word-text` is a flex row, and the letters inside it did
   * not opt out of shrinking. A word wider than its box therefore absorbed the
   * overflow by squashing every glyph — each kept its full height while its width
   * collapsed. Measured on a real profile title: `W-` (a 120x100 glyph) and `Θ-`
   * (79x100) both came out 21.8px wide, and five letters collapsed to 0.
   */
  it("never lets a letter or its glyph absorb overflow by shrinking", async () => {
    render(WordHeader, { word: "WΘOYEΩXΩOZDΘ", visible: true });

    await vi.waitFor(() => {
      expect(document.querySelector(".letter")).not.toBeNull();
    });

    const letter = document.querySelector(".letter") as HTMLElement;
    expect(getComputedStyle(letter).flexShrink).toBe("0");

    glyphCacheState.resolvePending?.();

    await vi.waitFor(() => {
      expect(document.querySelector("img.glyph-img")).not.toBeNull();
    });

    const img = document.querySelector("img.glyph-img") as HTMLElement;
    expect(getComputedStyle(img).flexShrink).toBe("0");
  });

  /**
   * `--word-em` is the width estimate the font-size fits itself to. A dash-letter
   * is nearly twice as wide as a plain one (the glyph plus `.dash-bar`'s 0.70em
   * and a gap), so a flat per-letter average left dash-heavy titles overflowing.
   */
  it("charges a dash-letter more width than a plain letter", async () => {
    const readWordEm = async () => {
      await vi.waitFor(() => {
        expect(document.querySelector(".word-text")).not.toBeNull();
      });
      const el = document.querySelector(".word-text") as HTMLElement;
      return Number(el.style.getPropertyValue("--word-em"));
    };

    const plain = render(WordHeader, { word: "AB", visible: true });
    const plainEm = await readWordEm();
    plain.unmount();

    render(WordHeader, { word: "A-B-", visible: true });
    const dashEm = await readWordEm();

    expect(plainEm).toBeGreaterThan(0);
    expect(dashEm).toBeGreaterThan(plainEm * 1.5);
  });
});

describe("WordHeader title transitions", () => {
  it("eventually displays the latest word after changes during an active transition", async () => {
    const screen = render(WordHeader, { word: "A", visible: true });

    await vi.waitFor(() => {
      expect(document.querySelector(".word-text")?.textContent).toContain("A");
    });

    await screen.rerender({ word: "B", visible: true });
    await screen.rerender({ word: "C", visible: true });

    await vi.waitFor(
      () => {
        expect(document.querySelector(".word-text")?.textContent).toContain(
          "C"
        );
      },
      { timeout: 1500 }
    );
  });
});

describe("WordHeader skewed spans", () => {
  /**
   * A rotate-45 fuse stores its word as one braced span, "{ΨΩZ-VΦΔW-T}". The
   * braces are notation, not beats: the highlight has to walk the eight
   * letters, and the braces have to read as brackets around them, drawn at the
   * letters' own height rather than as two more dim letters.
   */
  const SKEWED_WORD = "{ΨΩZ-VΦΔW-T}";

  it("renders the braces as span marks, not as letter units", async () => {
    render(WordHeader, { word: SKEWED_WORD, visible: true });

    await vi.waitFor(() => {
      expect(document.querySelectorAll(".letter").length).toBe(8);
    });
    const braces = [...document.querySelectorAll(".skew-brace")].map(
      (el) => el.textContent?.trim()
    );
    expect(braces).toEqual(["{", "}"]);
    expect(
      [...document.querySelectorAll(".letter")].map((el) => el.textContent?.trim())
    ).toEqual(["Ψ", "Ω", "Z-", "V", "Φ", "Δ", "W-", "T"]);
  });

  it("highlights the beat's own letter and wraps on the letter count", async () => {
    const activeLetter = () =>
      document.querySelector(".letter.active")?.textContent?.trim() ?? null;

    const screen = render(WordHeader, {
      word: SKEWED_WORD,
      visible: true,
      activeStepNumber: 1,
    });
    await vi.waitFor(() => expect(activeLetter()).toBe("Ψ"), { timeout: 1500 });

    await screen.rerender({ word: SKEWED_WORD, visible: true, activeStepNumber: 8 });
    await vi.waitFor(() => expect(activeLetter()).toBe("T"));

    await screen.rerender({ word: SKEWED_WORD, visible: true, activeStepNumber: 9 });
    await vi.waitFor(() => expect(activeLetter()).toBe("Ψ"));

    expect(document.querySelector(".skew-brace.active")).toBeNull();
  });

  it("draws the braces at least as tall as the letters", async () => {
    render(WordHeader, { word: SKEWED_WORD, visible: true });

    await vi.waitFor(() => {
      expect(document.querySelector(".skew-brace")).not.toBeNull();
    });
    const wordText = document.querySelector(".word-text") as HTMLElement;
    const brace = document.querySelector(".skew-brace") as HTMLElement;
    const letterEm = parseFloat(getComputedStyle(wordText).fontSize);
    const braceEm = parseFloat(getComputedStyle(brace).fontSize);
    expect(braceEm).toBeGreaterThanOrEqual(letterEm);
    expect(getComputedStyle(brace).fontFamily).not.toContain("TKA Letters");
  });

  it("centres each brace's ink on the letters and matches their height", async () => {
    render(WordHeader, { word: SKEWED_WORD, visible: true });

    await vi.waitFor(() => {
      expect(document.querySelectorAll(".skew-brace")).toHaveLength(2);
    });
    // Retried until the entrance transitions settle at rest.
    await vi.waitFor(() => {
      const letter = document.querySelector(".letter") as HTMLElement;
      const letterBox = letter.getBoundingClientRect();
      const letterCentre = (letterBox.top + letterBox.bottom) / 2;
      for (const brace of document.querySelectorAll<HTMLElement>(".skew-brace")) {
        const ink = measureHtmlBraceInk(brace);
        // A line-height box centres the font's whole ascent+descent, which
        // put the brace ink about 0.17 letter-heights low.
        expect(Math.abs(ink.centreY - letterCentre)).toBeLessThanOrEqual(
          0.03 * letterBox.height
        );
        expect(Math.abs(ink.height - letterBox.height)).toBeLessThanOrEqual(
          0.06 * letterBox.height
        );
      }
    });
  });

  it("wraps a compressed whole-word span in one brace pair", async () => {
    render(WordHeader, {
      word: "{STSSTS}",
      visible: true,
      activeStepNumber: 4,
    });

    await vi.waitFor(() => {
      expect(document.querySelectorAll(".letter").length).toBe(3);
    });
    expect(document.querySelectorAll(".skew-brace").length).toBe(2);
    await vi.waitFor(() =>
      expect(
        document.querySelector(".letter.active")?.textContent?.trim()
      ).toBe("S")
    );
    expect(
      [...document.querySelectorAll(".letter")].indexOf(
        document.querySelector(".letter.active")!
      )
    ).toBe(0);
  });
});
