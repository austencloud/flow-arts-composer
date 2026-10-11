import { afterEach, describe, expect, it, vi } from "vitest";

import { QualityTierDetector } from "#lib/shared/3d/effects/quality/quality-tier-detector.js";
import {
  QualityTier,
  TIER_CONFIGS,
} from "#lib/shared/3d/effects/types.js";
import {
  ADAPTIVE_QUALITY_SETTLE_FRAMES,
  ADAPTIVE_QUALITY_SETTLE_SECONDS,
  createAdaptiveQualityState,
} from "#lib/shared/3d/state/adaptive-quality-state.svelte.js";

function detectorAt(tier: QualityTier): QualityTierDetector {
  const detector = new QualityTierDetector();
  detector.detectFromCapabilities({
    maxTextureUnits: tier === QualityTier.HIGH ? 16 : 8,
    floatTextures: tier !== QualityTier.LOW,
    hardwareConcurrency:
      tier === QualityTier.HIGH ? 12 : tier === QualityTier.MEDIUM ? 4 : 2,
    isWebGPU: false,
  });
  return detector;
}

function feedFps(
  state: ReturnType<typeof createAdaptiveQualityState>,
  fps: number,
  seconds: number
): void {
  const frames = Math.ceil(fps * seconds);
  for (let frame = 0; frame < frames; frame += 1) {
    state.observeFrame(1 / fps, true);
  }
}

function settleAt(
  state: ReturnType<typeof createAdaptiveQualityState>,
  fps: number = 60
): void {
  feedFps(
    state,
    fps,
    Math.max(
      ADAPTIVE_QUALITY_SETTLE_SECONDS,
      ADAPTIVE_QUALITY_SETTLE_FRAMES / fps
    ) +
      0.1
  );
}

