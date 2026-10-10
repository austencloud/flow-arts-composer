<script lang="ts">
  import { useTask } from "@threlte/core";
  import { type PropState3D, type PropType } from "@austencloud/scene-3d";
  import { untrack } from "svelte";
  import type { Ghost3DParams } from "#lib/shared/effects/translators/webgl3d-types.js";
  import {
    GhostPoseHistory,
    selectGhostAgeStratifiedSamples,
    shouldResetGhostHistoryAtStepBoundary,
    type GhostPoseSample,
  } from "#lib/shared/effects/renderers/ghost-pose-history.js";
  import { resolveGhostHistoryCapacity } from "#lib/shared/effects/domain/ghost-parameters.js";
  import { resolveRigLocalPropCenter3D } from "../tip-position-bridge-3d";
  import { type QualityTier } from "../types";
  import { resolveGhostPoolSize } from "./ghost-chrono-frost-3d";
  import {
    captureGhostPropPose3D,
    createGhostPropPoseKey3D,
    type GhostPropPose3D,
  } from "./ghost-prop-pose-3d";
  import GhostPropPhantom3D from "./GhostPropPhantom3D.svelte";

  interface Props {
    propState: PropState3D | null;
    propType: PropType;
    propHand: "left" | "right";
    params: Ghost3DParams;
    enabled: boolean;
    propLength: number;
    handAnchor: { x: number; z: number };
    currentStep: number;
    totalSteps: number;
    seamlesslyLoopable: boolean;
    qualityTier: QualityTier;
  }

  let {
    propState,
    propType,
    propHand,
    params,
    enabled,
    propLength,
    handAnchor,
    currentStep,
    totalSteps,
    seamlesslyLoopable,
    qualityTier,
  }: Props = $props();

  const history = new GhostPoseHistory<GhostPropPose3D>();
  let visibleSamples = $state.raw<GhostPoseSample<GhostPropPose3D>[]>([]);
  let fallbackState = $state.raw<PropState3D | null>(null);
  let lastObservedStep = Number.NEGATIVE_INFINITY;
  const poolSize = $derived(resolveGhostPoolSize(qualityTier));
  const historyCapacity = $derived(
    resolveGhostHistoryCapacity(params.interval, poolSize)
  );
  const slots = $derived(Array.from({ length: poolSize }, (_, index) => index));

  function clearHistory(): void {
    history.reset();
    visibleSamples = [];
    lastObservedStep = Number.NEGATIVE_INFINITY;
  }

  $effect(() => {
    const currentType = propType;
    untrack(() => {
      void currentType;
      fallbackState = null;
      clearHistory();
    });
  });

  $effect(() => {
    if (!enabled) untrack(clearHistory);
  });

  useTask((delta) => {
    if (!propState) return;

    // Seed the fixed phantom pool while the scene is still behind its loading
    // curtain. Selecting Ghost then changes samples and visibility only; it
    // never mounts up to 160 Prop3D instances for an eight-person cast.
    if (!fallbackState) {
      fallbackState = captureGhostPropPose3D(
        resolveRigLocalPropCenter3D(propState.worldPosition, handAnchor),
        propState
      ).propState;
    }

    if (!enabled) return;

    if (
      shouldResetGhostHistoryAtStepBoundary({
        previousStep: lastObservedStep,
        currentStep,
        totalSteps,
        seamlesslyLoopable,
      })
    ) {
      clearHistory();
    }
    lastObservedStep = currentStep;
    history.advance(delta);

    const center = resolveRigLocalPropCenter3D(
      propState.worldPosition,
      handAnchor
    );
    const key = createGhostPropPoseKey3D(
      center,
      propState,
      params.positionQuantization,
      params.angleQuantization
    );
    history.capture(key, () => captureGhostPropPose3D(center, propState));
    // Draw slots stay fixed, but the lightweight capture history must retain
    // the full Persistence window. Otherwise fast motion fills every slot with
    // almost identical young poses and the age progression disappears.
    history.prune(params.lifetimeSeconds, historyCapacity);

    // The live prop occupies the current pose. Draw only completed past poses.
    visibleSamples = selectGhostAgeStratifiedSamples(
      history.samples(new Set([key])),
      poolSize
    );
  });
</script>

{#if fallbackState}
  {#each slots as slotIndex (slotIndex)}
    <GhostPropPhantom3D
      sample={visibleSamples[slotIndex] ?? null}
      {fallbackState}
      {propType}
      {propHand}
      intensity={params.intensity}
      lifetimeSeconds={params.lifetimeSeconds}
      rimPower={params.rimPower}
      {propLength}
      {slotIndex}
    />
  {/each}
{/if}
