/**
 * Animation Render Loop Interface
 *
 * Manages the requestAnimationFrame render loop for AnimatorCanvas.
 * Handles RAF scheduling, trail point gathering, and scene rendering.
 */

import type { IAnimationRenderer } from "$lib/shared/animation-engine/services/IAnimationRenderer";
import type {
  ITrailCapturer,
  AdditionalLayerProps,
} from "$lib/shared/animation-engine/services/ITrailCapturer";
import type { TrailSettings } from "../domain/types/trail-types";
import type { PropState } from "$lib/shared/foundation/domain/types/prop-state";
import type { AnimationPathCache } from "$lib/shared/animation-engine/services/animation-path-cache";
import type { FrameBudgetMonitor } from "$lib/shared/animation-engine/services/frame-budget-monitor";
import type { FireTipTracker } from "./fire-tip-tracker";
import type {
  FireOverlayConfig,
  PropFlameColor,
} from "../domain/types/fire-types";
import type { LedSampler } from "./led-sampler";
import type { LedOverlayConfig } from "../domain/types/led-types";
import type {
  Bloom2DParams,
  Bubbles2DParams,
  Ghost2DParams,
  Frost2DParams,
  Ink2DParams,
  Petals2DParams,
  Pulse2DParams,
  Silk2DParams,
  Animal2DParams,
  Smoke2DParams,
  Sparkles2DParams,
  GooParams,
  Zap2DParams,
} from "$lib/shared/effects/translators/canvas2d-types";
import type { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import type { Letter } from "$lib/shared/foundation/domain/models/letter";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import type { StartPositionData } from "$lib/shared/foundation/domain/models/start-position-data";
import type {
  EffectType,
  TipEffectMap,
} from "../domain/types/tip-effect-types";
import type { EffectRendererLike } from "./effects/effect-renderer";
import type { MandalaOverlayCanvas } from "$lib/shared/mandala/services/mandala-overlay-canvas";
import type { TunnelPropColorPair } from "$lib/shared/sequence-viewer/tunnel/tunnel-prop-colors";
import type { RenderActivityGate } from "$lib/shared/render-gating/render-activity-gate";
import type {
  MandalaPathOptions,
  StepLike,
} from "$lib/shared/mandala/services/types";

/**
 * Configuration for render loop initialization
 */
export interface RenderLoopConfig {
  renderer: IAnimationRenderer;
  TrailCapturer: ITrailCapturer | null;
  pathCache: AnimationPathCache | null;
  canvasSize: number;
  frameBudgetMonitor?: FrameBudgetMonitor | null;
  /** Optional fire/charcoal tip position/velocity tracker (shared by both) */
  fireTipTracker?: FireTipTracker | null;
  /** Optional LED tip position/color tracker */
  ledSampler?: LedSampler | null;
  /**
   * Registry-driven renderer map. Every effect renderer (fire, charcoal, led,
   * trails, zap, sparkles, …) lives here, keyed by EffectType id.
   * Replaces the 15 hand-typed xRenderer? fields from P2.3 and earlier.
   * null values signal removal (the render loop deletes the entry from its Map).
   */
  renderers?: Partial<Record<EffectType, EffectRendererLike | null>>;
  /** Bottom-layer mandala guide. Created lazily when its visibility toggle is on. */
  mandalaOverlay?: MandalaOverlayCanvas | null;
  /** Called when an effect (fire/charcoal/LED) fails repeatedly and is auto-disabled */
  onEffectError?: (effectName: string, error: Error) => void;
}

/**
 * Prop dimensions for rendering
 */
export interface PropDimensions {
  width: number;
  height: number;
}

/**
 * Visibility settings for render
 */
export interface RenderVisibilitySettings {
  gridVisible: boolean;
  propsVisible: boolean;
  trailsVisible: boolean;
  leftMotionVisible: boolean;
  rightMotionVisible: boolean;
}

/**
 * Props state for rendering
 */
export interface RenderPropsState {
  leftProp: PropState | null;
  rightProp: PropState | null;
  /** Additional tunnel layers (index 0 = layer 1, up to 3) */
  additionalLayers: AdditionalLayerProps[];
  leftPropDimensions: PropDimensions;
  rightPropDimensions: PropDimensions;
  /** Tunnel rainbow spectrum. When false, overlaid layers inherit the base
   *  blue/red colors instead of a per-layer spectrum hue. Default true. */
  tunnelSpectrum: boolean;
  tunnelPropColors?: TunnelPropColorPair | null;
  /** Spotlight: the selected performer (0 = base "you", k = copy arm k), or null.
   *  When set, every other family dims. Default null (no spotlight). */
  tunnelSelectedLayer?: number | readonly number[] | null;
}

/**
 * Parameters for a single render frame
 */
export interface RenderFrameParams {
  stepData: StartPositionData | StepData | null;
  currentStep: number;
  trailSettings: TrailSettings;
  gridVisible: boolean;
  gridOpacity?: number;
  gridMode: GridMode | null;
  letter: Letter | null;
  props: RenderPropsState;
  visibility: RenderVisibilitySettings;
  /** Whether animation playback is active (controls render loop continuation) */
  isPlaying: boolean;
  /** Prop flip settings (for asymmetric props like Buugeng) */
  leftPropFlipped?: boolean;
  rightPropFlipped?: boolean;
  /** Prop types - used for prop-specific rendering rules (e.g., hands never rotate) */
  leftPropType?: string;
  rightPropType?: string;
  /** Fire overlay configuration (null or undefined = disabled) */
  fireConfig?: FireOverlayConfig | null;
  /** Whether dark mode is active (used by fire renderer for intensity boost) */
  darkMode?: boolean;
  /** Prop colors for colored flames, indexed by tip.propIndex.
   *  [0]=base blue, [1]=base red; extra entries are tunnel-layer colors
   *  (blue 2+2*li / red 3+2*li) when overlaid layers are present. */
  propColors?: PropFlameColor[];
  /** LED overlay configuration (null or undefined = disabled) */
  ledConfig?: LedOverlayConfig | null;
  /** Zap (lightning) overlay parameters (null or undefined = disabled) */
  zapConfig?: Zap2DParams | null;
  /** Sparkles overlay parameters (null or undefined = disabled) */
  sparklesConfig?: Sparkles2DParams | null;
  /** Ghost overlay parameters (null or undefined = disabled) */
  ghostConfig?: Ghost2DParams | null;
  /** Bloom overlay parameters (null or undefined = disabled) */
  bloomConfig?: Bloom2DParams | null;
  /** Goo overlay parameters (null or undefined = disabled) */
  gooConfig?: GooParams | null;
  /** Bubbles overlay parameters (null or undefined = disabled) */
  bubblesConfig?: Bubbles2DParams | null;
  /** Petals overlay parameters (null or undefined = disabled) */
  petalsConfig?: Petals2DParams | null;
  /** Smoke overlay parameters (null or undefined = disabled) */
  smokeConfig?: Smoke2DParams | null;
  /** Ink overlay parameters (null or undefined = disabled) */
  inkConfig?: Ink2DParams | null;
  /** Frost overlay parameters (null or undefined = disabled) */
  frostConfig?: Frost2DParams | null;
  /** Silk overlay parameters (null or undefined = disabled) */
  silkConfig?: Silk2DParams | null;
  /** Animal overlay parameters (null or undefined = disabled) */
  animalConfig?: Animal2DParams | null;
  /** Pulse overlay parameters (null or undefined = disabled) */
  pulseConfig?: Pulse2DParams | null;
  /** Playback speed multiplier (1.0 = 60 BPM). Passed to fire for cache invalidation. */
  playbackSpeed?: number;
  /** Whether sequence loops seamlessly (end position = start position).
   *  When true, trail rendering wraps around the loop boundary instead of resetting. */
  isSeamlesslyLoopable?: boolean;
  /** Changes when the sequence content changes. Invalidates fire cache. */
  sequenceContentHash?: string;
  /** Per-tip effect assignments (global level). Used to filter tips by effect type. */
  tipEffectMap?: TipEffectMap;
  /** When true, skip fire/charcoal/LED/trail overlay rendering (3D mode handles effects) */
  suppress2DOverlays?: boolean;
  /** Virtual time for this frame (in ms). Used during video export to ensure
   * deterministic trail capture and effect timing regardless of real-time
   * rendering performance. When provided, replaces performance.now(). */
  virtualTime?: number;
  /**
   * True while a prop-type hot-swap's texture reload is still in flight
   * (PropTypeManager.trailsSuppressedUntilTextureLoad). Combined with the
   * renderer's per-color crossfade-in-progress accessors in
   * AnimationRenderLoop to suppress the trail overlay's tip capture for the
   * WHOLE mismatched-geometry window — async load AND the crossfade after
   * it — not just the load half. Raw boolean (not baked into trailSettings.mode)
   * because trailSettings.mode is also user-selectable (Off), which is a
   * different, unrelated "no trails at all" state that must not be conflated
   * with this transient per-swap suppression.
   */
  trailsSuppressedUntilTextureLoad?: boolean;
  /** Whether the engine-aligned mandala guide is enabled for this canvas. */
  mandalaVisible?: boolean;
  /** Sequence motions used to prepare the complete prop-tip guide paths. */
  mandalaSteps?: readonly StepLike[] | null;
  /** Path-shape policy shared with live trail interpolation. */
  mandalaPathOptions?: MandalaPathOptions;
  /** Hand identity shared by props and guides; independent of effect styling. */
  primaryPropColors?: { left: string; right: string } | null;
}

/**
 * Service for managing the animation render loop
 */
export interface IAnimationRenderLoop {
  /**
   * Initialize the render loop with required dependencies
   */
  initialize(config: RenderLoopConfig): void;

  /**
   * Update configuration (e.g., canvas resized, path cache changed)
   */
  updateConfig(config: Partial<RenderLoopConfig>): void;

  /**
   * Start the render loop
   * @param getFrameParams - Callback to get current frame parameters
   */
  start(getFrameParams: () => RenderFrameParams): void;

  /**
   * Stop the render loop
   */
  stop(): void;

  /**
   * Check if the loop is currently running
   */
  isRunning(): boolean;

  /**
   * Trigger a single render frame
   * @param params - Frame parameters
   */
  renderFrame(params: RenderFrameParams): void;

  /**
   * Mark that a render is needed and ensure loop is running
   * @param getFrameParams - Callback to get current frame parameters
   */
  triggerRender(getFrameParams: () => RenderFrameParams): void;

  /**
   * Put the loop under external (deterministic) control. When true, the
   * free-running rAF loop is disabled: start()/triggerRender() and the
   * self-reschedule become no-ops, so effect keep-warm/prewarm paths can't
   * restart it. renderSync() still renders (it bypasses rAF). Used by the
   * offscreen export engine so the loop never races the deterministic driver.
   * @param value - true to disable the rAF loop, false to re-enable
   */
  setExternallyDriven(value: boolean): void;

  /**
   * Route this loop through the canonical off-screen / hidden-tab gate
   * (`shared/render-gating/render-activity-gate.ts`). While the gate is closed
   * the rAF stops entirely and the canvas holds its last painted frame; when it
   * reopens the frame clock is re-seeded and the loop resumes. Pass null to
   * un-gate. An externally driven loop ignores the gate.
   */
  setActivityGate(gate: RenderActivityGate | null): void;

  /** Render ONE frame synchronously, now, with an explicit sim dt (seconds).
   *  Bypasses rAF/needsRender scheduling — used by the offscreen export path so
   *  rendering is deterministic. The free-running loop is never started. */
  renderSync(
    params: RenderFrameParams,
    timeMs: number,
    dtSeconds: number
  ): void;

  /**
   * Set a target FPS for preview throttling.
   * null = no throttling (render at native refresh rate).
   * When set, frames are skipped to approximate the target rate.
   */
  setTargetFps(fps: number | null): void;

  /**
   * Snapshot of render loop state for diagnostic reports.
   */
  getDiagnostics(): Record<string, unknown>;

  /**
   * Clean up resources
   */
  dispose(): void;
}
