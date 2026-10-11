<!--
  CardBackLoopIcon.svelte — standalone extraction of a single .loop-icon-cell
  from CardBack.svelte's loop row, for offscreen rasterization (P1.4a).

  PARITY: reproduces the EXACT node-selection logic and the .loop-icon-cell
  styling from CardBack.svelte:
    - SWAPPED      -> <i class="fas fa-shuffle" ... />
    - quartered INVERTED -> <CheckerboardCircleIcon size="8cqi" color={color} />
    - quartered ROTATED  -> <i class="fas fa-arrows-spin" ... />
    - else         -> <i class={fa} ... />
  The cell is 9cqi × 9cqi with an 8cqi icon, matching the live card. Mount
  inside a container-type:inline-size width = real card render width (1644px)
  so the cqi-based icon size matches the live card.
-->
<script lang="ts">
  import CheckerboardCircleIcon from "#lib/shared/icons/CheckerboardCircleIcon.svelte";

  interface Props {
    /** Which kind of icon node to render. */
    kind: "swap" | "checkerboard" | "fa";
    /** FontAwesome class string (used when kind === "fa"). */
    fa?: string;
    /** Icon color (used by fa <i> and CheckerboardCircleIcon). */
    color?: string;
    rotationDegrees?: number;
    iconScale?: number;
  }
  let {
    kind,
    fa = "",
    color = "currentColor",
    rotationDegrees = 0,
    iconScale = 1,
  }: Props = $props();
</script>

<span class="loop-icon-cell" style="overflow: hidden; width: 9cqi; height: 9cqi;">
  {#if kind === "swap"}
    <i
      class="fas fa-shuffle"
      style="font-size: 8cqi; color: {color}; line-height: 1; display: block; transform: rotate({rotationDegrees}deg) scale({iconScale});"
      aria-hidden="true"
    ></i>
  {:else if kind === "checkerboard"}
    <CheckerboardCircleIcon size="8cqi" {color} />
  {:else}
    <i
      class={fa}
      style="font-size: 8cqi; color: {color}; line-height: 1; display: block; transform: rotate({rotationDegrees}deg) scale({iconScale});"
      aria-hidden="true"
    ></i>
  {/if}
</span>

<style>
  /* verbatim from CardBack.svelte */
  .loop-icon-cell {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 9cqi;
    height: 9cqi;
    overflow: hidden;
  }

  .loop-icon-cell i {
    filter: none;
  }
</style>
