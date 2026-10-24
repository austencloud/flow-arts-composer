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

  // Frame-pressure ladder arithmetic at a steady 30 fps (HIGH detector, DPR 2):
  // - a 0.25 s sample needs 8 frames at 30 fps (7 frames = 0.233 s), so one
  //   4-sample severe window is 32 frames, about 1.07 s;
  // - at the resolution floor, content waits for a full 8-sample downgrade
  //   window (64 frames, about 2.13 s) instead of the severe window;
  // - every change re-arms a 3 s / 30-frame settle window (90 frames at 30 fps)
  //   that is not judged.
  // HIGH level 4 -> 2 at ~1.07 s, -> 1 (its floor) at ~5.1 s, then the floor
  // cannot recover the frame rate, so content steps HIGH -> MEDIUM at ~10.3 s.
  // MEDIUM keeps level 1 (its own floor), so the next full window steps
  // MEDIUM -> LOW at ~15.4 s, and LOW reaches the 0.5 DPR emergency level
  // (one severe window from level 1) at ~19.5 s.
  it("steps visual fidelity down once the resolution floor cannot recover the frame rate", () => {
    const state = createAdaptiveQualityState(detectorAt(QualityTier.HIGH), {
      devicePixelRatio: 2,
    });

    settleAt(state, 30);
    // ~10.3 s reaches MEDIUM; the next step is not due until ~15.4 s.
    feedFps(state, 30, 12);

    expect(state.contentTier).toBe(QualityTier.MEDIUM);
    expect(state.tier).toBe(QualityTier.MEDIUM);
    expect(state.config).toBe(TIER_CONFIGS[QualityTier.MEDIUM]);
    expect(state.resolutionLevel).toBe(1);
    expect(state.pixelRatio).toBe(1);
  });

  it("keeps stepping down to LOW and then the emergency floor when pressure never lifts", () => {
    const state = createAdaptiveQualityState(detectorAt(QualityTier.HIGH), {
      devicePixelRatio: 2,
    });

    settleAt(state, 30);
    // ~19.5 s reaches LOW at level 0; nothing lower exists after that.
    feedFps(state, 30, 22);

    expect(state.contentTier).toBe(QualityTier.LOW);
    expect(state.tier).toBe(QualityTier.LOW);
    expect(state.config).toBe(TIER_CONFIGS[QualityTier.LOW]);
    expect(state.resolutionLevel).toBe(0);
    expect(state.pixelRatio).toBe(0.5);
  });

  it("never raises visual fidelity again within the session", () => {
    const state = createAdaptiveQualityState(detectorAt(QualityTier.HIGH), {
      devicePixelRatio: 2,
    });

    settleAt(state, 30);
    feedFps(state, 30, 12);
    expect(state.contentTier).toBe(QualityTier.MEDIUM);

    // The content step keeps the 60 s severe recovery delay, then each
    // resolution raise needs 6 s of headroom plus a 3 s settle. 90 s at 60 fps
    // is enough to climb to MEDIUM's resolution ceiling and sit there.
    feedFps(state, 60, 90);

    expect(state.contentTier).toBe(QualityTier.MEDIUM);
    expect(state.tier).toBe(QualityTier.MEDIUM);
    expect(state.config).toBe(TIER_CONFIGS[QualityTier.MEDIUM]);
    expect(state.resolutionLevel).toBe(3);
    expect(state.pixelRatio).toBe(1.5);
  });

  it("does not step visual fidelity down while resolution room remains", () => {
    const state = createAdaptiveQualityState(detectorAt(QualityTier.HIGH), {
      devicePixelRatio: 2,
    });

    settleAt(state, 30);
    feedFps(state, 30, 2);

    expect(state.resolutionLevel).toBe(2);
    expect(state.contentTier).toBe(QualityTier.HIGH);
    expect(state.tier).toBe(QualityTier.HIGH);
  });

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
