import { describe, expect, it } from "vitest";

import { normalizeLegacyAppSettings } from "$lib/shared/settings/domain/app-settings";

describe("normalizeLegacyAppSettings position -> placement rename", () => {
  it("maps visibility.positionsGlyph to visibility.placementsGlyph when the new key is absent", () => {
    const normalized = normalizeLegacyAppSettings({
      visibility: { positionsGlyph: true, tkaGlyph: false },
    }) as Record<string, unknown>;

    const visibility = normalized.visibility as Record<string, unknown>;
    expect(visibility.placementsGlyph).toBe(true);
    expect(visibility.positionsGlyph).toBeUndefined();
    expect(visibility.tkaGlyph).toBe(false);
  });

  it("keeps an already-present visibility.placementsGlyph over the legacy key", () => {
    const normalized = normalizeLegacyAppSettings({
      visibility: { positionsGlyph: true, placementsGlyph: false },
    }) as Record<string, unknown>;

    const visibility = normalized.visibility as Record<string, unknown>;
    expect(visibility.placementsGlyph).toBe(false);
  });

  it("maps blockedStartPositions to blockedStartPlacements when absent", () => {
    const normalized = normalizeLegacyAppSettings({
      blockedStartPositions: ["alpha1"],
    }) as Record<string, unknown>;

    expect(normalized.blockedStartPlacements).toEqual(["alpha1"]);
    expect(normalized.blockedStartPositions).toBeUndefined();
  });

  it("keeps an already-present blockedStartPlacements over the legacy key", () => {
    const normalized = normalizeLegacyAppSettings({
      blockedStartPositions: ["alpha1"],
      blockedStartPlacements: ["beta5"],
    }) as Record<string, unknown>;

    expect(normalized.blockedStartPlacements).toEqual(["beta5"]);
  });

  it("maps blockedStartPositionsByGridMode to blockedStartPlacementsByGridMode when absent", () => {
    const normalized = normalizeLegacyAppSettings({
      blockedStartPositionsByGridMode: { DIAMOND: ["alpha1"] },
    }) as Record<string, unknown>;

    expect(normalized.blockedStartPlacementsByGridMode).toEqual({
      DIAMOND: ["alpha1"],
    });
    expect(normalized.blockedStartPositionsByGridMode).toBeUndefined();
  });

  it("maps imageExport.includeStartPosition to includeStartPlacement when absent", () => {
    const normalized = normalizeLegacyAppSettings({
      imageExport: { includeStartPosition: false, addWord: true },
    }) as Record<string, unknown>;

    const imageExport = normalized.imageExport as Record<string, unknown>;
    expect(imageExport.includeStartPlacement).toBe(false);
    expect(imageExport.includeStartPosition).toBeUndefined();
    expect(imageExport.addWord).toBe(true);
  });

  it("keeps an already-present imageExport.includeStartPlacement over the legacy key", () => {
    const normalized = normalizeLegacyAppSettings({
      imageExport: { includeStartPosition: false, includeStartPlacement: true },
    }) as Record<string, unknown>;

    const imageExport = normalized.imageExport as Record<string, unknown>;
    expect(imageExport.includeStartPlacement).toBe(true);
  });

  it("does not mutate the caller's nested objects", () => {
    const source = {
      visibility: { positionsGlyph: true },
      imageExport: { includeStartPosition: true },
    };
    normalizeLegacyAppSettings(source);

    expect(source.visibility).toEqual({ positionsGlyph: true });
    expect(source.imageExport).toEqual({ includeStartPosition: true });
  });

  it("passes non-object values through untouched", () => {
    expect(normalizeLegacyAppSettings(null)).toBeNull();
    expect(normalizeLegacyAppSettings("x")).toBe("x");
  });
});
