/**
 * Playhead Actions
 *
 * Extracted playhead/transport control mutations.
 * Uses callback injection to preserve Svelte 5 reactivity.
 */

import type { PlayheadState, TimeSeconds } from "#lib/shared/animation-engine/domain/timeline-types.js";

export interface PlayheadContext {
  getPlayhead: () => PlayheadState;
  setPlayhead: (p: PlayheadState) => void;
  getTotalDuration: () => number;
  getFrameRate: () => number;
}

export function createPlayheadActions(ctx: PlayheadContext) {
  const { getPlayhead, setPlayhead, getTotalDuration, getFrameRate } = ctx;

  function setPlayheadPosition(position: TimeSeconds) {
    const playhead = getPlayhead();
    setPlayhead({
      ...playhead,
      position: Math.max(0, Math.min(getTotalDuration(), position)),
    });
  }

  function play() {
    setPlayhead({ ...getPlayhead(), isPlaying: true, direction: 1 });
  }

  function pause() {
    setPlayhead({ ...getPlayhead(), isPlaying: false });
  }

  function stop() {
    setPlayhead({ ...getPlayhead(), isPlaying: false, position: 0 });
  }

  function togglePlayPause() {
    if (getPlayhead().isPlaying) {
      pause();
    } else {
      play();
    }
  }

  function setShuttleSpeed(speed: number) {
    setPlayhead({ ...getPlayhead(), shuttleSpeed: speed });
  }

  function shuttle(direction: 1 | -1) {
    const playhead = getPlayhead();
    const speeds = [1, 2, 4, 8];
    const currentIndex = speeds.indexOf(playhead.shuttleSpeed);

    if (playhead.direction === direction && playhead.isPlaying) {
      const nextIndex = Math.min(currentIndex + 1, speeds.length - 1);
      setPlayhead({
        ...playhead,
        shuttleSpeed: speeds[nextIndex] ?? 1,
        direction,
        isPlaying: true,
      });
    } else {
      setPlayhead({
        ...playhead,
        shuttleSpeed: 1,
        direction,
        isPlaying: true,
      });
    }
  }

  function shuttleForward() {
    shuttle(1);
  }

  function shuttleReverse() {
    shuttle(-1);
  }

  function shuttleStop() {
    setPlayhead({ ...getPlayhead(), isPlaying: false, shuttleSpeed: 1 });
  }

  function setLoopRegion(start: TimeSeconds | null, end: TimeSeconds | null) {
    setPlayhead({ ...getPlayhead(), loopStart: start, loopEnd: end });
  }

  function clearLoopRegion() {
    setPlayhead({ ...getPlayhead(), loopStart: null, loopEnd: null });
  }

  function goToStart() {
    setPlayheadPosition(0);
  }

  function goToEnd() {
    setPlayheadPosition(getTotalDuration());
  }

  function stepForward(frames: number = 1) {
    const frameTime = 1 / getFrameRate();
    setPlayheadPosition(getPlayhead().position + frameTime * frames);
  }

  function stepBackward(frames: number = 1) {
    const frameTime = 1 / getFrameRate();
    setPlayheadPosition(getPlayhead().position - frameTime * frames);
  }

  return {
    setPlayheadPosition,
    play,
    pause,
    stop,
    togglePlayPause,
    setShuttleSpeed,
    shuttleForward,
    shuttleReverse,
    shuttleStop,
    setLoopRegion,
    clearLoopRegion,
    goToStart,
    goToEnd,
    stepForward,
    stepBackward,
  };
}
