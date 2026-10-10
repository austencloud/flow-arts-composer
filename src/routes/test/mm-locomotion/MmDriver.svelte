<script lang="ts">
  /**
   * MmDriver — Threlte child that advances MmLocomotionController each frame.
   *
   * A useTask loop must run inside the <Canvas> context, so the per-frame drive
   * lives here rather than on the page. delta is in SECONDS in @threlte/core
   * useTask (verified against OrbitControls.svelte / FireLabScene.svelte, which
   * clamp it as seconds: 0.1 and 1/15 respectively). It is clamped here to avoid
   * a large step after a tab stall.
   */
  import { useTask } from "@threlte/core";
  import type { MmLocomotionController } from "#lib/features/stage/locomotion/motion-matching/mm-locomotion-controller.js";

  let { controller }: { controller: MmLocomotionController | null } = $props();

  useTask((delta) => {
    if (!controller) return;
    controller.update(Math.min(delta, 1 / 15));
  });
</script>
