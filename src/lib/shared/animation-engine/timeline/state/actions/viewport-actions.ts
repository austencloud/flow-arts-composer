/**
 * Viewport Actions
 *
 * Extracted viewport/zoom mutations.
 * Uses callback injection to preserve Svelte 5 reactivity.
 */

import type { ViewportState, TimeSeconds } from "#lib/shared/animation-engine/domain/timeline-types.js";
import { saveToStorage, TIMELINE_STORAGE_KEYS } from "#lib/shared/animation-engine/timeline/state/timeline-storage.js";

export interface ViewportContext {
  getViewport: () => ViewportState;
  setViewport: (v: ViewportState) => void;
  getTotalDuration: () => number;
  getPlayheadPosition: () => TimeSeconds;
}

export function createViewportActions(ctx: ViewportContext) {
  const { getViewport, setViewport, getTotalDuration, getPlayheadPosition } =
    ctx;

  function setZoom(pixelsPerSecond: number) {
    const viewport = {
      ...getViewport(),
      pixelsPerSecond: Math.max(10, Math.min(500, pixelsPerSecond)),
    };
    setViewport(viewport);
    saveToStorage(TIMELINE_STORAGE_KEYS.VIEWPORT, viewport);
  }

  function zoomIn() {
    setZoom(getViewport().pixelsPerSecond * 1.5);
  }

  function zoomOut() {
    setZoom(getViewport().pixelsPerSecond / 1.5);
  }

  function zoomToFit() {
    const targetWidth = 1000; // placeholder - should be passed in
    const newZoom = targetWidth / getTotalDuration();
    setZoom(newZoom);
  }

  function setScrollX(scrollX: TimeSeconds) {
    setViewport({ ...getViewport(), scrollX: Math.max(0, scrollX) });
  }

  function setScrollY(scrollY: number) {
    setViewport({ ...getViewport(), scrollY: Math.max(0, scrollY) });
  }

  function scrollToPlayhead() {
    const viewport = getViewport();
    const viewportWidth = viewport.visibleEnd - viewport.visibleStart;
    setScrollX(getPlayheadPosition() - viewportWidth / 2);
  }

  return {
    setZoom,
    zoomIn,
    zoomOut,
    zoomToFit,
    setScrollX,
    setScrollY,
    scrollToPlayhead,
  };
}
