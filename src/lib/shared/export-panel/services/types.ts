/**
 * ExportOrchestrator
 *
 * Contract for orchestrating exports from the export panel.
 * Handles static, animation, and performance exports with progress tracking.
 *
 * Domain: Export Panel - Export Orchestration
 */

import type { AnimationPlaybackController } from '#lib/shared/animation-engine/services/animation-playback-controller.js';
import type { AnimationPanelState } from "#lib/shared/animation-engine/state/animation-panel-state.svelte.js";

/** Result of an export operation */
export interface ExportResult {
  success: boolean;
  canceled?: boolean;
  error?: string;
}

/** Dependencies needed for animation export */
export interface AnimationExportDependencies {
  canvas: HTMLCanvasElement;
  playbackController: AnimationPlaybackController;
  animationState: AnimationPanelState;
}

/**
 * ExportUrlManager
 *
 * Contract for managing URL state synchronization for the export panel.
 * Handles deep linking, history management, and state restoration for animation exports.
 *
 * Domain: Export Panel - URL State Management
 */

import type { AnimationPanelState as URLAnimationState } from '#lib/shared/navigation/services/types.js';

/**
 * Animation state that can be persisted to/restored from URL
 */
export interface ExportAnimationUrlState {
  sequenceId?: string;
  speed?: number;
  isPlaying?: boolean;
  currentStep?: number;
}

/**
 * Callbacks for URL-driven state changes
 */
export interface ExportUrlCallbacks {
  /** Called when URL indicates animation panel should open */
  onAnimationPanelOpen: () => void;
  /** Called with restored state from URL (on initial load or back navigation) */
  onStateRestore: (state: URLAnimationState) => void;
}
