<!--
  Keeps every 3D clip's stage alive for as long as the canvas is open (see
  `stage-3d-slots.svelte.ts`). Stages rest here, unseen, until their clip's
  layer lends them a slot. A post without a 3D clip loads no 3D code.
-->
<script lang="ts">
  import type { CanvasOverlayProps } from "@austencloud/video-editor";
  import type { PostAnimationItem } from "../item-kinds";
  import type PostStudioStage3DLayerType from "./PostStudioStage3DLayer.svelte";
  import PostStage3DKept from "./PostStage3DKept.svelte";

  let { editor }: CanvasOverlayProps = $props();

  const stageItems = $derived(
    editor.project.tracks.flatMap((track) =>
      track.items.filter(
        (item): item is PostAnimationItem =>
          item.kind === "animation" && item.stage3d !== undefined
      )
    )
  );

  let Stage = $state.raw<typeof PostStudioStage3DLayerType | null>(null);
  $effect(() => {
    if (stageItems.length === 0 || Stage) return;
    let current = true;
    void import("./PostStudioStage3DLayer.svelte").then((module) => {
      if (current) Stage = module.default;
    });
    return () => {
      current = false;
    };
  });
</script>

{#if Stage && stageItems.length > 0}
  <div class="home" aria-hidden="true">
    {#each stageItems as item (item.id)}
      <PostStage3DKept {editor} {item} {Stage} />
    {/each}
  </div>
{/if}

<style>
  /* Resting stages keep a real size so they build, but are never seen. */
  .home {
    position: absolute;
    inset: 0;
    visibility: hidden;
    pointer-events: none;
    overflow: hidden;
    z-index: -1;
  }
</style>
