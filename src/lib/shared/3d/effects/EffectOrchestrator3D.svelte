<script lang="ts">
  import { getQualityTierDetector } from "$lib/shared/3d/effects/quality/get-quality-tier-detector";
  import { tryGetAdaptiveQualityContext } from "../context/adaptive-quality-context";
  /**
   * Central coordinator that reads TipEffectMap assignments and routes each
   * prop tip to the correct 3D renderer. Sits between the animation system
   * (which provides PropState3D per frame) and the visual effect components
   * (Trail3D, and eventually Fire3D, LED3D, etc.).
   *
   * Renders in rig-local space: receives hand positions and prop states,
   * computes rig-local tip positions via TipPositionBridge3D, and adds
   * imperative meshes to an effectsParentRef (a T.Group inside the rig).
   *
   * Each frame it:
   *   1. Computes rig-local center for each prop (handPos + propState.worldPosition)
   *   2. Feeds prop states through TipPositionBridge3D to get rig-local tip positions
   *   3. Resolves which effect each tip is assigned via resolveEffect()
   *   4. Passes tip positions to the appropriate renderer components
   */

  import { useThrelte, useTask } from "@threlte/core";
  import { onDestroy } from "svelte";
  import { tryGetViewer3DContext } from "../context/viewer-3d-context";
  import { Vector3, Object3D, Matrix3, type Camera } from "three";
  import Trail3D from "./trails/Trail3D.svelte";
  import EffectsLayer from "./EffectsLayer.svelte";
  import { LedRenderer3D, type LedTipInput } from "./led/led-renderer-3d";
  import {
    MOON_FAN_LED_COUNT,
    MoonFanDiffuserRenderer3D,
  } from "./led/moon-fan-diffuser-renderer-3d";
  import {
    CharcoalRenderer3D,
    type CharcoalTipInput,
  } from "./charcoal/charcoal-renderer-3d";
  import { FireRenderer3D, type FireTipInput } from "./fire/fire-renderer-3d";
  import {
    resolveRigLocalPropCenter3D,
    resolveTrailSources3D,
    TipPositionBridge3D,
    type TrailSourceId3D,
  } from "./tip-position-bridge-3d";
  import { resolvePropTipAnchors3D } from "./prop-tip-geometry-3d";
  import {
    PovStripRenderer3D,
    shutterToPovPersistence,
  } from "./poi/pov-strip-renderer-3d";
  import type { StripPattern } from "$lib/shared/poi/domain/strip-pattern";
  import { animationSettings } from "$lib/shared/animation-engine/state/animation-settings-state.svelte";
  import {
    resolveEffect,
    type TipEffectMap,
    type EffectType,
  } from "$lib/shared/animation-engine/domain/types/tip-effect-types";
  import { type QualityTier, type TipPositionData3D } from "./types";
  import {
    PROP_COLORS,
    PropType,
    propFinishState,
    userProportionsState,
    type PropState3D,
    type PropBuild,
  } from "@austencloud/scene-3d";
  import { getEffectsConfigContext } from "$lib/shared/effects/state/effects-config-context";
  import { getSettings } from "$lib/shared/application/state/app-state.svelte";
  import { resolveTrailColors } from "$lib/shared/animation-engine/domain/resolve-trail-colors";
  import { createEffectsConfigState } from "$lib/shared/effects/state/effects-config-state.svelte";
  import {
    resolveTrails3D,
    resolveLed3D,
    resolveFire3D,
    resolveCharcoal3D,
    resolveSparkles3D,
    resolveGoo3D,
    resolveBubbles3D,
    resolvePetals3D,
    resolveSmoke3D,
    resolveInk3D,
    resolveSilk3D,
    resolveAnimal3D,
    resolvePulse3D,
    resolveBloom3D,
  } from "$lib/shared/effects/translators/webgl3d-translator";
  import { LedPatternMaterializer } from "$lib/shared/animation-engine/services/led/led-pattern-materializer";
  import { patternFrameIndex } from "$lib/shared/animation-engine/services/led-sampler";
  import { getPixel } from "$lib/shared/poi/domain/strip-pattern";
  import { ledBrightnessToFloat } from "$lib/shared/animation-engine/domain/types/led-types";
  import { getSceneEffectsContext } from "./scene-effects/scene-effects-context";
  import type { SceneEffectsManager3D } from "./scene-effects/scene-effects-manager-3d";
  import type {
    SceneEffectRigFrame3D,
    SceneEffectTipSource3D,
  } from "./scene-effects/scene-effect-source-3d";

  interface TrailDatum {
    sourceId: TrailSourceId3D;
    position: Vector3;
    effect: EffectType;
  }

  function hexToRgb(hex: string): { r: number; g: number; b: number } {
    const clean = hex.replace("#", "");
    const bigint = parseInt(clean, 16);
    return {
      r: ((bigint >> 16) & 255) / 255,
      g: ((bigint >> 8) & 255) / 255,
      b: (bigint & 255) / 255,
    };
  }

  interface Props {
    leftPropState: PropState3D | null;
    rightPropState: PropState3D | null;
    leftPropType?: PropType;
    rightPropType?: PropType;
    isPlaying: boolean;
    staffHalfLength?: number;
    propBuild?: PropBuild;
    /**
     * Fractional animation step index. Only Ghost (inside EffectsLayer) reads
     * it — it needs step onsets to know when to capture a phantom. Rigs that
     * don't plumb it leave Ghost silent rather than capturing at step 0 every
     * frame.
     */
    currentStep?: number;
    /** Sequence seam metadata for persistence effects such as Ghost. */
    totalSteps?: number;
    seamlesslyLoopable?: boolean;
    tipEffectMap?: TipEffectMap;
    globalTipEffectMap?: TipEffectMap;
    /** Rig-local hand position for blue prop (from PerformerRig HandAnchor). y is always 0. */
    leftHandPos?: { x: number; z: number };
    /** Rig-local hand position for red prop (from PerformerRig HandAnchor). y is always 0. */
    rightHandPos?: { x: number; z: number };
    /** Parent Object3D to add imperative meshes to (rig group). Falls back to scene root. */
    effectsParentRef?: Object3D;
    /** Explicit manager for viewers that lazy-load the effects runtime. */
    sceneEffectsManagerOverride?: SceneEffectsManager3D | null;
    /** A host may cap the existing effect budget for a large directed cast. */
    qualityTierOverride?: QualityTier;
    /**
     * @deprecated Ignored - trail parameters now come from EffectsConfigState
     * via context. Left in place so parent components don't break; removed
     * in Phase B when callers migrate.
     */
    trailConfig?: {
      color?: string;
      width?: number;
      opacity?: number;
      maxPoints?: number;
      rainbow?: boolean;
    };
  }

  let {
    leftPropState,
    rightPropState,
    leftPropType = PropType.STAFF,
    rightPropType = PropType.STAFF,
    isPlaying,
    staffHalfLength = 0.5,
    propBuild: propBuildOverride,
    currentStep = 0,
    totalSteps = 0,
    seamlesslyLoopable = false,
    tipEffectMap,
    globalTipEffectMap = {},
    leftHandPos = { x: 0, z: 0 },
    rightHandPos = { x: 0, z: 0 },
    effectsParentRef,
    sceneEffectsManagerOverride = null,
    qualityTierOverride,
    trailConfig = {},
  }: Props = $props();

  const propBuild = $derived(propBuildOverride ?? propFinishState.build);

  const { scene, camera } = useThrelte();
  const qualityTierDetector = getQualityTierDetector();
  const adaptiveQuality = tryGetAdaptiveQualityContext();
  const qualityTier = $derived(
    qualityTierOverride ??
      adaptiveQuality?.tier ??
      qualityTierDetector.currentTier
  );
  const tipBridge = new TipPositionBridge3D();

  /**
   * The effect slots each prop actually presents: two for a staff, one for a
   * club. Iterating a hardcoded four would light effects for ends that do not
   * exist on the prop in hand.
   */
  const leftTipSlots = $derived(
    resolvePropTipAnchors3D(leftPropType, staffHalfLength, propBuild).map(
      (anchor) => anchor.effectTipIndex
    )
  );
  const rightTipSlots = $derived(
    resolvePropTipAnchors3D(rightPropType, staffHalfLength, propBuild).map(
      (anchor) => anchor.effectTipIndex
    )
  );

  /**
   * The effects this rig's live tips actually resolve to, for EffectsLayer.
   *
   * Same resolveEffect() and same maps the imperative renderers use below, so
   * the Svelte-mounted effects and the imperative ones can never disagree about
   * which effect is selected. Deduplicated because EffectsLayer gates per
   * effect, not per tip.
   */
  const layerActiveEffects = $derived([
    ...new Set([
      ...leftTipSlots.map((tipIndex) =>
        resolveEffect(0, tipIndex, tipEffectMap, globalTipEffectMap ?? {})
      ),
      ...rightTipSlots.map((tipIndex) =>
        resolveEffect(1, tipIndex, tipEffectMap, globalTipEffectMap ?? {})
      ),
    ]),
  ]);

  // Brighter HDR core on capable tiers so the scene bloom pass makes trails
  // glow (presence). LOW keeps the additive Gaussian halo alone - no bloom
  // there, so over-driving emissive would just clip to white.
  const trailTierBoost = $derived(
    qualityTier === "high" ? 1.6 : qualityTier === "medium" ? 1.3 : 1.0
  );

  // Canonical effect config - read from context, or create a default-seeded
  // local state as a fallback so this component still works when mounted
  // outside a viewer that sets the context explicitly.
  const effectsState = getEffectsConfigContext() ?? createEffectsConfigState();
  const sceneEffectsManager =
    sceneEffectsManagerOverride ?? getSceneEffectsContext();

  // Resolved intent objects only change when their config does. Keeping them
  // derived avoids allocating ten spread objects per rig on every frame.
  const resolvedSparkles = $derived(resolveSparkles3D(effectsState.sparkles));
  const resolvedGoo = $derived(resolveGoo3D(effectsState.goo));
  const resolvedBubbles = $derived(resolveBubbles3D(effectsState.bubbles));
  const resolvedPetals = $derived(resolvePetals3D(effectsState.petals));
  const resolvedSmoke = $derived(resolveSmoke3D(effectsState.smoke));
  const resolvedInk = $derived(resolveInk3D(effectsState.ink));
  const resolvedSilk = $derived(resolveSilk3D(effectsState.silk));
  const resolvedAnimal = $derived(resolveAnimal3D(effectsState.animal));
  const resolvedPulse = $derived(resolvePulse3D(effectsState.pulse));
  const resolvedBloom = $derived(resolveBloom3D(effectsState.bloom));
  const resolvedFire = $derived(resolveFire3D(effectsState.fire));
  const resolvedCharcoal = $derived(resolveCharcoal3D(effectsState.charcoal));

  const pooledFrame: SceneEffectRigFrame3D = { playing: false, sources: [] };
  const pooledSources: Array<SceneEffectTipSource3D | null> = [
    null,
    null,
    null,
    null,
  ];
  const pooledRegistration =
    sceneEffectsManager?.registerRig(pooledFrame) ?? null;
  const pooledPosition = new Vector3();
  const pooledVelocity = new Vector3();
  const pooledLinearTransform = new Matrix3();
  let leftEffectTips = $state.raw<readonly TipPositionData3D[]>([]);
  let rightEffectTips = $state.raw<readonly TipPositionData3D[]>([]);

  function publishPooledTip(
    propIndex: 0 | 1,
    tipIndex: 0 | 1,
    tip: TipPositionData3D,
    effect: EffectType
  ): void {
    if (!pooledRegistration) return;
    if (
      effect !== "sparkles" &&
      effect !== "goo" &&
      effect !== "bubbles" &&
      effect !== "petals" &&
      effect !== "smoke" &&
      effect !== "ink" &&
      effect !== "silk" &&
      effect !== "animal" &&
      effect !== "pulse" &&
      effect !== "bloom" &&
      effect !== "fire" &&
      effect !== "charcoal"
    )
      return;

    const slot = propIndex * 2 + tipIndex;
    let source = pooledSources[slot];
    if (!source || source.effect !== effect) {
      const base = {
        sourceId: pooledRegistration.sourceIdBase + slot,
        propIndex,
        tipIndex,
        position: { x: 0, y: 0, z: 0 },
        velocity: { x: 0, y: 0, z: 0 },
        speed: 0,
        currentStep,
        totalSteps,
        seamlesslyLoopable,
        propColor:
          propIndex === 0 ? PROP_COLORS.blue.main : PROP_COLORS.red.main,
      };
      switch (effect) {
        case "sparkles":
          source = { ...base, effect, params: resolvedSparkles };
          break;
        case "goo":
          source = { ...base, effect, params: resolvedGoo };
          break;
        case "bubbles":
          source = {
            ...base,
            effect,
            params: resolvedBubbles,
            qualityTier,
          };
          break;
        case "petals":
          source = { ...base, effect, params: resolvedPetals };
          break;
        case "smoke":
          source = {
            ...base,
            effect,
            params: resolvedSmoke,
            qualityTier,
          };
          break;
        case "ink":
          source = { ...base, effect, params: resolvedInk };
          break;
        case "silk":
          source = { ...base, effect, params: resolvedSilk };
          break;
        case "animal":
          source = { ...base, effect, params: resolvedAnimal };
          break;
        case "pulse":
          source = { ...base, effect, params: resolvedPulse };
          break;
        case "bloom":
          source = {
            ...base,
            effect,
            params: resolvedBloom,
            qualityTier,
          };
          break;
        case "fire":
          source = {
            ...base,
            effect,
            params: resolvedFire,
            qualityTier,
            jerk: 0,
          };
          break;
        case "charcoal":
          source = {
            ...base,
            effect,
            params: resolvedCharcoal,
            qualityTier,
            jerk: 0,
            totalSteps,
            collisionFloorY: userProportionsState.groundY,
          };
          break;
      }
      pooledSources[slot] = source;
    }

    switch (source.effect) {
      case "sparkles":
        source.params = resolvedSparkles;
        break;
      case "goo":
        source.params = resolvedGoo;
        break;
      case "bubbles":
        source.params = resolvedBubbles;
        source.qualityTier = qualityTier;
        break;
      case "petals":
        source.params = resolvedPetals;
        break;
      case "smoke":
        source.params = resolvedSmoke;
        source.qualityTier = qualityTier;
        break;
      case "ink":
        source.params = resolvedInk;
        break;
      case "silk":
        source.params = resolvedSilk;
        break;
      case "animal":
        source.params = resolvedAnimal;
        break;
      case "pulse":
        source.params = resolvedPulse;
        break;
      case "bloom":
        source.params = resolvedBloom;
        source.qualityTier = qualityTier;
        break;
      case "fire":
        source.params = resolvedFire;
        source.qualityTier = qualityTier;
        source.jerk = Math.hypot(tip.jerk.x, tip.jerk.y, tip.jerk.z);
        break;
      case "charcoal":
        source.params = resolvedCharcoal;
        source.qualityTier = qualityTier;
        source.jerk = Math.hypot(tip.jerk.x, tip.jerk.y, tip.jerk.z);
        source.totalSteps = totalSteps;
        pooledPosition.set(0, userProportionsState.groundY, 0);
        if (effectsParentRef) effectsParentRef.localToWorld(pooledPosition);
        source.collisionFloorY = pooledPosition.y;
        break;
    }

    pooledPosition.set(tip.position.x, tip.position.y, tip.position.z);
    pooledVelocity.set(tip.velocity.x, tip.velocity.y, tip.velocity.z);
    if (effectsParentRef) {
      effectsParentRef.localToWorld(pooledPosition);
      pooledVelocity.applyMatrix3(pooledLinearTransform);
    }
    source.position.x = pooledPosition.x;
    source.position.y = pooledPosition.y;
    source.position.z = pooledPosition.z;
    source.velocity.x = pooledVelocity.x;
    source.velocity.y = pooledVelocity.y;
    source.velocity.z = pooledVelocity.z;
    source.speed = pooledVelocity.length();
    source.currentStep = currentStep;
    source.totalSteps = totalSteps;
    source.seamlesslyLoopable = seamlesslyLoopable;
    source.propColor =
      propIndex === 0 ? PROP_COLORS.blue.main : PROP_COLORS.red.main;
    pooledFrame.sources.push(source);
  }

  // LED renderers managed directly (bypasses Svelte prop propagation timing)
  let leftLedRenderer: LedRenderer3D | null = null;
  let rightLedRenderer: LedRenderer3D | null = null;
  let leftMoonDiffuser: MoonFanDiffuserRenderer3D | null = null;
  let rightMoonDiffuser: MoonFanDiffuserRenderer3D | null = null;

  // Charcoal renderer (single instance - all tips share one particle pool)
  let charcoalRenderer: CharcoalRenderer3D | null = null;

  // Fire renderer (single instance - all tips share one particle pool)
  let fireRenderer: FireRenderer3D | null = null;

  // POV strip renderers - the pixel-staff device's renderer
  let leftPovRenderer: PovStripRenderer3D | null = null;
  let rightPovRenderer: PovStripRenderer3D | null = null;
  let rendererQualityTier = qualityTier;

  function syncRendererQuality(parent: Object3D): void {
    const nextTier = qualityTier;
    if (nextTier === rendererQualityTier) return;

    leftLedRenderer?.setQualityTier(nextTier);
    rightLedRenderer?.setQualityTier(nextTier);

    if (leftPovRenderer) {
      leftPovRenderer.setQualityTier(nextTier);
      leftPovRenderer.initialize(parent);
    }
    if (rightPovRenderer) {
      rightPovRenderer.setQualityTier(nextTier);
      rightPovRenderer.initialize(parent);
    }

    if (charcoalRenderer) {
      charcoalRenderer.dispose();
      charcoalRenderer = new CharcoalRenderer3D(nextTier);
      charcoalRenderer.initialize(parent);
    }
    if (fireRenderer) {
      fireRenderer.dispose();
      fireRenderer = new FireRenderer3D(nextTier);
      fireRenderer.initialize(parent);
    }

    rendererQualityTier = nextTier;
  }

  /**
   * Tear down every LED renderer when the simulated device changes. The
   * device decides which family is live (capsule -> ribbon, pixel staff ->
   * POV) and a pixel staff's LED count decides the POV instance buffers, so
   * both are rebuilt from scratch rather than reconfigured in place.
   */
  function syncLedDevice(kind: string, ledCount: number): void {
    const key = `${kind}:${ledCount}`;
    if (key === _ledDeviceKey) return;
    const previousKey = _ledDeviceKey;
    _ledDeviceKey = key;

    // Capsule renderers and their ribbon buffers stay warm across device
    // switches. POV buffers depend on the authored LED count, so only that
    // family is rebuilt when its capacity actually changes.
    leftLedRenderer?.reset();
    rightLedRenderer?.reset();
    if (previousKey && previousKey !== key) {
      leftPovRenderer?.dispose();
      leftPovRenderer = null;
      rightPovRenderer?.dispose();
      rightPovRenderer = null;
    }
    _ledPrevPositions.clear();
  }

  /**
   * Drive one prop's pixel staff. The strip spans the same shaft the ribbon
   * renderer lights on a capsule, so both devices sit on the identical prop
   * attachment.
   *
   * A two-ended prop spans tip to tip. A single-ended prop (club, sword, fan)
   * has no second end, so the strip runs from the hand to its one tip rather
   * than mirroring itself into empty air behind the grip.
   */
  function updatePixelStaff(
    renderer: PovStripRenderer3D,
    tips: readonly TipPositionData3D[],
    rigLocalCenter: { x: number; y: number; z: number },
    pattern: StripPattern,
    frameIndex: number,
    cam: Camera,
    now: number,
    brightness: number
  ): void {
    const leftTip = tips.find((tip) => tip.tipIndex === 0);
    const rightTip = tips.find((tip) => tip.tipIndex === 1);
    const first = leftTip?.position ?? rigLocalCenter;
    const last = rightTip?.position ?? leftTip?.position;
    if (!last) {
      renderer.reset();
      return;
    }

    _staffAxis.set(last.x - first.x, last.y - first.y, last.z - first.z);
    const span = _staffAxis.length();
    if (span < 1e-6) {
      renderer.reset();
      return;
    }
    _staffAxis.multiplyScalar(1 / span);
    _staffCenter.set(
      (first.x + last.x) / 2,
      (first.y + last.y) / 2,
      (first.z + last.z) / 2
    );

    renderer.update(
      _staffAxis,
      _staffCenter,
      span / 2,
      frameIndex,
      pattern,
      cam,
      now,
      brightness
    );
  }

  // Reusable vectors for staff axis computation
  const _staffAxis = new Vector3();
  const _staffCenter = new Vector3();

  // The 3D viewer reads the same materialized strip pattern the 2D sampler
  // uses, so both backends paint identical colors from one cache. A capsule
  // lights the two tracked shaft ends through the ribbon renderer; a pixel
  // staff spans the shaft through the POV renderer.
  const _ledPattern = new LedPatternMaterializer();

  // Which device the live renderers were built for. A change disposes both
  // renderer families so only the device's own meshes exist afterwards.
  let _ledDeviceKey = "";

  // Previous-frame tip position cache for LED sub-frame supersampling.
  // At 60fps a fast-moving LED covers ~12cm per frame, which looks like
  // a string of widely-spaced dots. Interpolating N points per real frame
  // between prev→current gives an effective 60·N Hz sample rate that
  // reads as a continuous glowing arc, matching how real LEDs look to
  // the human eye (persistence of vision integrates continuous emission).
  // Keyed by `${propIndex}-${tipIndex}`. Cleared on playback reset.
  const _ledPrevPositions = new Map<string, Vector3>();

  // Supersample count per quality tier. Higher = smoother fast motion at
  // the cost of more instances drawn per frame. At HIGH, 4 staff tips × 8
  // supersamples = 32 active LED instances per frame, well within budget.
  const LED_SUPERSAMPLE_BY_TIER: Record<string, number> = {
    high: 8,
    medium: 4,
    low: 1,
  };

  // Trail sources are selected from the canonical tracking mode each frame.
  // Stable source IDs prevent a mode switch from connecting two unrelated paths.
  let leftTrailData = $state<TrailDatum[]>([]);
  let rightTrailData = $state<TrailDatum[]>([]);

  function getTrailData(
    propIndex: number,
    tips: readonly TipPositionData3D[],
    propCenter: { x: number; y: number; z: number }
  ): TrailDatum[] {
    return resolveTrailSources3D(
      animationSettings.trail.trackingMode,
      tips,
      propCenter
    ).map((source) => ({
      sourceId: source.sourceId,
      position: new Vector3(
        source.position.x,
        source.position.y,
        source.position.z
      ),
      effect: resolveEffect(
        propIndex,
        source.effectTipIndex,
        tipEffectMap,
        globalTipEffectMap ?? {}
      ),
    }));
  }

  // Mutable arrays for effect tips - updated directly in useTask, read by
  // renderers in the SAME frame tick (bypasses Svelte's batched prop updates).
  const leftLedTips: LedTipInput[] = [];
  const rightLedTips: LedTipInput[] = [];
  const moonLedColors = Array.from({ length: MOON_FAN_LED_COUNT }, () => ({
    r: 0,
    g: 0,
    b: 0,
  }));
  const charcoalTips: CharcoalTipInput[] = [];
  const fireTips: FireTipInput[] = [];
  let interactiveRenderersPrepared = false;

  function prepareInteractiveRenderers(
    parent: Object3D,
    ledDeviceKind: string,
    ledCount: number
  ): void {
    if (!interactiveRenderersPrepared) {
      leftLedRenderer = new LedRenderer3D(qualityTier);
      rightLedRenderer = new LedRenderer3D(qualityTier);
      leftLedRenderer.initialize(parent);
      rightLedRenderer.initialize(parent);
      leftLedRenderer.primeTipCapacity(2);
      rightLedRenderer.primeTipCapacity(2);
      leftMoonDiffuser = new MoonFanDiffuserRenderer3D();
      rightMoonDiffuser = new MoonFanDiffuserRenderer3D();
      leftMoonDiffuser.initialize(parent);
      rightMoonDiffuser.initialize(parent);
      interactiveRenderersPrepared = true;
    }
    if (ledDeviceKind === "pixel-staff" && !leftPovRenderer) {
      leftPovRenderer = new PovStripRenderer3D(qualityTier, ledCount);
      rightPovRenderer = new PovStripRenderer3D(qualityTier, ledCount);
      leftPovRenderer.initialize(parent);
      rightPovRenderer.initialize(parent);
    }
  }

  // Viewer3D context for offline export gating - null when rendered outside
  // the sequence viewer (museum, realm).
  const _viewer3DCtx = tryGetViewer3DContext();

  /**
   * Core per-frame effect update logic. Extracted from useTask so the
   * offline exporter can call it with a deterministic dt.
   */
  function updateEffectsFrame(delta: number): void {
    pooledFrame.playing = isPlaying;
    pooledFrame.sources.length = 0;
    if (!isPlaying) {
      tipBridge.reset();
      leftEffectTips = [];
      rightEffectTips = [];
      leftLedRenderer?.reset();
      rightLedRenderer?.reset();
      leftPovRenderer?.reset();
      rightPovRenderer?.reset();
      charcoalRenderer?.reset();
      fireRenderer?.reset();
      // Drop the LED prev-position cache so resume/scrub doesn't draw an
      // 8-sample bridge from the stale pre-pause position to the new one.
      _ledPrevPositions.clear();
    }

    const resolvedLed = resolveLed3D(effectsState.led);
    // Fire's Color slider tints toward the physical staff color — the hand
    // colors the props are painted in, independent of the LED effect's color
    // mode (the blue/redBaseColor above are LED-derived and would leak LED
    // hues onto the flame, e.g. green when LED is unified).
    const firePropLeft = hexToRgb(PROP_COLORS.blue.main);
    const firePropRight = hexToRgb(PROP_COLORS.red.main);

    // The 2D sampler is handed the rAF timestamp, so reading the same clock
    // here (not a mount-relative one) puts both backends on the same frame of
    // the same loop at the same instant. performance.now() never resets, so
    // the pattern still runs continuously across play/pause and sequence
    // changes.
    const ledElapsedMs = performance.now();
    // Brightness is stored as a discrete 1-5 level and needs to be mapped
    // to the 0.2-1.0 alpha multiplier the shader expects. The 2D side
    // calls the same helper so both backends track the slider identically.
    const ledBrightness = ledBrightnessToFloat(resolvedLed.look.brightness);
    const ledCount = Math.max(1, Math.round(resolvedLed.device.ledCount));
    const usePixelStaff = resolvedLed.device.kind === "pixel-staff";
    syncLedDevice(resolvedLed.device.kind, ledCount);
    const ledStrip = _ledPattern.resolve(resolvedLed.pattern, ledCount);
    const ledFrame = ledStrip
      ? patternFrameIndex(
          ledElapsedMs,
          resolvedLed.cycleDuration,
          ledStrip.frameCount
        )
      : 0;
    /** Strip color for one shaft end, normalized to 0-1. Black while an
     *  image pattern is still loading. */
    const ledColorAt = (ledIndex: number) => {
      if (!ledStrip) return { r: 0, g: 0, b: 0 };
      const c = getPixel(ledStrip, ledFrame, ledIndex % ledStrip.ledCount);
      return { r: c.r / 255, g: c.g / 255, b: c.b / 255 };
    };
    const moonStrip = _ledPattern.resolve(
      resolvedLed.pattern,
      MOON_FAN_LED_COUNT
    );
    const moonFrame = moonStrip
      ? patternFrameIndex(
          ledElapsedMs,
          resolvedLed.cycleDuration,
          moonStrip.frameCount
        )
      : 0;
    const moonColorAt = (ledIndex: number) => {
      if (!moonStrip) return { r: 0, g: 0, b: 0 };
      const c = getPixel(moonStrip, moonFrame, ledIndex % moonStrip.ledCount);
      return { r: c.r / 255, g: c.g / 255, b: c.b / 255 };
    };
    if (moonStrip) {
      for (let index = 0; index < MOON_FAN_LED_COUNT; index++) {
        const pixel = getPixel(moonStrip, moonFrame, index);
        const color = moonLedColors[index]!;
        color.r = pixel.r / 255;
        color.g = pixel.g / 255;
        color.b = pixel.b / 255;
      }
    }
    const ledSupersampleCount = LED_SUPERSAMPLE_BY_TIER[qualityTier] ?? 4;

    /**
     * Push N interpolated LED samples between the previous-frame tip position
     * and the current-frame tip position into the given output array. On the
     * first frame (no prev) we just push a single sample at the current
     * position. All samples share the same pattern-evaluated color and the
     * same velocity, since they all represent points along a single motion
     * arc within a single frame.
     */
    function pushSupersampledLed(
      out: LedTipInput[],
      key: string,
      current: { x: number; y: number; z: number },
      velocity: { x: number; y: number; z: number },
      speed: number,
      r: number,
      g: number,
      b: number,
      sampleCount = ledSupersampleCount
    ): void {
      const prev = _ledPrevPositions.get(key);
      const N = sampleCount;
      if (!prev || N <= 1) {
        out.push({
          position: new Vector3(current.x, current.y, current.z),
          r,
          g,
          b,
          brightness: ledBrightness,
          velocityX: velocity.x,
          velocityY: velocity.y,
          velocityZ: velocity.z,
          speed,
        });
      } else {
        // Emit N samples at t = 1/N, 2/N, …, N/N so the final sample is
        // exactly the current position (keeps the leading-edge LED where
        // the physics sim says it should be).
        for (let i = 1; i <= N; i++) {
          const t = i / N;
          const x = prev.x + (current.x - prev.x) * t;
          const y = prev.y + (current.y - prev.y) * t;
          const z = prev.z + (current.z - prev.z) * t;
          out.push({
            position: new Vector3(x, y, z),
            r,
            g,
            b,
            brightness: ledBrightness,
            velocityX: velocity.x,
            velocityY: velocity.y,
            velocityZ: velocity.z,
            speed,
          });
        }
      }
      // Cache current position for next frame's interpolation start point.
      let cached = _ledPrevPositions.get(key);
      if (!cached) {
        cached = new Vector3();
        _ledPrevPositions.set(key, cached);
      }
      cached.set(current.x, current.y, current.z);
    }

    // Use actual frame delta from Threlte's render loop. Clamp to avoid
    // physics explosions after tab-switch or debugger pause (same safeguard
    // as CharcoalRenderer and FireRenderer use internally).
    const dt = Math.min(delta, 1 / 15);
    if (effectsParentRef) {
      effectsParentRef.updateWorldMatrix(true, false);
      pooledLinearTransform.setFromMatrix4(effectsParentRef.matrixWorld);
    }
    leftLedTips.length = 0;
    rightLedTips.length = 0;
    charcoalTips.length = 0;
    fireTips.length = 0;

    // Whether the LED effect is assigned to either end of each prop. A pixel
    // staff needs the assignment but not the per-tip samples: the POV renderer
    // computes its own LED positions along the shaft.
    let leftLedAssigned = false;
    let rightLedAssigned = false;
    const leftIsMoonFan =
      propBuild.fanBuild === "moon" &&
      (leftPropType === PropType.FAN || leftPropType === PropType.BIGFAN);
    const rightIsMoonFan =
      propBuild.fanBuild === "moon" &&
      (rightPropType === PropType.FAN || rightPropType === PropType.BIGFAN);
    const leftUsesPov = usePixelStaff && !leftIsMoonFan;
    const rightUsesPov = usePixelStaff && !rightIsMoonFan;

    // PerformerRig's external compatibility API renders the left prop through
    // bluePropState/blueHandPos and the right through redPropState/redHandPos.
    // Effects must preserve that mapping until the scene package migrates too.
    const visualLeftProp = leftPropState;
    const visualRightProp = rightPropState;

    // Compute rig-local center for each visual prop.
    const leftRigCenter = visualLeftProp
      ? resolveRigLocalPropCenter3D(visualLeftProp.worldPosition, leftHandPos)
      : null;

    const rightRigCenter = visualRightProp
      ? resolveRigLocalPropCenter3D(visualRightProp.worldPosition, rightHandPos)
      : null;

    if (visualLeftProp && leftRigCenter) {
      const result = tipBridge.update(
        0,
        visualLeftProp,
        leftRigCenter,
        staffHalfLength,
        dt,
        leftPropType,
        propBuild
      );
      leftEffectTips = result.tips;
      result.tips.forEach((tip, emitterIndex) => {
        // The tip owns its effect slot. A single-ended prop publishes one tip
        // on slot 1, so the array index is not the slot.
        const tipIndex = tip.tipIndex;
        const resolved = resolveEffect(
          0,
          tipIndex,
          tipEffectMap,
          globalTipEffectMap ?? {}
        );
        // "none" renders nothing - no silent fallback to trails. The default
        // effect comes from the resolved tip map, not an invented value here.
        const effect = resolved;
        publishPooledTip(0, tipIndex, tip, effect);

        if (effect === "led") {
          // Both props run the same pattern on the same clock, exactly as
          // the 2D sampler does, so a two-prop rig reads as one instrument.
          leftLedAssigned = true;
          if (!leftUsesPov) {
            const color = leftIsMoonFan
              ? moonColorAt(
                  Math.round(
                    (emitterIndex / Math.max(1, result.tips.length - 1)) *
                      (MOON_FAN_LED_COUNT - 1)
                  )
                )
              : ledColorAt(tipIndex);
            pushSupersampledLed(
              leftLedTips,
              leftIsMoonFan ? `0-moon-${emitterIndex}` : `0-${tipIndex}`,
              tip.position,
              tip.velocity,
              tip.speed,
              color.r,
              color.g,
              color.b,
              leftIsMoonFan ? 1 : ledSupersampleCount
            );
          }
        } else if (effect === "charcoal" && sceneEffectsManager === null) {
          charcoalTips.push({
            sourceId: tipIndex,
            position: new Vector3(
              tip.position.x,
              tip.position.y,
              tip.position.z
            ),
            velocityX: tip.velocity.x,
            velocityY: tip.velocity.y,
            velocityZ: tip.velocity.z,
            speed: tip.speed,
            jerk:
              tip.jerk.x * tip.jerk.x +
                tip.jerk.y * tip.jerk.y +
                tip.jerk.z * tip.jerk.z >
              0
                ? Math.sqrt(
                    tip.jerk.x * tip.jerk.x +
                      tip.jerk.y * tip.jerk.y +
                      tip.jerk.z * tip.jerk.z
                  )
                : 0,
          });
        } else if (effect === "fire" && sceneEffectsManager === null) {
          fireTips.push({
            position: new Vector3(
              tip.position.x,
              tip.position.y,
              tip.position.z
            ),
            velocityX: tip.velocity.x,
            velocityY: tip.velocity.y,
            velocityZ: tip.velocity.z,
            speed: tip.speed,
            jerk: Math.sqrt(
              tip.jerk.x * tip.jerk.x +
                tip.jerk.y * tip.jerk.y +
                tip.jerk.z * tip.jerk.z
            ),
            propColor: firePropLeft,
          });
        }
      });
      leftTrailData = getTrailData(0, result.tips, leftRigCenter);
    } else {
      leftTrailData = [];
      leftEffectTips = [];
    }

    if (visualRightProp && rightRigCenter) {
      const result = tipBridge.update(
        1,
        visualRightProp,
        rightRigCenter,
        staffHalfLength,
        dt,
        rightPropType,
        propBuild
      );
      rightEffectTips = result.tips;
      result.tips.forEach((tip, emitterIndex) => {
        // The tip owns its effect slot. A single-ended prop publishes one tip
        // on slot 1, so the array index is not the slot.
        const tipIndex = tip.tipIndex;
        const resolved = resolveEffect(
          1,
          tipIndex,
          tipEffectMap,
          globalTipEffectMap ?? {}
        );
        // "none" renders nothing - no silent fallback to trails. The default
        // effect comes from the resolved tip map, not an invented value here.
        const effect = resolved;
        publishPooledTip(1, tipIndex, tip, effect);

        if (effect === "led") {
          rightLedAssigned = true;
          if (!rightUsesPov) {
            const color = rightIsMoonFan
              ? moonColorAt(
                  Math.round(
                    (emitterIndex / Math.max(1, result.tips.length - 1)) *
                      (MOON_FAN_LED_COUNT - 1)
                  )
                )
              : ledColorAt(tipIndex);
            pushSupersampledLed(
              rightLedTips,
              rightIsMoonFan ? `1-moon-${emitterIndex}` : `1-${tipIndex}`,
              tip.position,
              tip.velocity,
              tip.speed,
              color.r,
              color.g,
              color.b,
              rightIsMoonFan ? 1 : ledSupersampleCount
            );
          }
        } else if (effect === "charcoal" && sceneEffectsManager === null) {
          charcoalTips.push({
            sourceId: 2 + tipIndex,
            position: new Vector3(
              tip.position.x,
              tip.position.y,
              tip.position.z
            ),
            velocityX: tip.velocity.x,
            velocityY: tip.velocity.y,
            velocityZ: tip.velocity.z,
            speed: tip.speed,
            jerk:
              tip.jerk.x * tip.jerk.x +
                tip.jerk.y * tip.jerk.y +
                tip.jerk.z * tip.jerk.z >
              0
                ? Math.sqrt(
                    tip.jerk.x * tip.jerk.x +
                      tip.jerk.y * tip.jerk.y +
                      tip.jerk.z * tip.jerk.z
                  )
                : 0,
          });
        } else if (effect === "fire" && sceneEffectsManager === null) {
          fireTips.push({
            position: new Vector3(
              tip.position.x,
              tip.position.y,
              tip.position.z
            ),
            velocityX: tip.velocity.x,
            velocityY: tip.velocity.y,
            velocityZ: tip.velocity.z,
            speed: tip.speed,
            jerk: Math.sqrt(
              tip.jerk.x * tip.jerk.x +
                tip.jerk.y * tip.jerk.y +
                tip.jerk.z * tip.jerk.z
            ),
            propColor: firePropRight,
          });
        }
      });
      rightTrailData = getTrailData(1, result.tips, rightRigCenter);
    } else {
      rightTrailData = [];
      rightEffectTips = [];
    }

    // Determine the parent before the pause gate: LED geometry and ribbon
    // histories must be prepared even when a scene opens on a still frame.
    const cam = camera.current;
    let imperativeParent: Object3D | null = effectsParentRef ?? null;

    if (!imperativeParent && cam) {
      // Walk up to the root Scene object
      let root = cam.parent;
      while (root?.parent) root = root.parent;
      imperativeParent = root;
    }

    if (imperativeParent) {
      prepareInteractiveRenderers(
        imperativeParent,
        resolvedLed.device.kind,
        ledCount
      );
      syncRendererQuality(imperativeParent);
    }

    if (
      moonStrip &&
      leftIsMoonFan &&
      leftLedAssigned &&
      leftRigCenter &&
      visualLeftProp
    ) {
      leftMoonDiffuser?.update({
        propState: visualLeftProp,
        rigLocalCenter: leftRigCenter,
        ledColors: moonLedColors,
        brightness: ledBrightness,
        scale: leftPropType === PropType.BIGFAN ? 1.4 : 1,
      });
    } else {
      leftMoonDiffuser?.reset();
    }
    if (
      moonStrip &&
      rightIsMoonFan &&
      rightLedAssigned &&
      rightRigCenter &&
      visualRightProp
    ) {
      rightMoonDiffuser?.update({
        propState: visualRightProp,
        rigLocalCenter: rightRigCenter,
        ledColors: moonLedColors,
        brightness: ledBrightness,
        scale: rightPropType === PropType.BIGFAN ? 1.4 : 1,
      });
    } else {
      rightMoonDiffuser?.reset();
    }

    // Bloom remains a live optical response while paused. The tip bridge was
    // reset above, so it publishes the current pose with zero motion without
    // inventing a trail across a pause or scrub. Every emitter below freezes.
    if (!isPlaying) return;

    if (imperativeParent) {
      const now = performance.now() / 1000;

      if (usePixelStaff) {
        // Pixel staff: the whole shaft lights, rendered as instanced POV
        // ghosts. One renderer per prop, both reading the shared pattern and
        // the shared clock.
        // The look carries a shutter, not a sprite size: emitter footprint is a
        // photometric quantity the 3D path does not yet derive, so the material
        // keeps its own falloff defaults and only persistence comes from the look.
        const povPersistence = shutterToPovPersistence(
          resolvedLed.look.shutter
        );

        if (ledStrip && leftLedAssigned && leftRigCenter && leftUsesPov) {
          if (!leftPovRenderer) {
            leftPovRenderer = new PovStripRenderer3D(qualityTier, ledCount);
            leftPovRenderer.initialize(imperativeParent);
          }
          leftPovRenderer.setPersistenceDuration(povPersistence);
          updatePixelStaff(
            leftPovRenderer,
            leftEffectTips,
            leftRigCenter,
            ledStrip,
            ledFrame,
            cam!,
            now,
            ledBrightness
          );
        } else {
          leftPovRenderer?.reset();
        }

        if (ledStrip && rightLedAssigned && rightRigCenter && rightUsesPov) {
          if (!rightPovRenderer) {
            rightPovRenderer = new PovStripRenderer3D(qualityTier, ledCount);
            rightPovRenderer.initialize(imperativeParent);
          }
          rightPovRenderer.setPersistenceDuration(povPersistence);
          updatePixelStaff(
            rightPovRenderer,
            rightEffectTips,
            rightRigCenter,
            ledStrip,
            ledFrame,
            cam!,
            now,
            ledBrightness
          );
        } else {
          rightPovRenderer?.reset();
        }

        // Moon fans render their full 78-emitter optical field through the
        // diffuser shader. Generic tip billboards would add five oversized
        // bulbs that do not exist on the physical fan.
        leftLedRenderer?.reset();
        rightLedRenderer?.reset();
      } else {
        if (leftLedTips.length > 0 && !leftIsMoonFan) {
          if (!leftLedRenderer) {
            leftLedRenderer = new LedRenderer3D(qualityTier);
            leftLedRenderer.initialize(imperativeParent);
          }
          leftLedRenderer.update(leftLedTips, cam!, now);
        } else {
          leftLedRenderer?.reset();
        }

        if (rightLedTips.length > 0 && !rightIsMoonFan) {
          if (!rightLedRenderer) {
            rightLedRenderer = new LedRenderer3D(qualityTier);
            rightLedRenderer.initialize(imperativeParent);
          }
          rightLedRenderer.update(rightLedTips, cam!, now);
        } else {
          rightLedRenderer?.reset();
        }
      }

      // Charcoal renderer (single pool for all tips)
      if (charcoalTips.length > 0) {
        if (!charcoalRenderer) {
          charcoalRenderer = new CharcoalRenderer3D(qualityTier);
          charcoalRenderer.initialize(imperativeParent);
        }
        charcoalRenderer.updateConfig(resolveCharcoal3D(effectsState.charcoal));
        charcoalRenderer.update(charcoalTips, dt, {
          currentStep,
          totalSteps,
          // Effects live in PerformerRig-local space. In that space y=0 is
          // shoulder height; the avatar's actual floor is groundY (~-1.56).
          collisionFloorY: userProportionsState.groundY,
        });
      } else {
        charcoalRenderer?.reset();
      }

      // Fire renderer
      if (fireTips.length > 0) {
        if (!fireRenderer) {
          fireRenderer = new FireRenderer3D(qualityTier);
          fireRenderer.initialize(imperativeParent);
        }
        // Push the user's curated tuning (intensity/turbulence/brightness)
        // before the physics step. resolveFire3D is a cheap pure spread,
        // matching the per-frame resolveLed3D idiom above.
        fireRenderer.updateConfig(resolveFire3D(effectsState.fire));
        fireRenderer.update(fireTips, dt);
      } else {
        fireRenderer?.reset();
      }
    }
  }

  // Register the effect update function on viewer3DState so the offline
  // exporter can call it with deterministic dt each frame.
  $effect(() => {
    if (_viewer3DCtx) {
      _viewer3DCtx.updateEffects = updateEffectsFrame;
      return () => {
        // Only clear if we're still the registered callback
        if (_viewer3DCtx.updateEffects === updateEffectsFrame) {
          _viewer3DCtx.updateEffects = null;
        }
      };
    }
    return;
  });

  // Threlte render-loop: call the extracted update function each frame.
  // During offline export, Threlte is in 'manual' render mode so this
  // only fires when advance() is called - no gating needed.
  useTask((delta) => {
    updateEffectsFrame(delta);
  });

  // Keep the bounded trail renderers mounted for every real prop end. The
  // selected effect only changes their visibility, so choosing Trails never
  // constructs geometry, buffers, materials, or light infrastructure.
  const leftTrailTips = $derived(leftTrailData);
  const rightTrailTips = $derived(rightTrailData);

  onDestroy(() => {
    pooledRegistration?.dispose();
    tipBridge.reset();
    leftLedRenderer?.dispose();
    rightLedRenderer?.dispose();
    leftMoonDiffuser?.dispose();
    rightMoonDiffuser?.dispose();
    leftPovRenderer?.dispose();
    rightPovRenderer?.dispose();
    charcoalRenderer?.dispose();
    fireRenderer?.dispose();
  });
