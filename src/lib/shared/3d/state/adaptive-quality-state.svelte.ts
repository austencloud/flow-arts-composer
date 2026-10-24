import type { WebGLRenderer } from "three";

import { QualityTier, TIER_CONFIGS } from "../effects/types";
import type { QualityTierConfig } from "../effects/types";
import type { QualityTierDetector } from "../effects/quality/quality-tier-detector";

interface AdaptiveResolutionLevel {
  maxPixelRatio: number;
}

interface AdaptiveQualityOptions {
  devicePixelRatio?: number;
}

const RESOLUTION_LEVELS: readonly AdaptiveResolutionLevel[] = [
  { maxPixelRatio: 0.5 },
  { maxPixelRatio: 1 },
  { maxPixelRatio: 1.25 },
  { maxPixelRatio: 1.5 },
  { maxPixelRatio: 2 },
];

const INITIAL_LEVEL: Record<QualityTier, number> = {
  [QualityTier.LOW]: 1,
  [QualityTier.MEDIUM]: 2,
  [QualityTier.HIGH]: 4,
};

const MINIMUM_LEVEL: Record<QualityTier, number> = {
  [QualityTier.LOW]: 0,
  [QualityTier.MEDIUM]: 1,
  [QualityTier.HIGH]: 1,
};

const MAX_LEVEL: Record<QualityTier, number> = {
  [QualityTier.LOW]: 2,
  [QualityTier.MEDIUM]: 3,
  [QualityTier.HIGH]: 4,
};

const SAMPLE_SECONDS = 0.25;
const SLOW_FPS = 50;
const SEVERELY_SLOW_FPS = 35;
const HEALTHY_FPS = 57;
const DOWNGRADE_SAMPLES = 8;
const DOWNGRADE_VOTES = 6;
const SEVERE_SAMPLES = 4;
const SEVERE_VOTES = 3;
const UPGRADE_SAMPLES = 24;
const UPGRADE_VOTES = 21;
const SEVERE_RECOVERY_DELAY_SECONDS = 60;
const SUSTAINED_RECOVERY_DELAY_SECONDS = 15;

export const ADAPTIVE_QUALITY_SETTLE_SECONDS = 3;
export const ADAPTIVE_QUALITY_SETTLE_FRAMES = 30;

