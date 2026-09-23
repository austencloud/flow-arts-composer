<script lang="ts">
  import { onMount } from "svelte";
  import { configureViewerOrbitNavigation } from "../camera/camera-controls-runtime";
  import { userProportionsState } from "@austencloud/scene-3d";
  import { BackgroundType } from "@austencloud/backgrounds";

  import { animationSettings } from "$lib/shared/animation-engine/state/animation-settings-state.svelte";
  import { getSettings } from "$lib/shared/application/state/app-state.svelte";
  import type { TipEffectMap } from "$lib/shared/animation-engine/domain/types/tip-effect-types";
  import { getAnimationVisibilityManager } from "$lib/shared/animation-engine/state/animation-visibility-state.svelte";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import { isSeamlesslyLoopable } from "$lib/shared/foundation/services/sequence-loopability-checker";
  import { getEffectsConfigContext } from "$lib/shared/effects/state/effects-config-context";
  import { createEffectsConfigState } from "$lib/shared/effects/state/effects-config-state.svelte";
  import { getPerformerColor } from "../constants/performer-colors";
  import { getViewer3DContext } from "../context/viewer-3d-context";
  import {
    resolvePerformerStepSource,
    synchronizePerformerPlayback,
  } from "../domain/performer-step-timing";
  import { toScenePropType } from "../domain/scene-prop-type";
  import { getSceneEnvironmentRendererKey } from "../environments/domain/scene-environment";
  import { getWorkerEnvironmentKey } from "../worker-renderer/domain/worker-viewer-backend";
  import { getStageCoordinateFrame } from "../environments/domain/stage-coordinate-frame";
  import {
    getCanonicalPerformerStageBounds,
    getPerformerStageClearance,
  } from "../environments/domain/performer-stage-bounds";
  import type { QualityTier } from "../effects/types";
  import { resolvePerformerProp } from "../state/performer-prop-resolution";
  import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import { isBuugengFamilyProp } from "$lib/shared/pictograph/prop/domain/enums/prop-classification";
  import { computeViewerAlignedCamera } from "../camera/viewer-camera-framing";
  import WorkerEnvironmentRenderer from "../worker-renderer/components/WorkerEnvironmentRenderer.svelte";
  import type {
    WorkerPerformerInteractionFailure,
    WorkerPerformerInteractionStateSnapshot,
  } from "../worker-renderer/components/WorkerPerformerInteractionAdapter.svelte";
  import type { ApplicationThreadCameraSnapshot } from "../worker-renderer/domain/application-thread-camera";
  import {
    toViewerCameraSnapshot,
    toWorkerCameraSnapshot,
  } from "../worker-renderer/domain/worker-camera-bridge";
  import type {
    WorkerEnvironmentKey,
    WorkerPerformerSnapshot,
    WorkerSceneEffectsSnapshot,
  } from "../worker-renderer/domain/worker-renderer-protocol";
  import type { WorkerViewerActualConditions } from "../worker-renderer/domain/worker-viewer-backend";
  import type { WorkerViewerFallbackReason } from "../worker-renderer/domain/worker-viewer-capability";
  import { createWorkerPerformerEffectIntent } from "../worker-renderer/services/worker-performer-effect-intent";
  import type { WorkerPerformerInteractionFrame } from "../worker-renderer/services/worker-performer-interaction";
  import {
    resolveWorkerPerformerStaffLength,
    supportsWorkerPerformerEffectIntent,
    type WorkerPerformerSnapshotOptions,
  } from "../worker-renderer/services/worker-performer-snapshot";
  import type { WorkerSceneSwitchSnapshot } from "../worker-renderer/services/worker-environment-renderer";
  import { createWorkerViewerSnapshot } from "../worker-renderer/services/worker-viewer-snapshot";

  interface Props {
    environment: WorkerEnvironmentKey;
    sequenceData: SequenceData;
    currentStep: number;
    isPlaying: boolean;
    leftPropType?: string | null;
    rightPropType?: string | null;
    hideSceneMarkers?: boolean;
    hidePerformerBadges?: boolean;
    enableEffects?: boolean;
    enablePerformerLocomotion?: boolean;
    effectQualityTier: QualityTier;
    renderQualityTier: QualityTier;
    performerStepOffsets?: readonly number[];
    performerSteps?: readonly (number | null | undefined)[] | null;
    visiblePerformerCount?: number;
    pixelRatio: number;
    maxOrbitDistance?: number;
    cameraFov?: number;
    conditions: WorkerViewerActualConditions;
    onSnapshot?: (snapshot: WorkerSceneSwitchSnapshot) => void;
    onWorkerFrame?: (deltaSeconds: number) => void;
    onFallback?: (reasons: readonly WorkerViewerFallbackReason[]) => void;
  }

  let {
    environment,
    sequenceData,
    currentStep,
    isPlaying,
    leftPropType = null,
    rightPropType = null,
    hideSceneMarkers = false,
    hidePerformerBadges = false,
    enableEffects = true,
    enablePerformerLocomotion = true,
    effectQualityTier,
    renderQualityTier,
    performerStepOffsets = [],
    performerSteps = null,
    visiblePerformerCount,
    pixelRatio,
    maxOrbitDistance,
    cameraFov,
    conditions,
    onSnapshot,
    onWorkerFrame,
    onFallback,
  }: Props = $props();

  const viewer = getViewer3DContext();
  const effectsConfig =
    getEffectsConfigContext() ??
    createEffectsConfigState(undefined, { persist: false });
  const visibility = getAnimationVisibilityManager();
  type SettingsService =
    (typeof import("$lib/shared/settings/state/settings-state.svelte"))["settingsService"];
  let viewerSettings = $state<SettingsService | null>(null);
  let globalTipEffectMap = $state<TipEffectMap>(
    visibility.effectsConfigState?.tipEffectMap ?? {}
  );
  // These are complete immutable transport snapshots, replaced once per
  // application frame. Keeping them raw matters: a deep Svelte proxy forces
  // WorkerEnvironmentRenderer to recursively snapshot the whole performer and
  // effect graph before postMessage performs its own structured clone. A
  // production trace measured 1.51s inside that redundant snapshot traversal.
  let performers = $state.raw<readonly WorkerPerformerSnapshot[]>([]);
  let effects = $state.raw<WorkerSceneEffectsSnapshot>({
    playing: false,
    sources: [],
  });
  let interactionFrame = $state.raw<WorkerPerformerInteractionFrame | null>(
    null
  );
  let interactionState = $state<WorkerPerformerInteractionStateSnapshot>({
    hoveredIndex: null,
    draggingIndex: null,
  });
  const alignedCamera = computeViewerAlignedCamera({
    environmentId: viewer.environmentId,
    fov: cameraFov ?? 50,
  });
  const cameraFallback = {
    position: [
      alignedCamera.position.x,
      alignedCamera.position.y,
      alignedCamera.position.z,
    ] as const,
    target: [
      alignedCamera.target.x,
      alignedCamera.target.y,
      alignedCamera.target.z,
    ] as const,
    fov: cameraFov ?? 50,
  };
  const restoredCamera = toWorkerCameraSnapshot(
    viewer.persistedCamera,
    cameraFallback
  );
  let camera = $state({ ...restoredCamera, fov: cameraFov ?? 50 });
  let renderReady = $state(false);
  let fallbackReported = false;
  let ringPulsePhase = 0;

  const sequenceIsSeamless = $derived(isSeamlesslyLoopable(sequenceData));

  function buildPerformerOptions(
    performer: (typeof viewer.performerManager.performers)[number],
    index: number,
    sampledAtMs: number,
    currentEffects: ReturnType<typeof effectsConfig.snapshot>
  ): WorkerPerformerSnapshotOptions {
    const resolvedLeft = toScenePropType(
      resolvePerformerProp(
        performer,
        PropType.STAFF,
        leftPropType as PropType | null
      )
    );
    const resolvedRight = toScenePropType(
      resolvePerformerProp(
        performer,
        PropType.STAFF,
        rightPropType as PropType | null
      )
    );
    const present =
      viewer.performerManager.renderablePerformers.find(
        (entry) => entry.castIndex === index
      )?.presencePhase !== "exiting";
    const selected = viewer.selectedPerformerIndices.includes(index);
    const perfEffect =
      performer.rawEffect ?? globalTipEffectMap["*"]?.effect ?? "none";
    const tipEffectMap: TipEffectMap = performer.rawHandEffects
      ? {
          "0": { effect: performer.rawHandEffects.left },
          "1": { effect: performer.rawHandEffects.right },
        }
      : { "*": { effect: perfEffect } };
    const resolvedStep = resolvePerformerStepSource(
      performerSteps?.[index],
      currentStep,
      performerStepOffsets[index] ?? 0,
      performer.totalSteps
    );

    return {
      leftPropType: resolvedLeft,
      rightPropType: resolvedRight,
      propBuild: { ...performer.effectivePropBuild },
      leftPropFlipped:
        isBuugengFamilyProp(resolvedLeft) &&
        (viewerSettings?.settings?.leftBuugengFlipped ?? false),
      rightPropFlipped:
        isBuugengFamilyProp(resolvedRight) &&
        (viewerSettings?.settings?.rightBuugengFlipped ?? false),
      enableLocomotion: enablePerformerLocomotion,
      badge: {
        index,
        selected,
        allMode: viewer.isAllPerformersSelected,
        visible: present && !hideSceneMarkers && !hidePerformerBadges,
      },
      selectionMarker: {
        color: Number.parseInt(getPerformerColor(index).slice(1), 16),
        selected,
        allPerformersSelected: viewer.isAllPerformersSelected,
        present,
        pulsePhase: ringPulsePhase,
        hovered: interactionState.hoveredIndex === index,
        dragging: interactionState.draggingIndex === index,
      },
      effectIntent: enableEffects
        ? createWorkerPerformerEffectIntent({
            playing: present && isPlaying,
            sampledAtMs,
            currentStep: resolvedStep,
            totalSteps: sequenceData.steps.length,
            seamlesslyLoopable: sequenceIsSeamless,
            qualityTier: effectQualityTier,
            propBuild: performer.effectivePropBuild,
            leftPropType: resolvedLeft,
            rightPropType: resolvedRight,
            staffHalfLength: resolveWorkerPerformerStaffLength(performer) / 2,
            tipEffectMap,
            globalTipEffectMap: {},
            effectsConfig: currentEffects,
            trailTrackingMode: animationSettings.trail.trackingMode,
            handColors: getSettings().primaryPropColors,
          })
        : null,
    };
  }

  function updateFrame(sampledAtMs: number, deltaSeconds: number): void {
    if (viewer.selectedPerformerIndices.length > 0) {
      ringPulsePhase += deltaSeconds * 3;
    }
    const visibleCount = Math.min(
      viewer.performerManager.performers.length,
      visiblePerformerCount ?? viewer.performerManager.performers.length
    );
    for (const [index, performer] of viewer.performerManager.performers
      .slice(0, visibleCount)
      .entries()) {
      synchronizePerformerPlayback(
        performer,
        performerSteps?.[index],
        currentStep,
        performerStepOffsets[index] ?? 0
      );
    }
    viewer.performerManager.updateFormationTransition();

    const currentEffects = effectsConfig.snapshot();
    const resolvedPerformers = viewer.performerManager.renderablePerformers
      .filter(({ castIndex }) => castIndex < visibleCount)
      .map(({ performer, castIndex }) => ({
        performer,
        options: buildPerformerOptions(
          performer,
          castIndex,
          sampledAtMs,
          currentEffects
        ),
      }));
    if (
      resolvedPerformers.some(
        ({ options }) =>
          !supportsWorkerPerformerEffectIntent(options.effectIntent)
      )
    ) {
      if (!fallbackReported) {
        fallbackReported = true;
        onFallback?.(["effects-not-migrated"]);
      }
      renderReady = false;
      return;
    }
    const nextEffects: WorkerSceneEffectsSnapshot = {
      playing: isPlaying,
      sources: [],
    };
    const decision = createWorkerViewerSnapshot({
      environmentId: viewer.environmentId,
      camera,
      performers: resolvedPerformers,
      effects: nextEffects,
      conditions,
    });
    if (decision.backend === "legacy") {
      if (!fallbackReported) {
        fallbackReported = true;
        onFallback?.(decision.fallbackReasons);
      }
      renderReady = false;
      return;
    }

    fallbackReported = false;
    performers = decision.snapshot.performers;
    effects = decision.snapshot.effects;
    const background = getSceneEnvironmentRendererKey(viewer.environmentId);
    const coordinateFrame = getStageCoordinateFrame(background, true);
    const stageBounds = getCanonicalPerformerStageBounds(visibleCount, {
      performerClearance: getPerformerStageClearance(
        userProportionsState.avatarScale
      ),
    });
    interactionFrame = {
      camera,
      performers: resolvedPerformers.map(({ performer }, index) => ({
        index: resolvedPerformers[index]?.options.badge?.index ?? index,
        position: { x: performer.position.x, z: performer.position.z },
        interactive: true,
        badge: {
          visible: Boolean(resolvedPerformers[index]?.options.badge?.visible),
          worldY:
            coordinateFrame.performerAnchorY -
            userProportionsState.groundY +
            0.15,
        },
      })),
      groundY: userProportionsState.groundY + coordinateFrame.performerAnchorY,
      stageBounds: { width: stageBounds.width, depth: stageBounds.depth },
    };
    renderReady = true;
  }

  function handleCameraChange(next: ApplicationThreadCameraSnapshot): void {
    camera = next;
    viewer.updateCameraSnapshot(toViewerCameraSnapshot(next));
  }

  function handleInteractionFailure(
    failure: WorkerPerformerInteractionFailure
  ): void {
    if (fallbackReported) return;
    fallbackReported = true;
    console.warn("[WorkerViewer3DScene] interaction fallback", failure);
    onFallback?.(["performer-interaction-not-migrated"]);
  }

  function dismissInteractionHint(): void {
    localStorage.setItem("tka-performer-direct-manipulation-hint", "dismissed");
    window.dispatchEvent(
      new CustomEvent("tka-performer-interaction-hint-dismissed")
    );
  }

  onMount(() => {
    let mounted = true;
    void import("$lib/shared/settings/state/settings-state.svelte").then(
      ({ settingsService }) => {
        if (mounted) viewerSettings = settingsService;
      }
    );
    const updateMap = () => {
      globalTipEffectMap = visibility.effectsConfigState?.tipEffectMap ?? {};
    };
    visibility.registerObserver(updateMap);
    updateMap();

    let previous = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      updateFrame(now, Math.max(0, now - previous) / 1000);
      previous = now;
      frame = requestAnimationFrame(tick);
    };
    updateFrame(previous, 0);
    frame = requestAnimationFrame(tick);
    return () => {
      mounted = false;
      cancelAnimationFrame(frame);
      visibility.unregisterObserver(updateMap);
    };
  });
