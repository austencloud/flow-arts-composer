import { describe, it, expect, beforeEach, vi } from "vitest";

// settingsService.updateSettings() calls applyThemeForBackground() whenever
// backgroundType is included in the payload (which our revert path always
// does). That function guards on `import.meta.hot` but not
// `import.meta.hot.data`, and under Vitest's transform `import.meta.hot` is
// truthy with `data` undefined — an unrelated pre-existing gap in that HMR
// guard, not something this suite is testing. Stub it out so the checkpoint
// tests exercise the real settingsState write without tripping over it.
vi.mock(
  "#lib/shared/settings/utils/background-theme-calculator.js",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("#lib/shared/settings/utils/background-theme-calculator.js")
      >();
    return { ...actual, applyThemeForBackground: () => {} };
  }
);

import {
  captureSettingsCheckpoint,
  revertSettingsCheckpoint,
} from "#lib/shared/collections/settings-checkpoint.svelte.js";
import { getAnimationVisibilityManager } from "#lib/shared/animation-engine/state/animation-visibility-state.svelte.js";
import {
  animationSettings,
  TrailMode,
} from "#lib/shared/animation-engine/state/animation-settings-state.svelte.js";
import { settingsService } from "#lib/shared/settings/state/settings-state.svelte.js";
import { EFFECTS_CONFIG_STORAGE_KEY } from "#lib/shared/effects/state/effects-config-state.svelte.js";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import { BackgroundType } from "@austencloud/backgrounds";

// These raw key literals mirror the ones open-tunnel-in-viewer.ts /
// open-3d-scene.ts write directly — the whole point of this suite is
// checking the checkpoint restores exactly what those apply paths touch, so
// the keys have to match theirs byte-for-byte, not settings-checkpoint's own
// (private) constants.
const TUNNEL_VIEW_STATE_KEY = "tka_tunnel_view_state";
const VIEWER_MODE_KEY = "tka-viewer-mode";
const SCENE_FEATURES_KEY = "tka-scene-features";

