/**
 * Finds the clap that starts a multi-camera recording.
 *
 * Every camera hears the same clap, so its time in each video is what lines
 * the videos up. The signal is differenced first: a clap is broadband and
 * survives that almost whole, while sung or played tones, which carry most of
 * music's energy, nearly vanish. Short windows of the differenced energy are
 * then compared with the stretch just before them. The first window that is
 * both loud and a big jump over its past is the clap; the best window in the
 * next 50 ms settles which one. The answer is the first sample above half the
 * clap's peak, so two cameras agree to well under a video frame.
 */

export interface ClapSearchOptions {
  /** How far into the recording to look, seconds. */
  searchSeconds?: number;
  /** The clap's energy must exceed the stretch before it by this factor. */
  minJump?: number;
  /** And its differenced RMS must reach this level (full scale is 1). */
  minLevel?: number;
}

const WINDOW_SECONDS = 0.01;
const HOP_SECONDS = 0.005;
const BACKGROUND_SECONDS = 0.15;
const SETTLE_SECONDS = 0.05;

export function findClapSeconds(
  samples: Float32Array,
  sampleRate: number,
  options: ClapSearchOptions = {},
): number | null {
  const searchSeconds = options.searchSeconds ?? 20;
  const minJump = options.minJump ?? 20;
  const minLevel = options.minLevel ?? 0.1;
  const window = Math.max(2, Math.round(WINDOW_SECONDS * sampleRate));
  const hop = Math.max(1, Math.round(HOP_SECONDS * sampleRate));
  const end = Math.min(samples.length, Math.round(searchSeconds * sampleRate));

  const energies: number[] = [];
  for (let start = 1; start + window <= end; start += hop) {
    let sum = 0;
    for (let i = start; i < start + window; i += 1) {
      const step = samples[i]! - samples[i - 1]!;
      sum += step * step;
    }
    energies.push(sum / window);
  }

  const backgroundHops = Math.max(
    2,
    Math.round(BACKGROUND_SECONDS / HOP_SECONDS),
  );
  const settleHops = Math.max(1, Math.round(SETTLE_SECONDS / HOP_SECONDS));
  const jumpAt = (index: number): number => {
    let background = 0;
    // The hop just before overlaps this window, so it is left out.
    for (let b = index - backgroundHops; b < index - 1; b += 1) {
      background += energies[b]!;
    }
    background /= backgroundHops - 1;
    return energies[index]! / Math.max(background, 1e-10);
  };
  const qualifies = (index: number): boolean =>
    Math.sqrt(energies[index]!) >= minLevel && jumpAt(index) >= minJump;

  let first = -1;
  for (let index = backgroundHops; index < energies.length; index += 1) {
    if (qualifies(index)) {
      first = index;
      break;
    }
  }
  if (first < 0) return null;

  let best = first;
  for (
    let index = first + 1;
    index < Math.min(energies.length, first + settleHops);
    index += 1
  ) {
    if (jumpAt(index) > jumpAt(best)) best = index;
  }

  const from = Math.max(0, 1 + (best - 1) * hop);
  const to = Math.min(end, 1 + best * hop + window);
  let peak = 0;
  for (let i = from; i < to; i += 1)
    peak = Math.max(peak, Math.abs(samples[i]!));
  for (let i = from; i < to; i += 1) {
    if (Math.abs(samples[i]!) >= peak / 2) return i / sampleRate;
  }
  return (1 + best * hop) / sampleRate;
}