describe("adaptive 3D quality", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("starts from the detector's capability tier", () => {
    const state = createAdaptiveQualityState(detectorAt(QualityTier.HIGH), {
      devicePixelRatio: 3,
    });

    expect(state.tier).toBe(QualityTier.HIGH);
    expect(state.contentTier).toBe(QualityTier.HIGH);
    expect(state.pixelRatio).toBe(2);
  });

  it("ignores an isolated hitch instead of visibly changing quality", () => {
    const state = createAdaptiveQualityState(detectorAt(QualityTier.HIGH), {
      devicePixelRatio: 2,
    });

    settleAt(state);
    feedFps(state, 20, 0.25);
    feedFps(state, 60, 2);

    expect(state.resolutionLevel).toBe(4);
    expect(state.tier).toBe(QualityTier.HIGH);
  });

  it("adapts resolution without lowering visual fidelity", () => {
    const state = createAdaptiveQualityState(detectorAt(QualityTier.HIGH), {
      devicePixelRatio: 2,
    });

    settleAt(state, 30);
    feedFps(state, 30, 1.1);

    expect(state.resolutionLevel).toBe(2);
    expect(state.tier).toBe(QualityTier.HIGH);
    expect(state.contentTier).toBe(QualityTier.HIGH);
    expect(state.config).toBe(TIER_CONFIGS[QualityTier.HIGH]);
    expect(state.pixelRatio).toBe(1.25);
  });

  it("ignores startup frame pressure while lazy scene work settles", () => {
    const state = createAdaptiveQualityState(detectorAt(QualityTier.HIGH), {
      devicePixelRatio: 2,
    });

    feedFps(state, 20, ADAPTIVE_QUALITY_SETTLE_SECONDS - 0.1);

    expect(state.resolutionLevel).toBe(4);
    expect(state.tier).toBe(QualityTier.HIGH);
    expect(state.pixelRatio).toBe(2);
  });

  it("starts a fresh grace period when playback resumes", () => {
    const state = createAdaptiveQualityState(detectorAt(QualityTier.HIGH), {
      devicePixelRatio: 2,
    });

    settleAt(state);
    state.observeFrame(1 / 60, false);
    feedFps(state, 20, ADAPTIVE_QUALITY_SETTLE_SECONDS - 0.1);

    expect(state.resolutionLevel).toBe(4);
    expect(state.tier).toBe(QualityTier.HIGH);
    expect(state.pixelRatio).toBe(2);
  });

  it("does not treat an invalid active-frame delta as a playback restart", () => {
    const state = createAdaptiveQualityState(detectorAt(QualityTier.HIGH), {
      devicePixelRatio: 2,
    });

    settleAt(state, 30);
    state.observeFrame(0, true);
    state.observeFrame(Number.NaN, true);
    feedFps(state, 30, 1.1);

    expect(state.resolutionLevel).toBe(2);
    expect(state.tier).toBe(QualityTier.HIGH);
  });

  it("discards the resize cost after changing DPR", () => {
    const state = createAdaptiveQualityState(detectorAt(QualityTier.HIGH), {
      devicePixelRatio: 2,
    });

    settleAt(state, 30);
    feedFps(state, 30, 1.1);
    expect(state.resolutionLevel).toBe(2);

    feedFps(state, 20, ADAPTIVE_QUALITY_SETTLE_SECONDS - 0.1);

    expect(state.resolutionLevel).toBe(2);
    expect(state.tier).toBe(QualityTier.HIGH);
  });

  it("keeps a frame floor after one large startup stall", () => {
    const state = createAdaptiveQualityState(detectorAt(QualityTier.HIGH), {
      devicePixelRatio: 2,
    });

    state.observeFrame(2.5, true);
    feedFps(state, 20, 0.8);

    expect(state.resolutionLevel).toBe(4);
    expect(state.tier).toBe(QualityTier.HIGH);
  });

  it("settles again after a long active-frame stall", () => {
    const state = createAdaptiveQualityState(detectorAt(QualityTier.HIGH), {
      devicePixelRatio: 2,
    });

    settleAt(state);
    state.observeFrame(1.5, true);
    feedFps(state, 20, ADAPTIVE_QUALITY_SETTLE_SECONDS - 0.1);

    expect(state.resolutionLevel).toBe(4);
    expect(state.tier).toBe(QualityTier.HIGH);
  });

  it("reaches a sub-1x emergency floor when LOW still misses its budget", () => {
    const state = createAdaptiveQualityState(detectorAt(QualityTier.LOW), {
      devicePixelRatio: 3,
    });

    settleAt(state, 30);
    feedFps(state, 30, 1.1);

    expect(state.resolutionLevel).toBe(0);
    expect(state.tier).toBe(QualityTier.LOW);
    expect(state.pixelRatio).toBe(0.5);
  });

  it.each([QualityTier.MEDIUM, QualityTier.HIGH])(
    "keeps %s-capability devices at or above native CSS resolution",
    (capabilityTier) => {
      const state = createAdaptiveQualityState(detectorAt(capabilityTier), {
        devicePixelRatio: 3,
      });

      settleAt(state, 30);
      feedFps(state, 30, 5.3);

      expect(state.resolutionLevel).toBe(1);
      expect(state.tier).toBe(capabilityTier);
      expect(state.contentTier).toBe(capabilityTier);
      expect(state.config).toBe(TIER_CONFIGS[capabilityTier]);
      expect(state.pixelRatio).toBe(1);
    }
  );

  it("does not immediately retry a quality level that caused severe pressure", () => {
    const state = createAdaptiveQualityState(detectorAt(QualityTier.LOW), {
      devicePixelRatio: 3,
    });

    settleAt(state, 30);
    feedFps(state, 30, 1.1);
    feedFps(state, 60, 12);

    expect(state.resolutionLevel).toBe(0);
  });

  it("raises one level only after sustained 60 fps headroom", () => {
    const state = createAdaptiveQualityState(detectorAt(QualityTier.LOW), {
      devicePixelRatio: 3,
    });

    settleAt(state);
    feedFps(state, 60, 6.2);

    expect(state.resolutionLevel).toBe(2);
    expect(state.tier).toBe(QualityTier.LOW);
    expect(state.contentTier).toBe(QualityTier.LOW);
    expect(state.config).toBe(TIER_CONFIGS[QualityTier.LOW]);
    expect(state.pixelRatio).toBe(1.25);
  });

  it("does not adapt across a manual quality override", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => null,
      setItem: vi.fn(),
      removeItem: vi.fn(),
    });
    const detector = detectorAt(QualityTier.HIGH);
    detector.setOverride(QualityTier.HIGH);
    const state = createAdaptiveQualityState(detector, {
      devicePixelRatio: 2,
    });

    feedFps(state, 20, 4);

    expect(state.resolutionLevel).toBe(4);
    expect(state.tier).toBe(QualityTier.HIGH);
  });
});
