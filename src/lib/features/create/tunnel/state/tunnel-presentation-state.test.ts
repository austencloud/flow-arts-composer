import { describe, expect, it } from "vitest";
import {
  createAnimationSettingsState,
  DEFAULT_TRAIL_SETTINGS,
} from "$lib/shared/animation-engine/state/animation-settings-state.svelte";
import { AnimationVisibilityStateManager } from "$lib/shared/animation-engine/state/animation-visibility-state.svelte";
import { DEFAULT_EFFECTS_CONFIG } from "$lib/shared/effects/domain/defaults";
import { createEffectsConfigState } from "$lib/shared/effects/state/effects-config-state.svelte";
import type { TunnelConfig } from "$lib/shared/sequence-viewer/tunnel/tunnel-config";
import { DEFAULT_CONFIG } from "$lib/shared/sequence-viewer/tunnel/tunnel-config";
import type { TunnelPresetRecipe } from "$lib/shared/sequence-viewer/tunnel/tunnel-preset-recipe";
import type { TunnelSnapshot } from "$lib/shared/sequence-viewer/tunnel/tunnel-snapshot";
import type { TunnelViewController } from "$lib/shared/sequence-viewer/tunnel/tunnel-view-controller.svelte";
import { createTunnelPresentationState } from "./tunnel-presentation-state.svelte";

function savedSnapshot(): TunnelSnapshot {
  return {
    version: 3,
    tunnel: {
      config: {
        ...DEFAULT_CONFIG,
        fold: 4,
        mirror: true,
        staggerSteps: 2,
        speedOverrides: { 1: 0.5 },
      },
      gridVisible: true,
      colors: {
        mode: "custom",
        custom: { left: "#123456", right: "#abcdef" },
      },
      section: "props",
      presetRecipe: null,
    },
    effects: structuredClone(DEFAULT_EFFECTS_CONFIG),
    effort: "punch",
    paths: {
      pathShape: "concave",
      motionAwarePaths: true,
      leftPathLines: true,
      rightPathLines: false,
    },
    playback: { bpm: 132, playbackMode: "step" },
    props: {
      leftPropType: "buugeng",
      rightPropType: "buugeng",
      catDogMode: false,
      leftBuugengFlipped: true,
      rightBuugengFlipped: false,
    },
    trailRender: {
      ...structuredClone(DEFAULT_TRAIL_SETTINGS),
      tailLength: 48,
      hideProps: true,
    },
  };
}

function controllerFor(): TunnelViewController {
  const state = {
    config: { ...DEFAULT_CONFIG, speedOverrides: {} },
    gridVisible: false,
    colors: {
      mode: "hands" as const,
      custom: { left: "#111111", right: "#eeeeee" },
    },
    section: "tunnel" as TunnelSnapshot["tunnel"]["section"],
    presetRecipe: null as TunnelSnapshot["tunnel"]["presetRecipe"],
  };
  return {
    get config() {
      return state.config;
    },
    get gridVisible() {
      return state.gridVisible;
    },
    set gridVisible(value) {
      state.gridVisible = value;
    },
    get colors() {
      return state.colors;
    },
    set colors(value) {
      state.colors = value;
    },
    get section() {
      return state.section;
    },
    set section(value) {
      state.section = value;
    },
    get presetRecipe() {
      return state.presetRecipe;
    },
    set presetRecipe(value) {
      state.presetRecipe = value;
    },
    applyConfig(
      config: TunnelConfig,
      recipe: TunnelPresetRecipe | null | undefined = undefined
    ) {
      state.config = JSON.parse(JSON.stringify(config));
      if (recipe !== undefined) state.presetRecipe = recipe;
    },
  } as unknown as TunnelViewController;
}

