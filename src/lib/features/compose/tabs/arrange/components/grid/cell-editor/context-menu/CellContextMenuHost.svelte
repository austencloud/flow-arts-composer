<!--
  CellContextMenuHost - Orchestrator for the cell right-click / long-press context menu.
  Mirrors the cell editor panel controls into a compact context menu.
  Rebuilds menu items reactively when cell state changes.
-->
<script lang="ts">
  import ContextMenu from "#lib/shared/components/context-menu/ContextMenu.svelte";
  import type {
    ContextMenuState,
    ContextMenuEntry,
  } from "#lib/shared/components/context-menu/context-menu-types.js";
  import {
    buildCellContextMenuItems,
    type CellContextMenuCallbacks,
  } from "./cell-context-menu-builder";
  import type { GridCell } from "../../../../state/arrange-grid-state.svelte";

  let {
    cell,
    callbacks,
  }: {
    cell: GridCell;
    callbacks: CellContextMenuCallbacks;
  } = $props();

  let menuState: ContextMenuState = $state({ open: false });

  function closeContextMenu(): void {
    menuState = { open: false };
  }

  // Rebuild items whenever cell properties change (speed, effect, visibility, etc.)
  const menuItems: ContextMenuEntry[] = $derived.by(() => {
    return buildCellContextMenuItems(cell, callbacks);
  });

  export function openContextMenu(x: number, y: number): void {
    menuState = { open: true, x, y };
  }
</script>

<ContextMenu {menuState} items={menuItems} onClose={closeContextMenu} />
