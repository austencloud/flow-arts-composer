<script lang="ts">
  /**
   * Replaces svelte-awesome-color-picker's popup wrapper so the square and hue
   * slider render inline inside our own editor card, with no border, margin,
   * or dialog role of their own.
   */
  import type { Snippet } from "svelte";

  interface Props {
    wrapper?: HTMLElement;
    isOpen: boolean;
    isDialog: boolean;
    children: Snippet;
  }

  let { wrapper = $bindable(), isOpen, isDialog, children }: Props = $props();
</script>

<div bind:this={wrapper} class="bare" hidden={isDialog && !isOpen}>
  {@render children()}
</div>

<style>
  /* The library's square and hue slider expect named areas from their wrapper
     (`.h` is `grid-area: hue`); without them the slider lands in an implicit
     second column. Alpha is never enabled by the owner, so no alpha row. */
  .bare {
    display: grid;
    grid-template-areas: "picker" "hue";
    grid-template-columns: minmax(0, 1fr);
    gap: 6px;
    width: 100%;
  }
</style>
