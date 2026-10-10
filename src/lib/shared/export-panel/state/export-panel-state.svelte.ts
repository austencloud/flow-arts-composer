/**
 * Export Panel State Management - Unified Panel Architecture
 *
 * Manages state for the unified export panel with Single Media | Composite toggle.
 * All state is reactive using Svelte 5 runes ($state, $derived).
 *
 * State Structure:
 * - mode: 'single' | 'composite' (top-level toggle)
 * - selectedFormat: format selected in Single Media mode
 * - compositeLayout: configuration for Composite mode (orientation + pieces)
 * - settingsPanel: open/closed state + context (which format's settings?)
 * - format-specific settings: animation, static, performance configurations
 *
 * Domain: Export Panel - Unified State Management
 */

import type { ShareMode } from "../domain/models/share-mode";
import type { MediaFormat } from "../domain/models/media-format";
import type { CompositeLayout } from "../domain/models/composite-layout";
import { DEFAULT_COMPOSITE_LAYOUT } from "../domain/models/composite-layout";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";

/** Settings for animation export */
export interface AnimationSettings {
  fps: number;
  loopCount: number;
  showOverlays: boolean;
  preset: string | null;
}

/** Settings for static image export */
export interface StaticSettings {
  width: number;
  height: number;
  quality: number; // 0-100
  background: "transparent" | "white" | "black";

  // Footer overrides (undefined = use persistent defaults)
  showNotes?: boolean;
  customNotesText?: string;
  // Track if user has customized settings for this export
  isUsingCustomFooter?: boolean;
}

/** Settings for performance video */
export interface PerformanceSettings {
  mode: "record" | "upload";
  cameraId: string | null;
  uploadedFile: File | null;
}

/** Context for which format's settings are open */
export interface SettingsContext {
  format: MediaFormat;
  pieceIndex?: 1 | 2; // For Composite mode: which piece?
}

/** Complete export panel state */
export interface ExportPanelState {
  // Sequence data (passed from parent)
  sequence: SequenceData | null;

  // Playback state (for animation preview)
  isPlaying: boolean;
  currentStep: number;

  // Core mode
  mode: ShareMode;

  // Single Media state
  selectedFormat: MediaFormat;

  // Composite state
  compositeLayout: CompositeLayout;

  // Settings panel state
  settingsPanelOpen: boolean;
  settingsContext: SettingsContext | null;

  // Format-specific settings
  animationSettings: AnimationSettings;
  staticSettings: StaticSettings;
  performanceSettings: PerformanceSettings;

  // Methods
  setSequence(sequence: SequenceData | null): void;
}

/** Default animation settings */
const DEFAULT_ANIMATION_SETTINGS: AnimationSettings = {
  fps: 30,
  loopCount: 1,
  showOverlays: true,
  preset: null,
};

/** Default static settings */
const DEFAULT_STATIC_SETTINGS: StaticSettings = {
  width: 1920,
  height: 1080,
  quality: 90,
  background: "transparent",
};

/** Default performance settings */
const DEFAULT_PERFORMANCE_SETTINGS: PerformanceSettings = {
  mode: "record",
  cameraId: null,
  uploadedFile: null,
};

import { getContext, setContext } from "svelte";

// Use Symbol.for to allow access from components that don't import this module directly
const EXPORT_PANEL_STATE_KEY = Symbol.for("ExportPanelState");

/**
 * Internal state holder class.
 * Uses a class to avoid the $state proxy being confused with a Svelte store.
 */
class ExportPanelStateHolder implements ExportPanelState {
  // Sequence data
  sequence: SequenceData | null = $state(null);

  // Playback state
  isPlaying: boolean = $state(false);
  currentStep: number = $state(0);

  // Mode state
  mode: ShareMode = $state("single");
  selectedFormat: MediaFormat = $state("animation");
  compositeLayout: CompositeLayout = $state({ ...DEFAULT_COMPOSITE_LAYOUT });
  settingsPanelOpen: boolean = $state(false);
  settingsContext: SettingsContext | null = $state(null);
  animationSettings: AnimationSettings = $state({
    ...DEFAULT_ANIMATION_SETTINGS,
  });
  staticSettings: StaticSettings = $state({ ...DEFAULT_STATIC_SETTINGS });
  performanceSettings: PerformanceSettings = $state({
    ...DEFAULT_PERFORMANCE_SETTINGS,
  });

  setSequence(sequence: SequenceData | null): void {
    this.sequence = sequence;
    this.currentStep = 0;
    this.isPlaying = false;
  }
}

/**
 * Creates and sets the unified export panel state in context.
 * Call this in the parent component (ExportPanel).
 */
export function createExportPanelState(): ExportPanelState {
  const stateHolder = new ExportPanelStateHolder();
  setContext(EXPORT_PANEL_STATE_KEY, stateHolder);
  return stateHolder;
}

/**
 * Retrieves the export panel state from context.
 * Call this in child components.
 * Throws an error if context is not available (helps debug missing parent).
 */
export function getExportPanelState(): ExportPanelState {
  const state = getContext<ExportPanelState | undefined>(EXPORT_PANEL_STATE_KEY);
  if (!state) {
    throw new Error(
      "ExportPanelState not found in context. Ensure ExportPanel is a parent component."
    );
  }
  return state;
}
