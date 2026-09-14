import { afterEach, describe, expect, it } from "vitest";
import {
  clearStoredSettings,
  getSettings,
  setCurrentPropType,
  settingsService,
  updateSettings,
} from "../../../apps/shape-engine/src/native-settings.svelte";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";

afterEach(clearStoredSettings);

describe("Shape Engine local renderer settings", () => {
  it("keeps appearance settings when changing the selected prop", async () => {
    await updateSettings({
      fanAppearance: { build: "day", frameColor: "white", cover: "covered" },
      leftBuugengFlipped: true,
    });
    await setCurrentPropType(PropType.FAN);
    expect(getSettings().fanAppearance).toEqual({
      build: "day", frameColor: "white", cover: "covered",
    });
    expect(getSettings().leftBuugengFlipped).toBe(true);
    expect(settingsService.currentSettings.leftPropType).toBe(PropType.FAN);
    expect(settingsService.currentSettings.rightPropType).toBe(PropType.FAN);
  });

  it("exposes fan updates to an already-mounted renderer and restores them from storage", async () => {
    const rendererSettings = settingsService.currentSettings;
    await updateSettings({
      fanAppearance: { build: "lotus", frameColor: "black", cover: "bare" },
    });
    expect(rendererSettings.fanAppearance?.build).toBe("lotus");
    rendererSettings.fanAppearance = { build: "fire", frameColor: "black", cover: "bare" };
    await settingsService.loadSettings();
    expect(rendererSettings.fanAppearance?.build).toBe("lotus");
  });
});
