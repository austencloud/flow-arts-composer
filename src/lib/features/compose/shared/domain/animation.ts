/**
 * Animation Domain Model
 *
 * Defines the structure for saveable animation configurations.
 * Animations are a new entity type that combines sequences with trail settings,
 * canvas configurations, and playback settings.
 */

import type { AnimationMode } from "./animation-mode";
import type { TrailSettings } from "#lib/shared/animation-engine/domain/types/trail-types.js";
import { TrailMode } from "#lib/shared/animation-engine/domain/types/trail-types.js";

/**
 * Animation Entity
 *
 * A complete animation configuration that can be saved, loaded, and shared.
 * Contains all settings needed to recreate an animation setup.
 */
export interface Animation {
  // Core metadata
  readonly id: string;
  readonly name: string;
  readonly creatorId: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  // Animation configuration
  readonly mode: AnimationMode;
  readonly sequences: AnimationSequenceSlot[];
  readonly canvasSettings: CanvasSettings[];
  readonly globalSettings: GlobalAnimationSettings;

  // Optional metadata
  readonly thumbnail?: string;
  readonly tags?: readonly string[];
  readonly isPublic: boolean;
}

/**
 * Animation Sequence Slot
 *
 * Represents a sequence in an animation with its specific settings.
 * For single mode: 1 slot
 * For tunnel/mirror/grid: Multiple slots
 * For side-by-side: 2 slots
 */
export interface AnimationSequenceSlot {
  readonly slotId: string; // Unique identifier for this slot (e.g., "slot-0", "slot-1")
  readonly sequenceId: string; // Reference to the SequenceData
  readonly trailSettings?: TrailSettings; // Sequence-specific trail overrides
  readonly transformations?: SequenceTransformations; // Visual transformations applied
}

/**
 * Sequence Transformations
 *
 * Visual transformations that can be applied to a sequence in the animation.
 */
export interface SequenceTransformations {
  readonly scale?: number; // Scale factor (default: 1.0)
  readonly rotation?: number; // Rotation in degrees (default: 0)
  readonly offsetX?: number; // Horizontal offset in pixels (default: 0)
  readonly offsetY?: number; // Vertical offset in pixels (default: 0)
  readonly opacity?: number; // Opacity (0-1, default: 1.0)
}

/**
 * Canvas Settings
 *
 * Settings specific to a canvas in the animation.
 * In single/tunnel/mirror mode: 1 canvas
 * In grid mode: Multiple canvases
 * In side-by-side mode: 2 canvases
 */
export interface CanvasSettings {
  readonly canvasId: string; // Unique identifier for this canvas (e.g., "canvas-0", "canvas-1")
  readonly trailMode: TrailMode; // Trail rendering mode for this canvas
  readonly trailPreset?: string; // Name of the trail preset (if using a preset)
  readonly customTrailSettings?: TrailSettings; // Custom trail settings (overrides preset)
}

/**
 * Global Animation Settings
 *
 * Settings that apply to the entire animation across all canvases/sequences.
 */
export interface GlobalAnimationSettings {
  readonly bpm: number; // Beats per minute (default: 120)
  readonly loop: boolean; // Whether the animation loops (default: true)
}

/**
 * Default values for new animations
 */
export const DEFAULT_GLOBAL_ANIMATION_SETTINGS: GlobalAnimationSettings = {
  bpm: 120,
  loop: true,
};

/**
 * Create a new Animation entity with default values
 */
export function createAnimation(
  data: Partial<Animation> & {
    creatorId: string;
    name: string;
    mode: AnimationMode;
  }
): Animation {
  const now = new Date();

  return {
    id: data.id ?? crypto.randomUUID(),
    name: data.name,
    creatorId: data.creatorId,
    createdAt: data.createdAt ?? now,
    updatedAt: data.updatedAt ?? now,
    mode: data.mode,
    sequences: data.sequences ?? [],
    canvasSettings: data.canvasSettings ?? [],
    globalSettings: data.globalSettings ?? DEFAULT_GLOBAL_ANIMATION_SETTINGS,
    thumbnail: data.thumbnail,
    tags: data.tags ?? [],
    isPublic: data.isPublic ?? false,
  };
}

export function updateAnimation(
  animation: Animation,
  updates: Partial<Omit<Animation, "id" | "creatorId" | "createdAt">>
): Animation {
  return {
    ...animation,
    ...updates,
    updatedAt: new Date(),
  };
}

/**
 * Create a default sequence slot
 */
export function createAnimationSequenceSlot(
  sequenceId: string,
  slotId?: string
): AnimationSequenceSlot {
  return {
    slotId: slotId ?? crypto.randomUUID(),
    sequenceId,
  };
}

export function createCanvasSettings(
  canvasId?: string,
  trailMode: TrailMode = TrailMode.FADE
): CanvasSettings {
  return {
    canvasId: canvasId ?? crypto.randomUUID(),
    trailMode,
  };
}
