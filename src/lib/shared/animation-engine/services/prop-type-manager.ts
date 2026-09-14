/**
 * PropTypeManager
 *
 * Hot-swaps prop types, loads/reloads textures asynchronously.
 * Suppresses trails during texture transitions.
 *
 * Extracted from AnimationEngine to reduce its line count.
 * This is a plain TypeScript class - no Svelte reactivity needed.
 */

import { animationSettings as animationSettingsState } from "../state/animation-settings-state.svelte";
import type { SettingsState } from "$lib/shared/settings/state/settings-state.svelte";
import type { IPropTextureLoader } from "./IPropTextureLoader";
import type { TrailCapturer } from "$lib/shared/animation-engine/services/trail-capturer";
import type {
  IAnimationRenderLoop,
  RenderFrameParams,
} from "./IAnimationRenderLoop";
import type { IAnimationPrecomputer } from "./IAnimationPrecomputer";
import type { PropTypeChanger } from "./prop-type-changer.svelte";
import type { FireTipTracker } from "./fire-tip-tracker";
import type { IAnimationRenderer as AnimationRenderer } from "$lib/shared/animation-engine/services/IAnimationRenderer";
import {
  tunnelPropColor,
  tunnelPerformerPair,
  type TunnelPropColorPair,
} from "$lib/shared/sequence-viewer/tunnel/tunnel-prop-colors";
import { getBaseMotionColors } from "./svg-generator";
import {
  DEFAULT_FAN_APPEARANCE,
  normalizeFanAppearance,
  resolveFanRenderKey,
  type FanAppearance,
} from "$lib/shared/pictograph/prop/domain/fan-appearance";
import {
  DEFAULT_PROP_LOOK,
  normalizePropLook,
  resolvePropRenderKey,
  type PropLook,
} from "$lib/shared/pictograph/prop/domain/prop-look";

import type {
  AdditionalLayerTextureStatus,
  AnimationEngineProps,
} from "./animation-engine.svelte";
import type { AnimatorState } from "../state/animator-state.svelte";

/** Callback to obtain current frame params. */
export type FrameParamsProvider = () => RenderFrameParams;

export class PropTypeManager {
  propTypeOverrideLeft: string | null = null;
  propTypeOverrideRight: string | null = null;
  private renderPropTypeLeft: string | null = null;
  private renderPropTypeRight: string | null = null;
  private fanAppearance: FanAppearance = DEFAULT_FAN_APPEARANCE;
  private propLook: PropLook = DEFAULT_PROP_LOOK;
  trailsSuppressedUntilTextureLoad = false;

  // Additional layer texture loading for tunnel mode (indexed by layer)
  additionalLayerTexturesLoaded: boolean[] = [];
  additionalLayerTexturesLoading: boolean[] = [];
  // Last seen tunnel layer count; spectrum hues depend on it, so a change forces
  // a sprite regenerate (see handleAdditionalLayers).
  private lastLayerCount = 0;
  private lastSpectrum = true;
  private lastTunnelPropColorSig = "";
  private lastBasePropColorSig = "";
  private currentBaseColors: TunnelPropColorPair | null = null;
  // Per-layer prop-type signature. A performer-set change (a copy swapping its
  // prop) must regenerate that layer's sprite even when count + spectrum hold.
  private lastLayerPropSig = "";

  // ── Dependencies (injected) ─────────────────────────────────────────
  private settingsService: SettingsState | null = null;
  private propTextureService: IPropTextureLoader | null = null;
  private trailCapturer: TrailCapturer | null = null;
  private renderLoopService: IAnimationRenderLoop | null = null;
  private precomputationService: IAnimationPrecomputer | null = null;
  private propTypeChangeService: PropTypeChanger | null = null;
  private fireTipTracker: FireTipTracker | null = null;
  private animationRenderer: AnimationRenderer | null = null;
  private lastTextureReloadSignal: number = 0;
  // Texture generation finishes on a later task. Keep the provider from the
  // newest engine update so that completion cannot put the render loop back on
  // the reset pose it happened to capture when the swap began.
  private latestFrameParamsProvider: FrameParamsProvider | null = null;

