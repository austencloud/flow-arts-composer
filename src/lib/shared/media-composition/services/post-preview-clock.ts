export interface PreviewVideoState {
  currentTime: number;
  ready: boolean;
  ended: boolean;
}

export interface PreviewVideoController {
  read: () => PreviewVideoState;
  align: () => void;
  hold: (held: boolean) => void;
}

export interface PreviewClockMedia extends PreviewVideoState {
  targetTime: number;
  playbackRate: number;
}

/** Footage sets the pace; buffering holds overlays, taps, and keyframes with it. */
export function previewClockStep(
  timelineSeconds: number,
  wallDeltaSeconds: number,
  media: readonly PreviewClockMedia[],
  nextBoundarySeconds = Infinity
): { deltaSeconds: number; waiting: boolean } {
  if (media.some((video) => !video.ready))
    return { deltaSeconds: 0, waiting: true };
  const master = media[0];
  const delta =
    master && !master.ended
      ? (master.currentTime - master.targetTime) / master.playbackRate
      : wallDeltaSeconds;
  // Crossing just past a cut releases the outgoing clip and starts the next
  // one's readiness gate, including when footage ends on its final frame.
  const untilBoundary = nextBoundarySeconds - timelineSeconds + 1e-6;
  return {
    deltaSeconds: Math.max(0, Math.min(delta, untilBoundary)),
    waiting: false,
  };
}
