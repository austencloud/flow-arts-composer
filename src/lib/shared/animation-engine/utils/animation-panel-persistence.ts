/**
 * animation-panel-persistence.ts
 *
 * LocalStorage persistence utilities for AnimationPanel state.
 * Handles saving/loading trail settings and collapse states.
 */

import { browser } from "$app/env";
import {
  type TrailSettings,
  DEFAULT_TRAIL_SETTINGS,
  TRAIL_SETTINGS_STORAGE_KEY,
  TrackingMode,
} from "#lib/shared/animation-engine/domain/types/trail-types.js";

const COLLAPSE_STATE_KEY = "tka_animation_collapse_states";


/**
 * Load trail settings from localStorage
 * Applies the canonical tapered, exponential-fade trail presentation.
 */
export function loadTrailSettings(): TrailSettings {
  if (!browser) return { ...DEFAULT_TRAIL_SETTINGS };
  try {
    const stored = localStorage.getItem(TRAIL_SETTINGS_STORAGE_KEY);
    if (!stored) return { ...DEFAULT_TRAIL_SETTINGS };
    const parsed = JSON.parse(stored);

    // Migration: convert old trackBothEnds boolean to new trackingMode enum
    if ("trackBothEnds" in parsed && !("trackingMode" in parsed)) {
      parsed.trackingMode = parsed.trackBothEnds
        ? TrackingMode.BOTH_ENDS
        : TrackingMode.RIGHT_END;
      delete parsed.trackBothEnds;
    }

    // Migration: Add previewMode if not present (defaults to false = normal trail mode)
    if (!("previewMode" in parsed)) {
      parsed.previewMode = false;
    }

    // Merge with defaults, then align legacy persisted surfaces with the
    // canonical presentation. Tracking and tail-length choices stay personal.
    // The rendering now always uses exponential fade and tapered width (hardcoded)
    const result = { ...DEFAULT_TRAIL_SETTINGS, ...parsed };

    result.mode = DEFAULT_TRAIL_SETTINGS.mode;
    result.effect = DEFAULT_TRAIL_SETTINGS.effect;
    result.lineWidth = DEFAULT_TRAIL_SETTINGS.lineWidth;
    result.maxOpacity = DEFAULT_TRAIL_SETTINGS.maxOpacity;
    result.minOpacity = DEFAULT_TRAIL_SETTINGS.minOpacity;
    result.glowBlur = DEFAULT_TRAIL_SETTINGS.glowBlur;
    result.fadeDurationMs = DEFAULT_TRAIL_SETTINGS.fadeDurationMs;

    return result;
  } catch (error) {
    console.error("❌ Failed to load trail settings:", error);
    return { ...DEFAULT_TRAIL_SETTINGS };
  }
}

/**
 * Save trail settings to localStorage
 */
export function saveTrailSettings(settings: TrailSettings): void {
  if (!browser) return;
  try {
    localStorage.setItem(TRAIL_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch (error) {
    console.error("❌ Failed to save trail settings:", error);
  }
}


export interface CollapseStates {
  playback: boolean;
  trail: boolean;
}

/**
 * Load collapse states from localStorage
 */
export function loadCollapseStates(): CollapseStates {
  if (!browser) return { playback: false, trail: false };
  try {
    const stored = localStorage.getItem(COLLAPSE_STATE_KEY);
    if (!stored) return { playback: false, trail: false };
    return JSON.parse(stored);
  } catch (error) {
    console.error("❌ Failed to load collapse states:", error);
    return { playback: false, trail: false };
  }
}

/**
 * Save collapse states to localStorage
 */
export function saveCollapseStates(playback: boolean, trail: boolean): void {
  if (!browser) return;
  try {
    localStorage.setItem(
      COLLAPSE_STATE_KEY,
      JSON.stringify({ playback, trail })
    );
  } catch (error) {
    console.error("❌ Failed to save collapse states:", error);
  }
}
