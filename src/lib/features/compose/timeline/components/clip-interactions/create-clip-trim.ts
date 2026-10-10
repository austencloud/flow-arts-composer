/**
 * createClipTrim - Composable for clip trim (in/out point) drag behavior
 *
 * Returns event handlers for adjusting a clip's in and out points.
 */

import type { TimelineClip } from "#lib/shared/animation-engine/domain/timeline-types.js";
import { getTimelineState } from "#lib/shared/animation-engine/state/timeline-state.svelte.js";

export interface ClipTrimHandlers {
  handleTrimLeftStart: (e: MouseEvent) => void;
  handleTrimRightStart: (e: MouseEvent) => void;
  dispose: () => void;
}

export interface ClipTrimCallbacks {
  onDragStart: () => void;
  onDragEnd: () => void;
}

export function createClipTrim(
  getClip: () => TimelineClip | null,
  getWidth: () => number,
  callbacks: ClipTrimCallbacks
): ClipTrimHandlers {
  let dragStartX = 0;
  let dragStartValue = 0;
  let leftActive = false;
  let rightActive = false;

  function getState() {
    return getTimelineState();
  }

  // Left trim (in-point) handlers
  function handleTrimLeftUpdate(e: MouseEvent) {
    const clip = getClip();
    if (!clip) return;

    const deltaX = e.clientX - dragStartX;
    const deltaRatio = deltaX / getWidth();
    const newInPoint = Math.max(
      0,
      Math.min(clip.outPoint - 0.1, dragStartValue + deltaRatio)
    );
    getState().setClipInOutPoints(clip.id, newInPoint, clip.outPoint);
  }

  function handleTrimLeftEnd() {
    if (!leftActive) return;
    leftActive = false;
    getState().endEdit();
    callbacks.onDragEnd();
    window.removeEventListener("mousemove", handleTrimLeftUpdate);
    window.removeEventListener("mouseup", handleTrimLeftEnd);
    window.removeEventListener("blur", handleTrimLeftEnd);
  }

  function handleTrimLeftStart(e: MouseEvent) {
    const clip = getClip();
    if (!clip || clip.locked || e.button !== 0) return;

    e.preventDefault();
    e.stopPropagation();

    dragStartX = e.clientX;
    dragStartValue = clip.inPoint;
    leftActive = true;
    getState().beginEdit("TRIM_CLIP", "Trim clip");

    callbacks.onDragStart();

    window.addEventListener("mousemove", handleTrimLeftUpdate);
    window.addEventListener("mouseup", handleTrimLeftEnd);
    window.addEventListener("blur", handleTrimLeftEnd);
  }

  // Right trim (out-point) handlers
  function handleTrimRightUpdate(e: MouseEvent) {
    const clip = getClip();
    if (!clip) return;

    const deltaX = e.clientX - dragStartX;
    const deltaRatio = deltaX / getWidth();
    const newOutPoint = Math.max(
      clip.inPoint + 0.1,
      Math.min(1, dragStartValue + deltaRatio)
    );
    getState().setClipInOutPoints(clip.id, clip.inPoint, newOutPoint);
  }

  function handleTrimRightEnd() {
    if (!rightActive) return;
    rightActive = false;
    getState().endEdit();
    callbacks.onDragEnd();
    window.removeEventListener("mousemove", handleTrimRightUpdate);
    window.removeEventListener("mouseup", handleTrimRightEnd);
    window.removeEventListener("blur", handleTrimRightEnd);
  }

  function handleTrimRightStart(e: MouseEvent) {
    const clip = getClip();
    if (!clip || clip.locked || e.button !== 0) return;

    e.preventDefault();
    e.stopPropagation();

    dragStartX = e.clientX;
    dragStartValue = clip.outPoint;
    rightActive = true;
    getState().beginEdit("TRIM_CLIP", "Trim clip");

    callbacks.onDragStart();

    window.addEventListener("mousemove", handleTrimRightUpdate);
    window.addEventListener("mouseup", handleTrimRightEnd);
    window.addEventListener("blur", handleTrimRightEnd);
  }

  return {
    handleTrimLeftStart,
    handleTrimRightStart,
    dispose: () => {
      handleTrimLeftEnd();
      handleTrimRightEnd();
    },
  };
}
