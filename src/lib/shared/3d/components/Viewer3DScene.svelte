<script lang="ts">
  import { T, useTask, useThrelte, useScheduler } from "@threlte/core";
  import { layers, type ThrelteLayers } from "@threlte/extras";
  import { onMount, onDestroy, tick, type Snippet } from "svelte";
  import {
    PerformerRig,
    type AvatarGripDiagnostics,
    type AvatarPoseDiagnostics,
    type CollisionEvent,
  } from "@austencloud/scene-3d";
  import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import { isBuugengFamilyProp } from "$lib/shared/pictograph/prop/domain/enums/prop-classification";
  import { BackgroundType } from "@austencloud/backgrounds";
  import Environment3D from "../environments/components/Environment3D.svelte";
  import { getViewer3DContext } from "../context/viewer-3d-context";
  import { getSceneFeatureContext } from "../scene-features/context/scene-feature-context";
  import SeatedAudience3D from "./SeatedAudience3D.svelte";
  import { Plane, GRID_OFFSETS, cmToUnits } from "@austencloud/scene-3d";
  import type { GridMode } from "@austencloud/scene-3d";
  import Grid3D from "./Grid3D.svelte";
  import { getAnimationVisibilityManager } from "$lib/shared/animation-engine/state/animation-visibility-state.svelte";
  import type { TipEffectMap } from "$lib/shared/animation-engine/domain/types/tip-effect-types";
  import type { CharacterInstanceState } from "../state/character-instance-state.svelte";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import { isSeamlesslyLoopable } from "$lib/shared/foundation/services/sequence-loopability-checker";
  import { resolvePerformerProp } from "$lib/shared/3d/state/performer-prop-resolution";
  import { AdditiveBlending } from "three";
  import type { Group } from "three";
  import { userProportionsState } from "@austencloud/scene-3d";
  import PerformerBadge3D from "./PerformerBadge3D.svelte";
  import { getPerformerColor } from "../constants/performer-colors";
  import { attachSceneUndoKeyboard } from "../undo/scene-undo-keyboard";
  import { getSceneUndoManager } from "../undo/get-scene-undo-manager";
  import { toast } from "$lib/shared/toast/state/toast-state.svelte";
  import CharacterSwapTransition from "./CharacterSwapTransition.svelte";
  import { toScenePropType } from "$lib/shared/3d/domain/scene-prop-type";
  import type { SceneEffectsManager3D } from "../effects/scene-effects/scene-effects-manager-3d";
  import type { QualityTier } from "../effects/types";
  import { resolvePetalEnvironmentProfile } from "../effects/petals/petal-world-art-direction";
  import {
    resolvePerformerStepSource,
    synchronizePerformerPlayback,
  } from "../domain/performer-step-timing";
  import {
    getStageCoordinateFrame,
    isRenderable3DEnvironment,
  } from "../environments/domain/stage-coordinate-frame";
  import { getSceneEnvironmentRendererKey } from "../environments/domain/scene-environment";
  import {
    createStageBoundsStabilizer,
    getAddedPerformerStageGrowth,
    getCanonicalPerformerStageBounds,
    getPerformerStageBounds,
    getStageBoundsForExtent,
    getPerformerStageClearance,
  } from "../environments/domain/performer-stage-bounds";
  import { tryGetEnvironmentTransitionVisualContext } from "../environments/context/environment-transition-visual-context";
  import type { EnvironmentTransitionObservation } from "../environments/domain/environment-transition";
  import {
    BASE_SCENE_LAYER,
    PROTECTED_PERFORMER_LAYER,
    protectPerformerTree,
  } from "../environments/rendering/environment-transition-compositor";
  import PerformerPickProxy from "./performer-interaction/PerformerPickProxy.svelte";
  import PerformerVisualPickTarget from "./performer-interaction/PerformerVisualPickTarget.svelte";
  import PerformerHoverRing from "./performer-interaction/PerformerHoverRing.svelte";
  import PerformerMoveHandle from "./performer-interaction/PerformerMoveHandle.svelte";
  import {
    createPerformerPointerInteraction,
    type PerformerPointerInteraction,
  } from "./performer-interaction/performer-pointer-interaction.svelte";
  import { resolvePerformerUpperBodyStance } from "../domain/performer-upper-body-stance";
  import { getAvatarSequenceCollisionAudit } from "../collision/avatar-sequence-collision-audit";
  import { getAvatarGripMotionAudit } from "../diagnostics/avatar-grip-motion-audit";
  import {
    resolveViewerBaseLighting,
    VIEWER_KEY_LIGHT_POSITION,
    VIEWER_PROTECTED_LIGHTING,
  } from "../rendering/viewer-lighting-rig";

  // Performer layer membership inherits through the nested PerformerRig tree.
  layers();
  const PERFORMER_LAYERS: ThrelteLayers = [
    BASE_SCENE_LAYER,
    PROTECTED_PERFORMER_LAYER,
  ];
  const collisionAudit = import.meta.env.DEV
    ? getAvatarSequenceCollisionAudit()
    : null;
  const gripMotionAudit = import.meta.env.DEV
    ? getAvatarGripMotionAudit()
    : null;

  interface Props {
    sequenceData: SequenceData | null;
    currentStep: number;
    isPlaying: boolean;
    characterState: CharacterInstanceState | null;
    /** Explicit prop-type override from the viewer's Theirs/Mine toggle.
     *  When set, takes precedence over sequenceData.intendedProp and
     *  creatorIntent.propConfig so the viewer's prop-context choice is
     *  respected in the 3D scene. Accepts string so Viewer3DCanvas can
     *  pass through without needing to import PropType. */
    leftPropTypeOverride?: string | null;
    rightPropTypeOverride?: string | null;
    /** Hide grid references and performer numbers in cinematic review embeds. */
    hideSceneMarkers?: boolean;
    /** Hide performer numbers while leaving grid references available. */
    hidePerformerBadges?: boolean;
    /** Keep dictated plane grids but drop the center sphere and axis arrows,
     *  for film surfaces where planes are scenery, not editor reference. */
    hideOrientationHelpers?: boolean;
    /** Skip the effects runtime entirely in prop/model inspection surfaces. */
    enableEffects?: boolean;
    /** Stationary stage casts can skip walk, jump, and foot-planting setup. */
    enablePerformerLocomotion?: boolean;
    weldPerformerGrip?: boolean;
    /** Explicit ensemble budget for the existing effect renderers. */
    effectQualityTier?: QualityTier;
    /** Per-performer count offsets, sampled against the same shared clock. */
    performerStepOffsets?: readonly number[];
    /**
     * Per-performer playback step, supplied whole by the host.
     *
     * The default puppet loop derives every performer's step from one shared
     * clock plus a constant offset, which assumes the cast is performing the
     * same sequence. A host whose performers hold independent timelines — the
     * Stage, where each lane carries its own choreography — supplies the
     * resolved step per performer instead. Missing entries fall back to the
     * shared clock, so a partially-driven cast still animates.
     */
    performerSteps?: readonly (number | null | undefined)[] | null;
    /**
     * Host world geometry rendered in the performer coordinate frame — the
     * same space `performer.position` is expressed in, so floor paths and
     * markers land under the feet that walk them.
     */
    worldChildren?: Snippet;
    /** Reserved film rigs stay mounted, but only the active cast is rendered. */
    visiblePerformerCount?: number;
    /**
     * Points the stage must contain, in place of the cast's live positions.
     *
     * The stage is sized from where the performers are, which is right for a
     * cast that only moves when someone edits the formation. Under a director
     * the cast walks, so the same derivation makes the ground grow and shrink
     * under their feet for the length of a scene. A host that knows the whole
     * scene's travel up front passes its extent here and gets one fixed stage.
     */
    stageBoundsPositions?: readonly { x: number; z: number }[] | null;
    /**
     * A stage the host authored, in metres. Wins outright: a host that owns a
     * floor and clamps its cast to it already knows how big the deck is.
     */
    stageExtent?: { width: number; depth: number } | null;
    /** Environments retained in the scene graph after the opening preparation. */
    retainedEnvironmentTypes?: readonly BackgroundType[];
    /** Lets a film-level compositor hide an atomic retained-world switch. */
    environmentTransitionVisualMode?: "internal" | "host-controlled";
    onPerformerReadinessChange?: (
      readyCount: number,
      totalCount: number
    ) => void;
    onEnvironmentTransitionChange?: (
      observation: EnvironmentTransitionObservation<BackgroundType>
    ) => void;
    /** Holds shader warmup until the full interactive effects tree is mounted. */
    onEffectsRuntimeReadyChange?: (ready: boolean) => void;
  }

  let {
    sequenceData,
    currentStep,
    isPlaying,
    characterState,
    leftPropTypeOverride = null,
    rightPropTypeOverride = null,
    hideSceneMarkers = false,
    hidePerformerBadges = false,
    hideOrientationHelpers = false,
    enableEffects = true,
    enablePerformerLocomotion = true,
    weldPerformerGrip = false,
    effectQualityTier,
    performerStepOffsets = [],
    performerSteps = null,
    worldChildren,
    visiblePerformerCount,
    stageBoundsPositions = null,
    stageExtent = null,
    retainedEnvironmentTypes = [],
    environmentTransitionVisualMode = "internal",
    onPerformerReadinessChange,
    onEnvironmentTransitionChange,
    onEffectsRuntimeReadyChange,
  }: Props = $props();
  // The scene now iterates viewer3DState.performerManager. This compatibility
  // prop can be empty while 3D Studio shows the environment before choreography.
  $effect(() => {
    void characterState;
  });

  const viewer3DState = getViewer3DContext();
  type SettingsService =
    (typeof import("$lib/shared/settings/state/settings-state.svelte"))["settingsService"];
  let viewerSettings = $state<SettingsService | null>(null);
  const sequenceIsSeamless = $derived(
    sequenceData ? isSeamlesslyLoopable(sequenceData) : false
  );
  const sceneFeatures = getSceneFeatureContext();
  let sceneEffectsManager = $state<SceneEffectsManager3D | null>(null);
  let effectsReadyToken = 0;

  function handleEffectsManagerReady(ready: boolean): void {
    const token = ++effectsReadyToken;
    if (!ready) {
      onEffectsRuntimeReadyChange?.(false);
      return;
    }
    // The manager and every performer orchestrator mount in the same Svelte
    // update. Wait through that flush and one real frame before allowing the
    // whole-scene shader compile to take its snapshot.
    const afterPaint = () =>
      new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    void (async () => {
      await tick();
      await afterPaint();
      await tick();
      await afterPaint();
      if (token === effectsReadyToken) onEffectsRuntimeReadyChange?.(true);
    })();
  }
  let readyCharacterKeys = $state<Record<string, true>>({});
  const sceneEffectsCoordinatorModule = enableEffects
    ? import("../effects/scene-effects/SceneEffectsCoordinator3D.svelte")
    : null;
  const effectOrchestratorModule = enableEffects
    ? import("../effects/EffectOrchestrator3D.svelte")
    : null;
  const transitionVisual = tryGetEnvironmentTransitionVisualContext();
  const { renderer, camera, scene } = useThrelte();
  const { scheduler, resetFrameInvalidation } = useScheduler();

  function markPerformerCharacterReady(
    performerId: string,
    characterId: string
  ): void {
    readyCharacterKeys = {
      ...readyCharacterKeys,
      [`${performerId}:${characterId}`]: true,
    };
  }

  const performerReadiness = $derived.by(() => {
    const performers = viewer3DState.performerManager.performers.slice(
      0,
      visiblePerformerCount
    );
    return {
      readyCount: performers.filter(
        (performer) =>
          readyCharacterKeys[`${performer.id}:${performer.characterId}`]
      ).length,
      totalCount: performers.length,
    };
  });

  $effect(() => {
    onPerformerReadinessChange?.(
      performerReadiness.readyCount,
      performerReadiness.totalCount
    );
  });

  // Every viewer owns its scene environment. BackgroundType remains only the
  // established renderer key below; it is no longer an application preference.
  const backgroundType = $derived(
    getSceneEnvironmentRendererKey(viewer3DState.environmentId)
  );

  // Reconstructs Threlte's default setAnimationLoop callback. We restore
  // this after the offline export pauses the loop.
  const autoLoopCallback = (time: number) => {
    scheduler.run(time);
    resetFrameInvalidation();
  };

  // runFrame drives Threlte's entire pipeline synchronously in one call:
  // every registered useTask (puppet loop, IK, effects, autoRender) runs,
  // then the scene is drawn to the canvas. No rAF involved. The exporter
  // uses this to export at CPU speed (decoupled from display refresh rate)
  // and without tab-switch throttling.
  function runFrame(timeMs: number) {
    scheduler.run(timeMs);
    resetFrameInvalidation();
  }

  // During export the native rAF loop is paused so it doesn't fight our
  // manual pacing. Resume restores the identical callback Threlte set up.
  function pauseAutoLoop() {
    if ("setAnimationLoop" in renderer) {
      (
        renderer as {
          setAnimationLoop(cb: ((time: number) => void) | null): void;
        }
      ).setAnimationLoop(null);
    }
  }

  function resumeAutoLoop() {
    if ("setAnimationLoop" in renderer) {
      (
        renderer as {
          setAnimationLoop(cb: ((time: number) => void) | null): void;
        }
      ).setAnimationLoop(autoLoopCallback);
    }
  }

  // Register Threlte internals so the offline exporter can drive the full
  // render pipeline. Threlte exposes renderer and scene as direct objects
  // (not CurrentWritable), but camera is a CurrentWritable with .current.
  $effect(() => {
    const cam = camera.current;
    if (!renderer || !scene || !cam) return;
    return viewer3DState.registerThrelteInternals({
      renderer,
      scene,
      camera: cam,
      runFrame,
      pauseAutoLoop,
      resumeAutoLoop,
    });
  });

  // All performers from the manager - the scene renders one rig per entry.
  const performerManager = $derived(viewer3DState.performerManager);

  // Read the global tip effect map so the 3D orchestrator knows which effect
  // each tip should use (trails, led, fire, etc.).
  // The visibility manager uses an observer pattern (not Svelte runes), so we
  // bridge it into reactive state with $state + registerObserver.
  const visibilityManager = getAnimationVisibilityManager();
  let globalTipEffectMap = $state<TipEffectMap>(
    visibilityManager.effectsConfigState?.tipEffectMap ?? {}
  );

  $effect(() => {
    // Sync on mount and whenever visibility settings change
    const updateMap = () => {
      globalTipEffectMap =
        visibilityManager.effectsConfigState?.tipEffectMap ?? {};
    };
    visibilityManager.registerObserver(updateMap);
    updateMap();
    return () => visibilityManager.unregisterObserver(updateMap);
  });

  // Puppet-mode sync loop: convert the orchestrator's floating-point currentStep
  // into avatar beat index + sub-beat progress each frame.
  //
  // currentStep is a continuous float: integer part = beat index, fractional
  // part = sub-beat interpolation 0..1. Beat 0 = start position, beats 1+ = motion.
  //
  // stepConfigs now includes the start position at index 0, so the mapping
  // is direct: 2D beat N → 3D index N (no offset needed).
  useTask((delta) => {
    if (transitionVisual?.active && performerLayerRoot) {
      protectPerformerTree(performerLayerRoot);
    }
    if (transitionVisual?.active && sceneEffectsLayerRoot) {
      protectPerformerTree(sceneEffectsLayerRoot);
    }

    if (viewer3DState.selectedPerformerIndices.length > 0) {
      ringPulsePhase += delta * 3;
    }
    // During offline export, the exporter sets exportCurrentStep on
    // viewer3DState each frame. We read it here instead of the component
    // prop `currentStep` (which is frozen because playback is paused).
    // This keeps state distribution inside useTask - the same code path
    // as live playback - so the $derived chain (currentStepIndex →
    // leftPropState → Avatar3D props) resolves within the same frame.
    const step = viewer3DState.isExporting
      ? (viewer3DState.exportCurrentStep ?? currentStep)
      : currentStep;

    for (const [performerIndex, p] of performerManager.performers
      .slice(0, visiblePerformerCount)
      .entries()) {
      synchronizePerformerPlayback(
        p,
        performerSteps?.[performerIndex],
        step,
        performerStepOffsets[performerIndex] ?? 0
      );
    }

    // Drive formation transitions. transitionToFormation (called from the
    // Performers tab) kicks off an animation but doesn't run its own frame
    // loop - this tick is what actually walks positions toward the target
    // slots over the canonical motion window. Without it, applyFormationFromUI flips
    // activeFormation but nothing visibly moves.
    if (!viewer3DState.isExporting) {
      performerManager.updateFormationTransition();
    }
  });

  let performerInteraction = $state<PerformerPointerInteraction | null>(null);
  let detachPerformerInteraction: (() => void) | null = null;

  let _detachUndo: (() => void) | null = null;

  onMount(() => {
    let mounted = true;

    // Prop type overrides choose the choreography's props, but Buugeng
    // chirality stays a personal setting. Load settings for both so a Browse
    // viewer with explicit prop types still shows the selected handedness.
    void import("$lib/shared/settings/state/settings-state.svelte").then(
      ({ settingsService }) => {
        if (mounted) viewerSettings = settingsService;
      }
    );

    if (enableEffects) {
      onEffectsRuntimeReadyChange?.(false);
      void import("../effects/scene-effects/scene-effects-manager-3d").then(
        ({ SceneEffectsManager3D }) => {
          if (mounted) sceneEffectsManager = new SceneEffectsManager3D();
        }
      );
    } else onEffectsRuntimeReadyChange?.(true);

    const interactionCanvas = renderer.domElement;
    if (interactionCanvas) {
      if (interactionCanvas.tabIndex < 0) interactionCanvas.tabIndex = 0;
      performerInteraction = createPerformerPointerInteraction({
        canvas: interactionCanvas,
        camera: () => camera.current,
        viewer: viewer3DState,
        groundY: () => performerGroundLevel,
        stageBounds: () => ({
          width: stageDimensions.width,
          depth: stageDimensions.depth,
        }),
        onHintDismissed: () => {
          localStorage.setItem(
            "tka-performer-direct-manipulation-hint",
            "dismissed"
          );
          window.dispatchEvent(
            new CustomEvent("tka-performer-interaction-hint-dismissed")
          );
        },
      });
      detachPerformerInteraction = performerInteraction.attach();
      _detachUndo = attachSceneUndoKeyboard(
        getSceneUndoManager(),
        (desc) => toast.info(`Undid: ${desc}`, 1500),
        (desc) => toast.info(`Redid: ${desc}`, 1500)
      );
    }

    return () => {
      mounted = false;
    };
  });

  onDestroy(() => {
    detachPerformerInteraction?.();
    _detachUndo?.();
  });

  // Resolve prop type: explicit viewer override wins, then sequence's intended
  // prop, then creator config, then global settings.
  const leftPropType = $derived.by((): PropType => {
    if (leftPropTypeOverride) return leftPropTypeOverride as PropType;
    if (sequenceData?.intendedProp?.leftPropType)
      return sequenceData.intendedProp.leftPropType;
    if (sequenceData?.creatorIntent?.propConfig?.leftPropType)
      return sequenceData.creatorIntent.propConfig.leftPropType;
    try {
      return viewerSettings?.settings?.leftPropType ?? PropType.STAFF;
    } catch {
      return PropType.STAFF;
    }
  });
  const rightPropType = $derived.by((): PropType => {
    if (rightPropTypeOverride) return rightPropTypeOverride as PropType;
    if (sequenceData?.intendedProp?.rightPropType)
      return sequenceData.intendedProp.rightPropType;
    if (sequenceData?.creatorIntent?.propConfig?.rightPropType)
      return sequenceData.creatorIntent.propConfig.rightPropType;
    try {
      return viewerSettings?.settings?.rightPropType ?? PropType.STAFF;
    } catch {
      return PropType.STAFF;
    }
  });
  const leftBuugengFlipped = $derived(
    viewerSettings?.settings?.leftBuugengFlipped ?? false
  );
  const rightBuugengFlipped = $derived(
    viewerSettings?.settings?.rightBuugengFlipped ?? false
  );

  const explicitPlanes = $derived(viewer3DState.visiblePlanes as Set<Plane>);

  const hasEnvironment = $derived(isRenderable3DEnvironment(backgroundType));

  const isNightEnvironment = $derived(
    backgroundType === BackgroundType.FOREST ||
      backgroundType === BackgroundType.COSMIC ||
      backgroundType === BackgroundType.OCEAN
  );
  const viewerBaseLighting = $derived(
    resolveViewerBaseLighting(hasEnvironment, isNightEnvironment)
  );

  const petalEnvironmentProfile = $derived(
    resolvePetalEnvironmentProfile(backgroundType)
  );

  const stageCoordinateFrame = $derived(
    getStageCoordinateFrame(backgroundType, sceneFeatures.isEnabled("stage"))
  );
  const stageGroundOffset = $derived(stageCoordinateFrame.performerAnchorY);

  // Keep the scene's light count stable as performers enter and leave.
  // WebGL keys material programs by light count, so one light per performer
  // forced every scene material to synchronously recompile on count changes.
  // A single movable light preserves the selected-performer highlight without
  // invalidating the shader program cache.
  const selectedPerformer = $derived.by(() => {
    const index = viewer3DState.primaryPerformerIndex;
    return index === null ? null : (performerManager.performers[index] ?? null);
  });
  const selectedPerformerIndices = $derived(
    new Set(viewer3DState.selectedPerformerIndices)
  );
  const selectedPerformerLightPosition = $derived([
    selectedPerformer?.position.x ?? 0,
    stageGroundOffset + 2.5,
    (selectedPerformer?.position.z ?? 0) + 0.3,
  ] as [number, number, number]);
  const performerGroundLevel = $derived(
    userProportionsState.groundY + stageGroundOffset
  );
  const performerCount = $derived(
    Math.min(
      performerManager.performers.length,
      visiblePerformerCount ?? performerManager.performers.length
    )
  );
  const selectionMoveHandle = $derived.by(() => {
    const selected = viewer3DState.selectedPerformerIndices.filter(
      (index) => index >= 0 && index < performerCount
    );
    if (selected.length === 0) return null;
    const positions = selected.flatMap((index) => {
      const performer = performerManager.performers[index];
      return performer ? [performer.position] : [];
    });
    if (positions.length === 0) return null;
    const anchorIndex = selected.includes(
      viewer3DState.primaryPerformerIndex ?? -1
    )
      ? (viewer3DState.primaryPerformerIndex ?? selected[0])
      : selected[0];
    return {
      anchorIndex,
      key: selected.join(":"),
      selectedCount: positions.length,
      position: {
        x:
          positions.reduce((total, position) => total + position.x, 0) /
          positions.length,
        z:
          positions.reduce((total, position) => total + position.z, 0) /
          positions.length,
      },
    };
  });
  const environmentPerformerPositions = $derived(
    performerManager.performers
      .slice(0, performerCount)
      .map((performer) => performer.position)
  );

  // The deck is a property of the venue, not of where the cast happens to be
  // standing this frame. Measuring live positions made the floor grow as a
  // formation opened out and shrink as it closed, so the stage appeared to
  // breathe under performers who were only walking across it.
  //
  // The stabilizer keeps the SAME object when the values did not change. This
  // derived shares invalidation granularity with per-frame playback props, so
  // it re-runs every frame during playback; without identity stability each
  // run handed every scene a "new" stage and Threlte rebuilt ~29 stage
  // BoxGeometries per frame, leaking GL buffers until playback crawled.
  const stabilizeStageBounds = createStageBoundsStabilizer();
  const stageDimensions = $derived(
    stabilizeStageBounds(
      stageExtent
        ? getStageBoundsForExtent(stageExtent)
        : stageBoundsPositions
          ? getPerformerStageBounds(stageBoundsPositions, {
              performerClearance: getPerformerStageClearance(
                userProportionsState.avatarScale
              ),
            })
          : getCanonicalPerformerStageBounds(performerCount, {
              performerClearance: getPerformerStageClearance(
                userProportionsState.avatarScale
              ),
            })
    )
  );

  const stageZOffset = $derived(stageDimensions.zOffset);
  const stageRadiusGrowth = $derived(
    stageExtent || stageBoundsPositions
      ? 0
      : getAddedPerformerStageGrowth(performerCount)
  );

  $effect(() => {
    viewer3DState.setStageGroundOffset(stageGroundOffset);
  });

  let ringPulsePhase = $state(0);
  const ringPulse = $derived(0.6 + 0.4 * Math.sin(ringPulsePhase));
  let performerLayerRoot = $state<Group>();
  let sceneEffectsLayerRoot = $state<Group>();

  // When the background type doesn't produce a 3D environment (solid color,
  // gradient), Environment3D never mounts - so nothing will ever call
  // reportReady("environment"). Report it immediately so the curtain lifts.
  $effect(() => {
    if (!hasEnvironment && sceneFeatures.isEnabled("environment")) {
      sceneFeatures.reportReady("environment");
    }
  });
