// Long enough to read "Pause" after moving the mouse, short enough that it
// doesn't sit on the animation someone stopped moving to watch.
const HOVER_HINT_LINGER_MS = 1500;

/**
 * Wakes the canvas hover hint on mouse activity and lets it rest a moment
 * after the activity stops. A resting mouse says nothing, so it can't hold the
 * hint up: that covers a player that opens under a mouse that just pressed
 * Play.
 */
export function createHoverHintLinger(
  onAwakeChange: (awake: boolean) => void,
  lingerMs = HOVER_HINT_LINGER_MS
) {
  let timer: ReturnType<typeof setTimeout> | null = null;

  return {
    wake() {
      if (timer === null) onAwakeChange(true);
      else clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        onAwakeChange(false);
      }, lingerMs);
    },
    dispose() {
      if (timer === null) return;
      clearTimeout(timer);
      timer = null;
    },
  };
}
