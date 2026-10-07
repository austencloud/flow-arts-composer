export interface PreviewVideoState {
  currentTime: number;
  ready: boolean;
  ended: boolean;
}

export interface PreviewVideoController {
  read: () => PreviewVideoState;
  align: () => void;
  hold: (held: boolean) => void;
  /**
   * Told on every frame of playback how far the clip runs ahead of sounding
   * music, in post seconds, or null when the music does not set the clock or
   * the clip is held.
   */
  follow?: (leadSeconds: number | null) => void;
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

/**
 * How far each clip runs ahead of the clock's master, in post seconds:
 * positive ahead, negative behind. The master itself, a clip that is not
 * ready or has ended, and every clip once the master has ended get null.
 */
export function previewClockLeads(
  media: readonly PreviewClockMedia[]
): (number | null)[] {
  const master = media[0];
  if (!master || !master.ready || master.ended) return media.map(() => null);
  // All were read on the same frame against the same playhead, so the
  // playhead's own lag cancels out.
  const masterOffset =
    (master.currentTime - master.targetTime) / master.playbackRate;
  return media.map((video, index) =>
    index === 0 || !video.ready || video.ended
      ? null
      : (video.currentTime - video.targetTime) / video.playbackRate -
        masterOffset
  );
}
