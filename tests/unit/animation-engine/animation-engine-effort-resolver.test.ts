import { describe, it, expect, vi } from "vitest";

// ── Block transitive imports that crash in jsdom (protobuf/Firebase) ──────────
// These must come before any imports that pull in the AnimationEngine graph.
vi.mock("#lib/shared/di", () => ({ container: {} }));
vi.mock("#lib/shared/animation-engine/state/animation-visibility-state.svelte.js", () => ({
  getAnimationVisibilityManager: vi.fn(() => ({ getEffortPreset: () => "linear" })),
}));
vi.mock("#lib/features/compose/utils/animation-panel-persistence", () => ({
  loadTrailSettings: vi.fn(() => ({})),
}));
vi.mock(
  "#lib/features/compose/services/implementations/Canvas2DAnimationRenderer",
  () => ({ Canvas2DAnimationRenderer: class {} })
);
vi.mock("#lib/shared/animation-engine/services/animator-loader.js", () => ({
  loadAnimatorServices: vi.fn(),
}));
// Firestore (both CJS and ESM entry points) relies on protobufjs which crashes
vi.mock("@firebase/firestore", () => ({}));
vi.mock("@firebase/firestore/lite", () => ({}));
// Block the settings state which transitively pulls in Firebase
vi.mock("#lib/shared/application/state/app-state.svelte.js", () => ({
  getSettings: vi.fn(() => ({})),
}));
vi.mock(
  "#lib/shared/settings/services/implementations/FirebaseSettingsPersister",
  () => ({ FirebaseSettingsPersister: class {} })
);
vi.mock("#lib/shared/di/containers/core-container", () => ({}));

import { AnimationEngine } from "#lib/shared/animation-engine/services/animation-engine.svelte.js";
import type { AnimationVisibilityStateManager } from "../../../src/lib/shared/animation-engine/state/animation-visibility-state.svelte";

function makeVmStub(effortId: string = "linear"): AnimationVisibilityStateManager {
  return { getEffortPreset: () => effortId } as unknown as AnimationVisibilityStateManager;
}

function makeEngine(effortId: string = "linear"): AnimationEngine {
  const engine = new AnimationEngine();
  engine.setVisibilityManager(makeVmStub(effortId));
  return engine;
}

describe("AnimationEngine — per-performer effort resolver", () => {
  it("setPerformerEffortResolver stores the resolver and getEffortForPerformer uses it", () => {
    const engine = makeEngine();
    const resolver = vi.fn((id: string) => (id === "p2" ? "glide" : "linear") as const);
    engine.setPerformerEffortResolver(resolver);
    expect(engine.getEffortForPerformer("p2")).toBe("glide");
    expect(resolver).toHaveBeenCalledWith("p2");
  });

  it("falls back to global effort when no resolver is set", () => {
    const engine = makeEngine("linear");
    expect(engine.getEffortForPerformer("anyone")).toBe("linear");
  });

  it("clears the resolver when passed null", () => {
    const engine = makeEngine("linear");
    engine.setPerformerEffortResolver(() => "glide");
    engine.setPerformerEffortResolver(null);
    expect(engine.getEffortForPerformer("p1")).toBe("linear");
  });
});
