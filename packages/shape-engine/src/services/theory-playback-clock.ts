import type { PlaybackMode } from "#lib/shared/animation-engine/state/animation-panel-state.svelte.js";

export interface TheoryPlaybackTick {
  advanceMs: number;
  clockMs: number;
}

export function resolveTheoryPlaybackTick(
  clockMs: number,
  deltaMs: number,
  beatDurationMs: number,
  pauseMs: number,
  mode: PlaybackMode
): TheoryPlaybackTick {
  if (mode === "continuous") return { advanceMs: deltaMs, clockMs: 0 };

  const duration = Math.max(1, beatDurationMs);
  const cycle = duration + Math.max(0, pauseMs);
  const remainingMotion = Math.max(0, duration - clockMs);
  const wrappedMotion = Math.max(0, clockMs + deltaMs - cycle);
  return {
    advanceMs:
      Math.min(deltaMs, remainingMotion) + Math.min(duration, wrappedMotion),
    clockMs: (clockMs + deltaMs) % cycle,
  };
}
