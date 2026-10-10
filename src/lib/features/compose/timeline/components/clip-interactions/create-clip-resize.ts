/**
 * createClipResize - Composable for clip resize (duration/speed) drag behavior
 *
 * Returns event handlers for changing a clip's duration (which affects playback speed).
 */

import type { TimelineClip } from "#lib/shared/animation-engine/domain/timeline-types.js";
import { pixelsToTime } from "#lib/shared/animation-engine/domain/timeline-types.js";
import { getTimelineState } from "#lib/shared/animation-engine/state/timeline-state.svelte.js";

export interface ClipResizeHandlers {
  handleResizeStart: (e: MouseEvent) => void;
  dispose: () => void;
}

export interface ClipResizeCallbacks {
  onDragStart: () => void;
  onDragEnd: () => void;
}

export function createClipResize(
  getClip: () => TimelineClip | null,
  getPixelsPerSecond: () => number,
  callbacks: ClipResizeCallbacks
): ClipResizeHandlers {
  let dragStartX = 0;
  let dragStartValue = 0;
  let initialRate = 1;
  let active = false;

  function getState() {
    return getTimelineState();
  }

  function handleResizeUpdate(e: MouseEvent) {
    const clip = getClip();
    if (!clip) return;

    const deltaX = e.clientX - dragStartX;
    const deltaTime = pixelsToTime(deltaX, getPixelsPerSecond());
    const newDuration = Math.max(1.0, dragStartValue + deltaTime);

    // Calculate new playback rate based on duration change
    const speedRatio = dragStartValue / newDuration;
    const newRate = initialRate * speedRatio;

    // Clamp rate to reasonable bounds
    const clampedRate = Math.max(0.1, Math.min(4, newRate));
    const adjustedDuration = (dragStartValue * initialRate) / clampedRate;

    getState().setClipDuration(clip.id, adjustedDuration);
    getState().setClipPlaybackRate(clip.id, clampedRate);
  }

  function handleResizeEnd() {
    if (!active) return;
    active = false;
    getState().endEdit();
    callbacks.onDragEnd();
    window.removeEventListener("mousemove", handleResizeUpdate);
    window.removeEventListener("mouseup", handleResizeEnd);
    window.removeEventListener("blur", handleResizeEnd);
  }

  function handleResizeStart(e: MouseEvent) {
    const clip = getClip();
    if (!clip || clip.locked || e.button !== 0) return;

    e.preventDefault();
    e.stopPropagation();

    dragStartX = e.clientX;
    dragStartValue = clip.duration;
    initialRate = clip.playbackRate;
    active = true;
    getState().beginEdit("RESIZE_CLIP", "Resize clip");

    callbacks.onDragStart();

    window.addEventListener("mousemove", handleResizeUpdate);
    window.addEventListener("mouseup", handleResizeEnd);
    window.addEventListener("blur", handleResizeEnd);
  }

  return { handleResizeStart, dispose: handleResizeEnd };
}
