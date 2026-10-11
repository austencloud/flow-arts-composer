import { BackgroundType } from "@austencloud/backgrounds";
import { describe, expect, it } from "vitest";

import { PRIDE_BACKGROUND_TYPE } from "#lib/shared/settings/domain/background-type-migration.js";
import {
  getShowroomTheme,
  getShowroomThemeFromId,
  SHOWROOM_THEMES,
} from "#lib/shared/settings/components/tabs/background/showroom/theme-showroom-data.js";

describe("theme showroom data", () => {
  it("covers every selectable environment exactly once", () => {
    const expectedTypes = [
      BackgroundType.EMBER,
      BackgroundType.COSMIC,
      BackgroundType.OCEAN,
      BackgroundType.FOREST,
      BackgroundType.WINTER,
      PRIDE_BACKGROUND_TYPE,
      BackgroundType.BLOSSOM,
      BackgroundType.AUTUMN,
      BackgroundType.CELESTIAL,
      BackgroundType.VOID,
    ];

    expect(SHOWROOM_THEMES.map((theme) => theme.id)).toEqual(expectedTypes);
    expect(new Set(SHOWROOM_THEMES.map((theme) => theme.id)).size).toBe(10);
  });

  it("provides card art and camera framing for every environment", () => {
    for (const theme of SHOWROOM_THEMES) {
      expect(theme.card.type).toBe(theme.id);
      expect(theme.card.gradient).toBeTruthy();
      expect(theme.card.accentColor).toBeTruthy();
      expect(theme.camera.position).toHaveLength(3);
      expect(theme.camera.target).toHaveLength(3);
      expect(theme.camera.fov).toBeGreaterThan(0);
      expect(getShowroomTheme(theme.id)).toBe(theme);
    }
  });

  it("keeps the Winter review orbit outside the authored tree belt", () => {
    const camera = getShowroomTheme(BackgroundType.WINTER).camera;
    const distanceFromTarget = Math.hypot(
      camera.position[0] - camera.target[0],
      camera.position[1] - camera.target[1],
      camera.position[2] - camera.target[2]
    );

    expect(distanceFromTarget).toBeGreaterThan(48);
    expect(camera.minDistance).toBe(16);
    expect(camera.maxDistance).toBeGreaterThan(distanceFromTarget);
  });

  it("keeps Autumn and Void adjacent to Celestial for the Gate 5 integration route", () => {
    const celestialIndex = SHOWROOM_THEMES.findIndex(
      (theme) => theme.id === BackgroundType.CELESTIAL
    );

    expect(SHOWROOM_THEMES[celestialIndex - 1]?.id).toBe(BackgroundType.AUTUMN);
    expect(SHOWROOM_THEMES[celestialIndex + 1]?.id).toBe(BackgroundType.VOID);
  });

  it("resolves environment links without accepting unknown values", () => {
    expect(getShowroomThemeFromId("autumn")).toBe(BackgroundType.AUTUMN);
    expect(getShowroomThemeFromId("unknown")).toBeUndefined();
    expect(getShowroomThemeFromId(null)).toBeUndefined();
  });
});
