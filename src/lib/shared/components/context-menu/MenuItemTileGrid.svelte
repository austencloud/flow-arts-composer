<!--
  MenuItemTileGrid — context-menu entries rendered as picture tiles: the
  item's icon as the picture, its label under it, pressed when `checked`. The
  tiles are the rail family's `.rt-chip` in the shared `.rt-tile-grid`, the
  same vocabulary as the animation panel's display tiles, so a host showing
  both gets one kind of switch.

  This is another view of a menu builder's list, not a
  second list: `action` runs on click and the builder stays the owner of
  labels and handlers. Submenus are not drawn; flatten them first. The host
  sets `--tile-grid-cols` and `--tile-grid-art` (see rail-tile.css).
-->
<script lang="ts">
  import "#lib/shared/animation-panel/bento/rail-tile.css";
  import type { ContextMenuItem } from "./context-menu-types";

  interface Props {
    items: readonly ContextMenuItem[];
    /** Names the group for assistive tech. */
    ariaLabel?: string;
  }

  let { items, ariaLabel }: Props = $props();

  /** Menu builders write bare `fa-*` names (the menu adds the style class);
   *  other lists write the full class. Both draw as the solid style. */
  function iconClass(icon: string | undefined): string {
    if (!icon) return "";
    return /\bfa[srb]\b|\bfa-(solid|regular|brands)\b/.test(icon)
      ? icon
      : `fas ${icon}`;
  }
</script>

<div class="rt-tile-grid" role="group" aria-label={ariaLabel}>
  {#each items as item (item.id)}
    <button
      type="button"
      class="rt-chip"
      aria-pressed={item.checked ?? false}
      disabled={item.disabled}
      onclick={() => void item.action?.()}
    >
      <span class="art" aria-hidden="true">
        {#if item.icon}<i class={iconClass(item.icon)}></i>{/if}
      </span>
      <span class="chip-label">{item.label}</span>
    </button>
  {/each}
</div>

<style>
  /* The same square box DisplayTilePreview draws in, so an icon tile and a
     drawn preview tile are the same size; the icon scales with the box. */
  .art {
    display: grid;
    place-items: center;
    width: 100%;
    max-width: var(--tile-art, 4rem);
    aspect-ratio: 1;
    margin-inline: auto;
    flex: 0 0 auto;
    container-type: inline-size;
  }

  .art i {
    font-size: 48cqi;
    line-height: 1;
  }
</style>
