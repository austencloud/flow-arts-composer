/**
 * createClipMove - Composable for clip move (reposition) drag behavior
 *
 * Returns event handlers for dragging a clip to a new timeline position.
 * Supports cross-track dragging to move clips between tracks.
 * Uses TimelineSnapService for proper snapping behavior.
 */

import type { TimelineClip } from "#lib/shared/animation-engine/domain/timeline-types.js";
import { pixelsToTime } from "#lib/shared/animation-engine/domain/timeline-types.js";
import { getTimelineState } from "#lib/shared/animation-engine/state/timeline-state.svelte.js";
import { getTimelineSnapper } from "../../services/timeline-snap-service";

export interface ClipMoveHandlers {
  handleMoveStart: (e: MouseEvent) => void;
  dispose: () => void;
}

export interface ClipMoveCallbacks {
  onDragStart: () => void;
  onDragEnd: () => void;
  /** Called during drag with target track ID (for visual feedback) */
  onTrackChange?: (targetTrackId: string | null) => void;
}

export function createClipMove(
  getClip: () => TimelineClip | null,
  getPixelsPerSecond: () => number,
  callbacks: ClipMoveCallbacks
): ClipMoveHandlers {
  let dragStartX = 0;
  let dragStartValue = 0;
  let currentTargetTrackId: string | null = null;
  let dragClipId: string | null = null; // Store clip ID for lookup during drag

  function getState() {
    return getTimelineState();
  }

  function getSnapService() {
    return getTimelineSnapper();
  }

  /** Get clip by ID from state (survives component remount) */
  function getClipById(id: string): TimelineClip | undefined {
    return getState().allClips.find((c) => c.id === id);
  }

  /**
   * Get the track at a given Y position relative to the tracks container
   * Returns the track ID or null if outside track bounds
   */
  function getTrackAtY(clientY: number): string | null {
    const state = getState();
    const tracks = state.project.tracks;

    // Find the tracks container element
    const tracksContainer = document.querySelector(".tracks-scroll-content");
    if (!tracksContainer) return null;

    const containerRect = tracksContainer.getBoundingClientRect();
    const relativeY =
      clientY -
      containerRect.top +
      (tracksContainer.parentElement?.scrollTop ?? 0);

    // Calculate cumulative heights to find which track
    let cumulativeHeight = 0;
    for (const track of tracks) {
      const trackHeight = track.height;
      if (
        relativeY >= cumulativeHeight &&
        relativeY < cumulativeHeight + trackHeight
      ) {
        return track.id;
      }
      cumulativeHeight += trackHeight;
    }

    // If below all tracks, return the last track
    if (tracks.length > 0 && relativeY >= cumulativeHeight) {
      return tracks[tracks.length - 1]?.id ?? null;
    }

    return null;
  }

  function handleMoveUpdate(e: MouseEvent) {
    if (!dragClipId) return;

    // Get current clip state by ID (survives component remount during cross-track drag)
    const clip = getClipById(dragClipId);
    if (!clip) return;

    // Horizontal movement - calculate proposed position
    const deltaX = e.clientX - dragStartX;
    const deltaTime = pixelsToTime(deltaX, getPixelsPerSecond());
    const proposedTime = Math.max(0, dragStartValue + deltaTime);

    // Apply snap using the snap service
    const snapService = getSnapService();
    const snapResult = snapService.previewSnap(proposedTime, [dragClipId]);
    const snappedTime = snapResult.time;

    // Vertical movement - detect target track
    const targetTrackId = getTrackAtY(e.clientY);

    // Track changed - notify for visual feedback
    if (targetTrackId !== currentTargetTrackId) {
      currentTargetTrackId = targetTrackId;
      callbacks.onTrackChange?.(targetTrackId);
    }

    // Move clip to snapped position (and track if different) - live update!
    // Use skipSnap since we already applied snap via the snap service
    if (targetTrackId && targetTrackId !== clip.trackId) {
      // Moving to a different track - include track ID
      getState().moveClip(dragClipId, snappedTime, targetTrackId, {
        skipSnap: true,
      });
    } else {
      // Same track - just update position
      getState().moveClip(dragClipId, snappedTime, undefined, {
        skipSnap: true,
      });
    }
  }

  function handleMoveEnd() {
    if (!dragClipId) return;
    getState().endEdit();
    // Clean up snap service state
    getSnapService().endDrag();

    // All movement already happened during drag - just clean up
    dragClipId = null;
    currentTargetTrackId = null;
    callbacks.onDragEnd();
    window.removeEventListener("mousemove", handleMoveUpdate);
    window.removeEventListener("mouseup", handleMoveEnd);
    window.removeEventListener("blur", handleMoveEnd);
  }

  function handleMoveStart(e: MouseEvent) {
    const clip = getClip();
    if (!clip || clip.locked || e.button !== 0) return;

    e.preventDefault();
    e.stopPropagation();

    // Store clip ID for lookup during drag (survives component remount)
    dragClipId = clip.id;
    dragStartX = e.clientX;
    dragStartValue = clip.startTime;
    currentTargetTrackId = null;

    // Initialize snap service for this drag operation
    getSnapService().startDrag([clip.id]);
    getState().beginEdit("MOVE_CLIP", "Move clip");

    callbacks.onDragStart();
    getState().selectClip(clip.id);

    window.addEventListener("mousemove", handleMoveUpdate);
    window.addEventListener("mouseup", handleMoveEnd);
    window.addEventListener("blur", handleMoveEnd);
  }

  return { handleMoveStart, dispose: handleMoveEnd };
}
