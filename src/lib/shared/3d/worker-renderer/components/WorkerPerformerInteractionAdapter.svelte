<script module lang="ts">
  import type { WorkerPerformerInteractionBlocker } from "../services/worker-performer-interaction-capability";

  export interface WorkerPerformerInteractionStateSnapshot {
    hoveredIndex: number | null;
    draggingIndex: number | null;
  }

  export type WorkerPerformerInteractionFailure =
    | {
        reason: "unsupported";
        blockers: readonly WorkerPerformerInteractionBlocker[];
        message: null;
      }
    | {
        reason: "initialization-failed" | "update-failed";
        blockers: readonly [];
        message: string;
      };
</script>

<script lang="ts">
  import { onMount, untrack } from "svelte";

  import type { ApplicationThreadCameraSnapshot } from "../domain/application-thread-camera";
  import {
    createWorkerPerformerInteractionBridge,
    type WorkerPerformerInteractionBridge,
    type WorkerPerformerInteractionCameraArbiter,
    type WorkerPerformerInteractionFrame,
    type WorkerPerformerInteractionViewer,
  } from "../services/worker-performer-interaction";
  import type { WorkerPerformerInteractionCapability } from "../services/worker-performer-interaction-capability";
  import WorkerPerformerMoveHint from "./WorkerPerformerMoveHint.svelte";
  import PerformerPlacementPrompt from "../../components/performer-interaction/PerformerPlacementPrompt.svelte";

  interface WorkerMoveHintSelection {
    key: string;
    position: { x: number; z: number };
    groundY: number;
  }

  interface Props {
    interactionSurface: HTMLElement;
    projectionContainer: HTMLElement;
    frame: WorkerPerformerInteractionFrame;
    viewer: WorkerPerformerInteractionViewer;
    cameraArbiter: WorkerPerformerInteractionCameraArbiter;
    cameraSnapshot: ApplicationThreadCameraSnapshot;
    onInteractionChange?: (
      snapshot: WorkerPerformerInteractionStateSnapshot
    ) => void;
    onFailure?: (failure: WorkerPerformerInteractionFailure) => void;
    onHintDismissed?: () => void;
  }

  let {
    interactionSurface,
    projectionContainer,
    frame,
    viewer,
    cameraArbiter,
    cameraSnapshot,
    onInteractionChange,
    onFailure,
    onHintDismissed,
  }: Props = $props();

  let bridge = $state<WorkerPerformerInteractionBridge | null>(null);
  let supported = $state(false);
  let projectionRevision = $state(0);
  let interactionState = $state<WorkerPerformerInteractionStateSnapshot>({
    hoveredIndex: null,
    draggingIndex: null,
  });
  let placing = $state(false);
  let mounted = $state(false);
  let failed = $state(false);
  let stateFrame: number | null = null;
  let lastFailureKey: string | null = null;

  function currentFrame(): WorkerPerformerInteractionFrame {
    return {
      camera: {
        position: [...cameraSnapshot.position],
        target: [...cameraSnapshot.target],
        fov: cameraSnapshot.fov,
        up: [...cameraSnapshot.up],
        quaternion: [...cameraSnapshot.quaternion],
      },
      performers: frame.performers.map((performer) => ({
        ...performer,
        position: { ...performer.position },
        badge: performer.badge ? { ...performer.badge } : undefined,
      })),
      groundY: frame.groundY,
      stageBounds: { ...frame.stageBounds },
      requireRenderedSurfaceAnchors: frame.requireRenderedSurfaceAnchors,
    };
  }

  function updateInteractionState(force = false): void {
    placing = supported ? (bridge?.placing ?? false) : false;
    const next = supported
      ? {
          hoveredIndex: bridge?.hoveredIndex ?? null,
          draggingIndex: bridge?.draggingIndex ?? null,
        }
      : { hoveredIndex: null, draggingIndex: null };
    if (
      !force &&
      next.hoveredIndex === interactionState.hoveredIndex &&
      next.draggingIndex === interactionState.draggingIndex
    ) {
      return;
    }
    interactionState = next;
    projectionRevision += 1;
  }

  function scheduleStateUpdate(): void {
    if (stateFrame !== null) return;
    stateFrame = requestAnimationFrame(() => {
      stateFrame = null;
      updateInteractionState();
    });
  }

  function reportCapability(
    capability: WorkerPerformerInteractionCapability
  ): void {
    if (supported !== capability.supported) {
      supported = capability.supported;
    }
    updateInteractionState();
    if (!("blockers" in capability)) {
      lastFailureKey = null;
      return;
    }

    const key = `unsupported:${capability.blockers.join(",")}`;
    if (lastFailureKey === key) return;
    lastFailureKey = key;
    onFailure?.({
      reason: "unsupported",
      blockers: [...capability.blockers],
      message: null,
    });
  }

  function fail(
    reason: "initialization-failed" | "update-failed",
    error: unknown
  ): void {
    failed = true;
    supported = false;
    bridge?.dispose();
    bridge = null;
    updateInteractionState(true);
    const message = error instanceof Error ? error.message : String(error);
    const key = `${reason}:${message}`;
    if (lastFailureKey === key) return;
    lastFailureKey = key;
    onFailure?.({ reason, blockers: [], message });
  }

  function updateBridge(): void {
    if (!mounted || !bridge || failed) return;
    try {
      reportCapability(bridge.update(currentFrame()));
      projectionRevision += 1;
    } catch (error) {
      fail("update-failed", error);
    }
  }

  const moveHintSelection = $derived.by((): WorkerMoveHintSelection | null => {
    void projectionRevision;
    if (!supported || viewer.performerSelectionMode) return null;

    const interactivePerformers = new Map(
      frame.performers
        .filter((performer) => performer.interactive !== false)
        .map((performer) => [performer.index, performer] as const)
    );
    const selected = viewer.selectedPerformerIndices.filter((index) =>
      interactivePerformers.has(index)
    );
    if (selected.length === 0) return null;
    const positions = selected.flatMap((index) => {
      const viewerPosition =
        viewer.performerManager.performers[index]?.position;
      const framePosition = interactivePerformers.get(index)?.position;
      const position = viewerPosition ?? framePosition;
      return position ? [{ ...position }] : [];
    });
    if (positions.length === 0) return null;
    return {
      key: selected.join(":"),
      position: {
        x:
          positions.reduce((total, position) => total + position.x, 0) /
          positions.length,
        z:
          positions.reduce((total, position) => total + position.z, 0) /
          positions.length,
      },
      groundY: frame.groundY,
    };
  });

  $effect(() => {
    void frame;
    void cameraSnapshot;
    // updateBridge synchronizes imperative bridge state back into this
    // component. Its reads are not dependencies of the incoming frame effect;
    // tracking them made the effect subscribe to the same state it writes and
    // produced an effect_update_depth_exceeded loop in the real viewer.
    untrack(updateBridge);
  });

  $effect(() => {
    if (!mounted) return;
    onInteractionChange?.({
      hoveredIndex: interactionState.hoveredIndex,
      draggingIndex: interactionState.draggingIndex,
    });
  });

  onMount(() => {
    mounted = true;
    const detachPlacement = viewer.registerPerformerPlacement?.(() => {
      if (!bridge?.placing) {
        bridge?.togglePlacement();
        updateInteractionState(true);
      }
    });
    try {
      bridge = createWorkerPerformerInteractionBridge({
        interactionSurface,
        projectionContainer,
        viewer,
        cameraArbiter,
        onHintDismissed: () => onHintDismissed?.(),
      });
      reportCapability(bridge.update(currentFrame()));
      bridge.attach();
    } catch (error) {
      fail("initialization-failed", error);
    }

    const interactionEvents = [
      "pointermove",
      "pointerdown",
      "pointerup",
      "pointercancel",
      "lostpointercapture",
      "pointerleave",
      "keydown",
    ] as const;
    for (const type of interactionEvents) {
      interactionSurface.addEventListener(type, scheduleStateUpdate);
    }

    return () => {
      mounted = false;
      detachPlacement?.();
      if (stateFrame !== null) {
        cancelAnimationFrame(stateFrame);
        stateFrame = null;
      }
      for (const type of interactionEvents) {
        interactionSurface.removeEventListener(type, scheduleStateUpdate);
      }
      bridge?.dispose();
      bridge = null;
      supported = false;
      onInteractionChange?.({ hoveredIndex: null, draggingIndex: null });
    };
  });
</script>

{#if bridge && moveHintSelection}
  {#key moveHintSelection.key}
    <WorkerPerformerMoveHint
      {bridge}
      position={moveHintSelection.position}
      groundY={moveHintSelection.groundY}
      {placing}
      {projectionRevision}
    />
  {/key}
{/if}
{#if bridge && placing}
  <PerformerPlacementPrompt
    oncancel={() => {
      bridge?.togglePlacement();
      updateInteractionState(true);
    }}
  />
{/if}
