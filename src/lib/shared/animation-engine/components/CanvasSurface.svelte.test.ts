import { render } from "vitest-browser-svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CanvasSurface from "./CanvasSurface.svelte";
import {
  AnimationVisibilityStateManager,
  getAnimationVisibilityManager,
} from "../state/animation-visibility-state.svelte";
import { createEffectsConfigState } from "$lib/shared/effects/state/effects-config-state.svelte";
import { FIRE_PRESETS } from "./effects-panel/presets/fire-presets";

const mocks = vi.hoisted(() => {
  const initializations: Array<() => Promise<void>> = [];
  const createEngine = () => ({
    animatorState: {
      setSuppress2DOverlays: vi.fn(),
      isInitialized: false,
      isPreRendering: false,
      preRenderProgress: 0,
      preRenderedFramesReady: false,
      displayedLetter: null,
      displayedTurnsTuple: "(s, 0, 0)",
      displayedStepNumber: null,
      displayedMusicalPosition: null,
    },
    initialize: vi.fn(() =>
      (initializations.shift() ?? (() => Promise.resolve()))()
    ),
    dispose: vi.fn(),
    getRenderContext: vi.fn(() => ({ id: "test-context" })),
    setActivityGate: vi.fn(),
    setEffectsConfigState: vi.fn(),
    prewarmEffect: vi.fn(),
    setFireConfig: vi.fn(),
    setLedConfig: vi.fn(),
    setCellTipEffectMap: vi.fn(),
    setCellTipEffortMap: vi.fn(),
    update: vi.fn(),
    processPendingGlyph: vi.fn(),
    pauseResize: vi.fn(),
    resumeResize: vi.fn(),
    setMotionVisibility: vi.fn(),
    setVisibilityManager: vi.fn(),
    setInitialQualityTier: vi.fn(),
    invalidateFireFrameCacheOnly: vi.fn(),
    clearFireThermalFields: vi.fn(),
    invalidateFireCache: vi.fn(),
    handleGlyphSvgReady: vi.fn(),
    canvasResizeCount: 0,
  });
  const activityGates: Array<{
    attach: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
  }> = [];

  return {
    createEngine,
    engines: [] as ReturnType<typeof createEngine>[],
    activityGates,
    initializations,
    register: vi.fn(),
    unregister: vi.fn(),
  };
});

vi.mock("../services/animation-engine.svelte", () => ({
  AnimationEngine: vi.fn(function () {
    const engine = mocks.createEngine();
    mocks.engines.push(engine);
    return engine;
  }),
}));

vi.mock("$lib/shared/render-gating/render-activity-gate", () => ({
  createRenderActivityGate: () => {
    const gate = { attach: vi.fn(), dispose: vi.fn() };
    mocks.activityGates.push(gate);
    return gate;
  },
}));

vi.mock("../get-render-context-registry", () => ({
  getRenderContextRegistry: () => ({
    register: mocks.register,
    unregister: mocks.unregister,
  }),
}));

vi.mock("../debug/animator-diagnostics", () => ({
  installAnimatorDiagnostics: () => vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.activityGates.length = 0;
  mocks.engines.length = 0;
  mocks.initializations.length = 0;
});

describe("CanvasSurface initialization", () => {
  it("shows a recoverable error and initializes again on retry", async () => {
    mocks.initializations.push(
      () => Promise.reject(new Error("renderer unavailable")),
      () => Promise.resolve()
    );
    render(CanvasSurface, {});
    const failedEngine = mocks.engines[0]!;

    await vi.waitFor(() => {
      expect(document.querySelector(".initialization-error")).not.toBeNull();
    });

    (
      document.querySelector(".panel-state__retry") as HTMLButtonElement
    ).click();

    await vi.waitFor(() => {
      expect(mocks.engines).toHaveLength(2);
      expect(mocks.engines[1]!.initialize).toHaveBeenCalledOnce();
      expect(document.querySelector(".initialization-error")).toBeNull();
    });
    expect(failedEngine.dispose).toHaveBeenCalledOnce();
    expect(mocks.activityGates).toHaveLength(2);
  });

  it("does not register a context when disposed before initialization resolves", async () => {
    let resolveInitialization!: () => void;
    mocks.initializations.push(
      () =>
        new Promise<void>((resolve) => {
          resolveInitialization = resolve;
        })
    );

    const screen = render(CanvasSurface, {});
    const engine = mocks.engines[0]!;
    await vi.waitFor(() => expect(engine.initialize).toHaveBeenCalledOnce());
    screen.unmount();
    resolveInitialization();
    await Promise.resolve();

    expect(mocks.register).not.toHaveBeenCalled();
    expect(engine.dispose).toHaveBeenCalledOnce();
  });
});

describe("CanvasSurface effects config bridge", () => {
  it("wakes the scoped visibility manager its engine observes when a look is applied", async () => {
    // Fire, charcoal, and LED only re-sync when the engine's own visibility
    // manager notifies. A scoped surface (Motion Paths, Shape Engine) observes
    // its override, so a look applied there must wake that manager.
    const scoped = new AnimationVisibilityStateManager({ ephemeral: true });
    const effects = createEffectsConfigState(undefined, { persist: false });
    const scopedObserver = vi.fn();
    const globalObserver = vi.fn();
    scoped.registerObserver(scopedObserver);
    getAnimationVisibilityManager().registerObserver(globalObserver);

    const screen = render(CanvasSurface, {
      props: {
        leftProp: null,
        rightProp: null,
        visibilityManagerOverride: scoped,
        effectsConfigState: effects,
      },
    });
    await vi.waitFor(() =>
      expect(mocks.engines[0]!.setEffectsConfigState).toHaveBeenCalledWith(
        effects
      )
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    scopedObserver.mockClear();
    globalObserver.mockClear();

    const blueFlame = FIRE_PRESETS.find(
      (preset) => preset.id === "fire-blue-flame"
    )!;
    effects.applyPreset("fire", blueFlame.id, blueFlame.patch!);

    await vi.waitFor(() => expect(scopedObserver).toHaveBeenCalled());
    expect(globalObserver).not.toHaveBeenCalled();

    screen.unmount();
    scoped.unregisterObserver(scopedObserver);
    getAnimationVisibilityManager().unregisterObserver(globalObserver);
  });
});