  /**
   * Wire dependencies after construction. Called from AnimationEngine.
   */
  wire(deps: {
    settingsService: SettingsState | null;
    propTextureService: IPropTextureLoader | null;
    trailCapturer: TrailCapturer | null;
    renderLoopService: IAnimationRenderLoop | null;
    precomputationService: IAnimationPrecomputer | null;
    propTypeChangeService: PropTypeChanger | null;
    fireTipTracker: FireTipTracker | null;
    animationRenderer: AnimationRenderer | null;
  }): void {
    this.settingsService = deps.settingsService;
    this.propTextureService = deps.propTextureService;
    this.trailCapturer = deps.trailCapturer;
    this.renderLoopService = deps.renderLoopService;
    this.precomputationService = deps.precomputationService;
    this.propTypeChangeService = deps.propTypeChangeService;
    this.fireTipTracker = deps.fireTipTracker;
    this.animationRenderer = deps.animationRenderer;
  }

  /** Update mutable refs that change after wire(). */
  updateRefs(refs: {
    renderLoopService?: IAnimationRenderLoop | null;
    precomputationService?: IAnimationPrecomputer | null;
    propTextureService?: IPropTextureLoader | null;
    trailCapturer?: TrailCapturer | null;
    fireTipTracker?: FireTipTracker | null;
    animationRenderer?: AnimationRenderer | null;
  }): void {
    if (refs.renderLoopService !== undefined)
      this.renderLoopService = refs.renderLoopService;
    if (refs.precomputationService !== undefined)
      this.precomputationService = refs.precomputationService;
    if (refs.propTextureService !== undefined)
      this.propTextureService = refs.propTextureService;
    if (refs.trailCapturer !== undefined)
      this.trailCapturer = refs.trailCapturer;
    if (refs.fireTipTracker !== undefined)
      this.fireTipTracker = refs.fireTipTracker;
    if (refs.animationRenderer !== undefined)
      this.animationRenderer = refs.animationRenderer;
  }

  /**
   * Render key for the base prop pair. Model sprites are baked in the blue and
   * red motion colors, so exact tunnel colors fall back to the recolorable
   * pictograph artwork; additional tunnel layers always use that path.
   */
  private baseRenderKey(
    propType: string,
    appearance: FanAppearance,
    look: PropLook,
    baseColors: TunnelPropColorPair | null = this.currentBaseColors
  ): string {
    return resolvePropRenderKey(propType, {
      fanAppearance: appearance,
      propLook: baseColors ? "pictograph" : look,
    });
  }

