import { describe, it, expect } from "vitest";
import { getImageCompositionManager } from "$lib/shared/share/state/image-composition-state.svelte";
import {
  buildCardVisibilityMenuItems,
  type CardThemeVisibility,
} from "./card-visibility-menu";
import { buildCardMenuSection } from "./card-menu-section";

// The class itself is module-private; the singleton is the only handle.
type ImageCompositionStateManager = ReturnType<typeof getImageCompositionManager>;

// The submenu is a view over the same manager the card options panel edits, so
// the contract worth locking is: checked states mirror the manager, every
// action writes back through it, and the guest QR gate matches the panel.

function makeTheme(dark = true): CardThemeVisibility {
  let imageDarkMode = dark;
  return {
    get imageDarkMode() {
      return imageDarkMode;
    },
    setImageDarkMode(next: boolean) {
      imageDarkMode = next;
    },
  };
}

function build(composition: ImageCompositionStateManager, canQRCode = true) {
  return buildCardVisibilityMenuItems({
    composition,
    exportOptions: makeTheme(),
    canQRCode,
  });
}

function item(composition: ImageCompositionStateManager, id: string, canQRCode = true) {
  const found = build(composition, canQRCode).find((i) => i.id === id);
  if (!found) throw new Error(`missing menu item ${id}`);
  return found;
}

describe("buildCardVisibilityMenuItems", () => {
  it("mirrors the manager's current toggles as checked states", () => {
    const composition = getImageCompositionManager();
    composition.setAddWord(false);
    composition.setAddDifficultyLevel(true);
    composition.setShowLoopGlyph(false);
    composition.setIncludeStartPlacement(true);
    composition.setShowQRCode(false);
    composition.setShowMandala(true);

    const checked = Object.fromEntries(
      build(composition).map((i) => [i.id, i.checked])
    );
    expect(checked).toEqual({
      "card-vis-word-header": false,
      "card-vis-level": true,
      "card-vis-loop-glyph": false,
      "card-vis-start-placement": true,
      "card-vis-qr-code": false,
      "card-vis-mandala": true,
      "card-vis-dark-mode": true,
    });
  });

  it("flips each composition setting through the manager", () => {
    const composition = getImageCompositionManager();
    const cases: Array<[string, () => boolean]> = [
      ["card-vis-word-header", () => composition.addWord],
      ["card-vis-level", () => composition.addDifficultyLevel],
      ["card-vis-loop-glyph", () => composition.showLoopGlyph],
      ["card-vis-start-placement", () => composition.includeStartPlacement],
      ["card-vis-qr-code", () => composition.showQRCode],
      ["card-vis-mandala", () => composition.showMandala],
    ];
    for (const [id, read] of cases) {
      const before = read();
      item(composition, id).action?.();
      expect(read(), id).toBe(!before);
      // Rebuilt menu reflects the new state.
      expect(item(composition, id).checked, id).toBe(!before);
    }
  });

  it("flips dark mode through the export options", () => {
    const theme = makeTheme(false);
    const items = buildCardVisibilityMenuItems({
      composition: getImageCompositionManager(),
      exportOptions: theme,
      canQRCode: true,
    });
    items.find((i) => i.id === "card-vis-dark-mode")?.action?.();
    expect(theme.imageDarkMode).toBe(true);
  });

  it("withholds Dark Mode when no export options are given (outside export mode)", () => {
    const ids = buildCardVisibilityMenuItems({
      composition: getImageCompositionManager(),
      canQRCode: true,
    }).map((i) => i.id);
    expect(ids).not.toContain("card-vis-dark-mode");
  });

  it("withholds the QR entry for guests, like the panel does", () => {
    const composition = getImageCompositionManager();
    const ids = build(composition, false).map((i) => i.id);
    expect(ids).not.toContain("card-vis-qr-code");
    expect(ids).toContain("card-vis-mandala");
  });

  it("keeps the menu open on every toggle so several can be flipped in a row", () => {
    for (const i of build(getImageCompositionManager())) {
      expect(i.keepOpen, i.id).toBe(true);
    }
  });
});

describe("buildCardMenuSection visibility submenu", () => {
  it("lists Visibility first only when the dep is provided", () => {
    const composition = getImageCompositionManager();
    const withDep = buildCardMenuSection({
      visibility: { composition, exportOptions: makeTheme(), canQRCode: true },
      onRerender: () => {},
    });
    expect((withDep[0] as { id?: string }).id).toBe("card-visibility-submenu");
    expect((withDep[0] as { children?: unknown[] }).children).toHaveLength(7);

    const without = buildCardMenuSection({ onRerender: () => {} });
    expect(without.map((e) => (e as { id?: string }).id)).not.toContain(
      "card-visibility-submenu"
    );
  });
});
