import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "$lib/shared/settings/state/settings-state.svelte";
import type { AppSettings } from "$lib/shared/settings/domain/app-settings";

describe("triangle grip setting", () => {
  it("defaults to the corner grip next to the fan appearance", () => {
    expect(DEFAULT_SETTINGS.triangleGrip).toBe("corner");
    const settings: AppSettings = { ...DEFAULT_SETTINGS, triangleGrip: "side" };
    expect(settings.triangleGrip).toBe("side");
  });
});
