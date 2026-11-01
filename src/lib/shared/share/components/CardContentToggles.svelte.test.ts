import { render } from "vitest-browser-svelte";
import { page } from "vitest/browser";
import { describe, expect, it, vi } from "vitest";
import CardContentToggles from "./CardContentToggles.svelte";

// Settings → Display and the viewer's card panel share these switches. The
// silent failures are a tile wired to the neighbouring setter (Steps writing
// Word, Hand key writing Reversals) and an info pick that writes nothing the
// card reads; both look fine until a card is exported.
const auth = vi.hoisted(() => ({ isAuthenticated: true }));
vi.mock("#lib/shared/auth/state/auth-state.svelte.js", () => ({
  authState: auth,
}));

function fakeComposition() {
  const observers = new Set<() => void>();
  return {
    addWord: true,
    addStepNumbers: true,
    addDifficultyLevel: false,
    showLoopGlyph: true,
    includeStartPlacement: true,
    showQRCode: true,
    showMandala: true,
    setAddWord: vi.fn(),
    setAddBeatNumbers: vi.fn(),
    setAddDifficultyLevel: vi.fn(),
    setShowLoopGlyph: vi.fn(),
    setIncludeStartPlacement: vi.fn(),
    setShowQRCode: vi.fn(),
    setShowMandala: vi.fn(),
    getInfoCellChoiceForStepCount: vi.fn(() => "qr" as const),
    setInfoCellChoiceForStepCount: vi.fn(),
    getColumnCountForStepCount: vi.fn(() => null),
    getStartPlacementLayoutForStepCount: vi.fn(() => "row" as const),
    registerObserver: (o: () => void) => observers.add(o),
    unregisterObserver: (o: () => void) => observers.delete(o),
  };
}

function fakeVisibility() {
  const values: Record<string, boolean> = {
    reversalIndicators: true,
    handColorKey: false,
  };
  return {
    getRawGlyphVisibility: (key: string) => values[key] ?? false,
    setGlyphVisibility: vi.fn(),
    registerObserver: vi.fn(),
    unregisterObserver: vi.fn(),
  };
}

function fakeExportOptions() {
  return { imageDarkMode: false, setImageDarkMode: vi.fn() };
}

function renderToggles(stepCount: number) {
  const composition = fakeComposition();
  const visibility = fakeVisibility();
  const exportOptions = fakeExportOptions();
  render(CardContentToggles, {
    composition: composition as never,
    visibility: visibility as never,
    exportOptions: exportOptions as never,
    stepCount,
  });
  return { composition, visibility, exportOptions };
}

const button = (name: string) =>
  page.getByRole("button", { name, exact: true });

describe("CardContentToggles", () => {
  it("routes every tile to its own setter", async () => {
    const { composition, visibility, exportOptions } = renderToggles(4);

    const cases: [string, ReturnType<typeof vi.fn>, unknown[]][] = [
      ["Word", composition.setAddWord, [false]],
      ["Step numbers", composition.setAddBeatNumbers, [false]],
      ["Level", composition.setAddDifficultyLevel, [true]],
      ["LOOP", composition.setShowLoopGlyph, [false]],
      ["Show", composition.setIncludeStartPlacement, [false]],
      [
        "Reversals",
        visibility.setGlyphVisibility,
        ["reversalIndicators", false],
      ],
    ];
    for (const [name, setter, args] of cases) {
      await button(name).click();
      expect(setter, name).toHaveBeenCalledExactlyOnceWith(...args);
    }
    visibility.setGlyphVisibility.mockClear();
    await button("Hand key").click();
    expect(visibility.setGlyphVisibility).toHaveBeenCalledExactlyOnceWith(
      "handColorKey",
      true
    );

    await button("Dark").click();
    expect(exportOptions.setImageDarkMode).toHaveBeenCalledWith(true);
  });

  it("offers QR, Mandala and None on a one-cell card, and a pick lands", async () => {
    const { composition } = renderToggles(4);
    await expect.element(button("QR")).toBeVisible();
    await expect.element(button("Mandala")).toBeVisible();
    await expect.element(button("None")).toBeVisible();
    expect(button("Both").elements()).toHaveLength(0);

    // One cell: both globals stay on and the per-length choice decides.
    await button("Mandala").click();
    expect(composition.setInfoCellChoiceForStepCount).toHaveBeenCalledWith(
      4,
      "mandala"
    );
    expect(composition.setShowQRCode).not.toHaveBeenCalled();
    expect(composition.setShowMandala).not.toHaveBeenCalled();
  });

  it("offers Both on a card with two info cells", async () => {
    const { composition } = renderToggles(8);
    await expect.element(button("Both")).toBeVisible();
    await button("None").click();
    expect(composition.setShowQRCode).toHaveBeenCalledWith(false);
    expect(composition.setShowMandala).toHaveBeenCalledWith(false);
  });

  it("withholds QR and Both from guests", async () => {
    auth.isAuthenticated = false;
    renderToggles(8);
    await expect.element(button("Mandala")).toBeVisible();
    expect(button("QR").elements()).toHaveLength(0);
    expect(button("Both").elements()).toHaveLength(0);
    auth.isAuthenticated = true;
  });
});
