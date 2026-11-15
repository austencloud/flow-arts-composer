import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";
import { describe, expect, it } from "vitest";
import { DEFAULT_EFFECTS_CONFIG } from "#lib/shared/effects/domain/defaults.js";
import { createEffectsConfigState } from "#lib/shared/effects/state/effects-config-state.svelte.js";
import { createEffectControlOverrides } from "#lib/shared/effects/effect-control-fields.js";
import { createAnimationSettingsState } from "../../../state/animation-settings-state.svelte";
import { getRegistration } from "../effect-registry";
import EffectsInspector from "../EffectsInspector.svelte";

// The phone dock's tune view swaps the inspector's look cards for a chip row
// and drops its titles to fit a 245px body. The silent failure is a control
// that no longer renders there: a look you cannot pick or a slider that has
// gone, which nobody notices until they reach for it on a phone.
describe("EffectsInspector in the phone dock", () => {
  it("keeps every Trails look and control, and leaves the heading to the host", async () => {
    const config = createEffectsConfigState(
      structuredClone(DEFAULT_EFFECTS_CONFIG),
      { persist: false }
    );
    const settings = createAnimationSettingsState({ ephemeral: true });
    render(EffectsInspector, {
      effect: "trails",
      registration: getRegistration("trails")!,
      config,
      activePresetId: "__default__",
      defaultChipId: "__default__",
      customChipId: "__custom__",
      customDisabled: true,
      customColors: null,
      summary: "",
      overrides: createEffectControlOverrides("trails", config, settings),
      onBack: () => {},
      onDisable: () => {},
      onSelectPreset: () => {},
      dock: true,
      showHeader: false,
    });

    for (const look of ["Original", "Neon", "Ember Trail"]) {
      await expect
        .element(page.getByRole("radio", { name: look, exact: true }))
        .toBeVisible();
    }
    for (const slider of ["Brightness", "Thickness", "Tail"]) {
      await expect
        .element(page.getByRole("slider", { name: slider }))
        .toBeInTheDocument();
    }
    await expect
      .element(page.getByRole("button", { name: "Rainbow" }))
      .toBeVisible();
    await expect.element(page.getByText("Hand", { exact: true })).toBeVisible();

    // The host's header row carries these, so the body must not repeat them.
    expect(
      page.getByRole("button", { name: "All effects" }).elements()
    ).toHaveLength(0);
    expect(page.getByText("Tune look").elements()).toHaveLength(0);
  });
});
