<script lang="ts">
  import { BackgroundType } from "@austencloud/backgrounds";
  import {
    Plane,
    userProportionsState,
    type CameraStateSnapshot,
  } from "@austencloud/scene-3d";
  import midflank from "#lib/shared/3d/environments/domain/models/scene-configs/ember-midflank-r5.json";
  import { SCENE_FEATURES } from "#lib/shared/3d/scene-features/domain/scene-feature-registry.js";
  import { goto } from "$app/navigation";
  import { onDestroy } from "svelte";

  import Viewer3DFullscreen from "#lib/shared/3d/components/Viewer3DFullscreen.svelte";
  import { setViewer3DContext } from "#lib/shared/3d/context/viewer-3d-context.js";
  import {
    readCameraUrlPose,
    setCameraUrlPose,
  } from "#lib/shared/3d/domain/camera-url-pose.js";
  import { createViewer3DState } from "#lib/shared/3d/state/viewer-3d-state.svelte.js";
  import { createPlaybackState } from "#lib/shared/3d/state/playback-state.svelte.js";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import demoSequenceJson from "#lib/shared/landing/data/demo-sequence.json";
  import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import { EMBER_VIEWER_FRONT_STAGE_FACING_ANGLE } from "#lib/shared/3d/domain/viewer-formation-facing.js";
  import { parseGridJoinToken } from "#lib/shared/foundation/domain/models/grid-join-token.js";

  const WORKBENCH_SCENES = new Set<string>([
    BackgroundType.FOREST,
    BackgroundType.AUTUMN,
    BackgroundType.COSMIC,
    BackgroundType.WINTER,
    BackgroundType.OCEAN,
    BackgroundType.EMBER,
    BackgroundType.BLOSSOM,
    BackgroundType.PRIDE,
    BackgroundType.CELESTIAL,
    BackgroundType.VOID,
  ]);
  const STREAMED_SCENE_FEATURES = ["environment"] as const;
  const workerReview =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("renderer") === "worker";

  function requestedScene(): BackgroundType {
    if (typeof window === "undefined") return BackgroundType.BLOSSOM;
    const requested = new URLSearchParams(window.location.search).get("scene");
    return requested && WORKBENCH_SCENES.has(requested)
      ? (requested as BackgroundType)
      : BackgroundType.BLOSSOM;
  }

  function requestedCamera(): CameraStateSnapshot | null {
    if (typeof window === "undefined") return null;
    const pose = readCameraUrlPose(
      new URLSearchParams(window.location.search),
      48
    );
    if (!pose) {
      // A seeded workbench must not inherit the user's camera from a different
      // environment. null lets the shared opening-camera policy frame it.
      if (requestedScene() !== BackgroundType.EMBER) return null;
      const camera = midflank.reviewCameras[0];
      return {
        position: {
          x: camera.positionWorldXYZ[0],
          y: camera.positionWorldXYZ[1] + userProportionsState.groundY,
          z: camera.positionWorldXYZ[2],
        },
        target: {
          x: camera.targetWorldXYZ[0],
          y: camera.targetWorldXYZ[1] + userProportionsState.groundY,
          z: camera.targetWorldXYZ[2],
        },
        rotation: { x: 0, y: 0, z: 0 },
        fov: 50,
        timestamp: 0,
      };
    }
    return {
      ...pose,
      rotation: { x: 0, y: 0, z: 0 },
      timestamp: 0,
    };
  }

  function requestedPerformers() {
    if (requestedScene() !== BackgroundType.EMBER) return [];
    // Ember deliberately looks down the opposite stage axis. The shared
    // formation owner keeps that exception scoped to this environment.
    return [
      {
        position: { x: 0, z: 0 },
        facingAngle: EMBER_VIEWER_FRONT_STAGE_FACING_ANGLE,
        customLeftPlane: Plane.WALL,
        customRightPlane: Plane.WALL,
      },
    ];
  }

  const requestedJoin =
    typeof window !== "undefined"
      ? parseGridJoinToken(
          new URLSearchParams(window.location.search).get("join") ?? ""
        )
      : undefined;
  const sequence = {
    ...demoSequenceJson,
    ...(requestedJoin ? { conjoined: requestedJoin } : {}),
  } as unknown as SequenceData;
  const viewer = createViewer3DState({
    renderMode: "3d",
    backgroundType: requestedScene(),
    camera: requestedCamera(),
    performers: requestedPerformers(),
    selectedPerformerIndex: 0,
    activeFormation: "line",
    defaultProp: PropType.STAFF,
    visiblePlanes: requestedJoin && !workerReview ? [Plane.WALL] : [],
    effectToggles: {},
    sceneFeatures: workerReview
      ? Object.fromEntries(
          SCENE_FEATURES.map((feature) => [feature.key, feature.defaultEnabled])
        )
      : {
          environment: true,
          stage: true,
          audience: false,
          campfire: false,
          tent: false,
        },
  });
  viewer.enter3D(sequence);
  if (!requestedJoin || workerReview) viewer.hideAllPlanes();
  if (
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("perf") === "1"
  ) {
    viewer.togglePerf();
  }
  setViewer3DContext(viewer);

  let currentStepBase = $state(0);
  let bpm = $state(60);
  const playback = createPlaybackState({
    persistenceKey: "tka-viewer-3d-workbench-playback",
    onCycleComplete: () => {
      const stepCount = Math.max(1, sequence.steps.length);
      currentStepBase = (currentStepBase + 1) % stepCount;
      return true;
    },
  });
  const currentStep = $derived(currentStepBase + playback.progress);

  $effect(() => {
    playback.speed = bpm / 60;
  });

  $effect(() => {
    const scene = viewer.seededBackgroundType;
    if (!scene || typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (url.searchParams.get("scene") === scene) return;
    url.searchParams.set("scene", scene);
    goto(url, { shallow: true, replace: true });
  });

  $effect(() => {
    const camera = viewer.cameraSnapshot;
    if (!camera || typeof window === "undefined") return;
    const url = new URL(window.location.href);
    setCameraUrlPose(url, camera, 3);
    goto(url, { shallow: true, replace: true });
  });

  onDestroy(() => {
    playback.destroy();
    viewer.dispose();
  });
</script>

<div class="workbench" data-viewer-3d-workbench>
  <Viewer3DFullscreen
    sequenceData={sequence}
    {currentStep}
    isPlaying={playback.isPlaying}
    {bpm}
    word={null}
    leftPropType="staff"
    rightPropType="staff"
    initialRevealMode={workerReview ? "gated" : "streaming"}
    cameraFov={requestedCamera()?.fov}
    initialRevealDeferredFeatures={STREAMED_SCENE_FEATURES}
    onClose={() => history.back()}
    onPlaybackToggle={playback.togglePlay}
    onBpmChange={(nextBpm) => (bpm = nextBpm)}
    onProgressBarSeek={(targetStep) => {
      currentStepBase = targetStep;
      playback.setProgress(0);
    }}
  />
</div>

<style>
  .workbench {
    position: fixed;
    inset: 0;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    background: var(--theme-panel-bg, #0a0a14);
  }
</style>
