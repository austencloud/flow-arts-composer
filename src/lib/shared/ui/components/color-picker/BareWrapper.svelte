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
  .bare {
    display: grid;
    gap: 6px;
    width: 100%;
  }
</style>
