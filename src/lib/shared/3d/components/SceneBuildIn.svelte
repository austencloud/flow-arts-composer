<script lang="ts">
  /**
   * SceneBuildIn
   *
   * The main-thread renderer's half of the viewer's opening
   * (scene-boot/scene-build-in.ts): a plain stage you can orbit from the
   * first frame, and the environment arriving around it once it has loaded.
   * Renders nothing itself; it drives the shared controller before each frame.
   */
  import { onDestroy } from "svelte";
  import { useTask, useThrelte } from "@threlte/core";
  import { userProportionsState } from "@austencloud/scene-3d";
  import { motionDuration } from "#lib/shared/transitions/motion.js";
  import { DURATION } from "#lib/shared/transitions/transitions.js";
  import { getSceneFeatureContext } from "../scene-features/context/scene-feature-context";
  import { SCENE_ENVIRONMENT_LOADING_SKY } from "../environments/domain/scene-environment-loading-sky";
  import type { SceneEnvironmentId } from "../environments/domain/scene-environment";
  import {
    createSceneBuildIn,
    type SceneBuildInPhase,
  } from "../scene-boot/scene-build-in";
  import {
    resolveThrelteHandles,
    resolveThrelteScene,
  } from "../scene-boot/threlte-handles";

  interface Props {
    environmentId: SceneEnvironmentId;
    /** The plain stage has been drawn, so a painted stand-in can go. */
    onStageShown?: () => void;
    onPhaseChange?: (phase: SceneBuildInPhase) => void;
  }

  let { environmentId, onStageShown, onPhaseChange }: Props = $props();

  // The haze lifts over two scene beats: long enough to read as the world
  // gathering around you, short enough that nobody waits on it.
  const REVEAL_MS = motionDuration(DURATION.scene * 2);

  const threlte = useThrelte();
  const sceneFeatures = getSceneFeatureContext();
  // The camera may mount after this component, so only the scene is needed
  // up front; the renderer and camera are read again when compiling.
  const scene = resolveThrelteScene(threlte.scene);

  const buildIn = scene
    ? createSceneBuildIn({
        scene,
        // The stage takes the sky of the world it opens on; later
        // environment switches use the environment transition instead.
        // svelte-ignore state_referenced_locally
        sky: SCENE_ENVIRONMENT_LOADING_SKY[environmentId],
        groundY: userProportionsState.groundY,
        revealMs: REVEAL_MS,
        prepare: async (scene) => {
          const current = resolveThrelteHandles(threlte);
          if (!current) return;
          await current.renderer.compileAsync(scene, current.camera);
        },
      })
    : null;

  let reportedPhase: SceneBuildInPhase | null = null;
  function reportPhase(): void {
    if (!buildIn || buildIn.phase === reportedPhase) return;
    reportedPhase = buildIn.phase;
    onPhaseChange?.(buildIn.phase);
  }
  reportPhase();

  // The world is in once its environment reports ready, or at once when the
  // environment is switched off and the scene keeps its own plain disc.
  $effect(() => {
    if (!buildIn) return;
    const arrived =
      !sceneFeatures.isEnabled("environment") ||
      sceneFeatures.isReady("environment") ||
      Boolean(sceneFeatures.getError("environment"));
    if (arrived) {
      buildIn.environmentArrived();
      reportPhase();
    }
  });

  $effect(() => {
    buildIn?.setGroundY(userProportionsState.groundY);
  });

  // The stage is on screen once a frame drawn with it has been presented,
  // which is the frame after the first update.
  let stageFrames = 0;
  const { stop } = useTask(() => {
    if (!buildIn) return;
    const camera = threlte.camera.current;
    if (camera) {
      buildIn.update(performance.now(), camera);
      if (++stageFrames === 2) onStageShown?.();
    }
    reportPhase();
    if (buildIn.phase === "done") stop();
  });

  onDestroy(() => buildIn?.dispose());
</script>
