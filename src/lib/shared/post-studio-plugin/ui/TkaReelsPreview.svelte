<script lang="ts">
  import type { CanvasOverlayProps } from "@austencloud/video-editor";
  import { canvasAspectOf } from "#lib/shared/media-composition/domain/auto-frame";
  import { reelsPreview } from "./reels-preview.svelte";

  /**
   * A Reel's own controls drawn over a 9:16 post: the header, the buttons
   * down the right, and the caption fading in at the bottom, in the sizes the
   * app shows them on a 1080 by 1920 screen. A picture to frame against, not
   * the real app; hidden while the crop screen owns the canvas.
   */
  let { editor, cropping }: CanvasOverlayProps = $props();

  const portrait = $derived(Math.abs(canvasAspectOf(editor.project.canvas) - 9 / 16) < 0.01);
  const caption = $derived(editor.project.title || "Your caption");

  const buttons = [
    { y: 1080, count: "1,204", path: "M0 -22 C-14 -46 -50 -40 -50 -12 C-50 14 -18 34 0 50 C18 34 50 14 50 -12 C50 -40 14 -46 0 -22 Z" },
    { y: 1230, count: "38", path: "M-44 2 A44 42 0 1 1 -30 32 L-46 48 L-24 40 A44 42 0 0 1 -44 2 Z" },
    { y: 1370, count: "12", path: "M-46 -6 L46 -40 L18 46 L2 10 Z M2 10 L46 -40" },
  ];
</script>

{#if reelsPreview.shown && portrait && !cropping}
  <svg
    class="reels-preview"
    viewBox="0 0 1080 1920"
    preserveAspectRatio="none"
    aria-hidden="true"
  >
    <defs>
      <linearGradient id="reels-top" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="black" stop-opacity="0.45" />
        <stop offset="1" stop-color="black" stop-opacity="0" />
      </linearGradient>
      <linearGradient id="reels-bottom" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="black" stop-opacity="0" />
        <stop offset="0.45" stop-color="black" stop-opacity="0.35" />
        <stop offset="1" stop-color="black" stop-opacity="0.75" />
      </linearGradient>
    </defs>

    <rect x="0" y="0" width="1080" height="220" fill="url(#reels-top)" />
    <rect x="0" y="1340" width="1080" height="580" fill="url(#reels-bottom)" />

    <g fill="white" font-family="system-ui, sans-serif">
      <text x="48" y="96" font-size="54" font-weight="700">Reels</text>
      <g transform="translate(1012 78)" fill="none" stroke="white" stroke-width="7" stroke-linejoin="round">
        <rect x="-36" y="-26" width="72" height="54" rx="12" />
        <circle cx="0" cy="1" r="14" />
      </g>

      {#each buttons as button (button.y)}
        <g transform="translate(1005 {button.y})" fill="none" stroke="white" stroke-width="7" stroke-linejoin="round">
          <path d={button.path} />
        </g>
        <text x="1005" y={button.y + 96} font-size="30" font-weight="600" text-anchor="middle">{button.count}</text>
      {/each}
      <g transform="translate(1005 1488)">
        <circle cx="-26" cy="0" r="7" /><circle cx="0" cy="0" r="7" /><circle cx="26" cy="0" r="7" />
      </g>
      <rect x="970" y="1530" width="70" height="70" rx="14" fill="none" stroke="white" stroke-width="6" />

      <circle cx="84" cy="1640" r="38" fill="rgb(255 255 255 / 0.25)" stroke="white" stroke-width="4" />
      <text x="140" y="1653" font-size="38" font-weight="700">flowartscomposer</text>
      <rect x="478" y="1612" width="146" height="58" rx="14" fill="none" stroke="white" stroke-width="4" />
      <text x="551" y="1652" font-size="32" font-weight="600" text-anchor="middle">Follow</text>
      <text x="48" y="1738" font-size="36">{caption} … more</text>
      <text x="48" y="1820" font-size="32" opacity="0.9">♫ flowartscomposer · Original audio</text>
    </g>
  </svg>
{/if}

<style>
  .reels-preview {
    position: absolute;
    inset: 0;
    z-index: 20001;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }
</style>
