<script lang="ts">
  /** Connect an environment harness to the app-wide copy/replay view owner. */
  import { onMount } from "svelte";
  import { useTask, useThrelte } from "@threlte/core";
  import { Raycaster } from "three";
  import { registerViewSource } from "#lib/shared/review/view-capture.js";
  import {
    inspectEnvironmentReviewTarget,
    readEnvironmentReviewPose,
    type EnvironmentReviewReading,
  } from "./environment-review-view-source";

  interface Props {
    sceneId: string;
    state?: () => Record<string, unknown>;
    onReading?: (reading: EnvironmentReviewReading) => void;
  }

  let { sceneId, state, onReading }: Props = $props();
  const threlte = useThrelte();
  const raycaster = new Raycaster();
  let elapsed = 0;

  const cameraPose = () => readEnvironmentReviewPose(threlte.camera.current);
  const target = () =>
    inspectEnvironmentReviewTarget(
      threlte.scene,
      threlte.camera.current,
      raycaster
    );

  onMount(() =>
    registerViewSource({
      sceneId,
      pose: cameraPose,
      canvas: () => {
        const renderer =
          (threlte.renderer as { current?: import("three").WebGLRenderer })
            .current ??
          (threlte.renderer as unknown as import("three").WebGLRenderer);
        return renderer?.domElement ?? null;
      },
      target,
      state,
    })
  );

  // Ten readings per second keeps a coordinate HUD responsive without adding
  // one raycast to every rendered frame in the scene under review.
  useTask((delta) => {
    elapsed += delta;
    if (elapsed < 0.1) return;
    elapsed = 0;
    onReading?.({ camera: cameraPose(), target: target() });
  });
</script>
