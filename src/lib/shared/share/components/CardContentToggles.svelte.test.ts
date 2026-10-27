import { render } from "vitest-browser-svelte";
import { page } from "vitest/browser";
import { describe, expect, it, vi } from "vitest";
import CardContentToggles from "./CardContentToggles.svelte";

// Settings → Display and the viewer's card panel share these switches. The
// silent failure is a chip wired to the neighbouring setter (Steps writing
// Word, Mandala writing QR), which would look fine until a card is exported.
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
    registerObserver: (o: () => void) => observers.add(o),
    unregisterObserver: (o: () => void) => observers.delete(o),
  };
}

function fakeExportOptions() {
  return { imageDarkMode: false, setImageDarkMode: vi.fn() };
}

describe("CardContentToggles", () => {
  it("routes every chip to its own composition setter", async () => {
    const composition = fakeComposition();
    const exportOptions = fakeExportOptions();
    render(CardContentToggles, {
      composition: composition as never,
      exportOptions: exportOptions as never,
    });

    const cases: [string, ReturnType<typeof vi.fn>, boolean][] = [
      ["Word", composition.setAddWord, false],
      ["Steps", composition.setAddBeatNumbers, false],
      ["Level", composition.setAddDifficultyLevel, true],
      ["LOOP", composition.setShowLoopGlyph, false],
      ["Show", composition.setIncludeStartPlacement, false],
      ["QR", composition.setShowQRCode, false],
      ["Mandala", composition.setShowMandala, false],
    ];
    for (const [name, setter, next] of cases) {
      await page.getByRole("button", { name, exact: true }).click();
      expect(setter, name).toHaveBeenCalledExactlyOnceWith(next);
    }

    await page.getByRole("button", { name: "Dark" }).click();
    expect(exportOptions.setImageDarkMode).toHaveBeenCalledWith(true);
  });

  it("withholds QR from guests", async () => {
    auth.isAuthenticated = false;
    render(CardContentToggles, {
      composition: fakeComposition() as never,
      exportOptions: fakeExportOptions() as never,
    });
    await expect
      .element(page.getByRole("button", { name: "Mandala", exact: true }))
      .toBeVisible();
    expect(
      page.getByRole("button", { name: "QR", exact: true }).elements()
    ).toHaveLength(0);
    auth.isAuthenticated = true;
  });
});