describe("tunnel presentation state", () => {
  it("restores and recaptures every saved presentation field", () => {
    const snapshot = savedSnapshot();
    const effects = createEffectsConfigState(undefined, { persist: false });
    const visibility = new AnimationVisibilityStateManager({ ephemeral: true });
    const animationSettings = createAnimationSettingsState({ ephemeral: true });
    const state = createTunnelPresentationState({
      initialSnapshot: snapshot,
      effects,
      visibility,
      animationSettings,
      initialLeftPropType: "staff",
      initialRightPropType: "staff",
      initialLeftBuugengFlipped: false,
      initialRightBuugengFlipped: true,
    });
    const controller = controllerFor();

    state.attachController(controller);

    expect(state.capture()).toEqual(snapshot);
    expect(state.chirality.hands.map((hand) => hand.flipped)).toEqual([
      true,
      false,
    ]);
  });

  it("captures live edits without writing through to the supplied defaults", () => {
    const effects = createEffectsConfigState(undefined, { persist: false });
    const visibility = new AnimationVisibilityStateManager({ ephemeral: true });
    const animationSettings = createAnimationSettingsState({ ephemeral: true });
    const state = createTunnelPresentationState({
      initialFormation: { ...DEFAULT_CONFIG, fold: 2 },
      effects,
      visibility,
      animationSettings,
      initialLeftPropType: "staff",
      initialRightPropType: "staff",
      initialLeftBuugengFlipped: false,
      initialRightBuugengFlipped: false,
    });
    const controller = controllerFor();
    state.attachController(controller);

    state.setBpm(144);
    state.setPlaybackMode("step");
    state.setPropType("fan");
    state.chirality.onChange("right", true);
    visibility.setEffortPreset("glide");
    visibility.setPathPolicy({ pathShape: "linear", motionAwarePaths: true });
    controller.gridVisible = true;
    controller.section = "playback";

    expect(state.capture()).toMatchObject({
      tunnel: {
        config: { fold: 2 },
        gridVisible: true,
        colors: { mode: "hands" },
        section: "playback",
        presetRecipe: null,
      },
      effort: "glide",
      paths: { pathShape: "linear", motionAwarePaths: true },
      playback: { bpm: 144, playbackMode: "step" },
      props: {
        leftPropType: "fan",
        rightPropType: "fan",
        leftBuugengFlipped: false,
        rightBuugengFlipped: true,
      },
    });
  });

  it("uses the composition formation when an older snapshot disagrees", () => {
    const snapshot = savedSnapshot();
    const state = createTunnelPresentationState({
      initialSnapshot: snapshot,
      initialFormation: {
        ...DEFAULT_CONFIG,
        fold: 2,
        mirror: false,
        speedOverrides: {},
      },
      effects: createEffectsConfigState(undefined, { persist: false }),
      visibility: new AnimationVisibilityStateManager({ ephemeral: true }),
      animationSettings: createAnimationSettingsState({ ephemeral: true }),
      initialLeftPropType: "staff",
      initialRightPropType: "staff",
      initialLeftBuugengFlipped: false,
      initialRightBuugengFlipped: false,
    });
    const controller = controllerFor();

    state.attachController(controller);

    expect(state.capture()).toMatchObject({
      tunnel: {
        config: { fold: 2, mirror: false },
        gridVisible: true,
      },
      playback: { bpm: 132, playbackMode: "step" },
    });
  });

  it("starts new creator stages with hand colors and preserves saved exact colors", () => {
    const create = (initialSnapshot?: TunnelSnapshot) => {
      const state = createTunnelPresentationState({
        initialSnapshot,
        effects: createEffectsConfigState(undefined, { persist: false }),
        visibility: new AnimationVisibilityStateManager({ ephemeral: true }),
        animationSettings: createAnimationSettingsState({ ephemeral: true }),
        initialLeftPropType: "staff",
        initialRightPropType: "staff",
        initialLeftBuugengFlipped: false,
        initialRightBuugengFlipped: false,
      });
      const controller = controllerFor();
      state.attachController(controller);
      return state.capture().tunnel.colors;
    };

    expect(create().mode).toBe("hands");
    expect(create(savedSnapshot())).toEqual({
      mode: "custom",
      custom: { left: "#123456", right: "#abcdef" },
    });
  });

  function freshState(
    overrides: Partial<Parameters<typeof createTunnelPresentationState>[0]> = {}
  ) {
    return createTunnelPresentationState({
      effects: createEffectsConfigState(undefined, { persist: false }),
      visibility: new AnimationVisibilityStateManager({ ephemeral: true }),
      animationSettings: createAnimationSettingsState({ ephemeral: true }),
      initialLeftPropType: "staff",
      initialRightPropType: "staff",
      initialLeftBuugengFlipped: false,
      initialRightBuugengFlipped: false,
      ...overrides,
    });
  }

  it("picks per hand while cat dog is on", () => {
    const state = freshState();
    state.toggleCatDog();
    state.selectPropHand("right");
    state.setPropType("fan");
    expect([state.leftPropType, state.rightPropType]).toEqual(["staff", "fan"]);
    expect(state.addressedPropType).toBe("fan");
    state.selectPropHand("left");
    state.setPropType("club");
    expect([state.leftPropType, state.rightPropType]).toEqual(["club", "fan"]);
  });

  it("sets both hands while cat dog is off", () => {
    const state = freshState();
    state.setPropType("fan");
    expect([state.leftPropType, state.rightPropType]).toEqual(["fan", "fan"]);
  });

  it("folds the right hand to the left when cat dog turns off", () => {
    const state = freshState();
    state.toggleCatDog();
    state.selectPropHand("right");
    state.setPropType("fan");
    state.toggleCatDog();
    expect(state.catDog).toBe(false);
    expect([state.leftPropType, state.rightPropType]).toEqual([
      "staff",
      "staff",
    ]);
    expect(state.propHand).toBe("left");
  });

  it("exposes handProps shaped for HandPropToolbar", () => {
    const state = freshState();
    state.handProps.onToggleCatDog();
    state.handProps.onHandChange("right");
    expect(state.handProps).toMatchObject({
      catDog: true,
      hand: "right",
      leftPropType: "staff",
      rightPropType: "staff",
    });
  });

  it("addresses only the selected hand's chirality seam while cat dog is on", () => {
    const state = freshState();
    expect(state.chirality.hands.map((hand) => hand.hand)).toEqual([
      "left",
      "right",
    ]);

    state.toggleCatDog();
    state.selectPropHand("right");
    expect(state.chirality.hands.map((hand) => hand.hand)).toEqual(["right"]);

    state.selectPropHand("left");
    expect(state.chirality.hands.map((hand) => hand.hand)).toEqual(["left"]);
  });

  it("starts a new tunnel from the settings pair and flag", () => {
    expect(freshState({ initialCatDogMode: true }).catDog).toBe(true);
    expect(
      freshState({ initialRightPropType: "fan", initialCatDogMode: false }).catDog
    ).toBe(true);
  });

  it("keeps an equal pair saved with cat dog on", () => {
    const snapshot = savedSnapshot();
    snapshot.props.catDogMode = true;
    const state = freshState({ initialSnapshot: snapshot });
    state.attachController(controllerFor());
    expect(state.catDog).toBe(true);
    expect(state.capture().props.catDogMode).toBe(true);
  });

  it("ignores a hand selection while cat dog is off", () => {
    const state = freshState();
    state.selectPropHand("right");
    expect(state.propHand).toBe("left");
  });

  it("round-trips the flag through capture", () => {
    const state = freshState();
    state.toggleCatDog();
    expect(state.capture().props.catDogMode).toBe(true);
  });

  it("infers the flag for an old snapshot without one", () => {
    const snapshot = savedSnapshot();
    delete (snapshot.props as { catDogMode?: boolean }).catDogMode;
    snapshot.props.rightPropType = "fan";
    const state = freshState({ initialSnapshot: snapshot });
    state.attachController(controllerFor());
    expect(state.catDog).toBe(true);
    expect(state.capture().props).toMatchObject({
      leftPropType: "buugeng",
      rightPropType: "fan",
      catDogMode: true,
    });
  });
});