</script>

{#if renderReady}
  <WorkerEnvironmentRenderer
    {environment}
    {performers}
    {effects}
    initialCamera={camera}
    initialCameraRoll={(viewer.cameraRollDeg * Math.PI) / 180}
    {maxOrbitDistance}
    {cameraFov}
    {pixelRatio}
    qualityTier={renderQualityTier}
    onRendererReady={(renderer) =>
      viewer.registerEnvironmentPreparation((environmentId) => {
        const key = getWorkerEnvironmentKey(environmentId);
        if (key) renderer.prefetch(key);
      })}
    onFrame={(deltaMs) => onWorkerFrame?.(deltaMs / 1000)}
    performerInteractionFrame={interactionFrame}
    interactionViewer={viewer}
    onPerformerInteractionChange={(snapshot) => (interactionState = snapshot)}
    onPerformerInteractionFailure={handleInteractionFailure}
    onPerformerInteractionHintDismissed={dismissInteractionHint}
    onCameraInteractionStart={() => viewer.setCameraDragging(true)}
    onCameraInteractionEnd={(snapshot) => {
      viewer.setCameraDragging(false);
      handleCameraChange(snapshot);
    }}
    onCameraChange={handleCameraChange}
    onCameraReady={(controller) => {
      configureViewerOrbitNavigation(controller.controls);
      return viewer.registerSnapTo(
        (position, target, spherical, animate = true) => {
          void controller.snapTo(position, target, spherical, animate);
          if (!animate) handleCameraChange(controller.getSnapshot());
        }
      );
    }}
    {onSnapshot}
  />
{/if}