  /**
   * Handle prop type changes from overrides (props.leftPropType/rightPropType).
   * Returns true if a texture reload was triggered.
   */
  handleOverrides(
    props: AnimationEngineProps,
    state: AnimatorState,
    getFrameParams: FrameParamsProvider,
    prevDarkMode: boolean
  ): boolean {
    this.latestFrameParamsProvider = getFrameParams;
    const newLeft = props.leftPropType ?? this.propTypeOverrideLeft ?? "staff";
    const newRight =
      props.rightPropType ?? this.propTypeOverrideRight ?? "staff";
    const nextAppearance = normalizeFanAppearance(
      props.fanAppearance ??
        this.settingsService?.currentSettings?.fanAppearance
    );
    const nextLook = normalizePropLook(
      this.settingsService?.currentSettings?.propArtwork
    );
    const nextBaseColors =
      props.tunnelPropColors ?? props.primaryPropColors ?? null;
    const newLeftRender = this.baseRenderKey(
      newLeft,
      nextAppearance,
      nextLook,
      nextBaseColors
    );
    const newRightRender = this.baseRenderKey(
      newRight,
      nextAppearance,
      nextLook,
      nextBaseColors
    );

    // Check if overrides changed
    if (
      newLeft !== this.propTypeOverrideLeft ||
      newRight !== this.propTypeOverrideRight ||
      newLeftRender !== this.renderPropTypeLeft ||
      newRightRender !== this.renderPropTypeRight
    ) {
      // Per-color hot-swap flags for the crossfade below. Gated on
      // propTypeOverrideBlue/Red already being non-null: the FIRST time an
      // override is ever registered (mount, coming from null) is establishing
      // initial state, not swapping an already-displayed prop, so it must not
      // fade — only a genuine value-to-value change does.
      const leftChanged =
        this.renderPropTypeLeft !== null &&
        newLeftRender !== this.renderPropTypeLeft;
      const rightChanged =
        this.renderPropTypeRight !== null &&
        newRightRender !== this.renderPropTypeRight;

      // Remember the last pose before the incoming sequence/prop state reaches
      // the canvas. The texture load is asynchronous, so waiting until it
      // finishes would capture the replacement pose and make the dissolve snap
      // between two positions.
      if (leftChanged) this.animationRenderer?.prepareLeftPropCrossfade();
      if (rightChanged) this.animationRenderer?.prepareRightPropCrossfade();

      this.propTypeOverrideLeft = newLeft;
      this.propTypeOverrideRight = newRight;
      this.renderPropTypeLeft = newLeftRender;
      this.renderPropTypeRight = newRightRender;
      this.fanAppearance = nextAppearance;
      this.propLook = nextLook;
      state.setLeftPropType(newLeft);
      state.setRightPropType(newRight);
      state.setLegacyPropType(newLeft);

      // Update global settings so UI (e.g. trail tracking labels) reflects current prop
      animationSettingsState.setCurrentPropType(newLeft);

      // Invalidate path cache FIRST - it holds pre-computed endpoint positions
      // for the old prop geometry. If the render loop reads stale cache data
      // before the new textures load, it draws a jump line to the wrong position.
      this.precomputationService?.clearCaches();
      this.renderLoopService?.updateConfig({ pathCache: null });

      // Clear trail buffers - old points are at wrong endpoint positions
      this.trailCapturer?.clearTrails();

      // Suppress trail rendering until new textures load - prevents stale
      // endpoint data from flashing as a jump line during the async gap
      this.trailsSuppressedUntilTextureLoad = true;

      // Reset additional layer textures so they reload with new prop type
      this.additionalLayerTexturesLoaded = [];
      this.additionalLayerTexturesLoading = [];

      // Reset fire tip tracker so fire points recalculate for the new prop geometry
      this.fireTipTracker?.reset();

      // Hot-swap textures
      this.loadPropTextures(
        state,
        prevDarkMode,
        props.tunnelPropColors ?? props.primaryPropColors ?? null
      ).then(() => {
        // Clear trails again after texture load to discard any points
        // captured during the async gap with old prop dimensions
        this.trailCapturer?.clearTrails();
        this.trailsSuppressedUntilTextureLoad = false;
        // Start the crossfade only for the color(s) whose type actually
        // changed. loadPropTextures always reloads both colors together, but
        // an unchanged color reloads a visually identical sprite, so there is
        // nothing to fade there even though a "previous" image now exists.
        if (leftChanged) this.animationRenderer?.startLeftPropCrossfade();
        if (rightChanged) this.animationRenderer?.startRightPropCrossfade();
        this.triggerRenderWithLatestFrame(state);
      });

      return true;
    }
    return false;
  }

