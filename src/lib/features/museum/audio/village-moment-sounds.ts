/**
 * One-shot sounds for the visitor's moments in the Room of Collaboration,
 * made in code from seeded noise and crackle, like the rest of the room
 * (village-ambience.ts). They stay in the fire's family; none is music.
 *
 *   - ember-rise: embers catching. Crackles thicken and brighten while a
 *     breath of air rises under them. For something taught.
 *   - hearth-breath: the fire drawing one slow breath, low and warm, with a
 *     few pops. For coming back to find it still alive.
 *   - ember-fade: embers dying. Crackles thin out and darken over a fading
 *     hiss. For something lost.
 *
 * Each sample is raw material the length of the cue; the ambience gives it
 * the cue's envelope and a filter sweep (MOMENT_SWEEPS) and mixes it into
 * the room. Pure and seeded: the same call gives the same samples.
 */

import { seededRandom } from "./village-noise";

export const VILLAGE_MOMENT_EFFECTS = [
  "ember-rise",
  "hearth-breath",
  "ember-fade",
] as const;
export type VillageMomentEffect = (typeof VILLAGE_MOMENT_EFFECTS)[number];

export function isMomentEffect(effect: string): effect is VillageMomentEffect {
  return (VILLAGE_MOMENT_EFFECTS as readonly string[]).includes(effect);
}

/** The filter each one-shot plays through, swept from `from` to `to` Hz. */
export const MOMENT_SWEEPS: Record<
  VillageMomentEffect,
  { type: BiquadFilterType; from: number; to: number; q: number }
> = {
  "ember-rise": { type: "bandpass", from: 600, to: 2400, q: 0.5 },
  "hearth-breath": { type: "lowpass", from: 260, to: 900, q: 0.7 },
  "ember-fade": { type: "lowpass", from: 3200, to: 380, q: 0.7 },
};

const SEEDS: Record<VillageMomentEffect, number> = {
  "ember-rise": 0x51e2a9c7,
  "hearth-breath": 0x0b7d4e13,
  "ember-fade": 0x7a3c90f5,
};

const PEAK = 0.9;

/** How busy the crackle is at `t` (0 to 1 through the sound), per effect. */
function crackleDensity(effect: VillageMomentEffect, t: number): number {
  switch (effect) {
    case "ember-rise":
      // Thickens through the first two thirds, then settles back.
      return t < 0.65 ? t / 0.65 : 1 - (t - 0.65) / 0.35;
    case "hearth-breath":
      return 0.12;
    case "ember-fade":
      return (1 - t) ** 2;
  }
}

/** How loud the breath of noise under the crackle is at `t`. */
function breathLevel(effect: VillageMomentEffect, t: number): number {
  switch (effect) {
    case "ember-rise":
      return 0.35 * Math.sin(Math.PI * t);
    case "hearth-breath":
      return Math.sin(Math.PI * t) ** 2;
    case "ember-fade":
      return 0.4 * (1 - t);
  }
}

/** The raw one-shot: seeded crackle over a breath of smoothed noise, peak 0.9. */
export function momentSamples(
  effect: VillageMomentEffect,
  sampleRate: number,
  seconds: number
): Float32Array {
  const out = new Float32Array(Math.max(1, Math.round(sampleRate * seconds)));
  const random = seededRandom(SEEDS[effect]);

  // Breath: white noise through a one-pole lowpass, so it reads as air.
  let smooth = 0;
  const pole = effect === "hearth-breath" ? 0.02 : 0.08;
  for (let i = 0; i < out.length; i++) {
    smooth += (random() * 2 - 1 - smooth) * pole;
    out[i] = smooth * breathLevel(effect, i / out.length) * 4;
  }

  // Crackle: short decaying clicks, at most about twenty a second.
  let at = 0;
  while (at < out.length) {
    const t = at / out.length;
    const density = crackleDensity(effect, t);
    const gap = 0.05 + (1 - density) * 0.4 + random() * 0.08;
    at += Math.round(sampleRate * gap);
    if (at >= out.length || random() > 0.25 + density * 0.75) continue;
    const length = Math.round(sampleRate * (0.002 + random() * 0.01));
    const amplitude = (0.25 + random() * 0.5) * (0.4 + 0.6 * density);
    for (let i = 0; i < length && at + i < out.length; i++) {
      out[at + i] =
        (out[at + i] ?? 0) +
        (random() * 2 - 1) * amplitude * Math.exp((-5 * i) / length);
    }
  }

  let peak = 0;
  for (const s of out) peak = Math.max(peak, Math.abs(s));
  if (peak > 0)
    for (let i = 0; i < out.length; i++) out[i] = (out[i]! / peak) * PEAK;
  return out;
}
