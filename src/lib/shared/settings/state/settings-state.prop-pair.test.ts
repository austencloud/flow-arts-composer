import { beforeEach, describe, expect, it, vi } from "vitest";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";

vi.mock("$app/environment", () => ({
  browser: true,
  dev: true,
  building: false,
  version: "test",
}));
vi.mock("$lib/shared/auth/firebase", () => ({ auth: { currentUser: null } }));
vi.mock("$lib/shared/analytics/services/posthog-activity-logger", () => ({
  logSettingChange: vi.fn(),
}));

const { settingsService } = await import("./settings-state.svelte");
const { logSettingChange } = await import(
  "$lib/shared/analytics/services/posthog-activity-logger"
);

const STORAGE_KEY = "tka-modern-web-settings";

describe("settings enforce the prop pair rule", () => {
  beforeEach(async () => {
    localStorage.clear();
    vi.mocked(logSettingChange).mockClear();
    await settingsService.updateSettings({
      leftPropType: PropType.STAFF,
      rightPropType: PropType.STAFF,
      catDogMode: false,
    });
  });

  it("turns cat dog on when one hand makes the hands differ", async () => {
    await settingsService.updateSettings({ rightPropType: PropType.FAN });
    expect(settingsService.settings).toMatchObject({
      leftPropType: PropType.STAFF,
      rightPropType: PropType.FAN,
      catDogMode: true,
      propType: PropType.STAFF,
    });
  });

  it("folds the right hand when updateSetting turns cat dog off", async () => {
    await settingsService.updateSettings({ rightPropType: PropType.FAN });
    await settingsService.updateSetting("catDogMode", false);
    expect(settingsService.settings).toMatchObject({
      leftPropType: PropType.STAFF,
      rightPropType: PropType.STAFF,
      catDogMode: false,
    });
  });

  it("moves both hands for a legacy propType write", async () => {
    await settingsService.updateSetting("propType", PropType.CLUB);
    expect(settingsService.settings).toMatchObject({
      leftPropType: PropType.CLUB,
      rightPropType: PropType.CLUB,
      catDogMode: false,
    });
  });

  it("heals a stored stale flag on load", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        leftPropType: PropType.STAFF,
        rightPropType: PropType.FAN,
        catDogMode: false,
      })
    );
    await settingsService.loadSettings();
    expect(settingsService.settings).toMatchObject({
      leftPropType: PropType.STAFF,
      rightPropType: PropType.FAN,
      catDogMode: true,
      propType: PropType.STAFF,
    });
  });

  it("heals a legacy propType-only stored profile to both hands on load", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ propType: PropType.FAN }));
    await settingsService.loadSettings();
    expect(settingsService.settings).toMatchObject({
      leftPropType: PropType.FAN,
      rightPropType: PropType.FAN,
      catDogMode: false,
      propType: PropType.FAN,
    });
  });

  it("turns cat dog on for the prop drawer or voice per-hand path", async () => {
    await settingsService.updateSetting("rightPropType", PropType.FAN);
    expect(settingsService.settings).toMatchObject({
      leftPropType: PropType.STAFF,
      rightPropType: PropType.FAN,
      catDogMode: true,
      propType: PropType.STAFF,
    });
  });

  it("still emits the analytics event for a pair-key updateSetting", async () => {
    await settingsService.updateSetting("rightPropType", PropType.FAN);
    // The call is fire-and-forget behind a dynamic import, so wait for the
    // microtask queue to drain rather than asserting immediately.
    await vi.waitFor(() => {
      expect(logSettingChange).toHaveBeenCalledWith(
        "rightPropType",
        String(PropType.STAFF),
        String(PropType.FAN)
      );
    });
  });
});