  /**
   * Handle prop type changes from settings (via PropTypeChanger).
   * Returns true if a texture reload was triggered.
   */
  handleSettingsChange(
    state: AnimatorState,
    getFrameParams: FrameParamsProvider,
    prevDarkMode: boolean,
    colors: TunnelPropColorPair | null = null
  ): boolean {
    this.latestFrameParamsProvider = getFrameParams;
    // No overrides - use settings via propTypeChangeService
    this.propTypeChangeService?.checkForChanges(this.settingsService);

    // Handle texture reload signal (track last signal to detect changes)
    const textureSignal =
      this.propTypeChangeService?.state.textureReloadSignal ?? 0;
    const settingsAppearance = normalizeFanAppearance(
      this.settingsService?.currentSettings?.fanAppearance
    );
    const settingsLeft =
      this.propTypeChangeService?.state.leftPropType ??
      state.currentLeftPropType;
    const settingsRight =
      this.propTypeChangeService?.state.rightPropType ??
      state.currentRightPropType;
    const settingsLook = normalizePropLook(
      this.settingsService?.currentSettings?.propArtwork
    );
    const settingsLeftRender = this.baseRenderKey(
      settingsLeft,
      settingsAppearance,
      settingsLook
    );
    const settingsRightRender = this.baseRenderKey(
      settingsRight,
      settingsAppearance,
      settingsLook
    );
    const renderAppearanceChanged =
      this.renderPropTypeLeft !== null &&
      (settingsLeftRender !== this.renderPropTypeLeft ||
        settingsRightRender !== this.renderPropTypeRight);
    if (
      (textureSignal > 0 && textureSignal !== this.lastTextureReloadSignal) ||
      renderAppearanceChanged
    ) {
      this.lastTextureReloadSignal = textureSignal;

      // Per-color hot-swap flags for the crossfade below, captured
      // against AnimatorState's currently-displayed type BEFORE it's
      // overwritten. This naturally excludes the mount-time sync (settings
      // already loaded the correct type during initial load, so the "old"
      // and "new" values here are equal and nothing fades) from a genuine
      // later settings-driven change (old and new differ, so it fades).
      const leftChanged =
        this.renderPropTypeLeft !== null &&
        settingsLeftRender !== this.renderPropTypeLeft;
      const rightChanged =
        this.renderPropTypeRight !== null &&
        settingsRightRender !== this.renderPropTypeRight;

      if (leftChanged) this.animationRenderer?.prepareLeftPropCrossfade();
      if (rightChanged) this.animationRenderer?.prepareRightPropCrossfade();

      // CRITICAL: Sync prop type state AFTER checkForChanges() detected the new values
      // Otherwise loadPropTextures() would use stale values from the earlier syncServiceState() call
      if (this.propTypeChangeService) {
        state.setLeftPropType(this.propTypeChangeService.state.leftPropType);
        state.setRightPropType(this.propTypeChangeService.state.rightPropType);
        state.setLegacyPropType(
          this.propTypeChangeService.state.legacyPropType
        );
        animationSettingsState.setCurrentPropType(
          this.propTypeChangeService.state.leftPropType
        );
      }
      this.renderPropTypeLeft = settingsLeftRender;
      this.renderPropTypeRight = settingsRightRender;
      this.fanAppearance = settingsAppearance;
      this.propLook = settingsLook;

      // Invalidate path cache FIRST - it holds pre-computed endpoint positions
      // for the old prop geometry. If the render loop reads stale cache data
      // before the new textures load, it draws a jump line to the wrong position.
      this.precomputationService?.clearCaches();
      this.renderLoopService?.updateConfig({ pathCache: null });

      // Clear trail buffers - old points are at wrong endpoint positions
      this.trailCapturer?.clearTrails();

      // Suppress trail rendering until new textures load
      this.trailsSuppressedUntilTextureLoad = true;

      // Reset additional layer textures so they reload with new prop type
      this.additionalLayerTexturesLoaded = [];
      this.additionalLayerTexturesLoading = [];

      // Reset fire tip tracker so fire points recalculate for the new prop geometry
      this.fireTipTracker?.reset();

      // Hot-swap textures without full re-initialization
      // The render loop keeps running with old textures until new ones load
      this.loadPropTextures(state, prevDarkMode, colors).then(() => {
        this.trailCapturer?.clearTrails();
        this.trailsSuppressedUntilTextureLoad = false;
        // Same per-color crossfade start as handleOverrides — see its comment.
        if (leftChanged) this.animationRenderer?.startLeftPropCrossfade();
        if (rightChanged) this.animationRenderer?.startRightPropCrossfade();
        // Trigger immediate re-render once new textures are ready
        this.triggerRenderWithLatestFrame(state);
      });

      return true;
    }
    return false;
  }

