/**
 * The Room of Collaboration rendered to a file instead of the speakers: the
 * village ambience (village-ambience.ts) in an OfflineAudioContext, heard
 * from a fixed distance, with cues played on a timeline. The noise seed is
 * explicit and every cue is scheduled before the render starts, so two
 * renders with the same settings match. Not always bit for bit: Chrome's
 * arithmetic inside a cue's ramp can differ in a float's last bits from run
 * to run (largest gap seen 6e-8, about 140 dB down; often none at all;
 * Chrome 155, measured 10-23). The page reports the gap for each render.
 * /test/village-sound downloads the result as a WAV for someone to listen to.
 */

import type { VillageMomentKind } from "#lib/features/village/state/village-moments.js";
import { cuesForMoment } from "../data/village-sound-cues";
import { VillageAmbience } from "./village-ambience";
import { VILLAGE_NOISE_SEED } from "./village-noise";

export interface VillageRenderCue {
  // Seconds into the render.
  at: number;
  moment: VillageMomentKind;
}

/**
 * The opening's three moments, squeezed into thirty seconds so a listener
 * hears each one land and settle: in the room they are further apart. The
 * first waits out the room's fade-in; the last ends just before the file does.
 */
export const OPENING_RENDER_TIMELINE: readonly VillageRenderCue[] = [
  { at: 4, moment: "opening:started" },
  { at: 11, moment: "opening:recognition" },
  { at: 19, moment: "opening:passing" },
];

export interface VillageRenderOptions {
  seconds: number;
  // Metres from the listener to the fire.
  distance: number;
  // The museum's master volume.
  master: number;
  sampleRate: number;
  noiseSeed: number;
  timeline: readonly VillageRenderCue[];
}

export const VILLAGE_RENDER_DEFAULTS: VillageRenderOptions = {
  seconds: 30,
  // Where a visitor first stands (rules campfire.audienceDistance).
  distance: 11,
  master: 0.7,
  sampleRate: 48000,
  noiseSeed: VILLAGE_NOISE_SEED,
  timeline: OPENING_RENDER_TIMELINE,
};

/** Renders the room; mono, after the master volume. */
export async function renderVillageSound(
  options: Partial<VillageRenderOptions> = {}
): Promise<Float32Array> {
  const { seconds, distance, master, sampleRate, noiseSeed, timeline } = {
    ...VILLAGE_RENDER_DEFAULTS,
    ...options,
  };
  const context = new OfflineAudioContext(
    1,
    Math.round(seconds * sampleRate),
    sampleRate
  );
  const masterGain = context.createGain();
  masterGain.gain.value = master;
  masterGain.connect(context.destination);
  const output = { context, destination: masterGain };
  const ambience = new VillageAmbience(() => output, noiseSeed);
  // One update is enough: the listener never moves.
  ambience.update(true, distance, Infinity);

  // Every cue is scheduled before the render starts, in time order, so
  // nothing reaches the audio thread mid-render and each render repeats.
  const ordered = [...timeline].sort((x, y) => x.at - y.at);
  for (const { at, moment } of ordered) {
    for (const cue of cuesForMoment(moment)) ambience.play(cue, at);
  }
  const rendered = await context.startRendering();
  ambience.dispose();
  return rendered.getChannelData(0).slice();
}

/** The largest gap between two renders, in dB below full scale. */
export function largestDifferenceDb(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return 0;
  let largest = 0;
  for (let i = 0; i < a.length; i++) {
    largest = Math.max(largest, Math.abs((a[i] ?? 0) - (b[i] ?? 0)));
  }
  return largest > 0 ? 20 * Math.log10(largest) : -Infinity;
}

/** A short fingerprint of the samples, to tell two renders apart (FNV-1a). */
export function samplesFingerprint(samples: Float32Array): string {
  const bytes = new Uint8Array(
    samples.buffer,
    samples.byteOffset,
    samples.byteLength
  );
  let hash = 0x811c9dc5;
  for (const byte of bytes) hash = Math.imul(hash ^ byte, 0x01000193) >>> 0;
  return hash.toString(16).padStart(8, "0");
}

/** The file name says what was rendered, so two files can be told apart. */
export function villageRenderFileName(
  options: Pick<VillageRenderOptions, "seconds" | "distance" | "noiseSeed">
): string {
  return `village-room-${options.seconds}s-${options.distance}m-seed-${options.noiseSeed.toString(16)}.wav`;
}
