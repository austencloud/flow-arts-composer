/**
 * AnimationExportContext
 *
 * Provides animation state and actions to export panel components.
 * Eliminates prop drilling through 5+ component layers.
 *
 * Usage:
 * - Provider: Call setAnimationExportContext() in SequenceDrawer (edit mode)
 * - Consumer: Call getAnimationExportContext() in leaf components
 */

import { getContext, setContext } from "svelte";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { VideoExportProgress } from "#lib/shared/compose/domain/video-export-types.js";
import type {
  PlaybackMode,
  StepPlaybackStepSize,
} from "#lib/shared/animation-engine/state/animation-panel-state.svelte.js";
import type { PropState3D } from "@austencloud/scene-3d";

const CONTEXT_KEY = Symbol("animation-export-context");

/**
 * Animation export state - all readonly from consumer perspective
 */
export interface AnimationExportState {
  // Sequence
  sequenceData: SequenceData | null;
  isCircular: boolean;

  // Playback
  isPlaying: boolean;
  currentStep: number;
  speed: number;
  playbackMode: PlaybackMode;
  stepPlaybackPauseMs: number;
  stepPlaybackStepSize: StepPlaybackStepSize;

  // Visibility
  leftMotionVisible: boolean;
  rightMotionVisible: boolean;
  leftPropState: PropState3D | null;
  rightPropState: PropState3D | null;

  exportLoopCount: number;
  isExporting: boolean;
  exportProgress: VideoExportProgress | null;

  // Services
  servicesReady: boolean;
  loading: boolean;

  // Layout
  isSideBySideLayout: boolean;

  // Format
  selectedFormat: "animation" | "static" | "performance";
}

/**
 * Animation export actions - callbacks for state mutations
 */
export interface AnimationExportActions {
  // Playback
  onPlaybackToggle: () => void;
  onSpeedChange: (speed: number) => void;
  onPlaybackModeChange: (mode: PlaybackMode) => void;
  onStepPlaybackPauseMsChange: (pauseMs: number) => void;
  onStepPlaybackStepSizeChange: (stepSize: StepPlaybackStepSize) => void;

  // Stepping
  onStepHalfBeatForward: () => void;
  onStepHalfBeatBackward: () => void;
  onStepFullBeatForward: () => void;
  onStepFullBeatBackward: () => void;

  // Visibility
  onToggleLeft: () => void;
  onToggleRight: () => void;

  onLoopCountChange: (count: number) => void;
  onExportVideo: () => void;
  onCancelExport: () => void;
  onCanvasReady: (canvas: HTMLCanvasElement | null) => void;

  // Format
  onFormatChange: (format: "animation" | "static" | "performance") => void;
}

/**
 * Combined context interface
 */
export interface AnimationExportContext {
  state: AnimationExportState;
  actions: AnimationExportActions;
}

/**
 * Default no-op actions for when context is not provided
 */
const defaultActions: AnimationExportActions = {
  onPlaybackToggle: () => {},
  onSpeedChange: () => {},
  onPlaybackModeChange: () => {},
  onStepPlaybackPauseMsChange: () => {},
  onStepPlaybackStepSizeChange: () => {},
  onStepHalfBeatForward: () => {},
  onStepHalfBeatBackward: () => {},
  onStepFullBeatForward: () => {},
  onStepFullBeatBackward: () => {},
  onToggleLeft: () => {},
  onToggleRight: () => {},
  onLoopCountChange: () => {},
  onExportVideo: () => {},
  onCancelExport: () => {},
  onCanvasReady: () => {},
  onFormatChange: () => {},
};

/**
 * Default state for when context is not provided
 */
const defaultState: AnimationExportState = {
  sequenceData: null,
  isCircular: false,
  isPlaying: false,
  currentStep: 0,
  speed: 1,
  playbackMode: "continuous",
  stepPlaybackPauseMs: 300,
  stepPlaybackStepSize: 1,
  leftMotionVisible: true,
  rightMotionVisible: true,
  leftPropState: null,
  rightPropState: null,
  exportLoopCount: 1,
  isExporting: false,
  exportProgress: null,
  servicesReady: false,
  loading: false,
  isSideBySideLayout: false,
  selectedFormat: "animation",
};

/**
 * Set the animation export context (call in provider component)
 */
export function setAnimationExportContext(
  context: AnimationExportContext
): void {
  setContext(CONTEXT_KEY, context);
}

/**
 * Get the animation export context (call in consumer components)
 * Returns default values if context not provided (graceful degradation)
 */
export function getAnimationExportContext(): AnimationExportContext {
  const context = getContext<AnimationExportContext | undefined>(CONTEXT_KEY);
  if (!context) {
    return { state: defaultState, actions: defaultActions };
  }
  return context;
}