describe("settings checkpoint capture/revert symmetry", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("restores raw keys that existed before capture and deletes keys the apply path created", () => {
    // Pristine state: some keys already have a value, others don't exist yet
    // (matches a viewer that's never touched 3D — no tka-viewer3d-* keys, no
    // scene-features key).
    localStorage.setItem(TUNNEL_VIEW_STATE_KEY, "pristine-tunnel-state");
    localStorage.setItem(EFFECTS_CONFIG_STORAGE_KEY, "pristine-effects");
    localStorage.setItem(VIEWER_MODE_KEY, "split");
    localStorage.setItem("tka-viewer3d-renderMode", "2d");

    captureSettingsCheckpoint("Test Tunnel");

    // Simulate an apply path: overwrite the keys that existed, and create
    // keys that didn't (tka-viewer3d-camera, tka-scene-features).
    localStorage.setItem(TUNNEL_VIEW_STATE_KEY, "applied-tunnel-state");
    localStorage.setItem(EFFECTS_CONFIG_STORAGE_KEY, "applied-effects");
    localStorage.setItem(VIEWER_MODE_KEY, "tunnel");
    localStorage.setItem("tka-viewer3d-renderMode", "3d");
    localStorage.setItem("tka-viewer3d-camera", '{"x":1}');
    localStorage.setItem(SCENE_FEATURES_KEY, '{"stage":true}');

    const label = revertSettingsCheckpoint();

    expect(label).toBe("Test Tunnel");
    expect(localStorage.getItem(TUNNEL_VIEW_STATE_KEY)).toBe(
      "pristine-tunnel-state"
    );
    expect(localStorage.getItem(EFFECTS_CONFIG_STORAGE_KEY)).toBe(
      "pristine-effects"
    );
    expect(localStorage.getItem(VIEWER_MODE_KEY)).toBe("split");
    expect(localStorage.getItem("tka-viewer3d-renderMode")).toBe("2d");
    // Neither key existed at capture time, so revert removes them rather
    // than writing back a value they never had.
    expect(localStorage.getItem("tka-viewer3d-camera")).toBeNull();
    expect(localStorage.getItem(SCENE_FEATURES_KEY)).toBeNull();
  });

  it("removes a key entirely when it had no value at capture time", () => {
    // Nothing set before capture — a completely fresh install.
    captureSettingsCheckpoint("Empty");
    localStorage.setItem(VIEWER_MODE_KEY, "animation-3d");

    revertSettingsCheckpoint();

    expect(localStorage.getItem(VIEWER_MODE_KEY)).toBeNull();
  });

  it("returns null and touches nothing when there is no checkpoint to revert", () => {
    localStorage.setItem(VIEWER_MODE_KEY, "split");

    expect(revertSettingsCheckpoint()).toBeNull();
    expect(localStorage.getItem(VIEWER_MODE_KEY)).toBe("split");
  });

  it("clears itself after reverting, so a second Undo click is a no-op", () => {
    captureSettingsCheckpoint("Once");

    expect(revertSettingsCheckpoint()).toBe("Once");
    expect(revertSettingsCheckpoint()).toBeNull();
  });

  it("restores semantic singleton values through their live setters", () => {
    const vm = getAnimationVisibilityManager();

    // Pristine state the user configured for themselves.
    vm.setEffortPreset("linear");
    vm.setPathShape("arc");
    vm.setMotionAwarePaths(false);
    vm.setVisibility("leftPathLines", false);
    vm.setVisibility("rightPathLines", true);
    animationSettings.updateSettings({
      trail: {
        ...animationSettings.trail,
        mode: TrailMode.PERSISTENT,
        lineWidth: 7,
      },
    });
    void settingsService.updateSettings({
      leftPropType: PropType.STAFF,
      rightPropType: PropType.FAN,
      backgroundType: BackgroundType.COSMIC,
    });

    captureSettingsCheckpoint("Semantic Test");

    // Simulate an apply path overwriting every one of these with the saved
    // tunnel/scene's own values.
    vm.setEffortPreset("bounce");
    vm.setPathShape("concave");
    vm.setMotionAwarePaths(true);
    vm.setVisibility("leftPathLines", true);
    vm.setVisibility("rightPathLines", false);
    animationSettings.updateSettings({
      trail: { ...animationSettings.trail, mode: TrailMode.FADE, lineWidth: 2 },
    });
    void settingsService.updateSettings({
      leftPropType: PropType.CLUB,
      rightPropType: PropType.CLUB,
      backgroundType: BackgroundType.OCEAN,
    });

    const label = revertSettingsCheckpoint();

    expect(label).toBe("Semantic Test");
    expect(vm.getEffortPreset()).toBe("linear");
    expect(vm.getPathShape()).toBe("arc");
    expect(vm.getMotionAwarePaths()).toBe(false);
    expect(vm.getVisibility("leftPathLines")).toBe(false);
    expect(vm.getVisibility("rightPathLines")).toBe(true);
    expect(animationSettings.trail.mode).toBe(TrailMode.PERSISTENT);
    expect(animationSettings.trail.lineWidth).toBe(7);
    expect(settingsService.settings.leftPropType).toBe(PropType.STAFF);
    expect(settingsService.settings.rightPropType).toBe(PropType.FAN);
    expect(settingsService.settings.backgroundType).toBe(BackgroundType.COSMIC);
  });

  describe("prop version", () => {
    // The settings rule resets Version 2 to Version 1 when a write brings in a
    // new prop that has a Version 2. Restoring the props is such a write, so
    // the version has to ride along or Undo drops the performer to Version 1.
    function holdWithVersion(prop: PropType, propArtwork: "model" | "pictograph") {
      void settingsService.updateSettings({
        leftPropType: prop,
        rightPropType: prop,
        catDogMode: false,
        propArtwork,
      });
    }

    function storeCheckpoint(semantic: Record<string, unknown>) {
      localStorage.setItem(
        "tka_settings_checkpoint",
        JSON.stringify({
          label: "Props",
          capturedAt: 1,
          semantic: {
            effortPreset: "linear",
            pathShape: "arc",
            motionAwarePaths: false,
            leftPathLines: true,
            rightPathLines: true,
            trail: { ...animationSettings.trail },
            backgroundType: BackgroundType.COSMIC,
            ...semantic,
          },
          raw: {
            tunnelViewState: null,
            effectsConfig: null,
            viewerMode: null,
            sceneFeatures: null,
            viewer3d: {},
          },
        })
      );
    }

    it("puts Version 2 back when the apply path moved to another prop", () => {
      holdWithVersion(PropType.CLUB, "model");
      captureSettingsCheckpoint("Version 2 scene");

      // The apply path writes its own props and, naming no version, the rule
      // drops the version to Version 1.
      void settingsService.updateSettings({
        leftPropType: PropType.STAFF,
        rightPropType: PropType.STAFF,
      });
      expect(settingsService.settings.propArtwork).toBe("pictograph");

      revertSettingsCheckpoint();

      expect(settingsService.settings.leftPropType).toBe(PropType.CLUB);
      expect(settingsService.settings.rightPropType).toBe(PropType.CLUB);
      expect(settingsService.settings.propArtwork).toBe("model");
    });

    it("puts Version 1 back when the scene was opened on Version 1", () => {
      holdWithVersion(PropType.CLUB, "pictograph");
      captureSettingsCheckpoint("Version 1 scene");

      // The apply path turned Version 2 on for its own look.
      holdWithVersion(PropType.CLUB, "model");

      revertSettingsCheckpoint();

      expect(settingsService.settings.leftPropType).toBe(PropType.CLUB);
      expect(settingsService.settings.propArtwork).toBe("pictograph");
    });

    it("leaves the version to the settings rule for a checkpoint saved before versions were captured", () => {
      holdWithVersion(PropType.CLUB, "model");
      // Same props as now, no version in the checkpoint: nothing new comes
      // into the hands, so the performer's Version 2 must survive. Writing
      // Version 1 here would change it.
      storeCheckpoint({
        leftPropType: PropType.CLUB,
        rightPropType: PropType.CLUB,
      });

      expect(revertSettingsCheckpoint()).toBe("Props");
      expect(settingsService.settings.propArtwork).toBe("model");
    });

    it("still lets the rule reset the version for an old checkpoint that brings in a new prop", () => {
      holdWithVersion(PropType.CLUB, "model");
      storeCheckpoint({
        leftPropType: PropType.STAFF,
        rightPropType: PropType.STAFF,
      });

      expect(revertSettingsCheckpoint()).toBe("Props");
      expect(settingsService.settings.leftPropType).toBe(PropType.STAFF);
      expect(settingsService.settings.propArtwork).toBe("pictograph");
    });
  });

  it("restores a literal blue/red semantic checkpoint", () => {
    const vm = getAnimationVisibilityManager();
    localStorage.setItem(
      "tka_settings_checkpoint",
      JSON.stringify({
        label: "Legacy",
        capturedAt: 1,
        semantic: {
          effortPreset: "linear",
          pathShape: "arc",
          motionAwarePaths: false,
          bluePathLines: false,
          redPathLines: true,
          trail: {
            ...animationSettings.trail,
            leftColor: undefined,
            rightColor: undefined,
            blueColor: "#112233",
            redColor: "#445566",
          },
          bluePropType: PropType.POI,
          redPropType: PropType.FAN,
          backgroundType: BackgroundType.COSMIC,
        },
        raw: {
          tunnelViewState: null,
          effectsConfig: null,
          viewerMode: null,
          sceneFeatures: null,
          viewer3d: {},
        },
      })
    );

    expect(revertSettingsCheckpoint()).toBe("Legacy");
    expect(vm.getVisibility("leftPathLines")).toBe(false);
    expect(vm.getVisibility("rightPathLines")).toBe(true);
    expect(animationSettings.trail.leftColor).toBe("#112233");
    expect(animationSettings.trail.rightColor).toBe("#445566");
    expect(settingsService.settings.leftPropType).toBe(PropType.POI);
    expect(settingsService.settings.rightPropType).toBe(PropType.FAN);
  });
});