  /**
   * Handle additional layer prop textures for tunnel mode.
   * When additional layers are passed, load per-layer colored textures.
   */
  handleAdditionalLayers(
    props: AnimationEngineProps,
    state: AnimatorState,
    getFrameParams: FrameParamsProvider,
    darkMode = false
  ): void {
    this.latestFrameParamsProvider = getFrameParams;
    const visibleLayers = props.additionalLayers ?? [];
    const additionalLayers =
      visibleLayers.length > 0
        ? visibleLayers
        : (props.preloadAdditionalLayers ?? []);
    const layerCount = additionalLayers.length;
    const spectrum = props.tunnelSpectrum ?? true;
    const exactColors = props.tunnelPropColors ?? null;
    const baseColors = exactColors ?? props.primaryPropColors ?? null;
    const layerColors = exactColors ?? (spectrum ? null : baseColors);
    this.currentBaseColors = baseColors;
    const colorSig = layerColors ? JSON.stringify(layerColors) : "";
    // Signature of every layer's per-hand prop type. Empty entries fall back to
    // the global prop, so an all-default set yields "|"-joined blanks — a
    // performer swapping a prop changes the signature and re-generates sprites.
    const propSig = `${this.fanAppearance.build}:${this.fanAppearance.frameColor}:${this.fanAppearance.cover}:${this.propLook}|${additionalLayers
      .map((l) => `${l.leftPropType ?? ""}:${l.rightPropType ?? ""}`)
      .join("|")}`;

    // Spectrum colors fan across the active stack, so they depend on layerCount
    // AND the spectrum toggle. Per-performer props depend on propSig. When any
    // change, every affected layer's sprite must regenerate — drop the cache.
    if (
      layerCount !== this.lastLayerCount ||
      spectrum !== this.lastSpectrum ||
      colorSig !== this.lastTunnelPropColorSig ||
      propSig !== this.lastLayerPropSig
    ) {
      this.lastLayerCount = layerCount;
      this.lastSpectrum = spectrum;
      this.lastTunnelPropColorSig = colorSig;
      this.lastLayerPropSig = propSig;
      this.additionalLayerTexturesLoaded = [];
      this.additionalLayerTexturesLoading = [];
      this.publishAdditionalLayerTextureStatus(props, layerCount);
    }

    if (layerCount > 0 && this.animationRenderer) {
      for (let i = 0; i < layerCount; i++) {
        const layer = additionalLayers[i]!;
        const hasProps = layer.leftProp != null || layer.rightProp != null;

        if (
          hasProps &&
          !this.additionalLayerTexturesLoaded[i] &&
          !this.additionalLayerTexturesLoading[i]
        ) {
          this.additionalLayerTexturesLoading[i] = true;

          const { left: leftColor, right: rightColor } =
            this.additionalLayerColors(i, layerCount, spectrum, layerColors);
          // Each performer's per-hand prop; falls back to the global prop when a
          // layer carries no explicit type (default 1-skin appearance = today).
          const leftPropType = layer.leftPropType ?? state.currentLeftPropType;
          const rightPropType =
            layer.rightPropType ?? state.currentRightPropType;
          const leftRenderType = resolveFanRenderKey(
            leftPropType,
            this.fanAppearance
          );
          const rightRenderType = resolveFanRenderKey(
            rightPropType,
            this.fanAppearance
          );

          this.animationRenderer
            .loadAdditionalLayerPropTextures(
              i,
              leftRenderType,
              rightRenderType,
              leftColor,
              rightColor
            )
            .then(() => {
              if (
                colorSig !== this.lastTunnelPropColorSig ||
                propSig !== this.lastLayerPropSig ||
                layerCount !== this.lastLayerCount
              )
                return;
              this.additionalLayerTexturesLoaded[i] = true;
              this.additionalLayerTexturesLoading[i] = false;
              this.publishAdditionalLayerTextureStatus(props, layerCount);

              // Trigger re-render with new layer textures
              this.triggerRenderWithLatestFrame(state);
            })
            .catch((err) => {
              if (
                colorSig !== this.lastTunnelPropColorSig ||
                propSig !== this.lastLayerPropSig ||
                layerCount !== this.lastLayerCount
              )
                return;
              console.error(`Failed to load layer ${i} prop textures:`, err);
              this.additionalLayerTexturesLoading[i] = false;
              this.publishAdditionalLayerTextureStatus(props, layerCount);
            });
        }
      }
    }

    this.publishAdditionalLayerTextureStatus(props, layerCount);

    const baseColorSig = baseColors
      ? `${baseColors.left}:${baseColors.right}`
      : "";
    if (baseColorSig !== this.lastBasePropColorSig) {
      this.lastBasePropColorSig = baseColorSig;
      this.animationRenderer?.prepareLeftPropCrossfade();
      this.animationRenderer?.prepareRightPropCrossfade();
      void this.loadPropTextures(state, darkMode, baseColors).then(() => {
        if (baseColorSig !== this.lastBasePropColorSig) return;
        this.animationRenderer?.startLeftPropCrossfade();
        this.animationRenderer?.startRightPropCrossfade();
        this.triggerRenderWithLatestFrame(state);
      });
    }
  }

