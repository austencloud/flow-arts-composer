<script lang="ts">
  import type { CanvasOverlayProps } from "@austencloud/video-editor";
  import {
    STRIP_AREA,
    stripModeFromRole,
    POST_STUDIO_ROLE,
  } from "@austencloud/video-editor/core";

  /**
   * Outline the strip so prop ends can be framed clear of it: drawn over the
   * frame while a video is selected and the post shows a strip or the
   * carousel, hidden while the crop screen owns the canvas.
   */
  let { editor, cropping }: CanvasOverlayProps = $props();

  const stripGuideVisible = $derived(
    editor.selectedItem?.kind === "video" &&
      editor.frameLayers.some(
        (layer) =>
          stripModeFromRole(layer.sourceRole) !== null ||
          layer.sourceRole === POST_STUDIO_ROLE.carousel
      )
  );

  function pct(value: number): string {
    return `${value * 100}%`;
  }
</script>

{#if stripGuideVisible && !cropping}
  <div
    class="strip-guide"
    aria-hidden="true"
    style:left={pct(STRIP_AREA.x)}
    style:top={pct(STRIP_AREA.y)}
    style:width={pct(STRIP_AREA.width)}
    style:height={pct(STRIP_AREA.height)}
  ></div>
{/if}

<style>
  .strip-guide {
    position: absolute;
    z-index: 20000;
    border: 2px dashed rgb(255 255 255 / 0.7);
    pointer-events: none;
  }
</style>