/**
 * Try to get context, returns null if not available
 * Use when you need to check if context exists
 */
export function tryGetAnimationExportContext(): AnimationExportContext | null {
  return getContext<AnimationExportContext | undefined>(CONTEXT_KEY) ?? null;
}

/**
 * Helper to create context from flat props (for backward compatibility)
 * Use this in SequenceDrawer to convert props to context
 */
export function createAnimationExportContext(props: {
  // State props
  animationSequenceData?: SequenceData | null;
  isCircular?: boolean;
  isAnimationPlaying?: boolean;
  animationCurrentBeat?: number;
  animationSpeed?: number;
  playbackMode?: PlaybackMode;
  stepPlaybackPauseMs?: number;
  stepPlaybackStepSize?: StepPlaybackStepSize;
  leftMotionVisible?: boolean;
  rightMotionVisible?: boolean;
  animationLeftPropState?: PropState3D | null;
  animationRightPropState?: PropState3D | null;
  exportLoopCount?: number;
  isAnimationExporting?: boolean;
  animationExportProgress?: VideoExportProgress | null;
  animationServicesReady?: boolean;
  animationLoading?: boolean;
  isSideBySideLayout?: boolean;
  selectedFormat?: "animation" | "static" | "performance";
  // Action props
  onPlaybackToggle?: () => void;
  onSpeedChange?: (speed: number) => void;
  onPlaybackModeChange?: (mode: PlaybackMode) => void;
  onStepPlaybackPauseMsChange?: (pauseMs: number) => void;
  onStepPlaybackStepSizeChange?: (stepSize: StepPlaybackStepSize) => void;
  onStepHalfBeatForward?: () => void;
  onStepHalfBeatBackward?: () => void;
  onStepFullBeatForward?: () => void;
  onStepFullBeatBackward?: () => void;
  onToggleLeft?: () => void;
  onToggleRight?: () => void;
  onLoopCountChange?: (count: number) => void;
  onExportVideo?: () => void;
  onCancelExport?: () => void;
  onCanvasReady?: (canvas: HTMLCanvasElement | null) => void;
  onFormatChange?: (format: "animation" | "static" | "performance") => void;
}): AnimationExportContext {
  return {
    state: {
      sequenceData: props.animationSequenceData ?? null,
      isCircular: props.isCircular ?? false,
      isPlaying: props.isAnimationPlaying ?? false,
      currentStep: props.animationCurrentBeat ?? 0,
      speed: props.animationSpeed ?? 1,
      playbackMode: props.playbackMode ?? "continuous",
      stepPlaybackPauseMs: props.stepPlaybackPauseMs ?? 300,
      stepPlaybackStepSize: props.stepPlaybackStepSize ?? 1,
      leftMotionVisible: props.leftMotionVisible ?? true,
      rightMotionVisible: props.rightMotionVisible ?? true,
      leftPropState: props.animationLeftPropState ?? null,
      rightPropState: props.animationRightPropState ?? null,
      exportLoopCount: props.exportLoopCount ?? 1,
      isExporting: props.isAnimationExporting ?? false,
      exportProgress: props.animationExportProgress ?? null,
      servicesReady: props.animationServicesReady ?? false,
      loading: props.animationLoading ?? false,
      isSideBySideLayout: props.isSideBySideLayout ?? false,
      selectedFormat: props.selectedFormat ?? "animation",
    },
    actions: {
      onPlaybackToggle: props.onPlaybackToggle ?? (() => {}),
      onSpeedChange: props.onSpeedChange ?? (() => {}),
      onPlaybackModeChange: props.onPlaybackModeChange ?? (() => {}),
      onStepPlaybackPauseMsChange:
        props.onStepPlaybackPauseMsChange ?? (() => {}),
      onStepPlaybackStepSizeChange:
        props.onStepPlaybackStepSizeChange ?? (() => {}),
      onStepHalfBeatForward: props.onStepHalfBeatForward ?? (() => {}),
      onStepHalfBeatBackward: props.onStepHalfBeatBackward ?? (() => {}),
      onStepFullBeatForward: props.onStepFullBeatForward ?? (() => {}),
      onStepFullBeatBackward: props.onStepFullBeatBackward ?? (() => {}),
      onToggleLeft: props.onToggleLeft ?? (() => {}),
      onToggleRight: props.onToggleRight ?? (() => {}),
      onLoopCountChange: props.onLoopCountChange ?? (() => {}),
      onExportVideo: props.onExportVideo ?? (() => {}),
      onCancelExport: props.onCancelExport ?? (() => {}),
      onCanvasReady: props.onCanvasReady ?? (() => {}),
      onFormatChange: props.onFormatChange ?? (() => {}),
    },
  };
}