  private publishAdditionalLayerTextureStatus(
    props: AnimationEngineProps,
    requested: number
  ): void {
    if (!props.onAdditionalLayerTextureStatusChange) return;
    const status: AdditionalLayerTextureStatus = {
      requested,
      loaded: this.additionalLayerTexturesLoaded.filter(Boolean).length,
      loading: this.additionalLayerTexturesLoading.filter(Boolean).length,
    };
    props.onAdditionalLayerTextureStatusChange(status);
  }

  /**
   * Canonical per-layer staff colors, shared by the live load path
   * (handleAdditionalLayers) and the export preload so both color the
   * kaleidoscope identically. Colors each layer sprite through the same
   * selective SVG pipeline the base pair uses (gold sword blade preserved, only
   * the hardware takes the hue). propIndex convention: layer blue = 2+2i,
   * red = 3+2i.
   *
   * Spectrum off: every layer staff matches the base pair exactly — the native
   * blue/red SVG (getBaseMotionColors), NOT tunnelPropColor's anchor (the anchor
   * blue is a touch more violet, which read as "one odd staff" against the
   * native base), so all four blues (and reds) are identical.
   */
  private additionalLayerColors(
    layerIndex: number,
    layerCount: number,
    spectrum: boolean,
    exactColors: TunnelPropColorPair | null = null
  ): { left: string; right: string } {
    if (exactColors) return tunnelPerformerPair(exactColors, layerIndex + 1);
    const baseColors = spectrum ? null : getBaseMotionColors();
    return {
      left: baseColors
        ? baseColors.left
        : tunnelPropColor(2 + layerIndex * 2, layerCount).hex,
      right: baseColors
        ? baseColors.right
        : tunnelPropColor(3 + layerIndex * 2, layerCount).hex,
    };
  }

  private triggerRenderWithLatestFrame(state: AnimatorState): void {
    if (!state.isInitialized || !this.latestFrameParamsProvider) return;
    this.renderLoopService?.triggerRender(this.latestFrameParamsProvider);
  }

