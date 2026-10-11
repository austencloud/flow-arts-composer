const BLOOM_INTENSITY_GAMMA = 2.6;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * The Bloom slider controls perceived exposure, not raw additive alpha.
 * Without this curve, the first fifth of the track does all the useful work
 * and everything above it clips toward white.
 */
export function perceptualBloomIntensity(intensity: number): number {
  return Math.pow(clamp01(intensity), BLOOM_INTENSITY_GAMMA);
}

/** One clock shared by both renderers keeps pulse timing visually equivalent. */
export function resolveBloomExposure(
  intensity: number,
  pulse: number,
  pulseRate: number,
  timeSeconds: number
): number {
  const pulseAmount = clamp01(pulse);
  const pulseFactor =
    1 -
    pulseAmount +
    pulseAmount * (0.5 + 0.5 * Math.sin(timeSeconds * pulseRate * Math.PI * 2));
  return clamp01(perceptualBloomIntensity(intensity) * pulseFactor);
}

/**
 * Seconds a tip's light path stays visible behind it. Zero turns the history
 * off; the longest setting still clears within about a second, so a trail never
 * outlives the move that drew it.
 */
export function resolveBloomHistoryLifetime(afterglow: number): number {
  return afterglow <= 0.001 ? 0 : 0.08 + clamp01(afterglow) * 0.95;
}

/** Additive energy grows by perceived prop count, not by raw tip count. */
export function resolveBloomSourceNormalization(propCount: number): number {
  return 1 / Math.sqrt(Math.max(1, propCount));
}

/**
 * Rainbow hue in turns. Every tip starts a quarter-ish turn from its
 * neighbors, so two props never bloom the same color at the same moment.
 */
export function resolveBloomRainbowHue(
  clockSeconds: number,
  sourceIndex: number
): number {
  return (clockSeconds * 0.12 + (Math.abs(sourceIndex) % 4) * 0.23) % 1;
}