</script>

<T.Group bind:ref={sceneEffectsLayerRoot} layers={PERFORMER_LAYERS} />
{#if sceneEffectsManager && sceneEffectsCoordinatorModule}
  {#await sceneEffectsCoordinatorModule then { default: SceneEffectsCoordinator3D }}
    <SceneEffectsCoordinator3D
      manager={sceneEffectsManager}
      parent={sceneEffectsLayerRoot}
      {petalEnvironmentProfile}
      onReadyChange={handleEffectsManagerReady}
    />
  {/await}
{/if}

<!-- Environment (gated by scene feature toggle) -->
{#if hasEnvironment && sceneFeatures.isEnabled("environment")}
  <Environment3D
    {backgroundType}
    {performerCount}
    performerPositions={environmentPerformerPositions}
    stageWidth={stageDimensions.width}
    stageDepth={stageDimensions.depth}
    stageRadius={stageDimensions.radius}
    {stageRadiusGrowth}
    {stageZOffset}
    {retainedEnvironmentTypes}
    transitionVisualMode={environmentTransitionVisualMode}
    onTransitionChange={onEnvironmentTransitionChange}
  />
{/if}

<!-- Seated audience (gated by scene feature toggle) -->
{#if sceneFeatures.isEnabled("audience")}
  <SeatedAudience3D groundLevel={performerGroundLevel} />
{/if}

<!-- Lighting - reduced when the environment provides its own -->
<T.AmbientLight intensity={viewerBaseLighting.ambientIntensity} />
<T.DirectionalLight
  position={VIEWER_KEY_LIGHT_POSITION}
  intensity={viewerBaseLighting.directionalIntensity}
/>

<!-- Stable performer-only lighting for the protected transition pass. -->
<T.AmbientLight
  intensity={VIEWER_PROTECTED_LIGHTING.ambientIntensity}
  layers={PROTECTED_PERFORMER_LAYER}
/>
<T.DirectionalLight
  position={VIEWER_PROTECTED_LIGHTING.directionalPosition}
  intensity={VIEWER_PROTECTED_LIGHTING.directionalIntensity}
  layers={PROTECTED_PERFORMER_LAYER}
/>

<!-- Ground disc (only when no environment provides its own ground) -->
{#if !hasEnvironment}
  <T.Mesh rotation.x={-Math.PI / 2}>
    <T.CircleGeometry args={[2, 64]} />
    <T.MeshStandardMaterial color="#1a1a2e" />
  </T.Mesh>
{/if}

<!-- Performer group shifts with stage expansion to stay centered -->
<T.Group
  bind:ref={performerLayerRoot}
  position.z={stageZOffset}
  layers={PERFORMER_LAYERS}
>
  {@render worldChildren?.()}

  <T.PointLight
    position={selectedPerformerLightPosition}
    intensity={selectedPerformer ? 6 : 0}
    color={0xfff5e6}
    distance={5}
    decay={1.5}
  />

  {#each performerManager.renderablePerformers as renderEntry (renderEntry.performer.id)}
    {@const performer = renderEntry.performer}
    {@const i = renderEntry.castIndex}
    <T.Group
      userData={{ performerIndex: i }}
      visible={renderEntry.presencePhase === "exiting" || i < performerCount}
    >
      {#if performerInteraction}
        <PerformerPickProxy
          performerIndex={i}
          position={performer.position}
          groundY={performerGroundLevel}
          register={performerInteraction.registerPickTarget}
        />
        {#if performerInteraction.hoveredIndex === i || performerInteraction.draggingIndex === i}
          <PerformerHoverRing
            position={performer.position}
            groundY={performerGroundLevel}
            color={getPerformerColor(i)}
            dragging={performerInteraction.draggingIndex === i}
          />
        {/if}
      {/if}
      {#if renderEntry.presencePhase !== "exiting" && selectedPerformerIndices.has(i) && !viewer3DState.isAllPerformersSelected}
        {@const selectionColor = Number.parseInt(
          getPerformerColor(i).slice(1),
          16
        )}
        <T.Group
          position={[
            performer.position.x,
            performerGroundLevel + 0.015,
            performer.position.z,
          ]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <T.Mesh>
            <T.RingGeometry args={[0.42, 0.58, 64]} />
            <T.MeshBasicMaterial
              color={selectionColor}
              transparent
              opacity={ringPulse * 0.9}
              blending={AdditiveBlending}
              depthWrite={false}
            />
          </T.Mesh>
          <T.Mesh>
            <T.RingGeometry args={[0.58, 1.0, 64]} />
            <T.MeshBasicMaterial
              color={selectionColor}
              transparent
              opacity={ringPulse * 0.3}
              blending={AdditiveBlending}
              depthWrite={false}
            />
          </T.Mesh>
          <T.Mesh>
            <T.CircleGeometry args={[0.42, 64]} />
            <T.MeshBasicMaterial
              color={selectionColor}
              transparent
              opacity={0.15}
            />
          </T.Mesh>
        </T.Group>
      {/if}
      {@const performerGridMode = (sequenceData?.gridMode ??
        "diamond") as GridMode}
      {@const performerGridOffset = GRID_OFFSETS[performer.planeMode]}
      {@const perfStaffCm = performer.settings.staffLengthCm}
      {@const propLength =
        perfStaffCm != null ? cmToUnits(perfStaffCm) : undefined}
      {@const propBuild = performer.effectivePropBuild}
      {@const resolvedLeftProp = resolvePerformerProp(
        performer,
        leftPropType,
        leftPropTypeOverride as PropType | null
      )}
      {@const resolvedRightProp = resolvePerformerProp(
        performer,
        rightPropType,
        rightPropTypeOverride as PropType | null
      )}
      <!-- Per-performer effect cascade: this performer's override, else the
         global default (effects-config wildcard). This is what makes the
         Performer Hub effect selection actually reach the renderer. -->
      {@const perfEffect =
        performer.rawEffect ?? globalTipEffectMap["*"]?.effect ?? "none"}
      <!-- When the two hands run different effects, key the map per prop
         instead of the wildcard. resolveEffect already reads propIndex, so
         prop 0 (blue, left) and prop 1 (red, right) each take their own. -->
      {@const perfTipMap = performer.rawHandEffects
        ? {
            "0": { effect: performer.rawHandEffects.left },
            "1": { effect: performer.rawHandEffects.right },
          }
        : { "*": { effect: perfEffect } }}
      {@const performerCurrentStep = resolvePerformerStepSource(
        performerSteps?.[i],
        currentStep,
        performerStepOffsets[i] ?? 0,
        performer.totalSteps
      )}
      {@const upperBodyStance = resolvePerformerUpperBodyStance(performer)}
      <PerformerVisualPickTarget
        performerIndex={i}
        register={performerInteraction?.registerVisualPickTarget}
      >
        <CharacterSwapTransition
          {performer}
          performerIndex={i}
          groundOffset={stageGroundOffset}
          presenceProgress={performer.presenceProgress}
        >
          {#snippet children({ onCharacterSwapped, characterOpacity })}
            <PerformerRig
              position={performer.position}
              groundOffset={stageGroundOffset}
              facingAngle={performer.facingAngle}
              planeMode={performer.planeMode}
              avatarState={performer}
              avatarId={performer.characterId}
              visiblePlanes={explicitPlanes}
              gridMode={performerGridMode}
              bluePropType={toScenePropType(resolvedLeftProp)}
              redPropType={toScenePropType(resolvedRightProp)}
              bluePropFlipped={isBuugengFamilyProp(resolvedLeftProp) &&
                leftBuugengFlipped}
              redPropFlipped={isBuugengFamilyProp(resolvedRightProp) &&
                rightBuugengFlipped}
              bluePropState={performer.leftPropState}
              redPropState={performer.rightPropState}
              tipEffectMap={perfTipMap}
              {propLength}
              {propBuild}
              isPlaying={renderEntry.presencePhase !== "exiting" &&
                isPlaying &&
                i < performerCount}
              enableLocomotion={enablePerformerLocomotion}
              enableFootPlanting={enablePerformerLocomotion}
              weldGrip={weldPerformerGrip}
              isMoving={performer.isMoving}
              moveSpeed={performer.moveSpeed}
              moveDirection={performer.moveDirection}
              gaitTimingSample={performer.gaitTimingSample}
              terminalStepPlan={performer.terminalStepPlan}
              stanceYaw={upperBodyStance.yawRad}
              stanceSegments={upperBodyStance.segments}
              spinePitchOffset={upperBodyStance.pitchRad}
              blueHandDepthOffset={upperBodyStance.leftDepthOffsetM}
              redHandDepthOffset={upperBodyStance.rightDepthOffsetM}
              headDodge={true}
              onCollisionEvents={collisionAudit || gripMotionAudit
                ? (
                    events: CollisionEvent[],
                    diagnostics: AvatarPoseDiagnostics,
                    gripDiagnostics: AvatarGripDiagnostics
                  ) => {
                    collisionAudit?.record(performer.id, events, diagnostics);
                    gripMotionAudit?.record(
                      performer.id,
                      gripDiagnostics,
                      events
                    );
                  }
                : undefined}
              onAvatarSwapped={(characterId) => {
                onCharacterSwapped(characterId);
                markPerformerCharacterReady(performer.id, characterId);
              }}
              avatarOpacity={characterOpacity}
            >
              {#snippet gridSlot()}
                {#if !hideSceneMarkers}
                  <T.Group
                    position.z={performerGridOffset}
                    layers={BASE_SCENE_LAYER}
                    userData={{ performerInteractionExcluded: true }}
                  >
                    <Grid3D
                      visiblePlanes={explicitPlanes}
                      gridMode={performerGridMode}
                      planeMode={performer.planeMode}
                      showLabels={viewer3DState.showGridLabels}
                      showOrientationHelpers={!hideOrientationHelpers}
                    />
                  </T.Group>
                {/if}
              {/snippet}
              <!-- PerformerRig's external compatibility API still names the
                 snippet payload blue/red. Rename at this seam so the
                 orchestrator receives real prop states; destructuring the
                 app-side left/right names here left both undefined and
                 silently disabled every 3D effect. -->
              {#snippet effectsSlot({
                bluePropState: leftPropState,
                redPropState: rightPropState,
                blueHandPos: leftHandPos,
                redHandPos: rightHandPos,
                isPlaying: rigPlaying,
                staffHalfLength,
                effectsParentRef,
              })}
                {#if sceneEffectsManager && effectOrchestratorModule}
                  {#await effectOrchestratorModule then { default: EffectOrchestrator3D }}
                    <EffectOrchestrator3D
                      {leftPropState}
                      {rightPropState}
                      leftPropType={toScenePropType(resolvedLeftProp)}
                      rightPropType={toScenePropType(resolvedRightProp)}
                      isPlaying={rigPlaying}
                      {staffHalfLength}
                      {propBuild}
                      tipEffectMap={perfTipMap}
                      {leftHandPos}
                      {rightHandPos}
                      {effectsParentRef}
                      sceneEffectsManagerOverride={sceneEffectsManager}
                      qualityTierOverride={effectQualityTier}
                      currentStep={performerCurrentStep}
                      totalSteps={sequenceData?.steps.length ?? 0}
                      seamlesslyLoopable={sequenceIsSeamless}
                    />
                  {/await}
                {/if}
              {/snippet}
            </PerformerRig>
          {/snippet}
        </CharacterSwapTransition>
      </PerformerVisualPickTarget>

      {#if renderEntry.presencePhase !== "exiting" && viewer3DState.isAllPerformersSelected}
        <T.Mesh
          position={[
            performer.position.x,
            performerGroundLevel + 0.01,
            performer.position.z,
          ]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <T.CircleGeometry args={[0.35, 32]} />
          <T.MeshBasicMaterial color={0x6b7280} transparent opacity={0.15} />
        </T.Mesh>
      {/if}

      {#if renderEntry.presencePhase !== "exiting" && !hideSceneMarkers && !hidePerformerBadges}
        <!-- Floating numbered badge above performer head -->
        <T.Group
          position.x={performer.position.x}
          position.y={stageGroundOffset}
          position.z={performer.position.z}
        >
          <PerformerBadge3D
            index={i}
            selected={selectedPerformerIndices.has(i)}
            allMode={viewer3DState.isAllPerformersSelected}
            registerPickTarget={performerInteraction?.registerPickTarget}
          />
        </T.Group>
      {/if}
    </T.Group>
  {/each}

  {#if performerInteraction && selectionMoveHandle && !hideSceneMarkers && !viewer3DState.performerSelectionMode}
    {#key selectionMoveHandle.key}
      <PerformerMoveHandle
        position={selectionMoveHandle.position}
        groundY={performerGroundLevel}
        selectedCount={selectionMoveHandle.selectedCount}
        dragging={performerInteraction.draggingIndex !== null}
        onpointerdown={(event) =>
          performerInteraction?.onMoveHandlePointerDown(
            event,
            selectionMoveHandle.anchorIndex
          )}
        onpointermove={(event) => {
          event.stopPropagation();
          performerInteraction?.onMoveHandlePointerMove(event);
        }}
        onpointerup={(event) => {
          event.stopPropagation();
          performerInteraction?.onMoveHandlePointerUp(event);
        }}
        onpointercancel={(event) => {
          event.stopPropagation();
          performerInteraction?.onMoveHandlePointerCancel(event);
        }}
      />
    {/key}
  {/if}
</T.Group>