export function createAdaptiveQualityState(
  detector: QualityTierDetector,
  options: AdaptiveQualityOptions = {}
) {
  const nativePixelRatio = Math.max(
    1,
    options.devicePixelRatio ??
      (typeof window === "undefined" ? 1 : window.devicePixelRatio)
  );

  const initialTier = detector.currentTier;
  let contentTier = $state(initialTier);
  let levelIndex = $state(INITIAL_LEVEL[initialTier]);
  let minimumLevel = MINIMUM_LEVEL[initialTier];
  let maximumLevel = $state(MAX_LEVEL[initialTier]);
  let fps = $state(0);
  let initialized = $state(false);

  let sampleElapsed = 0;
  let sampleFrames = 0;
  let recentSamples: number[] = [];
  let baselineReported = false;
  let upgradeDelaySeconds = 0;
  let settleSecondsRemaining = 0;
  let settleFramesRemaining = 0;
  let wasActive = false;

  function resetSamples(): void {
    sampleElapsed = 0;
    sampleFrames = 0;
    recentSamples = [];
  }

  function armSettleWindow(): void {
    settleSecondsRemaining = ADAPTIVE_QUALITY_SETTLE_SECONDS;
    settleFramesRemaining = ADAPTIVE_QUALITY_SETTLE_FRAMES;
    resetSamples();
  }

  function setLevel(nextLevel: number, reason: string): void {
    const clamped = Math.max(minimumLevel, Math.min(maximumLevel, nextLevel));
    if (clamped === levelIndex) return;

    levelIndex = clamped;
    armSettleWindow();

    const level = RESOLUTION_LEVELS[levelIndex]!;
    console.info(
      `[AdaptiveQuality] ${reason}: ${Math.min(nativePixelRatio, level.maxPixelRatio).toFixed(2)} DPR at ${contentTier} visual fidelity (${fps} fps)`
    );
  }

  // Content tier is one-way for the session: shadows and bloom popping back in
  // and out reads worse than a stable lower look. Resolution can still climb
  // again inside the lower tier when frame headroom returns.
  function stepContentTierDown(reason: string): boolean {
    const nextTier =
      contentTier === QualityTier.HIGH
        ? QualityTier.MEDIUM
        : contentTier === QualityTier.MEDIUM
          ? QualityTier.LOW
          : null;
    if (nextTier === null) return false;

    contentTier = nextTier;
    if (!detector.hasOverride) {
      minimumLevel = MINIMUM_LEVEL[nextTier];
      maximumLevel = MAX_LEVEL[nextTier];
    }
    levelIndex = Math.max(minimumLevel, Math.min(maximumLevel, levelIndex));
    armSettleWindow();

    const level = RESOLUTION_LEVELS[levelIndex]!;
    console.info(
      `[AdaptiveQuality] ${reason}: lowered visual fidelity to ${contentTier} at ${Math.min(nativePixelRatio, level.maxPixelRatio).toFixed(2)} DPR (${fps} fps)`
    );
    return true;
  }

  function initialize(renderer: WebGLRenderer): void {
    if (initialized) return;

    const detectedTier = detector.detectFromRenderer(renderer);
    contentTier = detectedTier;
    levelIndex = INITIAL_LEVEL[detectedTier];
    minimumLevel = MINIMUM_LEVEL[detectedTier];
    maximumLevel = detector.hasOverride ? levelIndex : MAX_LEVEL[detectedTier];
    initialized = true;
    baselineReported = false;
    armSettleWindow();
    wasActive = false;

    const level = RESOLUTION_LEVELS[levelIndex]!;
    console.info(
      `[AdaptiveQuality] initialized: ${contentTier} visual fidelity at ${Math.min(nativePixelRatio, level.maxPixelRatio).toFixed(2)} DPR`
    );
  }

  function evaluateSamples(): void {
    if (detector.hasOverride) return;

    const severeWindow = recentSamples.slice(-SEVERE_SAMPLES);
    if (
      severeWindow.length === SEVERE_SAMPLES &&
      severeWindow.filter((sample) => sample < SEVERELY_SLOW_FPS).length >=
        SEVERE_VOTES
    ) {
      // A failed quality probe should not come back six seconds later and tank
      // the same scene again. Give the phone time to cool before retrying it.
      upgradeDelaySeconds = Math.max(
        upgradeDelaySeconds,
        SEVERE_RECOVERY_DELAY_SECONDS
      );
      if (levelIndex > minimumLevel) {
        setLevel(levelIndex - 2, "severe frame pressure");
        return;
      }
      // Resolution adapts first. At its floor, the content tier gives up
      // shadows, bloom, and lights only once a full downgrade window of
      // samples has accumulated at the floor, not after the shorter severe
      // window alone.
      if (recentSamples.length >= DOWNGRADE_SAMPLES) {
        stepContentTierDown("severe frame pressure");
      }
      return;
    }

    const downgradeWindow = recentSamples.slice(-DOWNGRADE_SAMPLES);
    if (
      downgradeWindow.length === DOWNGRADE_SAMPLES &&
      downgradeWindow.filter((sample) => sample < SLOW_FPS).length >=
        DOWNGRADE_VOTES
    ) {
      upgradeDelaySeconds = Math.max(
        upgradeDelaySeconds,
        SUSTAINED_RECOVERY_DELAY_SECONDS
      );
      if (levelIndex === minimumLevel) {
        stepContentTierDown("sustained frame pressure");
      } else {
        setLevel(levelIndex - 1, "sustained frame pressure");
      }
      return;
    }

    const upgradeWindow = recentSamples.slice(-UPGRADE_SAMPLES);
    if (
      upgradeDelaySeconds <= 0 &&
      levelIndex < maximumLevel &&
      upgradeWindow.length === UPGRADE_SAMPLES &&
      upgradeWindow.filter((sample) => sample >= HEALTHY_FPS).length >=
        UPGRADE_VOTES
    ) {
      setLevel(levelIndex + 1, "sustained frame headroom");
      return;
    }

    if (!baselineReported && recentSamples.length >= DOWNGRADE_SAMPLES) {
      const average = Math.round(
        recentSamples.reduce((sum, sample) => sum + sample, 0) /
          recentSamples.length
      );
      baselineReported = true;
      console.info(
        `[AdaptiveQuality] stable baseline: ${average} fps at level ${levelIndex}`
      );
    }
  }

  function observeFrame(deltaSeconds: number, active: boolean): void {
    if (!active) {
      resetSamples();
      wasActive = false;
      return;
    }

    if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return;

    if (!wasActive) {
      wasActive = true;
      armSettleWindow();
    }

    // Starting or resuming playback wakes lazy scene work that is unrelated to
    // steady-state rendering cost. Let those uploads and allocations settle so
    // a capable machine is not judged by its first few frames.
    if (settleSecondsRemaining > 0 || settleFramesRemaining > 0) {
      settleSecondsRemaining = Math.max(
        0,
        settleSecondsRemaining - deltaSeconds
      );
      settleFramesRemaining = Math.max(0, settleFramesRemaining - 1);
      resetSamples();
      return;
    }

    // A background/resume gap is not a rendering-quality signal. Browser
    // visibility normally filters it, and this catches the remaining cases.
    // Keep the settling tail out too; uploads queued behind the stall can make
    // the next few frames just as misleading as the gap itself.
    if (deltaSeconds > 1) {
      armSettleWindow();
      return;
    }

    upgradeDelaySeconds = Math.max(0, upgradeDelaySeconds - deltaSeconds);
    sampleElapsed += deltaSeconds;
    sampleFrames += 1;
    if (sampleElapsed + 1e-6 < SAMPLE_SECONDS) return;

    fps = Math.round(sampleFrames / sampleElapsed);
    recentSamples.push(fps);
    if (recentSamples.length > UPGRADE_SAMPLES) recentSamples.shift();

    sampleElapsed = 0;
    sampleFrames = 0;
    evaluateSamples();
  }

  return {
    initialize,
    observeFrame,
    armSettleWindow,
    get initialized(): boolean {
      return initialized;
    },
    get fps(): number {
      return fps;
    },
    // The visual-fidelity tier. It starts from renderer detection and does not
    // follow every resolution change.
    get tier(): QualityTier {
      return contentTier;
    },
    // Frame pressure lowers pixel density first. Only after the resolution
    // floor is reached and pressure persists does the content tier step down
    // (HIGH -> MEDIUM -> LOW); each step is logged and never reverses within
    // the session, so authored effects do not pop in and out.
    get contentTier(): QualityTier {
      return contentTier;
    },
    get config(): QualityTierConfig {
      return TIER_CONFIGS[contentTier];
    },
    get pixelRatio(): number {
      return Math.min(
        nativePixelRatio,
        RESOLUTION_LEVELS[levelIndex]!.maxPixelRatio
      );
    },
    get resolutionLevel(): number {
      return levelIndex;
    },
  };
}

export type AdaptiveQualityState = ReturnType<
  typeof createAdaptiveQualityState
>;
