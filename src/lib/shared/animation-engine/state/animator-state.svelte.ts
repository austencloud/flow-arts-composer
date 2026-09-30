/**
 * Animator State
 *
 * Per-instance reactive state for a single animator canvas — the single
 * source of truth the engine + its SRP managers read and write. Replaces the
 * engine's internal `$state` object and the per-tick `syncServiceState`
 * mirroring (the Svelte-5 anti-pattern that previously forced a synchronizer).
 *
 * Factory + getter/setter shape matches the codebase convention
 * (see shared-animation-state.svelte.ts). Primitive setters assign directly —
 * Svelte 5 `$state` already skips reactivity on `===`-equal writes, so manual
 * no-op guards are redundant there. Object fields keep a value guard so a
 * new-but-equal reference doesn't retrigger downstream effects every tick.
 */

import type { AnimationVisibilityState } from "../services/animation-visibility-synchronizer";
import type { PreRenderProgress } from "../services/sequence-frame-pre-renderer";
import type { Letter } from "$lib/shared/foundation/domain/models/letter";
import type { TrailSettings } from "../domain/types/trail-types";
import { loadTrailSettings } from "../utils/animation-panel-persistence";
import {
  DEFAULT_PROP_DIMENSIONS,
  type PropDimensions,
} from "../services/IPropTextureLoader";
import type { EffectType, TipEffectMap } from "../domain/types/tip-effect-types";

export interface AnimatorState {
  readonly isInitialized: boolean;
  readonly rendererLoading: boolean;
  readonly rendererError: string | null;
  readonly servicesReady: boolean;
  readonly visibilityState: AnimationVisibilityState;
  readonly isPreRendering: boolean;
  readonly preRenderProgress: PreRenderProgress | null;
  readonly preRenderedFramesReady: boolean;
  readonly displayedLetter: Letter | null;
  readonly displayedStepNumber: number | null;
  readonly displayedMusicalPosition: string | null;
  readonly fadingOutLetter: Letter | null;
  readonly fadingOutStepNumber: number | null;
  readonly isNewLetter: boolean;
  readonly trailSettings: TrailSettings;
  readonly leftPropDimensions: PropDimensions;
  readonly rightPropDimensions: PropDimensions;
  readonly currentLeftPropType: string;
  readonly currentRightPropType: string;
  readonly currentPropType: string;
  readonly suppress2DOverlays: boolean;
  readonly leftMotionVisible: boolean;
  readonly rightMotionVisible: boolean;

  setInitialized(v: boolean): void;
  setRendererLoading(v: boolean): void;
  setRendererError(v: string | null): void;
  setServicesReady(v: boolean): void;
  setVisibilityState(v: AnimationVisibilityState): void;
  setPreRendering(v: boolean): void;
  setPreRenderProgress(v: PreRenderProgress | null): void;
  setPreRenderedFramesReady(v: boolean): void;
  setGlyphState(v: {
    displayedLetter: Letter | null;
    displayedStepNumber: number | null;
    displayedMusicalPosition: string | null;
    fadingOutLetter: Letter | null;
    fadingOutStepNumber: number | null;
    isNewLetter: boolean;
  }): void;
  setTrailSettings(v: TrailSettings): void;
  setLeftPropDimensions(v: PropDimensions): void;
  setRightPropDimensions(v: PropDimensions): void;
  setLeftPropType(v: string): void;
  setRightPropType(v: string): void;
  setLegacyPropType(v: string): void;
  setSuppress2DOverlays(v: boolean): void;
  setMotionVisibility(left: boolean, right: boolean): void;
}

