<script lang="ts">
  import type { CanvasOverlayProps } from "@austencloud/video-editor";
  import { canvasAspectOf } from "#lib/shared/media-composition/domain/auto-frame";
  import { reelsPreview } from "./reels-preview.svelte";
  import { REEL_FRAME, REEL_ZONES } from "./reel-zones";

  /**
   * A Reel's own controls drawn over a 9:16 post: the header, the buttons
   * down the right, and the caption fading in at the bottom, in the sizes the
   * app shows them on a 1080 by 1920 screen. A picture to frame against, not
   * the real app; hidden while the crop screen owns the canvas.
   */
  let { editor, cropping }: CanvasOverlayProps = $props();

  const portrait = $derived(Math.abs(canvasAspectOf(editor.project.canvas) - 9 / 16) < 0.01);
  const caption = $derived(editor.project.title || "Your caption");

  const zones = REEL_ZONES;
  const feed = zones.feedWindow;
  const bubbles = zones.friendBubbles;

  // Glyphs are drawn about 100 wide and roughly -46 to +50 tall around their
  // y. The first top lands at the column's top (830); the audio square ends at
  // its bottom (1750). Stride 160, counts 96 below each glyph's y.
  const columnX = (zones.buttons.x0 + zones.buttons.x1) / 2;
  const buttons = [
    { y: 876, count: "1,204", path: "M0 -22 C-14 -46 -50 -40 -50 -12 C-50 14 -18 34 0 50 C18 34 50 14 50 -12 C50 -40 14 -46 0 -22 Z" },
    { y: 1036, count: "38", path: "M-44 2 A44 42 0 1 1 -30 32 L-46 48 L-24 40 A44 42 0 0 1 -44 2 Z" },
    // Repost: two arrows chasing each other round a loop.
    { y: 1196, count: "96", path: "M-34 -8 V-18 A14 14 0 0 1 -20 -32 H24 M10 -46 L26 -32 L10 -18 M34 8 V18 A14 14 0 0 1 20 32 H-24 M-10 46 L-26 32 L-10 18" },
    { y: 1356, count: "12", path: "M-46 -6 L46 -40 L18 46 L2 10 Z M2 10 L46 -40" },
  ];
  const moreY = 1540;
  const audioSize = 70;
  const audioTop = zones.buttons.y1 - audioSize;

  // The name row's top edge sits at the caption block's top; the lines below
  // keep their spacing from it.
  const nameTop = zones.captionBlock.y0;
  const nameCy = nameTop + 38;

  // The two explanatory labels are HTML over the picture so their type stays
  // one size while the preview shrinks; only their positions follow the zones.
  const pct = (value: number, of: number) => `${(value / of) * 100}%`;
  const feedLabelTop = pct(feed.y0, REEL_FRAME.height);
  const bubblesLabelLeft = pct(bubbles.x0, REEL_FRAME.width);
  const bubblesLabelBottom = pct(REEL_FRAME.height - bubbles.y1, REEL_FRAME.height);
  const bubblesLabelMaxWidth = pct(zones.buttons.x0 - bubbles.x0, REEL_FRAME.width);
</script>

{#if reelsPreview.shown && portrait && !cropping}
  <div class="reels-preview" aria-hidden="true">
  <svg
    class="reels-art"
    viewBox="0 0 1080 1920"
    preserveAspectRatio="none"
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
        <g transform="translate({columnX} {button.y})" fill="none" stroke="white" stroke-width="7" stroke-linejoin="round" stroke-linecap="round">
          <path d={button.path} />
        </g>
        <text x={columnX} y={button.y + 96} font-size="30" font-weight="600" text-anchor="middle">{button.count}</text>
      {/each}
      <g transform="translate({columnX} {moreY})">
        <circle cx="-26" cy="0" r="7" /><circle cx="0" cy="0" r="7" /><circle cx="26" cy="0" r="7" />
      </g>
      <rect x={columnX - audioSize / 2} y={audioTop} width={audioSize} height={audioSize} rx="14" fill="none" stroke="white" stroke-width="6" />

      <circle cx="84" cy={nameCy} r="38" fill="rgb(255 255 255 / 0.25)" stroke="white" stroke-width="4" />
      <text x="140" y={nameCy + 13} font-size="38" font-weight="700">flowartscomposer</text>
      <rect x="478" y={nameTop + 10} width="146" height="58" rx="14" fill="none" stroke="white" stroke-width="4" />
      <text x="551" y={nameTop + 50} font-size="32" font-weight="600" text-anchor="middle">Follow</text>
      <text x="48" y={nameTop + 136} font-size="36">{caption} … more</text>
      <text x="48" y={nameTop + 218} font-size="32" opacity="0.9">♫ flowartscomposer · Original audio</text>
    </g>

    <!-- Friends' bubbles show only sometimes, so they are drawn faint. -->
    <g class="bubbles" opacity="0.5" fill="white" font-family="system-ui, sans-serif">
      <circle cx={bubbles.x0 + 50} cy={bubbles.y0 + 70} r="40" fill="rgb(255 255 255 / 0.35)" stroke="white" stroke-width="4" />
      <circle cx={bubbles.x0 + 110} cy={bubbles.y0 + 70} r="40" fill="rgb(255 255 255 / 0.35)" stroke="white" stroke-width="4" />
      <circle cx={bubbles.x0 + 170} cy={bubbles.y0 + 70} r="40" fill="rgb(255 255 255 / 0.35)" stroke="white" stroke-width="4" />
      <rect x={bubbles.x0 + 240} y={bubbles.y0 + 58} width="300" height="24" rx="12" fill="rgb(255 255 255 / 0.6)" />
    </g>

    <!-- What the home feed keeps when it crops this Reel to 4:5. -->
    <g fill="none" stroke-dasharray="28 20">
      <rect x={feed.x0} y={feed.y0} width={feed.x1 - feed.x0} height={feed.y1 - feed.y0} stroke="black" stroke-opacity="0.6" stroke-width="8" />
      <rect x={feed.x0} y={feed.y0} width={feed.x1 - feed.x0} height={feed.y1 - feed.y0} stroke="white" stroke-width="4" />
    </g>
  </svg>
  <span class="label feed-label" style:top={feedLabelTop}>Home feed crop</span>
  <span
    class="label bubbles-label"
    style:left={bubblesLabelLeft}
    style:bottom={bubblesLabelBottom}
    style:max-width={bubblesLabelMaxWidth}
  >Friends' bubbles, sometimes</span>
  </div>
{/if}

<style>
  .reels-preview {
    position: absolute;
    inset: 0;
    z-index: 20001;
    pointer-events: none;
  }

  .reels-art {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }

  .label {
    position: absolute;
    padding: 2px 4px;
    border-radius: 3px;
    background: rgb(0 0 0 / 0.6);
    color: white;
    font-family: system-ui, sans-serif;
    font-size: var(--font-size-compact);
    font-weight: 600;
    line-height: 1.2;
  }

  .feed-label {
    left: 6px;
    margin-top: 4px;
  }
</style>