</script>

{#each leftTrailTips as tip (tip.sourceId)}
  {@const resolvedTrails = resolveTrails3D(
    resolveTrailColors(effectsState.trails, getSettings().primaryPropColors)
  )}
  <Trail3D
    tipPosition={tip.position}
    color={resolvedTrails.rainbow ? "rainbow" : resolvedTrails.leftColor}
    propId="left"
    width={resolvedTrails.tubeRadius}
    opacity={resolvedTrails.brightness}
    maxPoints={resolvedTrails.maxPoints}
    rainbow={resolvedTrails.rainbow}
    enabled={tip.effect === "trails" && isPlaying}
    {qualityTier}
    emissiveStrength={resolvedTrails.emissive * trailTierBoost}
    {sceneEffectsManager}
    lightSpaceRoot={effectsParentRef}
  />
{/each}

{#each rightTrailTips as tip (tip.sourceId)}
  {@const resolvedTrails = resolveTrails3D(
    resolveTrailColors(effectsState.trails, getSettings().primaryPropColors)
  )}
  <Trail3D
    tipPosition={tip.position}
    color={resolvedTrails.rainbow ? "rainbow" : resolvedTrails.rightColor}
    propId="right"
    width={resolvedTrails.tubeRadius}
    opacity={resolvedTrails.brightness}
    maxPoints={resolvedTrails.maxPoints}
    rainbow={resolvedTrails.rainbow}
    enabled={tip.effect === "trails" && isPlaying}
    {qualityTier}
    emissiveStrength={resolvedTrails.emissive * trailTierBoost}
    {sceneEffectsManager}
    lightSpaceRoot={effectsParentRef}
  />
{/each}

<!-- LED, charcoal, and fire effects are managed imperatively by the orchestrator's
     useTask - renderer instances add meshes to the effectsParentRef (rig group).
     This bypasses Svelte's batched prop propagation so effect data flows
     in the same frame tick as the tip position computation. -->

<!-- The seven effects whose only 3D renderers live in EffectsLayer: goo,
     bubbles, smoke, petals, sparkles, zap, and ghost. Mounting it
     unconditionally is correct — it gates each effect on activeEffects below.

     activeEffects is the 3D selection, resolved here from the same
     tipEffectMap/globalTipEffectMap that drive trails, led, charcoal and fire.
     EffectsLayer must NOT resolve this itself from the effects-config context:
     that context is the 2D/global choice, and reading it put the 2D effect on
     the 3D props (Goo in 2D + LED in 3D rendered gooey LEDs). -->
<EffectsLayer
  {leftPropState}
  {rightPropState}
  {leftPropType}
  {rightPropType}
  {isPlaying}
  staffLength={staffHalfLength * 2}
  activeEffects={layerActiveEffects}
  {leftHandPos}
  {rightHandPos}
  leftTipData={leftEffectTips}
  rightTipData={rightEffectTips}
  pooledEffectsManaged={sceneEffectsManager !== null}
  {sceneEffectsManager}
  effectSpaceRoot={effectsParentRef}
  {currentStep}
  {totalSteps}
  {seamlesslyLoopable}
  {qualityTier}
  {propBuild}
/>
