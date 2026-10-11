import { describe, expect, it } from "vitest";
import {
  resolveEffectivePropsVisibility,
  setEffectivePropsVisibility,
  toggleEffectivePropsVisibility,
} from "#lib/shared/animation-engine/state/effective-prop-visibility.js";
import { AnimationVisibilityStateManager } from "#lib/shared/animation-engine/state/animation-visibility-state.svelte.js";
import { createAnimationSettingsState } from "#lib/shared/animation-engine/state/animation-settings-state.svelte.js";

function createState() {
  return {
    visibility: new AnimationVisibilityStateManager({ ephemeral: true }),
    settings: createAnimationSettingsState({ ephemeral: true }),
  };
}

describe("effective prop visibility", () => {
  it("reports the state the renderer can actually display", () => {
    expect(resolveEffectivePropsVisibility(true, false)).toBe(true);
    expect(resolveEffectivePropsVisibility(true, true)).toBe(false);
    expect(resolveEffectivePropsVisibility(false, false)).toBe(false);
    expect(resolveEffectivePropsVisibility(false, true)).toBe(false);
  });

  it("shows props with one activation from a persisted trail-only state", () => {
    const { visibility, settings } = createState();
    settings.setHideProps(true);

    expect(
      resolveEffectivePropsVisibility(
        visibility.getVisibility("props"),
        settings.trail.hideProps
      )
    ).toBe(false);

    toggleEffectivePropsVisibility(visibility, settings);

    expect(visibility.getVisibility("props")).toBe(true);
    expect(settings.trail.hideProps).toBe(false);
    expect(
      resolveEffectivePropsVisibility(
        visibility.getVisibility("props"),
        settings.trail.hideProps
      )
    ).toBe(true);
  });

  it("clears the trail-only veto before publishing a visible state", () => {
    const calls: string[] = [];
    let hideProps = true;
    const visibility = {
      getVisibility: (_key: "props") => true,
      setVisibility: (_key: "props", visible: boolean) => {
        calls.push(`props:${visible}`);
      },
    };
    const settings = {
      get trail() {
        return { hideProps };
      },
      setHideProps(hide: boolean) {
        hideProps = hide;
        calls.push(`trail-only:${hide}`);
      },
    };

    setEffectivePropsVisibility(visibility, settings, true);

    expect(calls).toEqual(["trail-only:false", "props:true"]);
  });

  it("hides props without changing unrelated trail-only preference", () => {
    const { visibility, settings } = createState();

    setEffectivePropsVisibility(visibility, settings, false);

    expect(visibility.getVisibility("props")).toBe(false);
    expect(settings.trail.hideProps).toBe(false);
  });
});