export function createAnimatorState(): AnimatorState {
  const state = $state({
    isInitialized: false,
    rendererLoading: false,
    rendererError: null as string | null,
    servicesReady: false,
    visibilityState: {
      grid: true,
      stepNumbers: true,
      props: true,
      trails: true,
      tkaGlyph: true,
      elementalGlyph: false,
      darkMode: false,
      wordHeader: true,
      mandala: true,
      activeEffect: "trails" as EffectType,
      tipEffectMap: {} as TipEffectMap,
    } as AnimationVisibilityState,
    isPreRendering: false,
    preRenderProgress: null as PreRenderProgress | null,
    preRenderedFramesReady: false,
    displayedLetter: null as Letter | null,
    displayedStepNumber: null as number | null,
    displayedMusicalPosition: null as string | null,
    fadingOutLetter: null as Letter | null,
    fadingOutStepNumber: null as number | null,
    isNewLetter: false,
    trailSettings: loadTrailSettings(),
    leftPropDimensions: DEFAULT_PROP_DIMENSIONS,
    rightPropDimensions: DEFAULT_PROP_DIMENSIONS,
    currentLeftPropType: "staff",
    currentRightPropType: "staff",
    currentPropType: "staff",
    suppress2DOverlays: false,
    leftMotionVisible: true,
    rightMotionVisible: true,
  });

  return {
    get isInitialized() { return state.isInitialized; },
    get rendererLoading() { return state.rendererLoading; },
    get rendererError() { return state.rendererError; },
    get servicesReady() { return state.servicesReady; },
    get visibilityState() { return state.visibilityState; },
    get isPreRendering() { return state.isPreRendering; },
    get preRenderProgress() { return state.preRenderProgress; },
    get preRenderedFramesReady() { return state.preRenderedFramesReady; },
    get displayedLetter() { return state.displayedLetter; },
    get displayedStepNumber() { return state.displayedStepNumber; },
    get displayedMusicalPosition() { return state.displayedMusicalPosition; },
    get fadingOutLetter() { return state.fadingOutLetter; },
    get fadingOutStepNumber() { return state.fadingOutStepNumber; },
    get isNewLetter() { return state.isNewLetter; },
    get trailSettings() { return state.trailSettings; },
    get leftPropDimensions() { return state.leftPropDimensions; },
    get rightPropDimensions() { return state.rightPropDimensions; },
    get currentLeftPropType() { return state.currentLeftPropType; },
    get currentRightPropType() { return state.currentRightPropType; },
    get currentPropType() { return state.currentPropType; },
    get suppress2DOverlays() { return state.suppress2DOverlays; },
    get leftMotionVisible() { return state.leftMotionVisible; },
    get rightMotionVisible() { return state.rightMotionVisible; },

    setInitialized(v) { state.isInitialized = v; },
    setRendererLoading(v) { state.rendererLoading = v; },
    setRendererError(v) { state.rendererError = v; },
    setServicesReady(v) { state.servicesReady = v; },
    setVisibilityState(v) { state.visibilityState = v; },
    setPreRendering(v) { state.isPreRendering = v; },
    setPreRenderProgress(v) { state.preRenderProgress = v; },
    setPreRenderedFramesReady(v) { state.preRenderedFramesReady = v; },
    setGlyphState(v) {
      state.displayedLetter = v.displayedLetter;
      state.displayedStepNumber = v.displayedStepNumber;
      state.displayedMusicalPosition = v.displayedMusicalPosition;
      state.fadingOutLetter = v.fadingOutLetter;
      state.fadingOutStepNumber = v.fadingOutStepNumber;
      state.isNewLetter = v.isNewLetter;
    },
    setTrailSettings(v) { state.trailSettings = v; },
    setLeftPropDimensions(v) {
      // Object guard: a new ref with equal w/h would otherwise retrigger every tick.
      if (state.leftPropDimensions.width !== v.width || state.leftPropDimensions.height !== v.height) {
        state.leftPropDimensions = v;
      }
    },
    setRightPropDimensions(v) {
      if (state.rightPropDimensions.width !== v.width || state.rightPropDimensions.height !== v.height) {
        state.rightPropDimensions = v;
      }
    },
    setLeftPropType(v) { state.currentLeftPropType = v; },
    setRightPropType(v) { state.currentRightPropType = v; },
    setLegacyPropType(v) { state.currentPropType = v; },
    setSuppress2DOverlays(v) { state.suppress2DOverlays = v; },
    setMotionVisibility(left, right) {
      state.leftMotionVisible = left;
      state.rightMotionVisible = right;
    },
  };
}
