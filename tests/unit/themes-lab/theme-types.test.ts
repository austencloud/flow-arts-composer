import { describe, it, expect } from "vitest";
import { BackgroundType } from "@austencloud/backgrounds";
import {
  THEME_OPTIONS,
  getThemeOption,
  type ThemeId,
} from "#lib/features/themes-lab/domain/theme-types.js";
import { PRIDE_BACKGROUND_TYPE } from "#lib/shared/settings/domain/background-type-migration.js";

describe("THEME_OPTIONS", () => {
  it("has exactly 10 themes", () => {
    expect(THEME_OPTIONS).toHaveLength(10);
  });

  it("every theme has unique id", () => {
    const ids = THEME_OPTIONS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every theme has both backgroundType and sceneId", () => {
    for (const theme of THEME_OPTIONS) {
      expect(theme.backgroundType).toBeTruthy();
      expect(theme.sceneId).toBeTruthy();
    }
  });

  it("maps ocean ThemeId to OCEAN BackgroundType and ocean SceneId", () => {
    const ocean = getThemeOption("ocean");
    expect(ocean?.backgroundType).toBe("ocean" as BackgroundType);
    expect(ocean?.sceneId).toBe("ocean");
  });

  it("maps cosmic ThemeId to COSMIC BackgroundType and cosmic SceneId", () => {
    const cosmic = getThemeOption("cosmic");
    expect(cosmic?.backgroundType).toBe("cosmic" as BackgroundType);
    expect(cosmic?.sceneId).toBe("cosmic");
  });

  it("maps the Rainbow tab to whichever name the loaded bundle gives that background", () => {
    const rainbow = getThemeOption("rainbow");
    expect(rainbow?.backgroundType).toBe(PRIDE_BACKGROUND_TYPE);
    expect(rainbow?.sceneId).toBe("rainbow");
  });

  it("returns undefined for invalid ThemeId", () => {
    expect(getThemeOption("invalid" as ThemeId)).toBeUndefined();
  });
});
