import { render } from "vitest-browser-svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";
import WordHeader from "./WordHeader.svelte";

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
