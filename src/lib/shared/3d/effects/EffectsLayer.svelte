<script lang="ts">
  /**
   * EffectsLayer Component
   *
   * Orchestrates all visual effects for the 3D viewer.
   * Reads prop states from animation state and configuration from effects state.
   * Renders enabled effects with proper positioning.
   *
   * Must be placed inside Scene3D's children snippet to be part of the 3D scene.
   */

  import { Vector3, Quaternion, Euler, type Object3D } from "three";
  import {
    AUSTEN_STAFF,
    PropType,
    propFinishState,
    type PropBuild,
    type PropState3D,
  } from "@austencloud/scene-3d";
  import { getEffectsConfigContext as getUnifiedEffectsState } from "#lib/shared/effects/state/effects-config-context.js";
  import { getScene3DRenderContext } from "#lib/shared/3d/scene-features/state/scene-3d-render-context.js";
  import {
    resolveGhost3D,
    resolveSparkles3D,
    resolveZap3D,
    resolveGoo3D,
    resolveBubbles3D,
    resolvePetals3D,
    resolveSmoke3D,
  } from "#lib/shared/effects/translators/webgl3d-translator.js";
  import type { EffectType } from "#lib/shared/animation-engine/domain/types/tip-effect-types.js";
  import { QualityTier, type TipPositionData3D } from "./types";
  import { resolveScaledPropTipAnchors3D } from "./prop-tip-geometry-3d";

  // Effect components
  // Trails are no longer mounted here. The single consolidated 3D trail
  // (Trail3D ribbon) renders via EffectOrchestrator3D in PerformerRig's
  // effectsSlot.
  //
  // Mounted by EffectOrchestrator3D. This component owns the ONLY 3D renderers
  // for goo, bubbles, smoke, petals, sparkles, zap and ghost. It was
  // unmounted for a period, which silently cost those seven effects their 3D
  // path; tests/unit/effects/effect-orchestrator-mounts-layer.test.ts now
  // guards against that recurring.
  import SparkleEmitter from "./particles/SparkleEmitter.svelte";
  import ElectricityArc from "./energy/ElectricityArc.svelte";
  // PropMotionEffects is the LEGACY per-prop motion blur/speed-line mount
  // driven by configState.motion (the `effects-config-state` next to this
  // file, not the unified one). Phase 3 retires it. Ghost is the unified
  // intent-layer replacement, mounted via GhostPropHistory3D below.
  import PropMotionEffects from "./motion/PropMotionEffects.svelte";
  import GhostPropHistory3D from "./motion/GhostPropHistory3D.svelte";
  import WaterEmitter3D from "./water/WaterEmitter3D.svelte";
  import BubbleEmitter3D from "./bubbles/BubbleEmitter3D.svelte";
  import PetalEmitter3D from "./petals/PetalEmitter3D.svelte";
  import PetalAmbientShower3D from "./petals/PetalAmbientShower3D.svelte";
  import SmokeRenderer3D from "./smoke/SmokeRenderer3D.svelte";
  import type { SceneEffectsManager3D } from "./scene-effects/scene-effects-manager-3d";

  interface Props {
    /** Blue prop state from animation */
    leftPropState: PropState3D | null;
    /** Red prop state from animation */
    rightPropState: PropState3D | null;
    /** Canonical 3D prop types used by the live rig. */
    leftPropType?: PropType;
    rightPropType?: PropType;
    /** Whether animation is currently playing */
    isPlaying: boolean;
    /** Staff length for end position calculations */
    staffLength?: number;
    propScale?: number;
    /**
     * The effects actually selected for THIS 3D rig's tips, resolved by
     * EffectOrchestrator3D from its tipEffectMap / globalTipEffectMap props.
     *
     * This must not be read from the effects-config context. The context map is
     * the 2D/global selection; the 3D selection travels down the prop channel
     * the orchestrator already resolves for trails, led, charcoal and fire.
     * Gating on the context meant picking Goo in 2D put goo on the 3D props
     * while the 3D picker said LED — gooey LEDs.
     */
    activeEffects?: readonly EffectType[];
    /** Hand-anchor offsets applied by PerformerRig before the live props. */
    leftHandPos: { x: number; z: number };
    rightHandPos: { x: number; z: number };
    /** Rig-local tips and metres/second velocities from TipPositionBridge3D. */
    leftTipData?: readonly TipPositionData3D[];
    rightTipData?: readonly TipPositionData3D[];
    /** A scene coordinator owns the scene-batched effects when present. */
    pooledEffectsManaged?: boolean;
    /** Current fractional animation step. Ghost uses backward movement to
     *  detect loops and scrubs; pose capture itself is motion-based. */
    currentStep?: number;
    /** Seam metadata keeps Ghost history continuous across a real LOOP wrap. */
    totalSteps?: number;
    seamlesslyLoopable?: boolean;
    /** Shared adaptive quality tier for bounded Ghost prop pools. */
    qualityTier?: QualityTier;
    propBuild?: PropBuild;
    sceneEffectsManager?: SceneEffectsManager3D | null;
    effectSpaceRoot?: Object3D;
  }

  let {
    leftPropState,
    rightPropState,
    leftPropType = PropType.STAFF,
    rightPropType = PropType.STAFF,
    isPlaying,
    staffLength = AUSTEN_STAFF.length,
    propScale = 1,
    activeEffects = [],
    leftHandPos,
    rightHandPos,
    leftTipData = [],
    rightTipData = [],
    pooledEffectsManaged = false,
    currentStep = 0,
    totalSteps = 0,
    seamlesslyLoopable = false,
    qualityTier = QualityTier.MEDIUM,
    propBuild: propBuildOverride,
    sceneEffectsManager = null,
    effectSpaceRoot,
  }: Props = $props();

  const propBuild = $derived(propBuildOverride ?? propFinishState.build);

  const unifiedState = getUnifiedEffectsState();
  const scene3DRender = getScene3DRenderContext();

  /**
   * Which effects are live on this rig. Sourced from the orchestrator's
   * resolved per-tip effects; falls back to the context map only when a caller
   * hasn't plumbed them, so an unplumbed host degrades to the old behaviour
   * rather than going dark.
   *
   * Known limitation: this is a per-rig set, so a config with DIFFERENT effects
   * per tip lights every one of them on all four tips. The whole-rig case (what
   * every surface uses today) is correct. Per-tip gating is a follow-up.
   */
  const activeSet = $derived(
    activeEffects.length > 0
      ? new Set<string>(activeEffects)
      : new Set<string>(
          unifiedState?.config.tipEffectMap["*"]?.effect
            ? [unifiedState.config.tipEffectMap["*"].effect]
            : []
        )
  );
  const isActive = (id: string) => activeSet.has(id);
  const zap3D = $derived(unifiedState ? resolveZap3D(unifiedState.zap) : null);
  const zapEnabled = $derived(isActive("zap"));
  const sparkles3D = $derived(
    unifiedState ? resolveSparkles3D(unifiedState.sparkles) : null
  );
  const sparklesEnabled = $derived(isActive("sparkles"));
  const ghost3D = $derived(
    unifiedState ? resolveGhost3D(unifiedState.ghost) : null
  );
  const ghostEnabled = $derived(isActive("ghost"));
  // 3D goo currently renders via the legacy WaterEmitter3D particle system; a dedicated 3D goo renderer is a follow-up.
  const goo3D = $derived(unifiedState ? resolveGoo3D(unifiedState.goo) : null);
  const gooEnabled = $derived(isActive("goo"));
  const gooShowLeftEnd = $derived(
    goo3D?.trackingMode === "left_end" || goo3D?.trackingMode === "both_ends"
  );
  const gooShowRightEnd = $derived(
    goo3D?.trackingMode === "right_end" || goo3D?.trackingMode === "both_ends"
  );
  const bubbles3D = $derived(
    unifiedState ? resolveBubbles3D(unifiedState.bubbles) : null
  );
  const bubblesEnabled = $derived(isActive("bubbles"));
  const bubblesShowLeftEnd = $derived(
    bubbles3D?.trackingMode === "left_end" ||
      bubbles3D?.trackingMode === "both_ends"
  );
  const bubblesShowRightEnd = $derived(
    bubbles3D?.trackingMode === "right_end" ||
      bubbles3D?.trackingMode === "both_ends"
  );
  const petals3D = $derived(
    unifiedState ? resolvePetals3D(unifiedState.petals) : null
  );
  const petalsEnabled = $derived(isActive("petals"));
  const petalsShowLeftEnd = $derived(
    petals3D?.trackingMode === "left_end" ||
      petals3D?.trackingMode === "both_ends"
  );
  const petalsShowRightEnd = $derived(
    petals3D?.trackingMode === "right_end" ||
      petals3D?.trackingMode === "both_ends"
  );
  const smoke3D = $derived(
    unifiedState ? resolveSmoke3D(unifiedState.smoke) : null
  );
  const smokeEnabled = $derived(isActive("smoke"));
  const smokeShowLeftEnd = $derived(
    smoke3D?.trackingMode === "left_end" ||
      smoke3D?.trackingMode === "both_ends"
  );
  const smokeShowRightEnd = $derived(
    smoke3D?.trackingMode === "right_end" ||
      smoke3D?.trackingMode === "both_ends"
  );
  function pickSparkleColor(i: number): string {
    if (!sparkles3D) return "#ffffff";
    if (sparkles3D.colorMode === "solid") return sparkles3D.color;
    if (sparkles3D.colorMode === "palette" && sparkles3D.palette.length > 0) {
      return sparkles3D.palette[i % sparkles3D.palette.length]!;
    }
    // rainbow mode - rotate hue by emitter index
    const hue = (Date.now() * 0.05 + i * 90) % 360;
    return `hsl(${hue}, 80%, 60%)`;
  }

  // Half staff length for calculating prop ends
  const halfLength = $derived(staffLength / 2);

  // =============================================================================
  // Calculate Prop End Positions
  // =============================================================================

  /**
   * Calculate the emitting end positions of a prop given its state.
   * Must match the exact rotation logic used in Staff3D.svelte.
   *
   * Only the staff family has a negative end. A club, sword or fan has one
   * tip, so `negative` is null and every emitter below skips it rather than
   * throwing a second flame out the back of the grip.
   */
  function calculatePropEnds(
    propState: PropState3D,
    propType: PropType
  ): {
    positive: Vector3;
    negative: Vector3 | null;
  } {
    const center = propState.worldPosition.clone();

    // Staff3D applies: finalQuat = worldRotation.clone().multiply(horizontalQuat)
    // where horizontalQuat is 90° around Z axis
    // This makes the cylinder (which is vertical by default along Y) horizontal
    const horizontalQuat = new Quaternion().setFromEuler(
      new Euler(0, 0, Math.PI / 2)
    );
    const finalQuat = propState.worldRotation.clone().multiply(horizontalQuat);

    const anchors = resolveScaledPropTipAnchors3D(
      propType,
      halfLength,
      propScale,
      propBuild
    );
    const endAt = (slot: 0 | 1): Vector3 | null => {
      const anchor = anchors.find((a) => a.effectTipIndex === slot);
      return anchor
        ? center
            .clone()
            .add(
              new Vector3(
                anchor.offset.x,
                anchor.offset.y,
                anchor.offset.z
              ).applyQuaternion(finalQuat)
            )
        : null;
    };

    return { positive: endAt(1) ?? center.clone(), negative: endAt(0) };
  }

  function tipAt(
    tipData: readonly TipPositionData3D[],
    slot: 0 | 1
  ): TipPositionData3D | undefined {
    return tipData.find((tip) => tip.tipIndex === slot);
  }

  // Derived prop end positions. Read by slot, never by array index: a
  // single-ended prop publishes exactly one tip and it owns slot 1.
  const leftEnds = $derived.by(() => {
    const positive = tipAt(leftTipData, 1);
    if (positive) {
      const negative = tipAt(leftTipData, 0);
      return {
        positive: vectorFrom(positive.position),
        negative: negative ? vectorFrom(negative.position) : null,
      };
    }
    if (!leftPropState) return null;
    return calculatePropEnds(leftPropState, leftPropType);
  });

  const rightEnds = $derived.by(() => {
    const positive = tipAt(rightTipData, 1);
    if (positive) {
      const negative = tipAt(rightTipData, 0);
      return {
        positive: vectorFrom(positive.position),
        negative: negative ? vectorFrom(negative.position) : null,
      };
    }
    if (!rightPropState) return null;
    return calculatePropEnds(rightPropState, rightPropType);
  });

  function vectorFrom(
    value: { x: number; y: number; z: number } | undefined
  ): Vector3 {
    return value ? new Vector3(value.x, value.y, value.z) : new Vector3();
  }

  // Blue prop center for trail/motion effects
  const leftCenter = $derived(leftPropState?.worldPosition ?? null);
  const rightCenter = $derived(rightPropState?.worldPosition ?? null);

  const leftPositiveVelocityVec = $derived(
    vectorFrom(tipAt(leftTipData, 1)?.velocity)
  );
  const leftNegativeVelocityVec = $derived(
    vectorFrom(tipAt(leftTipData, 0)?.velocity)
  );
  const rightPositiveVelocityVec = $derived(
    vectorFrom(tipAt(rightTipData, 1)?.velocity)
  );
  const rightNegativeVelocityVec = $derived(
    vectorFrom(tipAt(rightTipData, 0)?.velocity)
  );
