<script lang="ts">
  /**
   * MethodPreviewFinger
   *
   * The demo finger in a Create method preview: the shared GhostPointer at
   * its compact size, posed by the scene's ghost (sceneGhost() in
   * method-preview-run.ts). Render it inside the scene's positioned root;
   * the pose is in root pixels. Its glow takes the scene's --accent. Like
   * the Composer page's demo fingers it passes no speed, so it draws no
   * trail: GhostPointer sizes its trail for page-length glides.
   */
  import GhostPointer from "#lib/shared/attract/components/GhostPointer.svelte";
  import type { GhostState } from "#lib/shared/attract/services/attract-ghost.svelte.js";

  let { pose }: { pose: GhostState | null } = $props();
</script>

{#if pose}
  <GhostPointer
    compact
    x={pose.x}
    y={pose.y}
    pressed={pose.pressed}
    visible={pose.visible}
    considering={pose.considering}
    parked={false}
    dimmed={false}
  />
{/if}