  /**
   * Pre-load every additional-layer prop texture up front and await them. The
   * offscreen export engine is driven only through renderFrame() and never runs
   * PlaybackSync.update → handleAdditionalLayers, so the per-layer images would
   * otherwise stay null and the renderer would skip the kaleidoscope copies
   * (canvas-2d-animation-renderer getAdditionalLayerImages) — the export showing
   * only the base pair. Deterministic: every load resolves before frame 0.
   */
  async preloadAdditionalLayerTextures(
    layerCount: number,
    spectrum: boolean,
    propType: string,
    perLayerTypes?: ReadonlyArray<{ left: string; right: string }>,
    exactColors: TunnelPropColorPair | null = null
  ): Promise<void> {
    if (layerCount <= 0 || !this.animationRenderer) return;
    this.lastLayerCount = layerCount;
    this.lastSpectrum = spectrum;
    // Reset the prop-type signature so the next live handleAdditionalLayers pass
    // re-evaluates against the freshly-preloaded sprites.
    this.lastLayerPropSig = "";
    this.additionalLayerTexturesLoaded = [];
    this.additionalLayerTexturesLoading = [];
    await Promise.all(
      Array.from({ length: layerCount }, (_, i) => {
        const { left, right } = this.additionalLayerColors(
          i,
          layerCount,
          spectrum,
          exactColors
        );
        // Per-performer prop types when supplied (Performer Set export); else the
        // single global prop for both hands — today's export behavior, unchanged.
        const t = perLayerTypes?.[i];
        const leftType = t?.left ?? propType;
        const rightType = t?.right ?? propType;
        return this.animationRenderer!.loadAdditionalLayerPropTextures(
          i,
          resolveFanRenderKey(leftType, this.fanAppearance),
          resolveFanRenderKey(rightType, this.fanAppearance),
          left,
          right
        ).then(() => {
          this.additionalLayerTexturesLoaded[i] = true;
        });
      })
    );
  }

  /**
   * Load prop textures (used by both override and settings paths).
   */
  async loadPropTextures(
    state: AnimatorState,
    prevDarkMode: boolean,
    colors?: TunnelPropColorPair | null
  ): Promise<void> {
    if (!this.propTextureService) return;

    // Use overrides if set, otherwise read from settings
    let leftPropType = state.currentLeftPropType;
    let rightPropType = state.currentRightPropType;
    let appearance = this.fanAppearance;
    let look = this.propLook;

    if (
      this.propTypeOverrideLeft != null ||
      this.propTypeOverrideRight != null
    ) {
      // Use overrides - bypass settings entirely
      leftPropType = this.propTypeOverrideLeft ?? "staff";
      rightPropType = this.propTypeOverrideRight ?? "staff";
    } else if (this.settingsService?.currentSettings) {
      // No overrides - read from settings
      const settings = this.settingsService.currentSettings;
      leftPropType = settings.leftPropType || settings.propType || "staff";
      rightPropType = settings.rightPropType || settings.propType || "staff";
      appearance = normalizeFanAppearance(settings.fanAppearance);
      look = normalizePropLook(settings.propArtwork);

      // Also update engine state to keep it in sync
      state.setLeftPropType(leftPropType);
      state.setRightPropType(rightPropType);
      state.setLegacyPropType(leftPropType);
    }

    this.fanAppearance = appearance;
    this.propLook = look;

    // Pass dark mode state for prop color selection
    // This allows preview isolation - local preview dark mode instead of global
    const effectiveColors =
      colors === undefined ? this.currentBaseColors : colors;
    this.currentBaseColors = effectiveColors;
    const leftRenderType = this.baseRenderKey(
      leftPropType,
      appearance,
      look,
      effectiveColors
    );
    const rightRenderType = this.baseRenderKey(
      rightPropType,
      appearance,
      look,
      effectiveColors
    );
    this.renderPropTypeLeft = leftRenderType;
    this.renderPropTypeRight = rightRenderType;
    if (colors !== undefined) {
      this.lastBasePropColorSig = effectiveColors
        ? `${effectiveColors.left}:${effectiveColors.right}`
        : "";
    }
    await this.propTextureService.loadPropTextures(
      leftRenderType,
      rightRenderType,
      prevDarkMode,
      effectiveColors
    );

    // CRITICAL: Sync dimensions to engine state immediately after loading
    // This ensures getFrameParams() has correct dimensions for the first render
    state.setLeftPropDimensions(this.propTextureService.state.leftDimensions);
    state.setRightPropDimensions(this.propTextureService.state.rightDimensions);

    // CRITICAL: Clear animation path caches when prop types/dimensions change
    // The path cache uses prop dimensions for endpoint calculations - stale cache = wrong trails
    this.precomputationService?.clearCaches();
  }
}