</script>

<!-- Trails render via EffectOrchestrator3D (Trail3D ribbon) in the rig's
     effectsSlot, not here. -->

<!-- Fire renders via EffectOrchestrator3D (FireRenderer3D, imperative) in the
     rig's effectsSlot, not here — same as trails. The FireEmitter particle
     block that used to live at this spot double-rendered fire the moment this
     layer was mounted, blowing the exposure out on any fire station. -->

<!-- =============================================================================
     Sparkle Effects (on prop ends)
     ============================================================================= -->
{#if !pooledEffectsManaged && sparklesEnabled && sparkles3D && isPlaying}
  <!-- worldSpread / baseRadius / worldGravity, never the raw intent values:
       intent.spread is 2D canvas pixels and reading it as metres is what put
       7-metre sparkles on a 0.86m staff. -->
  {#if leftEnds}
    <SparkleEmitter
      position={leftEnds.positive}
      enabled={true}
      intensity={sparkles3D.rate}
      color={pickSparkleColor(0)}
      spread={sparkles3D.worldSpread}
      radius={sparkles3D.baseRadius}
      gravity={sparkles3D.worldGravity}
      lifetime={sparkles3D.lifetime}
    />
    {#if leftEnds.negative}
      <SparkleEmitter
        position={leftEnds.negative}
        enabled={true}
        intensity={sparkles3D.rate * 0.7}
        color={pickSparkleColor(1)}
        spread={sparkles3D.worldSpread * 0.75}
        radius={sparkles3D.baseRadius}
        gravity={sparkles3D.worldGravity}
        lifetime={sparkles3D.lifetime}
      />
    {/if}
  {/if}

  {#if rightEnds}
    <SparkleEmitter
      position={rightEnds.positive}
      enabled={true}
      intensity={sparkles3D.rate}
      color={pickSparkleColor(2)}
      spread={sparkles3D.worldSpread}
      radius={sparkles3D.baseRadius}
      gravity={sparkles3D.worldGravity}
      lifetime={sparkles3D.lifetime}
    />
    {#if rightEnds.negative}
      <SparkleEmitter
        position={rightEnds.negative}
        enabled={true}
        intensity={sparkles3D.rate * 0.7}
        color={pickSparkleColor(3)}
        spread={sparkles3D.worldSpread * 0.75}
        radius={sparkles3D.baseRadius}
        gravity={sparkles3D.worldGravity}
        lifetime={sparkles3D.lifetime}
      />
    {/if}
  {/if}
{/if}

<!-- =============================================================================
     Electricity / Zap Effects (sourced from unified intent layer via resolveZap3D)
     ============================================================================= -->
{#if zap3D}
  {#if leftPropState && rightPropState && leftEnds && rightEnds}
    <!-- jitterAmount/segments/regenerateEveryFrames have been on Zap3DParams
         since it was defined and nothing read them; the arc hardcoded a
         25-metre displacement instead. -->
    <ElectricityArc
      start={leftEnds.positive}
      end={rightEnds.positive}
      enabled={zapEnabled && isPlaying}
      intensity={zap3D.intensity}
      color={zap3D.leftColor}
      mode={zap3D.mode}
      displacement={zap3D.jitterAmount}
      segments={zap3D.segments}
      regenerateEveryFrames={zap3D.regenerateEveryFrames}
      {sceneEffectsManager}
      lightSpaceRoot={effectSpaceRoot}
    />
    <!-- The second arc needs a back end on BOTH props. One club in hand and
         there is nothing to arc between. -->
    {#if leftEnds.negative && rightEnds.negative}
      <ElectricityArc
        start={leftEnds.negative}
        end={rightEnds.negative}
        enabled={zapEnabled && isPlaying}
        intensity={zap3D.intensity}
        color={zap3D.rightColor}
        mode={zap3D.mode}
        displacement={zap3D.jitterAmount}
        segments={zap3D.segments}
        regenerateEveryFrames={zap3D.regenerateEveryFrames}
        {sceneEffectsManager}
        lightSpaceRoot={effectSpaceRoot}
      />
    {/if}
  {/if}
{/if}

<!-- =============================================================================
     Motion Effects (blur and speed lines)
     ============================================================================= -->
{#if scene3DRender && (scene3DRender.motion.blur || scene3DRender.motion.speedLines) && isPlaying}
  {#if leftCenter}
    <PropMotionEffects
      position={leftCenter}
      hand="left"
      enableBlur={scene3DRender.motion.blur}
      enableSpeedLines={scene3DRender.motion.speedLines}
      intensity={scene3DRender.motion.intensity}
      threshold={2}
    />
  {/if}

  {#if rightCenter}
    <PropMotionEffects
      position={rightCenter}
      hand="right"
      enableBlur={scene3DRender.motion.blur}
      enableSpeedLines={scene3DRender.motion.speedLines}
      intensity={scene3DRender.motion.intensity}
      threshold={2}
    />
  {/if}
{/if}

<!-- =============================================================================
     Unified Ghost intent - time-based frozen poses of the canonical prop,
     sourced from the unified intent layer via resolveGhost3D.
     Lives alongside the legacy PropMotionEffects mount above; Phase 3
     retires the legacy path.
     ============================================================================= -->
{#if ghost3D}
  <GhostPropHistory3D
    propState={leftPropState}
    propType={leftPropType}
    propHand="left"
    params={ghost3D}
    enabled={ghostEnabled && isPlaying}
    propLength={staffLength}
    geometryScale={propScale}
    handAnchor={leftHandPos}
    {currentStep}
    {totalSteps}
    {seamlesslyLoopable}
    {qualityTier}
  />
  <GhostPropHistory3D
    propState={rightPropState}
    propType={rightPropType}
    propHand="right"
    params={ghost3D}
    enabled={ghostEnabled && isPlaying}
    propLength={staffLength}
    geometryScale={propScale}
    handAnchor={rightHandPos}
    {currentStep}
    {totalSteps}
    {seamlesslyLoopable}
    {qualityTier}
  />
{/if}

<!-- =============================================================================
     Water: per-tip droplet emitters (Phase 1f.i MVP). Ambient drip + motion-
     reactive emission. Later sub-phases add stream ribbon / metaballs /
     puddles / refraction.
     ============================================================================= -->
{#if !pooledEffectsManaged && gooEnabled && goo3D && isPlaying}
  {#if leftEnds && gooShowRightEnd}
    <WaterEmitter3D
      position={leftEnds.positive}
      propVelocity={leftPositiveVelocityVec}
      params={goo3D}
      enabled={true}
    />
  {/if}
  {#if leftEnds?.negative && gooShowLeftEnd}
    <WaterEmitter3D
      position={leftEnds.negative}
      propVelocity={leftNegativeVelocityVec}
      params={goo3D}
      enabled={true}
    />
  {/if}
  {#if rightEnds && gooShowRightEnd}
    <WaterEmitter3D
      position={rightEnds.positive}
      propVelocity={rightPositiveVelocityVec}
      params={goo3D}
      enabled={true}
    />
  {/if}
  {#if rightEnds?.negative && gooShowLeftEnd}
    <WaterEmitter3D
      position={rightEnds.negative}
      propVelocity={rightNegativeVelocityVec}
      params={goo3D}
      enabled={true}
    />
  {/if}
{/if}

<!-- =============================================================================
     Bubbles: per-tip buoyant bubble emitters. Ambient drift + motion-reactive
     emission. Bubbles rise (+y) and grow over lifetime before popping on
     timeout or max-size.
     ============================================================================= -->
{#if !pooledEffectsManaged && bubblesEnabled && bubbles3D && isPlaying}
  {#if leftEnds}
    <BubbleEmitter3D
      position={leftEnds.positive}
      propVelocity={leftPositiveVelocityVec}
      params={bubbles3D}
      enabled={bubblesShowRightEnd}
      {qualityTier}
    />
  {/if}
  {#if leftEnds?.negative}
    <BubbleEmitter3D
      position={leftEnds.negative}
      propVelocity={leftNegativeVelocityVec}
      params={bubbles3D}
      enabled={bubblesShowLeftEnd}
      {qualityTier}
    />
  {/if}
  {#if rightEnds}
    <BubbleEmitter3D
      position={rightEnds.positive}
      propVelocity={rightPositiveVelocityVec}
      params={bubbles3D}
      enabled={bubblesShowRightEnd}
      {qualityTier}
    />
  {/if}
  {#if rightEnds?.negative}
    <BubbleEmitter3D
      position={rightEnds.negative}
      propVelocity={rightNegativeVelocityVec}
      params={bubbles3D}
      enabled={bubblesShowLeftEnd}
      {qualityTier}
    />
  {/if}
{/if}

<!-- =============================================================================
     Petals: dual-source emission. Per-tip motion bursts (4 emitters) + one
     scene-wide ambient ceiling shower that rains petals from above.
     ============================================================================= -->
{#if !pooledEffectsManaged && petalsEnabled && petals3D && isPlaying}
  <PetalAmbientShower3D params={petals3D} enabled={true} />
  {#if leftEnds && petalsShowRightEnd}
    <PetalEmitter3D
      position={leftEnds.positive}
      propVelocity={leftPositiveVelocityVec}
      params={petals3D}
      enabled={true}
    />
  {/if}
  {#if leftEnds?.negative && petalsShowLeftEnd}
    <PetalEmitter3D
      position={leftEnds.negative}
      propVelocity={leftNegativeVelocityVec}
      params={petals3D}
      enabled={true}
    />
  {/if}
  {#if rightEnds && petalsShowRightEnd}
    <PetalEmitter3D
      position={rightEnds.positive}
      propVelocity={rightPositiveVelocityVec}
      params={petals3D}
      enabled={true}
    />
  {/if}
  {#if rightEnds?.negative && petalsShowLeftEnd}
    <PetalEmitter3D
      position={rightEnds.negative}
      propVelocity={rightNegativeVelocityVec}
      params={petals3D}
      enabled={true}
    />
  {/if}
{/if}

<!-- =============================================================================
     Smoke: per-tip curl-noise puff emitters (Phase 1i.i MVP). Each tip owns
     a 256-particle pool; palette carries lifetime + curl bias + rise bias.
     Sub-phases 1i.ii (blur) and 1i.iii (genie hue-shift) deferred.
     ============================================================================= -->
{#if !pooledEffectsManaged && smokeEnabled && smoke3D && isPlaying}
  {#if leftEnds && smokeShowRightEnd}
    <SmokeRenderer3D
      position={leftEnds.positive}
      propVelocity={leftPositiveVelocityVec}
      params={smoke3D}
      enabled={true}
    />
  {/if}
  {#if leftEnds?.negative && smokeShowLeftEnd}
    <SmokeRenderer3D
      position={leftEnds.negative}
      propVelocity={leftNegativeVelocityVec}
      params={smoke3D}
      enabled={true}
    />
  {/if}
  {#if rightEnds && smokeShowRightEnd}
    <SmokeRenderer3D
      position={rightEnds.positive}
      propVelocity={rightPositiveVelocityVec}
      params={smoke3D}
      enabled={true}
    />
  {/if}
  {#if rightEnds?.negative && smokeShowLeftEnd}
    <SmokeRenderer3D
      position={rightEnds.negative}
      propVelocity={rightNegativeVelocityVec}
      params={smoke3D}
      enabled={true}
    />
  {/if}
{/if}
