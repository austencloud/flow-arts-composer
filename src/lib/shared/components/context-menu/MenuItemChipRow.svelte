<!--
  MenuItemChipRow — context-menu entries rendered as a wrapping row of small
  toggle chips (FilterChipBase mode="toggle"), each with its icon and label,
  pressed when `checked`. The dense sibling of MenuItemTileGrid: a phone
  screen where the stage is the hero shows the same switches as chips, so the
  pictures make room for the thing they switch.

  This is another view of a menu builder's list, not a second list: `action`
  runs on click and the builder stays the owner of labels and handlers.
  Submenus are not drawn; flatten them first. The chip height follows
  `--min-touch-target`, so a dense host lowers it for its own controls.
-->
<script lang="ts">
  import FilterChipBase from "#lib/shared/browse/components/filter-chips/FilterChipBase.svelte";
  import type { ContextMenuItem } from "./context-menu-types";
  import { menuItemIconClass } from "./menu-item-icon";

  interface Props {
    items: readonly ContextMenuItem[];
    /** Names the group for assistive tech. */
    ariaLabel?: string;
    /** Or point at a visible label instead. */
    ariaLabelledby?: string;
    /** center (default) for a row of its own; start beside a row label. */
    align?: "center" | "start";
  }

  let { items, ariaLabel, ariaLabelledby, align = "center" }: Props = $props();
</script>

<div
  class="menu-chip-row"
  class:start={align === "start"}
  role="group"
  aria-label={ariaLabel}
  aria-labelledby={ariaLabelledby}
>
  {#each items as item (item.id)}
    <FilterChipBase
      mode="toggle"
      size="sm"
      label={item.label}
      icon={menuItemIconClass(item.icon) || undefined}
      active={item.checked ?? false}
      disabled={item.disabled}
      onclick={() => void item.action?.()}
    />
  {/each}
</div>

<style>
  .menu-chip-row {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: var(--chip-row-gap, 0.4rem);
    min-width: 0;
  }

  .menu-chip-row.start {
    justify-content: flex-start;
  }
</style>
