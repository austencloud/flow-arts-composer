import { browser } from "$app/env";
import { sceneAudioState } from "#lib/shared/3d/state/scene-audio-state.svelte.js";

const POP_SECONDS = 0.11;
const POP_LEVEL = 0.24;

export interface IOceanBubblePop {
  play(size01: number, pan?: number): void;
  dispose(): void;
}

const NOOP_POP: IOceanBubblePop = { play() {}, dispose() {} };

function createLiveBubblePop(): IOceanBubblePop {
  let context: AudioContext | null = null;

  function ensureContext(): AudioContext | null {
    if (context) return context;
    try {
      const AudioContextConstructor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      context = new AudioContextConstructor();
      return context;
    } catch {
      return null;
    }
  }

  return {
    play(size01: number, pan = 0): void {
      const ctx = ensureContext();
      if (!ctx) return;
      if (ctx.state === "suspended") void ctx.resume();

      const volume = sceneAudioState.masterVolume;
      if (volume <= 0) return;

      const clampedSize = Math.max(0, Math.min(1, size01));
      const now = ctx.currentTime;
      const frequency = 720 - clampedSize * 360;
      const oscillator = ctx.createOscillator();
      const envelope = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      const panner = ctx.createStereoPanner();

      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency * 1.25, now);
      oscillator.frequency.exponentialRampToValueAtTime(
        frequency * 0.55,
        now + POP_SECONDS
      );

      filter.type = "lowpass";
      filter.Q.value = 0.6;
      filter.frequency.setValueAtTime(1900 - clampedSize * 500, now);

      envelope.gain.setValueAtTime(0.0001, now);
      envelope.gain.exponentialRampToValueAtTime(
        volume * POP_LEVEL,
        now + 0.004
      );
      envelope.gain.exponentialRampToValueAtTime(0.0001, now + POP_SECONDS);
      panner.pan.value = Math.max(-1, Math.min(1, pan));

      oscillator.connect(filter);
      filter.connect(envelope);
      envelope.connect(panner);
      panner.connect(ctx.destination);

      oscillator.start(now);
      oscillator.stop(now + POP_SECONDS + 0.01);
      oscillator.onended = () => {
        oscillator.disconnect();
        filter.disconnect();
        envelope.disconnect();
        panner.disconnect();
      };
    },

    dispose(): void {
      if (context && context.state !== "closed") void context.close();
      context = null;
    },
  };
}

export function createOceanBubblePop(): IOceanBubblePop {
  if (!browser) return NOOP_POP;
  const AudioContextConstructor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  return AudioContextConstructor ? createLiveBubblePop() : NOOP_POP;
}
