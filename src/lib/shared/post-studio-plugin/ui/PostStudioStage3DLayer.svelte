<!--
  A 3D animation clip: the post's performers on the 3D stage, each on the
  step the post's clock gives it, seen through the clip's shot.

  The viewer is a per-clip instance (the Scene3DPreview pattern): a seeded
  state that reads and writes none of the device's 3D settings, and local
  effects and scene contexts. Two clips on screen are two stages. The cast is
  staged like the tunnel page's 3D view: a file front to back, all facing the
  audience, the back performers in the tunnel's colors.

  Nothing here plays on its own. Every step comes from the post time, and the
  camera is a function of the shot and the post time, so a paused, scrubbed or
  exported frame shows the same picture. For export the stage registers a
  frame source that renders one frame on demand with the scene's own loop
  paused, the offline 3D exporter's method.
-->
<script lang="ts">
  import { onDestroy, onMount, tick, untrack } from "svelte";
  import { userProportionsState } from "@austencloud/scene-3d";
  import { Vector2, type PerspectiveCamera, type WebGLRenderer } from "three";
  import Viewer3DCanvas from "#lib/shared/3d/components/Viewer3DCanvas.svelte";
  import { createViewer3DState } from "#lib/shared/3d/state/viewer-3d-state.svelte.js";
  import { setViewer3DContext } from "#lib/shared/3d/context/viewer-3d-context.js";
  import { createEffectsConfigState } from "#lib/shared/effects/state/effects-config-state.svelte.js";
  import { setEffectsConfigContext } from "#lib/shared/effects/state/effects-config-context.js";
  import { createScene3DRenderState } from "#lib/shared/3d/scene-features/state/scene-3d-render-state.svelte.js";
  import { setScene3DRenderContext } from "#lib/shared/3d/scene-features/state/scene-3d-render-context.js";
  import { normalizeSceneEnvironmentId } from "#lib/shared/3d/environments/domain/scene-environment.js";
  import type { PerformerPropColors } from "#lib/shared/3d/rendering/performer-prop-tint.js";
  import {
    applyTunnelCastToViewer,
    type TunnelCastPerformer3D,
  } from "#lib/shared/sequence-viewer/tunnel/tunnel-cast-3d.js";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import type { PostStage3D } from "../item-kinds";
  import { backPerformerName, followerPropColors } from "../tunnel-performers";
  import { registerStage3DFrameSource } from "../stage-3d-registry";
  import {
    stage3DBaseShot,
    stage3DCameraPose,
    type StageCameraPose,
  } from "./stage-3d-camera";
  import { stage3DCameraState } from "./stage-3d-camera-state.svelte";

  let {
    itemId,
    sequence,
    followerSequences,
    followerCount,
    performerSteps,
    stage,
    orbitAngle,
    postSeconds,
    leftPropType,
    rightPropType,
    exporting,
    exportSize,
  }: {
    itemId: string;
    sequence: SequenceData;
    /** Each follower's own sequence; null while they are building. */
    followerSequences: readonly SequenceData[] | null;
    followerCount: number;
    /** Front performer first, then each follower, in engine positions. */
    performerSteps: readonly number[];
    stage: PostStage3D;
    /** The orbit shot's turn at this post time. */
    orbitAngle: number;
    postSeconds: number;
    leftPropType?: string | null;
    rightPropType?: string | null;
    exporting: boolean;
    exportSize?: { width: number; height: number } | null;
  } = $props();

  const environmentId = $derived(
    normalizeSceneEnvironmentId(stage.environment)
  );

  // svelte-ignore state_referenced_locally
  const viewer = createViewer3DState(
    {
      renderMode: "3d",
      environmentId: normalizeSceneEnvironmentId(stage.environment),
      // The post owns its look: no device effects, grid or plane labels.
      effectToggles: { fire: false, led: false, trails: false, charcoal: false },
      showGridLabels: false,
      visiblePlanes: [],
    },
    { hostOwnsCast: true }
  );
  setViewer3DContext(viewer);
  setEffectsConfigContext(
    createEffectsConfigState(undefined, { persist: false })
  );
  setScene3DRenderContext(createScene3DRenderState());

  let entered = $state(false);
  let sceneReady = $state(false);
  let element = $state<HTMLDivElement | null>(null);
  let boxWidth = $state(0);
  let boxHeight = $state(0);

  onMount(() => {
    viewer.enter3D(sequence);
    entered = true;
  });

  $effect(() => {
    const id = environmentId;
    untrack(() => {
      if (viewer.environmentId !== id) viewer.setEnvironmentId(id);
    });
  });

  // The cast: the front performer in the app's red and blue, each follower in
  // its tunnel colors, dancing its own transformed sequence.
  const cast = $derived.by((): TunnelCastPerformer3D[] | null => {
    if (followerCount > 0 && !followerSequences) return null;
    const followers = followerSequences ?? [];
    return [
      {
        id: "front",
        label: "Front",
        sequence,
        offset: 0,
        speed: 1,
        colors: { left: "", right: "" },
      },
      ...followers.slice(0, followerCount).map((followerSequence, index) => ({
        id: `back-${index}`,
        label: backPerformerName(index, followerCount),
        sequence: followerSequence,
        offset: 0,
        speed: 1,
        colors: followerPropColors(index, followerCount),
      })),
    ];
  });
  const propColors = $derived<(PerformerPropColors | null)[]>([
    null,
    ...Array.from({ length: followerCount }, (_, index) =>
      followerPropColors(index, followerCount)
    ),
  ]);

  let castApplied = $state(false);
  $effect(() => {
    const current = cast;
    if (!entered || !current) {
      castApplied = false;
      return;
    }
    // Entering 3D seeds an empty rig with the opened sequence, and the stage
    // axis turns with the environment; both send the cast back to its places.
    for (const rig of viewer.performerManager.performers) void rig.sourceSequence;
    void viewer.environmentId;
    untrack(() => {
      applyTunnelCastToViewer(viewer, current);
      castApplied =
        viewer.performerManager.performers.length === current.length;
    });
  });

  /** The box's shape; the export's own size while exporting. */
  const aspect = $derived(
    exporting && exportSize && exportSize.height > 0
      ? exportSize.width / exportSize.height
      : boxWidth > 0 && boxHeight > 0
        ? boxWidth / boxHeight
        : 1
  );

  const baseShot = $derived.by((): StageCameraPose | null => {
    if (!castApplied) return null;
    const performers = viewer.performerManager.performers;
    if (performers.length === 0) return null;
    return stage3DBaseShot(
      performers.map((performer) => ({
        position: { x: performer.position.x, z: performer.position.z },
        loadedSequence: performer.loadedSequence,
        handDistance: performer.handDistance,
        staffHalfLength: performer.staffLength / 2,
      })),
      viewer.stageGroundOffset + userProportionsState.groundY,
      aspect,
      viewer.environmentId
    );
  });

  const pose = $derived.by((): StageCameraPose | null => {
    const dragging = stage3DCameraState.live;
    if (dragging?.itemId === itemId && stage.shot === "saved") {
      return dragging.pose;
    }
    return baseShot ? stage3DCameraPose(stage, baseShot, orbitAngle) : null;
  });

  $effect(() => {
    if (pose) stage3DCameraState.setShown(itemId, pose);
  });

  // ---- Preview camera --------------------------------------------------------

  // The viewer can glide its own camera (its welcome move), and a stray drag
  // could turn it, so every frame puts the camera back on the shot's pose
  // whenever it has drifted.
  let frame = 0;
  function holdCamera(): void {
    frame = requestAnimationFrame(holdCamera);
    const current = pose;
    if (!current || viewer.isExporting) return;
    const camera = viewer.threlteCamera as PerspectiveCamera | null;
    if (camera) {
      const p = camera.position;
      const drift = Math.hypot(
        p.x - current.position.x,
        p.y - current.position.y,
        p.z - current.position.z
      );
      if (drift < 1e-4 && lastTarget === current.target) return;
    }
    lastTarget = current.target;
    viewer.snapCameraTo(current.position, current.target, undefined, false);
  }
  let lastTarget: StageCameraPose["target"] | null = null;
  onMount(() => {
    frame = requestAnimationFrame(holdCamera);
    return () => cancelAnimationFrame(frame);
  });

  // ---- Export ----------------------------------------------------------------

  interface ExportSession {
    width: number;
    height: number;
    pixelRatio: number;
    cameraAspect: number;
    clockMs: number;
    firstSeconds: number;
  }
  let session: ExportSession | null = null;
  let output: HTMLCanvasElement | null = null;

  const ready = $derived(
    entered &&
      sceneReady &&
      castApplied &&
      pose !== null &&
      viewer.threlteRunFrame !== null &&
      viewer.webglCanvas !== null
  );

  async function render(
    width: number,
    height: number
  ): Promise<HTMLCanvasElement> {
    const renderer = viewer.threlteRenderer as WebGLRenderer | null;
    const camera = viewer.threlteCamera as PerspectiveCamera | null;
    const runFrame = viewer.threlteRunFrame;
    const canvas = viewer.webglCanvas;
    if (!renderer || !camera || !runFrame || !canvas) {
      throw new Error("The 3D stage has no renderer to export from.");
    }
    if (!session) {
      const size = renderer.getSize(new Vector2());
      session = {
        width: size.x,
        height: size.y,
        pixelRatio: renderer.getPixelRatio(),
        cameraAspect: camera.aspect,
        clockMs: performance.now(),
        firstSeconds: postSeconds,
      };
      viewer.isExporting = true;
      viewer.threltePauseAutoLoop?.();
    }
    if (canvas.width !== width || canvas.height !== height) {
      renderer.setPixelRatio(1);
      renderer.setSize(width, height, false);
    }
    // The seek has set the post time; let the steps and the pose land.
    await tick();
    const current = pose;
    if (!current) throw new Error("The 3D stage has no camera to export from.");
    camera.aspect = width / height;
    camera.up.set(0, 1, 0);
    camera.position.set(
      current.position.x,
      current.position.y,
      current.position.z
    );
    camera.lookAt(current.target.x, current.target.y, current.target.z);
    camera.updateProjectionMatrix();
    runFrame(session.clockMs + (postSeconds - session.firstSeconds) * 1000);
    // The drawing buffer is not kept: copy it before anything yields.
    output ??= document.createElement("canvas");
    if (output.width !== width || output.height !== height) {
      output.width = width;
      output.height = height;
    }
    const context = output.getContext("2d");
    if (!context) throw new Error("The 3D stage could not copy its frame.");
    context.clearRect(0, 0, width, height);
    context.drawImage(canvas, 0, 0, width, height);
    return output;
  }

  function finish(): void {
    const ended = session;
    if (!ended) return;
    session = null;
    const renderer = viewer.threlteRenderer as WebGLRenderer | null;
    const camera = viewer.threlteCamera as PerspectiveCamera | null;
    if (renderer) {
      renderer.setPixelRatio(ended.pixelRatio);
      renderer.setSize(ended.width, ended.height, false);
    }
    if (camera) {
      camera.aspect = ended.cameraAspect;
      camera.updateProjectionMatrix();
    }
    viewer.isExporting = false;
    viewer.threlteResumeAutoLoop?.();
    lastTarget = null;
  }

  $effect(() => {
    if (!exporting) untrack(finish);
  });

  $effect(() => {
    const host = element;
    if (!host) return;
    return registerStage3DFrameSource(host, {
      ready: () => ready,
      render,
      finish,
    });
  });

  onDestroy(() => {
    finish();
    viewer.dispose();
  });
</script>

<div
  class="stage-3d"
  bind:this={element}
  bind:clientWidth={boxWidth}
  bind:clientHeight={boxHeight}
  data-stage-3d={itemId}
  data-stage-3d-ready={ready}
  data-stage-3d-shot={stage.shot}
  data-stage-3d-orbit-angle={orbitAngle.toFixed(4)}
  data-stage-3d-steps={performerSteps.map((step) => step.toFixed(4)).join(",")}
>
  {#if entered}
    <Viewer3DCanvas
      sequenceData={sequence}
      currentStep={performerSteps[0] ?? 0}
      performerSteps={performerSteps}
      performerPropColors={propColors}
      isPlaying={false}
      {leftPropType}
      {rightPropType}
      hideOverlays
      hidePerformerBadges
      hideSceneMarkers
      rendererHandleRequired
      onSceneReadyChange={(value: boolean) => (sceneReady = value)}
    />
  {/if}
</div>

<style>
  .stage-3d {
    position: absolute;
    inset: 0;
    overflow: hidden;
    background: #000;
  }
</style>
