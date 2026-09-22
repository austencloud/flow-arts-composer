import { describe, it, expect, vi, beforeEach } from "vitest";
import type { GlyphImageData } from "@tka/render-composition";

const glyphCacheMock = vi.hoisted(() => {
  const loadedLetters = new Set<string>();
  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    loadGlyphsByLetter: vi.fn(async (letters: readonly string[]) => {
      letters.forEach((letter) => loadedLetters.add(letter));
    }),
    getGlyphDataUrl: (letter: string) =>
      loadedLetters.has(letter)
        ? "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iODAiIGhlaWdodD0iMTAwIi8+"
        : null,
    loadedLetters,
    throwOnAccess: false,
  };
});

// Mock getGlyphCache before importing TextRenderer
vi.mock("$lib/shared/render/get-glyph-cache", () => ({
  getGlyphCache: () => {
    if (glyphCacheMock.throwOnAccess) {
      throw new Error("browser-only glyph cache accessed");
    }
    return glyphCacheMock;
  },
}));

// Mock Image constructor to auto-fire onload with fixed dimensions
class MockImage {
  naturalWidth = 80;
  naturalHeight = 100;
  onload: (() => void) | null = null;
  set src(_: string) {
    Promise.resolve().then(() => this.onload?.());
  }
}

vi.stubGlobal("Image", MockImage);

// Import AFTER mocks are set up
const { TextRenderer } =
  await import("$lib/shared/render/services/text-renderer");

describe("TextRenderer glyph methods", () => {
  let renderer: InstanceType<typeof TextRenderer>;

  beforeEach(async () => {
    renderer = new TextRenderer();
    glyphCacheMock.loadedLetters.clear();
    ["A", "B", "W", "W-", "Σ"].forEach((letter) =>
      glyphCacheMock.loadedLetters.add(letter)
    );
    glyphCacheMock.initialize.mockClear();
    glyphCacheMock.loadGlyphsByLetter.mockClear();
    glyphCacheMock.throwOnAccess = false;
    await renderer.preloadGlyphImages();
  });

  it("preloadGlyphImages populates glyphImageCache for known letters", () => {
    const map = renderer.buildGlyphMap("AB");
    expect(map.size).toBe(2);
    expect(map.has("A")).toBe(true);
    expect(map.has("B")).toBe(true);
  });

  it("buildGlyphMap returns GlyphImageData with correct isDash=false for plain letters", () => {
    const map = renderer.buildGlyphMap("A");
    const entry = map.get("A")!;
    expect(entry.isDash).toBe(false);
    expect(entry.naturalWidth).toBe(80);
    expect(entry.naturalHeight).toBe(100);
  });

  it("buildGlyphMap sets isDash=true for dash letters", () => {
    const map = renderer.buildGlyphMap("W-");
    const entry = map.get("W-")!;
    expect(entry).toBeDefined();
    expect(entry.isDash).toBe(true);
  });

  it("buildGlyphMap silently omits letters not in cache", () => {
    const map = renderer.buildGlyphMap("AZ");
    expect(map.has("A")).toBe(true);
    expect(map.has("Z")).toBe(false);
  });

  it("buildGlyphMap handles empty word", () => {
    const map = renderer.buildGlyphMap("");
    expect(map.size).toBe(0);
  });

  it("preloads only the Unicode-aware TKA tokens required by a header", async () => {
    const scopedRenderer = new TextRenderer();
    glyphCacheMock.loadedLetters.clear();
    glyphCacheMock.initialize.mockClear();
    glyphCacheMock.loadGlyphsByLetter.mockClear();

    await scopedRenderer.preloadGlyphImagesForWord("AΣ-");

    expect(glyphCacheMock.loadGlyphsByLetter).toHaveBeenCalledWith(["A", "Σ-"]);
    expect(scopedRenderer.buildGlyphMap("AΣ-").size).toBe(2);
    expect(glyphCacheMock.initialize).not.toHaveBeenCalled();
  });

  it("loads glyphs missing from a later header word", async () => {
    const scopedRenderer = new TextRenderer();
    glyphCacheMock.loadedLetters.clear();
    glyphCacheMock.loadGlyphsByLetter.mockClear();

    await scopedRenderer.preloadGlyphImagesForWord("AB");
    await scopedRenderer.preloadGlyphImagesForWord("W-");

    expect(glyphCacheMock.loadGlyphsByLetter).toHaveBeenNthCalledWith(1, [
      "A",
      "B",
    ]);
    expect(glyphCacheMock.loadGlyphsByLetter).toHaveBeenNthCalledWith(2, [
      "W-",
    ]);
    expect(scopedRenderer.buildGlyphMap("ABW-").size).toBe(3);
  });

  it("uses worker-seeded glyph bitmaps without accessing the browser glyph cache", async () => {
    const seededRenderer = new TextRenderer();
    seededRenderer.setGlyphBitmaps([
      {
        letter: "A",
        bitmap: {} as ImageBitmap,
        naturalWidth: 80,
        naturalHeight: 100,
        isDash: false,
      },
    ]);
    glyphCacheMock.throwOnAccess = true;

    await expect(
      seededRenderer.preloadGlyphImagesForWord("A")
    ).resolves.toBeUndefined();
    expect(seededRenderer.buildGlyphMap("A").size).toBe(1);
  });
});
