<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  /**
   * IndeterminateBar - Thin animated bar that slides back and forth.
   * YouTube/GitHub-style loading indicator.
   */

  interface Props {
    /** Bar color. Defaults to theme accent. */
    color?: string;
    /** Bar height in pixels. Default 3. */
    height?: number;
    /** "top" pins to top of nearest positioned parent. "inline" flows in document. Default "inline". */
    position?: "top" | "inline";
  }

  let { color, height = 3, position = "inline" }: Props = $props();
</script>

<div
  class="indeterminate-bar"
  class:position-top={position === "top"}
  style:height="{height}px"
  style:--bar-color={color}
  role="status"
  aria-label={t("common_loading")}
>
  <div class="fill"></div>
</div>

<style>
  .indeterminate-bar {
    position: relative;
    width: 100%;
    border-radius: 2px;
    background: color-mix(
      in srgb,
      var(--bar-color, var(--theme-accent, #6366f1)) 15%,
      transparent
    );
    overflow: hidden;
  }

  .position-top {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    z-index: 50;
    border-radius: 0;
  }

  /* The slide runs on transform, not left. Animating left re-ran layout every
     frame and Chrome logged each frame as a layout shift: about 4 a second
     while /create booted, all from this bar. translateX percentages are of the
     fill's own width (40% of the track), so -100% and 250% are the old
     left: -40% and left: 100%. */
  .fill {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    width: 40%;
    background: var(--bar-color, var(--theme-accent, #6366f1));
    border-radius: inherit;
    animation: indeterminate-slide 1.4s ease-in-out infinite;
  }

  @keyframes indeterminate-slide {
    0% {
      transform: translateX(-100%);
    }
    100% {
      transform: translateX(250%);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .fill {
      animation: none;
      transform: none;
      width: 100%;
      opacity: 0.6;
    }
  }
</style>
