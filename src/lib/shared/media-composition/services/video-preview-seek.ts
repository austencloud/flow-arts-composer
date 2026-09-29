interface PreviewSeekState {
  currentTime: number;
  targetTime: number;
  previousTargetTime: number | null;
  playing: boolean;
  seeking: boolean;
  waiting: boolean;
  awaitingFrame: boolean;
  discontinuity?: boolean;
  sinceLastCorrectionMs: number;
}

export function shouldSeekPreviewVideo(state: PreviewSeekState): boolean {
  const jumped =
    state.discontinuity ||
    (state.previousTargetTime !== null &&
      Math.abs(state.targetTime - state.previousTargetTime) > 0.5);
  // Repeated seeks can leave footage displaying the same frame while the
  // playhead moves. Continuous drift gets rate correction instead.
  const tolerance = state.playing ? (jumped ? 0.12 : 2) : 1 / 30;
  if (Math.abs(state.currentTime - state.targetTime) <= tolerance) return false;
  if (state.seeking) return false;
  if (!state.playing) return true;
  return (
    jumped ||
    (!state.waiting &&
      !state.awaitingFrame &&
      state.sinceLastCorrectionMs >= 3000)
  );
}

export function previewPlaybackRate(
  authoredRate: number,
  driftSeconds: number,
  recovering: boolean
): number {
  if (recovering || Math.abs(driftSeconds) < 0.05) return authoredRate;
  const correction = Math.max(-0.15, Math.min(0.15, driftSeconds * 0.4));
  return authoredRate * (1 + correction);
}
