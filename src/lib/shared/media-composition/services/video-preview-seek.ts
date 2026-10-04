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
  recoveryElapsedMs?: number;
  targetBuffered?: boolean;
  presentedTime?: number | null;
  sinceLastPresentedFrameMs?: number;
  visible?: boolean;
}

export function shouldSeekPreviewVideo(state: PreviewSeekState): boolean {
  const jumped =
    state.discontinuity ||
    (state.previousTargetTime !== null &&
      Math.abs(state.targetTime - state.previousTargetTime) > 0.5);
  // Repeated seeks can leave footage displaying the same frame while the
  // playhead moves. The composition follows the native media clock instead.
  const tolerance = state.playing ? (jumped ? 1 / 30 : 2) : 1 / 30;
  if (state.seeking) return false;
  // The native clock can keep advancing after the picture stops. Give a
  // visible, buffered clip one retry even when that clock is on time.
  const presentationStalled =
    state.playing &&
    state.visible === true &&
    state.targetBuffered === true &&
    (state.sinceLastPresentedFrameMs ?? 0) >= 3000 &&
    (state.presentedTime === null ||
      (state.presentedTime !== undefined &&
        Math.abs(state.targetTime - state.presentedTime) > 1 / 30));
  if (presentationStalled && state.sinceLastCorrectionMs >= 3000) return true;
  if (Math.abs(state.currentTime - state.targetTime) <= tolerance) return false;
  if (!state.playing) return true;
  // A decoder that stops presenting frames cannot clear its own recovery
  // gate. Retry a buffered position after giving the current attempt time.
  const recoveryStalled =
    (state.recoveryElapsedMs ?? 0) >= 3000 && state.targetBuffered === true;
  return (
    jumped ||
    (((!state.waiting && !state.awaitingFrame) || recoveryStalled) &&
      state.sinceLastCorrectionMs >= 3000)
  );
}

export function previewPlaybackRate(authoredRate: number): number {
  return authoredRate;
}
