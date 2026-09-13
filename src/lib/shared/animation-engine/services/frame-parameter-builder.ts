/**
 * FrameParameterBuilder
 *
 * Computes per-frame animation parameters by querying all services.
 * Resolves effect configs, caches loopability/hand presence.
 *
 * Extracted from AnimationEngine to reduce its line count.
 * This is a plain TypeScript class - no Svelte reactivity needed.
 */

import { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import { resolveTrailColors } from "../domain/resolve-trail-colors";
import { isVisibleMotion } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { RenderFrameParams } from "./IAnimationRenderLoop";
import {
  type TrailSettings,
  DEFAULT_TRAIL_SETTINGS,
  TrailMode,
} from "../domain/types/trail-types";
import { TrackingMode } from "../domain/types/trail-types";
import { DEFAULT_PROP_DIMENSIONS } from "./IPropTextureLoader";
import { DEFAULT_PROP_FLAME_COLORS } from "../domain/types/fire-types";
import type { PropFlameColor } from "../domain/types/fire-types";
import {
  spotlightFactor,
  tunnelColorFromHex,
  tunnelPropColor,
  tunnelPerformerPair,
  type TunnelLayerSelection,
  type TunnelPropColorPair,
} from "$lib/shared/sequence-viewer/tunnel/tunnel-prop-colors";
import type { AnimationVisibilityStateManager } from "../state/animation-visibility-state.svelte";
import type { SettingsState } from "$lib/shared/settings/state/settings-state.svelte";
import type { SequenceAnimationOrchestrator } from "$lib/shared/animation-engine/services/sequence-animation-orchestrator";
import type { EffectsConfigState } from "$lib/shared/effects/state/effects-config-state.svelte";

import type {
  Bloom2DParams,
  Bubbles2DParams,
  Ghost2DParams,
  Frost2DParams,
  Ink2DParams,
  Petals2DParams,
  Silk2DParams,
  Animal2DParams,
  Pulse2DParams,
  Smoke2DParams,
  Sparkles2DParams,
  GooParams,
  Zap2DParams,
} from "$lib/shared/effects/translators/canvas2d-types";
import {
  resolveBloom2D,
  resolveBubbles2D,
  resolveGhost2D,
  resolveFrost2D,
  resolveInk2D,
  resolvePetals2D,
  resolveSilk2D,
  resolveAnimal2D,
  resolvePulse2D,
  resolveSmoke2D,
  resolveSparkles2D,
  resolveGoo2D,
  resolveZap2D,
} from "$lib/shared/effects/translators/canvas2d-translator";
import type {
  BloomIntent,
  BubblesIntent,
  GhostIntent,
  FrostIntent,
  InkIntent,
  PetalsIntent,
  SilkIntent,
  AnimalIntent,
  PulseIntent,
  SmokeIntent,
  SparklesIntent,
  GooIntent,
} from "$lib/shared/effects/domain/effects-config";
import { DEFAULT_EFFECTS_CONFIG } from "$lib/shared/effects/domain/defaults";
import { isSeamlesslyLoopable } from "$lib/shared/foundation/services/sequence-loopability-checker";
import { isBilateralProp } from "$lib/shared/pictograph/prop/domain/enums/prop-classification";

import type { AnimationEngineProps } from "./animation-engine.svelte";
import type { AnimatorState } from "../state/animator-state.svelte";
import type { EffectRendererManager } from "./effect-renderer-manager";

export class FrameParameterBuilder {
  private trailColorSource: TrailSettings | null = null;
  private trailColorSignature = "";
  private coloredTrailSettings: TrailSettings | null = null;
  private zapConfig: Zap2DParams = resolveZap2D(DEFAULT_EFFECTS_CONFIG.zap);
  private sparklesConfig: Sparkles2DParams = resolveSparkles2D(
    DEFAULT_EFFECTS_CONFIG.sparkles
  );
  private prevSparklesIntentRef: SparklesIntent | null = null;
  private ghostConfig: Ghost2DParams = resolveGhost2D(
    DEFAULT_EFFECTS_CONFIG.ghost
  );
  private prevGhostIntentRef: GhostIntent | null = null;
  private bloomConfig: Bloom2DParams = resolveBloom2D(
    DEFAULT_EFFECTS_CONFIG.bloom
  );
  private prevBloomIntentRef: BloomIntent | null = null;
  private gooConfig: GooParams = resolveGoo2D(DEFAULT_EFFECTS_CONFIG.goo);
  private prevGooIntentRef: GooIntent | null = null;
  private bubblesConfig: Bubbles2DParams = resolveBubbles2D(
    DEFAULT_EFFECTS_CONFIG.bubbles
  );
  private prevBubblesIntentRef: BubblesIntent | null = null;
  private petalsConfig: Petals2DParams = resolvePetals2D(
    DEFAULT_EFFECTS_CONFIG.petals
  );
  private prevPetalsIntentRef: PetalsIntent | null = null;
  private smokeConfig: Smoke2DParams = resolveSmoke2D(
    DEFAULT_EFFECTS_CONFIG.smoke
  );
  private prevSmokeIntentRef: SmokeIntent | null = null;
  private inkConfig: Ink2DParams = resolveInk2D(DEFAULT_EFFECTS_CONFIG.ink);
  private prevInkIntentRef: InkIntent | null = null;
  private frostConfig: Frost2DParams = resolveFrost2D(
    DEFAULT_EFFECTS_CONFIG.frost
  );
  private prevFrostIntentRef: FrostIntent | null = null;
  private silkConfig: Silk2DParams = resolveSilk2D(DEFAULT_EFFECTS_CONFIG.silk);
  private prevSilkIntentRef: SilkIntent | null = null;
  private animalConfig: Animal2DParams = resolveAnimal2D(
    DEFAULT_EFFECTS_CONFIG.animal
  );
  private prevAnimalIntentRef: AnimalIntent | null = null;
  private pulseConfig: Pulse2DParams = resolvePulse2D(
    DEFAULT_EFFECTS_CONFIG.pulse
  );
  private prevPulseIntentRef: PulseIntent | null = null;
  private prevZapIntentJson: string = JSON.stringify(
    DEFAULT_EFFECTS_CONFIG.zap
  );

  private cachedIsSeamlesslyLoopable: boolean = false;
  private loopabilityCacheHash: string | null = null;

  sequenceHasLeftMotion: boolean = true;
  sequenceHasRightMotion: boolean = true;
  private handPresenceCacheKey: string | null = null;

  // Sequence content hash for detecting beat duration changes
  lastSequenceContentHash: string | null = null;

  // Extended propColors array (base pair + one spectrum color per layer end)
  // for colored flames on overlaid kaleidoscope copies. Rebuilt only when the
  // layer count or the base blue/red colors change, then reused each frame.
  private extendedPropColors: PropFlameColor[] | null = null;
  private extendedPropColorsLayerCount = -1;
  private extendedPropColorsBaseRef: PropFlameColor[] | null = null;
  private extendedPropColorsSpectrum = true;
  private extendedPropColorsSelected: TunnelLayerSelection = null;
  private customPropColorsSignature = "";
  private customPropFlamePair: PropFlameColor[] | null = null;

  // Reusable frame params object to avoid GC pressure (created once, mutated each frame)
  private readonly frameParams: RenderFrameParams = {
    stepData: null,
    currentStep: 0,
    trailSettings: DEFAULT_TRAIL_SETTINGS,
    gridVisible: true,
    gridMode: GridMode.DIAMOND,
    letter: null,
    props: {
      leftProp: null,
      rightProp: null,
      additionalLayers: [],
      leftPropDimensions: DEFAULT_PROP_DIMENSIONS,
      rightPropDimensions: DEFAULT_PROP_DIMENSIONS,
      tunnelSpectrum: true,
      tunnelPropColors: null,
      tunnelSelectedLayer: null,
    },
    visibility: {
      gridVisible: true,
      propsVisible: true,
      trailsVisible: true,
      leftMotionVisible: true,
      rightMotionVisible: true,
    },
    isPlaying: false,
    leftPropFlipped: false,
    rightPropFlipped: false,
    leftPropType: undefined,
    rightPropType: undefined,
    fireConfig: null,
    darkMode: false,
    propColors: undefined,
    ledConfig: null,
    zapConfig: null,
    sparklesConfig: null,
    ghostConfig: null,
    bloomConfig: null,
    gooConfig: null,
    bubblesConfig: null,
    petalsConfig: null,
    smokeConfig: null,
    inkConfig: null,
    frostConfig: null,
    silkConfig: null,
    animalConfig: null,
    pulseConfig: null,
    isSeamlesslyLoopable: false,
    sequenceContentHash: undefined,
    tipEffectMap: {},
    trailsSuppressedUntilTextureLoad: false,
    mandalaVisible: false,
    mandalaSteps: null,
    mandalaPathOptions: {
      pathShape: "arc",
      motionAware: false,
    },
  };

  /**
   * Get frame params by mutating reusable object (avoids 180 allocations/sec GC pressure)
   */
  getFrameParams(
    props: AnimationEngineProps,
    state: AnimatorState,
    deps: {
      prevDarkMode: boolean;
      prevHasFireTips: boolean;
      prevHasCharcoalTips: boolean;
      trailsSuppressedUntilTextureLoad: boolean;
      effectsConfigState: EffectsConfigState | null;
      settingsService: SettingsState | null;
      effectRendererManager: EffectRendererManager;
      getVM: () => AnimationVisibilityStateManager;
      orchestrator: SequenceAnimationOrchestrator | null;
    }
  ): RenderFrameParams {
    const {
      prevDarkMode,
      prevHasFireTips,
      prevHasCharcoalTips,
      trailsSuppressedUntilTextureLoad,
      effectsConfigState,
      settingsService,
      effectRendererManager: erm,
      getVM,
      orchestrator, // eslint-disable-line @typescript-eslint/no-unused-vars
    } = deps;

    // Mutate the reusable object instead of creating new ones each frame
    const fp = this.frameParams;
    fp.stepData = props.stepData ?? null;
    fp.currentStep = props.currentStep ?? 0;
    fp.primaryPropColors =
      props.tunnelPropColors ?? props.primaryPropColors ?? null;
    fp.virtualTime = props.virtualTime;
    fp.trailSettings = this.getEffectiveTrailSettings(
      state,
      trailsSuppressedUntilTextureLoad,
      props.primaryPropColors
    );
    // Raw flag alongside the mode-OFF trailSettings above — see the field doc
    // on RenderFrameParams for why AnimationRenderLoop needs both.
    fp.trailsSuppressedUntilTextureLoad = trailsSuppressedUntilTextureLoad;
    fp.gridVisible = props.gridVisible ?? true;
    fp.gridOpacity = props.gridOpacity;
    fp.gridMode = props.gridMode ?? GridMode.DIAMOND;
    fp.letter = props.letter ?? null;

    // Mutate nested props object
    fp.props.leftProp = props.leftProp;
    fp.props.rightProp = props.rightProp;

    // For single-hand sequences (e.g., during assembly), null out the missing
    // hand's prop so the renderer skips drawing it entirely.
    this.updateHandPresenceCache(props.sequenceData ?? null);
    if (!this.sequenceHasLeftMotion) fp.props.leftProp = null;
    if (!this.sequenceHasRightMotion) fp.props.rightProp = null;
    fp.props.additionalLayers = props.additionalLayers ?? [];
    fp.props.leftPropDimensions = state.leftPropDimensions;
    fp.props.rightPropDimensions = state.rightPropDimensions;
    fp.props.tunnelSpectrum = props.tunnelSpectrum ?? true;
    fp.props.tunnelPropColors = props.tunnelPropColors ?? null;
    fp.props.tunnelSelectedLayer = props.tunnelSelectedLayer ?? null;

    // Mutate nested visibility object
    fp.visibility.gridVisible = state.visibilityState.grid;
    fp.visibility.propsVisible = state.visibilityState.props;
    fp.visibility.trailsVisible = state.visibilityState.trails;
    fp.visibility.leftMotionVisible = state.leftMotionVisible;
    fp.visibility.rightMotionVisible = state.rightMotionVisible;

    // Set isPlaying to control render loop continuation
    fp.isPlaying = props.isPlaying ?? false;

    // Get flip settings from settings service
    // - Buugeng family: user preference (asymmetric props)
    // - Hand: red hand always flipped (left/right hands are anatomically mirrored)
    const settings = settingsService?.currentSettings;
    // Chirality-flippable props (buugeng family + trigeng) honor the user's flip.
    const buugengFamily = ["buugeng", "bigbuugeng", "trigeng"];
    const leftPropType = state.currentLeftPropType.toLowerCase();
    const rightPropType = state.currentRightPropType.toLowerCase();

    // Left prop: Buugeng family uses the user's left-hand flip preference.
    fp.leftPropFlipped = buugengFamily.includes(leftPropType)
      ? (props.leftBuugengFlipped ?? settings?.leftBuugengFlipped ?? false)
      : false;

    // Red prop: Hand is always flipped (right hand mirror), Buugeng uses user preference
    fp.rightPropFlipped =
      rightPropType === "hand"
        ? true
        : buugengFamily.includes(rightPropType)
          ? (props.rightBuugengFlipped ??
            settings?.rightBuugengFlipped ??
            false)
          : false;

    // Pass prop types for prop-specific rendering rules (e.g., hands never rotate)
    fp.leftPropType = leftPropType;
    fp.rightPropType = rightPropType;

    // Fire/charcoal overlay config - pass when either effect is active
    fp.fireConfig =
      prevHasFireTips || prevHasCharcoalTips ? erm.fireConfig : null;
    fp.darkMode = prevDarkMode;
    // Prop colors for colored flames - read from EffectsConfigState, else default blue/red.
    // The fire splat indexes this by tip.propIndex, so when the tunnel overlays
    // layers (propIndex >= 2) we extend the 2-entry base array with a distinct
    // spectrum color per layer end (tunnelPropColor) so each kaleidoscope copy's
    // flame matches its prop. No layers → the plain base pair, unchanged.
    const authoredPropColors =
      effectsConfigState?.fire.propColors ?? DEFAULT_PROP_FLAME_COLORS;
    const basePropColors = fp.props.tunnelPropColors
      ? this.getCustomPropFlamePair(fp.props.tunnelPropColors)
      : authoredPropColors;
    const layerCount = fp.props.additionalLayers.length;
    if (layerCount > 0) {
      fp.propColors = this.getExtendedPropColors(
        basePropColors,
        layerCount,
        (fp.props.tunnelSpectrum ?? true) && !fp.props.tunnelPropColors,
        fp.props.tunnelSelectedLayer ?? null
      );
    } else {
      fp.propColors = basePropColors;
    }

    // LED overlay config
    fp.ledConfig = erm.ledConfig.enabled ? erm.ledConfig : null;

    // Zap (lightning) overlay config - re-resolve when the shared
    // EffectsConfigState reports a changed ZapIntent. JSON diff mirrors the
    // prevCharcoalParamsJson pattern: cheap to compare, zero alloc when stable,
    // one re-resolve per slider tick when the user is actively tweaking.
    if (effectsConfigState) {
      const intent = effectsConfigState.zap;
      const intentJson = JSON.stringify(intent);
      if (intentJson !== this.prevZapIntentJson) {
        this.prevZapIntentJson = intentJson;
        this.zapConfig = resolveZap2D(intent);
      }
    }
    fp.zapConfig = erm.wasEnabled("zap") ? this.zapConfig : null;

    // Sparkles overlay config - re-resolve when SparklesIntent changes via
    // reference identity (Phase 1b pattern; cheaper than JSON diff and safe
    // because EffectsConfigState assigns a fresh object on every updateSparkles).
    if (effectsConfigState) {
      const intent = effectsConfigState.sparkles;
      if (intent !== this.prevSparklesIntentRef) {
        this.prevSparklesIntentRef = intent;
        this.sparklesConfig = resolveSparkles2D(intent);
      }
    }
    fp.sparklesConfig = erm.wasEnabled("sparkles") ? this.sparklesConfig : null;

    // Ghost overlay config - re-resolve when GhostIntent changes via
    // reference identity (mirrors sparkles; cheap and EffectsConfigState
    // assigns a fresh object on every updateGhost).
    if (effectsConfigState) {
      const intent = effectsConfigState.ghost;
      if (intent !== this.prevGhostIntentRef) {
        this.prevGhostIntentRef = intent;
        this.ghostConfig = resolveGhost2D(intent);
      }
    }
    fp.ghostConfig = erm.wasEnabled("ghost") ? this.ghostConfig : null;

    // Bloom overlay config - re-resolve when BloomIntent changes via
    // reference identity (mirrors echo/sparkles; EffectsConfigState
    // assigns a fresh object on every updateBloom).
    if (effectsConfigState) {
      const intent = effectsConfigState.bloom;
      if (intent !== this.prevBloomIntentRef) {
        this.prevBloomIntentRef = intent;
        this.bloomConfig = resolveBloom2D(intent);
      }
    }
    fp.bloomConfig = erm.wasEnabled("bloom") ? this.bloomConfig : null;

    // Goo overlay config - re-resolve when GooIntent changes via
    // reference identity (same pattern as bloom/echo/sparkles).
    if (effectsConfigState) {
      const intent = effectsConfigState.goo;
      if (intent !== this.prevGooIntentRef) {
        this.prevGooIntentRef = intent;
        this.gooConfig = resolveGoo2D(intent);
      }
    }
    fp.gooConfig = erm.wasEnabled("goo") ? this.gooConfig : null;

    // Bubbles overlay config - same reference-identity diff pattern.
    if (effectsConfigState) {
      const intent = effectsConfigState.bubbles;
      if (intent !== this.prevBubblesIntentRef) {
        this.prevBubblesIntentRef = intent;
        this.bubblesConfig = resolveBubbles2D(intent);
      }
    }
    fp.bubblesConfig = erm.wasEnabled("bubbles") ? this.bubblesConfig : null;

    // Petals overlay config - same reference-identity diff pattern.
    if (effectsConfigState) {
      const intent = effectsConfigState.petals;
      if (intent !== this.prevPetalsIntentRef) {
        this.prevPetalsIntentRef = intent;
        this.petalsConfig = resolvePetals2D(intent);
      }
    }
    fp.petalsConfig = erm.wasEnabled("petals") ? this.petalsConfig : null;

    // Smoke overlay config - same reference-identity diff pattern.
    if (effectsConfigState) {
      const intent = effectsConfigState.smoke;
      if (intent !== this.prevSmokeIntentRef) {
        this.prevSmokeIntentRef = intent;
        this.smokeConfig = resolveSmoke2D(intent);
      }
    }
    fp.smokeConfig = erm.wasEnabled("smoke") ? this.smokeConfig : null;

    // Ink overlay config - same reference-identity diff pattern.
    if (effectsConfigState) {
      const intent = effectsConfigState.ink;
      if (intent !== this.prevInkIntentRef) {
        this.prevInkIntentRef = intent;
        this.inkConfig = resolveInk2D(intent);
      }
    }
    fp.inkConfig = erm.wasEnabled("ink") ? this.inkConfig : null;

    // Frost overlay config - same reference-identity diff pattern.
    if (effectsConfigState) {
      const intent = effectsConfigState.frost;
      if (intent !== this.prevFrostIntentRef) {
        this.prevFrostIntentRef = intent;
        this.frostConfig = resolveFrost2D(intent);
      }
    }
    fp.frostConfig = erm.wasEnabled("frost") ? this.frostConfig : null;

    // Silk overlay config - same reference-identity diff pattern.
    if (effectsConfigState) {
      const intent = effectsConfigState.silk;
      if (intent !== this.prevSilkIntentRef) {
        this.prevSilkIntentRef = intent;
        this.silkConfig = resolveSilk2D(intent);
      }
    }
    fp.silkConfig = erm.wasEnabled("silk") ? this.silkConfig : null;

    // Animal overlay config - same reference-identity diff pattern.
    if (effectsConfigState) {
      const intent = effectsConfigState.animal;
      if (intent !== this.prevAnimalIntentRef) {
        this.prevAnimalIntentRef = intent;
        this.animalConfig = resolveAnimal2D(intent);
      }
    }
    fp.animalConfig = erm.wasEnabled("animal") ? this.animalConfig : null;

    // Pulse overlay config - same reference-identity diff pattern.
    if (effectsConfigState) {
      const intent = effectsConfigState.pulse;
      if (intent !== this.prevPulseIntentRef) {
        this.prevPulseIntentRef = intent;
        this.pulseConfig = resolvePulse2D(intent);
      }
    }
    fp.pulseConfig = erm.wasEnabled("pulse") ? this.pulseConfig : null;

    // Per-tip effect assignments for filtering tips by effect type.
    // Cell-level map (from compose grid) takes priority over the global map.
    fp.tipEffectMap =
      erm.cellTipEffectMap ?? effectsConfigState?.tipEffectMap ?? {};

    // Suppress 2D effect overlays when 3D mode is active
    fp.suppress2DOverlays = state.suppress2DOverlays ?? false;

    // Playback speed for fire cache invalidation
    const vmRef = getVM();
    fp.playbackSpeed = vmRef.getSpeed();

    // Step mode: disable fire frame cache so flames track actual prop positions.
    // The cache records during continuous playback and replays using wall-clock time,
    // which drifts from prop positions during step mode's discrete pauses.
    if (fp.fireConfig) {
      fp.fireConfig.disableFrameCache = vmRef.getPlaybackMode() === "step";
    }

    // Sequence identity for fire cache invalidation (new sequence = invalidate stale fire frames)
    fp.sequenceContentHash = this.lastSequenceContentHash ?? undefined;

    // Seamless loop flag for trail wrap-around.
    // Auto-detect from sequence data when not explicitly provided by parent.
    // Cached per sequence to avoid recomputing on every frame.
    if (props.isSeamlesslyLoopable != null) {
      fp.isSeamlesslyLoopable = props.isSeamlesslyLoopable;
    } else if (props.sequenceData) {
      const hash = this.lastSequenceContentHash;
      if (hash !== this.loopabilityCacheHash) {
        this.cachedIsSeamlesslyLoopable = isSeamlesslyLoopable(
          props.sequenceData
        );
        this.loopabilityCacheHash = hash;
      }
      fp.isSeamlesslyLoopable = this.cachedIsSeamlesslyLoopable;
    } else {
      fp.isSeamlesslyLoopable = false;
    }

    return fp;
  }

  /**
   * Generate a hash string representing sequence content that affects animation.
   * Includes motion data fingerprint so transforms (rotate, mirror, etc.) trigger re-precomputation.
   */
  getSequenceContentHash(seq: SequenceData): string {
    const stepCount = seq.steps?.length || 0;
    // Build a compact fingerprint of each step's motion data.
    // Transforms change startLocation, endLocation, rotationDirection, orientations -
    // we must detect these changes to re-precompute path caches.
    const motionFingerprint =
      seq.steps
        ?.map((s) => {
          const b = s.motions?.left;
          const r = s.motions?.right;
          const bPart = b
            ? `${b.startLocation}${b.endLocation}${b.motionType}${b.rotationDirection}${b.turns}`
            : "_";
          const rPart = r
            ? `${r.startLocation}${r.endLocation}${r.motionType}${r.rotationDirection}${r.turns}`
            : "_";
          return `${bPart}|${rPart}`;
        })
        .join(";") || "";
    return `${seq.id || seq.word || "unknown"}-${stepCount}-${motionFingerprint}`;
  }

  /**
   * Recompute which hands have motion data, cached per sequence identity.
   * For single-hand sequences (assembly in progress), this lets us null out
   * the missing hand's prop so the renderer doesn't draw it.
   */
  updateHandPresenceCache(seq: SequenceData | null): void {
    const steps = seq?.steps;
    const cacheKey = seq
      ? (seq.id || seq.word || "") + "-" + (steps?.length ?? 0)
      : null;

    if (cacheKey === this.handPresenceCacheKey) return;
    this.handPresenceCacheKey = cacheKey;

    if (!seq || !steps || steps.length === 0) {
      this.sequenceHasLeftMotion = true;
      this.sequenceHasRightMotion = true;
      return;
    }

    let hasLeft = false;
    let hasRight = false;

    // Check start position. Invisible placeholders count as "not there"
    // (both-required Step shape: absence is encoded as isVisible:false).
    const startPos = seq.startPosition ?? seq.startingPosition;
    if (isVisibleMotion(startPos?.motions?.left)) hasLeft = true;
    if (isVisibleMotion(startPos?.motions?.right)) hasRight = true;

    // Check all steps
    for (const step of steps) {
      if (isVisibleMotion(step.motions?.left)) hasLeft = true;
      if (isVisibleMotion(step.motions?.right)) hasRight = true;
      if (hasLeft && hasRight) break;
    }

    this.sequenceHasLeftMotion = hasLeft;
    this.sequenceHasRightMotion = hasRight;
  }

  /**
   * Enforce unilateral prop constraint on trail settings.
   * Unilateral props (fan, club, minihoop, etc.) only have one meaningful
   * endpoint, so BOTH_ENDS must be overridden to RIGHT_END.
   */
  enforceUnilateralConstraint(
    settings: TrailSettings,
    currentLeftPropType: string,
    currentRightPropType: string
  ): TrailSettings {
    if (settings.trackingMode !== TrackingMode.BOTH_ENDS) return settings;

    const leftIsBilateral = isBilateralProp(currentLeftPropType);
    const rightIsBilateral = isBilateralProp(currentRightPropType);

    // Only allow BOTH_ENDS when at least one prop is bilateral
    if (leftIsBilateral || rightIsBilateral) return settings;

    return { ...settings, trackingMode: TrackingMode.RIGHT_END };
  }

  /**
   * Return trail settings with unilateral prop constraint enforced.
   * During prop type changes, trails are suppressed entirely to prevent
   * stale endpoint data from rendering as a visible jump line.
   */
  private getEffectiveTrailSettings(
    state: AnimatorState,
    trailsSuppressedUntilTextureLoad: boolean,
    colors?: { left: string; right: string } | null
  ): TrailSettings {
    const source = this.enforceUnilateralConstraint(
      state.trailSettings,
      state.currentLeftPropType,
      state.currentRightPropType
    );
    const signature = colors ? `${colors.left}:${colors.right}` : "";
    if (
      source !== this.trailColorSource ||
      signature !== this.trailColorSignature
    ) {
      this.trailColorSource = source;
      this.trailColorSignature = signature;
      this.coloredTrailSettings = resolveTrailColors(source, colors);
    }
    const settings = this.coloredTrailSettings ?? source;
    if (trailsSuppressedUntilTextureLoad) {
      return { ...settings, mode: TrailMode.OFF };
    }
    return settings;
  }

  /**
   * Build (and cache) the extended fire propColors array for `layerCount`
   * overlaid tunnel layers. Index 0/1 stay the base blue/red; index 2+2*li /
   * 3+2*li get the layer's spectrum color (tunnelPropColor rgb01, which is the
   * same {r,g,b} 0..1 shape as PropFlameColor). Rebuilt only when the layer
   * count or the base color array identity changes; reused each frame otherwise.
   */
  private getExtendedPropColors(
    base: PropFlameColor[],
    layerCount: number,
    spectrum: boolean,
    selectedLayer: TunnelLayerSelection
  ): PropFlameColor[] {
    if (
      this.extendedPropColors &&
      this.extendedPropColorsLayerCount === layerCount &&
      this.extendedPropColorsBaseRef === base &&
      this.extendedPropColorsSpectrum === spectrum &&
      this.extendedPropColorsSelected === selectedLayer
    ) {
      return this.extendedPropColors;
    }

    // Spotlight: when a performer is selected, every other family's flame dims
    // toward black so the chosen copy's fire dominates (family 0 = base).
    const dim = (c: PropFlameColor, family: number): PropFlameColor => {
      const f = spotlightFactor(selectedLayer, family);
      return f >= 1 ? c : { r: c.r * f, g: c.g * f, b: c.b * f };
    };

    // Spectrum off: every layer inherits the base blue/red flame color so the
    // kaleidoscope reads as one look the Effects panel drives, not a rainbow.
    const out: PropFlameColor[] = [dim(base[0]!, 0), dim(base[1]!, 0)];
    for (let li = 0; li < layerCount; li++) {
      const family = li + 1;
      const left = spectrum
        ? tunnelPropColor(2 + li * 2, layerCount).rgb01
        : (base[2 + li * 2] ?? base[0]!);
      const right = spectrum
        ? tunnelPropColor(3 + li * 2, layerCount).rgb01
        : (base[3 + li * 2] ?? base[1]!);
      out[2 + li * 2] = dim(left, family);
      out[3 + li * 2] = dim(right, family);
    }

    this.extendedPropColors = out;
    this.extendedPropColorsLayerCount = layerCount;
    this.extendedPropColorsBaseRef = base;
    this.extendedPropColorsSpectrum = spectrum;
    this.extendedPropColorsSelected = selectedLayer;
    return out;
  }

  private getCustomPropFlamePair(
    colors: TunnelPropColorPair
  ): PropFlameColor[] {
    const signature = JSON.stringify(colors);
    if (
      signature === this.customPropColorsSignature &&
      this.customPropFlamePair
    ) {
      return this.customPropFlamePair;
    }
    this.customPropColorsSignature = signature;
    this.customPropFlamePair = Array.from(
      { length: colors.performers?.length ?? 1 },
      (_, index) => {
        const pair = tunnelPerformerPair(colors, index);
        return [
          tunnelColorFromHex(pair.left).rgb01,
          tunnelColorFromHex(pair.right).rgb01,
        ];
      }
    ).flat();
    return this.customPropFlamePair;
  }

  /** Reset cached hand presence (called on dispose). */
  resetHandPresenceCache(): void {
    this.handPresenceCacheKey = null;
    this.sequenceHasLeftMotion = true;
    this.sequenceHasRightMotion = true;
  }
}
