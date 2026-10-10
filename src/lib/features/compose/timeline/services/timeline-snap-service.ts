/**
 * TimelineSnapService
 *
 * Service for managing timeline snapping during clip operations.
 * Provides snap calculations for steps, clip edges, grid, and playhead.
 */

import type { SnapResult, SnapPoint, SnapType } from "#lib/shared/animation-engine/timeline/domain/types.js";
import type { TimeSeconds } from "#lib/shared/animation-engine/domain/timeline-types.js";
import {
  snapTimeValue,
  calculateSnapPoints,
  DEFAULT_SNAP_THRESHOLD,
  type SnapContext,
} from "./snap-service";
import { getTimelineState } from "#lib/shared/animation-engine/state/timeline-state.svelte.js";

export class TimelineSnapper {
  private _activeSnapResult: SnapResult | null = null;
  private _draggingClipIds: string[] = [];

  constructor() {}

  // State Getters

  get activeSnapResult(): SnapResult | null {
    return this._activeSnapResult;
  }

  get activeSnapTime(): TimeSeconds | null {
    return this._activeSnapResult?.time ?? null;
  }

  get activeSnapType(): SnapType | null {
    return this._activeSnapResult?.snapType ?? null;
  }

  get isSnapping(): boolean {
    return this._activeSnapResult?.didSnap ?? false;
  }

  get draggingClipIds(): string[] {
    return this._draggingClipIds;
  }

  get isSnapEnabled(): boolean {
    return getTimelineState().project.snap.enabled;
  }

  // Snap Calculations

  snapTime(time: TimeSeconds, excludeClipIds: string[] = []): TimeSeconds {
    const context = this.buildContext(excludeClipIds);
    const result = snapTimeValue(time, context, DEFAULT_SNAP_THRESHOLD);

    this._activeSnapResult = result.didSnap ? result : null;
    return result.time;
  }

  previewSnap(time: TimeSeconds, excludeClipIds: string[] = []): SnapResult {
    const context = this.buildContext(excludeClipIds);
    const result = snapTimeValue(time, context, DEFAULT_SNAP_THRESHOLD);

    this._activeSnapResult = result.didSnap ? result : null;
    return result;
  }

  getSnapPoints(excludeClipIds: string[] = []): SnapPoint[] {
    const context = this.buildContext(excludeClipIds);
    return calculateSnapPoints(context);
  }

  // Drag State Management

  startDrag(clipIds: string[]): void {
    this._draggingClipIds = clipIds;
    this._activeSnapResult = null;
  }

  endDrag(): void {
    this._draggingClipIds = [];
    this._activeSnapResult = null;
  }

  clearActiveSnap(): void {
    this._activeSnapResult = null;
  }

  // Settings

  toggleSnap(): void {
    const state = getTimelineState();
    state.updateSnapSettings({ enabled: !state.project.snap.enabled });
  }

  // Private Methods

  private buildContext(excludeClipIds: string[] = []): SnapContext {
    const state = getTimelineState();
    return {
      clips: state.allClips,
      excludeClipIds,
      audioBpm: state.project.audio.bpm,
      audioDuration: state.project.audio.duration,
      playheadPosition: state.playhead.position,
      settings: state.project.snap,
    };
  }
}

// Singleton Instance

let serviceInstance: TimelineSnapper | null = null;

/**
 * Get the singleton snap service instance
 */
export function getTimelineSnapper(): TimelineSnapper {
  if (!serviceInstance) {
    serviceInstance = new TimelineSnapper();
  }
  return serviceInstance;
}
