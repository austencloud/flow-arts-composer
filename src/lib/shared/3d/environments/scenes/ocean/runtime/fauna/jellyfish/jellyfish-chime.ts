import { browser } from "$app/env";
import { sceneAudioState } from "../../../../../../state/scene-audio-state.svelte";
export {
  buildPentatonicNotes,
  midiName,
  midiToFreq,
} from "../../../../../worlds/ocean/ocean-jellyfish-notes";

// Additive inharmonic partials → per-partial exponential decay → lowpass
// (underwater muffle) → stereo pan → master, with a shared convolver reverb tail.
// A soft, mellow bell: fundamental dominant with gentle upper partials. Kept
// dark and low on the bright inharmonic partials so it reads as a warm chime,
// not a sharp ping. A lowpass envelope (see play) darkens the tail further.
const PARTIALS: readonly [ratio: number, gain: number, decayMul: number][] = [
  [1.0, 1.0, 1.0],
  [2.0, 0.4, 0.75],
  [3.01, 0.16, 0.5],
  [4.18, 0.07, 0.35],
];
const ATTACK = 0.014; // softer onset — no click/ping
const BASE_DECAY = 2.0;
const REVERB_SECONDS = 2.8;
const REVERB_DECAY = 2.8;
const REVERB_WET = 0.36; // lush, gentle tail
// Headroom so the stacked partials at full scene volume never clip the master.
const BELL_LEVEL = 0.42;

export interface JellyfishChime {
  /** Play a bell at the given frequency (Hz), panned in [-1, 1]. */
  play(freq: number, pan?: number): void;
  dispose(): void;
}

const NOOP_CHIME: JellyfishChime = { play() {}, dispose() {} };

function makeReverbImpulse(ctx: AudioContext, seconds: number, decay: number): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const data = buf.getChannelData(c);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
  }
  return buf;
}

function createLiveChime(): JellyfishChime {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let reverb: ConvolverNode | null = null;

  function ensure(): boolean {
    if (ctx) return true;
    try {
      ctx = new (window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    } catch {
      return false;
    }
    master = ctx.createGain();
    master.connect(ctx.destination);

    reverb = ctx.createConvolver();
    reverb.buffer = makeReverbImpulse(ctx, REVERB_SECONDS, REVERB_DECAY);
    const wet = ctx.createGain();
    wet.gain.value = REVERB_WET;
    reverb.connect(wet);
    wet.connect(ctx.destination);
    return true;
  }

  return {
    play(freq: number, pan = 0): void {
      if (!ensure() || !ctx || !master || !reverb) return;
      if (ctx.state === "suspended") void ctx.resume();

      // Bells follow the master volume slider but NOT the music mute/pause —
      // they're interaction feedback, so they ring even with the ambient track
      // paused or muted.
      const vol = sceneAudioState.masterVolume;
      if (vol <= 0) return;
      master.gain.value = vol * BELL_LEVEL;

      const t = ctx.currentTime;
      const decayEnd = t + BASE_DECAY;

      const panner = ctx.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, pan));

      // Lowpass with a closing envelope: opens softly on attack, darkens as the
      // note rings out — a mellower, gentler bloom than a static filter.
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.Q.value = 0.3;
      const cutOpen = Math.min(3600, freq * 4 + 900);
      const cutClose = Math.max(freq * 1.5 + 300, 350);
      lp.frequency.setValueAtTime(cutOpen, t);
      lp.frequency.exponentialRampToValueAtTime(cutClose, decayEnd);
      lp.connect(panner);
      panner.connect(master);
      panner.connect(reverb);

      let maxStop = 0;
      for (const [ratio, gain, decMul] of PARTIALS) {
        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.value = freq * ratio;
        osc.detune.value = (Math.random() * 2 - 1) * 4;

        const env = ctx.createGain();
        const decay = BASE_DECAY * decMul;
        env.gain.setValueAtTime(0, t);
        env.gain.linearRampToValueAtTime(gain * 0.9, t + ATTACK);
        env.gain.exponentialRampToValueAtTime(0.0001, t + decay);

        osc.connect(env);
        env.connect(lp);
        const stop = t + decay + 0.1;
        osc.start(t);
        osc.stop(stop);
        // Detach the panner/filter once the longest partial has finished so the
        // graph doesn't leak nodes across many taps.
        maxStop = Math.max(maxStop, stop);
        osc.onended = () => {
          osc.disconnect();
          env.disconnect();
        };
      }

      setTimeout(() => {
        lp.disconnect();
        panner.disconnect();
      }, (maxStop - t) * 1000 + 200);
    },

    dispose(): void {
      if (ctx && ctx.state !== "closed") void ctx.close();
      ctx = null;
      master = null;
      reverb = null;
    },
  };
}

/** Factory getter — bell synth for jellyfish taps. No-op when Web Audio is absent. */
export function createJellyfishChime(): JellyfishChime {
  if (!browser || typeof AudioContext === "undefined") return NOOP_CHIME;
  return createLiveChime();
}
