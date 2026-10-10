import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock localStorage
const mockStorage = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (key: string) => mockStorage.get(key) ?? null,
  setItem: (key: string, value: string) => mockStorage.set(key, value),
  removeItem: (key: string) => mockStorage.delete(key),
});

import { createSceneFeatureState } from "#lib/shared/3d/scene-features/state/scene-feature-state.svelte.js";
import { SCENE_FEATURES } from "#lib/shared/3d/scene-features/domain/scene-feature-registry.js";

describe("createSceneFeatureState", () => {
  beforeEach(() => {
    mockStorage.clear();
  });

  it("initializes with registry defaults when no localStorage or overrides", () => {
    const state = createSceneFeatureState();
    expect(state.isEnabled("stage")).toBe(true);
    expect(state.isEnabled("audience")).toBe(false);
    expect(state.isEnabled("environment")).toBe(true);
  });

  it("applies overrides over registry defaults", () => {
    const state = createSceneFeatureState({ audience: true });
    expect(state.isEnabled("audience")).toBe(true);
  });

  it("localStorage wins over overrides", () => {
    mockStorage.set("tka-scene-features", JSON.stringify({ audience: false }));
    const state = createSceneFeatureState({ audience: true });
    expect(state.isEnabled("audience")).toBe(false);
  });

  it("toggle flips state and persists to localStorage", () => {
    const state = createSceneFeatureState();
    expect(state.isEnabled("stage")).toBe(true);
    state.toggle("stage");
    expect(state.isEnabled("stage")).toBe(false);
    const stored = JSON.parse(mockStorage.get("tka-scene-features")!);
    expect(stored.stage).toBe(false);
  });

  it("allEnabledReady is true when no async features are enabled", () => {
    const state = createSceneFeatureState();
    state.toggle("environment"); // off
    expect(state.allEnabledReady).toBe(true);
  });

  it("allEnabledReady is false when async feature is enabled but not ready", () => {
    const state = createSceneFeatureState();
    expect(state.allEnabledReady).toBe(false);
  });

  it("allEnabledReady becomes true after all enabled async features report ready", () => {
    const state = createSceneFeatureState();
    state.reportReady("environment");
    expect(state.allEnabledReady).toBe(true);
  });

  it("reveals the usable scene while a deferred environment keeps loading", () => {
    const state = createSceneFeatureState(undefined, {
      initialRevealDeferredFeatures: ["environment"],
    });

    expect(state.isEnabled("environment")).toBe(true);
    expect(state.isReady("environment")).toBe(false);
    expect(state.allEnabledReady).toBe(false);
    expect(state.allInitialRevealFeaturesReady).toBe(true);
    expect(state.allInitialRevealFeaturesSettled).toBe(true);
    expect(state.initialRevealSettledProgress).toBe(1);
  });

  it("still waits for non-deferred async features", () => {
    const state = createSceneFeatureState(
      { audience: true },
      { initialRevealDeferredFeatures: ["environment"] }
    );

    expect(state.allInitialRevealFeaturesReady).toBe(false);
    state.reportReady("audience");
    expect(state.allInitialRevealFeaturesReady).toBe(true);
  });

  it("settles a failed feature without pretending it loaded", () => {
    const state = createSceneFeatureState();
    state.reportFailed("environment", "Environment couldn't load.");

    expect(state.isReady("environment")).toBe(false);
    expect(state.getError("environment")).toBe("Environment couldn't load.");
    expect(state.allEnabledReady).toBe(false);
    expect(state.allEnabledSettled).toBe(true);
    expect(state.settledProgress).toBe(1);
  });

  it("clears a failed feature and issues a new retry request", () => {
    const state = createSceneFeatureState();
    state.reportFailed("environment", "Environment couldn't load.");

    state.requestRetry("environment");

    expect(state.getError("environment")).toBeNull();
    expect(state.allEnabledSettled).toBe(false);
    expect(state.getRetryRequest("environment")).toBe(1);
  });

  it("moves cleanly from ready to failed and back to ready", () => {
    const state = createSceneFeatureState();
    state.reportReady("environment");

    state.reportFailed("environment", "Environment couldn't reload.");
    expect(state.isReady("environment")).toBe(false);
    expect(state.getError("environment")).toBe("Environment couldn't reload.");

    state.reportReady("environment");
    expect(state.isReady("environment")).toBe(true);
    expect(state.getError("environment")).toBeNull();
  });

  it("readyProgress tracks fraction of ready async features", () => {
    const state = createSceneFeatureState({ audience: true });
    expect(state.readyProgress).toBe(0);
    state.reportReady("environment");
    expect(state.readyProgress).toBe(0.5);
    state.reportReady("audience");
    expect(state.readyProgress).toBe(1);
  });

  it("disabling an async feature recalculates readiness", () => {
    const state = createSceneFeatureState({ audience: true });
    expect(state.allEnabledReady).toBe(false);
    state.toggle("environment");
    state.toggle("audience");
    expect(state.allEnabledReady).toBe(true);
  });

  it("reset clears localStorage and reverts to defaults", () => {
    const state = createSceneFeatureState();
    state.toggle("stage");
    state.toggle("audience");
    state.reset();
    expect(state.isEnabled("stage")).toBe(true);
    expect(state.isEnabled("audience")).toBe(false);
    expect(mockStorage.has("tka-scene-features")).toBe(false);
  });

  it("features exposes the full registry", () => {
    const state = createSceneFeatureState();
    expect(state.features).toBe(SCENE_FEATURES);
  });
});
