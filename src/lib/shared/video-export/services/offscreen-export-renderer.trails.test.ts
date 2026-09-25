import { describe, it, expect, vi } from "vitest";
import { DEFAULT_EFFECTS_CONFIG } from "$lib/shared/effects/domain/defaults";
import { TRAIL_PRESETS } from "$lib/shared/animation-engine/components/effects-panel/presets/trail-presets";

// Same seams as offscreen-export-renderer.layers.test.ts: the real factory pulls
// a muxer that can't initialize under node, so it hands back a stubbed handle.
const state = vi.hoisted(() => ({
  handle: null as unknown,
  trailLook: null as unknown,
}));
vi.mock("$lib/shared/animation-engine/services/render-context-factory", () => ({
  RenderContextFactory: class {
    async createOffscreenContext() {
      return state.handle;
    }
  },
}));
vi.mock(
  "$lib/shared/animation-engine/state/animation-settings-state.svelte",
  () => ({
    animationSettings: {
      trail: {
        mode: "fade",
        fadeDurationMs: 800,
        lineWidth: 3.5,
        maxOpacity: 0.95,
        minOpacity: 0.3,
        leftColor: "#2e3bff",
        rightColor: "#ed1c24",
      },
    },
  })
);
vi.mock(
  "$lib/shared/animation-engine/state/animation-visibility-state.svelte",
  () => ({
    getAnimationVisibilityManager: () => ({
      effectsConfigState: { trails: state.trailLook },
      isDarkMode: () => true,
    }),
  })
);

import { OffscreenExportRenderer } from "./offscreen-export-renderer";

function makeHandle() {
  return {
    engine: {
      prepareExportPropTypes: vi.fn(async () => {}),
      prepareExportAdditionalLayers: vi.fn(async () => {}),
      setMotionVisibility: vi.fn(),
      renderFrame: vi.fn(),
    },
    context: {
      renderLoop: { setExternallyDriven: vi.fn() },
      trailCapturer: {
        updateConfig: vi.fn(),
        captureFrame: vi.fn(),
        clearTrails: vi.fn(),
      },
      renderer: { loadGridTexture: vi.fn(async () => {}) },
      effectManager: { trailOverlay: { clearBuffers: vi.fn() } },
    },
    dispose: vi.fn(),
  };
}

describe("OffscreenExportRenderer trail look", () => {
  it("exports the trail look chosen in the effects panel", async () => {
    const ember = TRAIL_PRESETS.find((preset) => preset.id === "trail-ember")!;
    state.trailLook = { ...DEFAULT_EFFECTS_CONFIG.trails, ...ember.patch };
    const handle = makeHandle();
    state.handle = handle;
    const renderer = new OffscreenExportRenderer(
      {
        computePropStatesForStep: () => ({ left: null, right: null }),
        isSeamlesslyLoopable: false,
      } as never,
      { sequenceData: null } as never
    );

    await renderer.initialize({
      outputCanvasSize: 64,
      fps: 60,
      needsFluidWarmup: false,
      leftPropType: "staff",
      rightPropType: "staff",
      previewDarkMode: true,
      showNonRadialPoints: true,
    });
    renderer.renderFrame(1, 0);

    const look = {
      mode: "fade",
      lineWidth: 8,
      maxOpacity: 0.55,
      minOpacity: expect.closeTo(0.165, 6),
      leftColor: "#ff4d1c",
      rightColor: "#ffc046",
    };
    expect(handle.context.trailCapturer.updateConfig).toHaveBeenCalledWith(
      expect.objectContaining({ trailSettings: expect.objectContaining(look) })
    );
    expect(handle.engine.renderFrame).toHaveBeenCalledWith(
      expect.objectContaining({
        externalTrailSettings: expect.objectContaining(look),
      }),
      expect.any(Number),
      expect.any(Number)
    );
  });
});
