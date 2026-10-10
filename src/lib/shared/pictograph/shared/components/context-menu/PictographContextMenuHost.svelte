<!--
  PictographContextMenuHost - Orchestrator for the pictograph right-click context menu.
  Entries: inline visibility toggles and optional arrow adjustment items (admin only).
-->
<script lang="ts">
  import { onMount } from "svelte";
  import ContextMenu from "#lib/shared/components/context-menu/ContextMenu.svelte";
  import type {
    ContextMenuState,
    ContextMenuEntry,
  } from "#lib/shared/components/context-menu/context-menu-types.js";
  import { buildPictographContextMenuItems } from "./pictograph-context-menu-builder";
  import { getVisibilityStateManager } from "../../state/visibility-state.svelte";
  import type { HandSide } from "../../domain/enums/pictograph-enums";
  import { followGridJoin } from "#lib/shared/grid-join/grid-join-follower.svelte.js";

  interface Props {
    onAdjustArrow?: (hand: HandSide) => void;
    showArrowAdjustment?: boolean;
    /**
     * Offer the sequence's "Grid join" choice, when the surrounding workspace
     * provides one. Only the cells of the sequence itself opt in; pictograph
     * previews of options do not.
     */
    offerGridJoin?: boolean;
  }

  const {
    onAdjustArrow,
    showArrowAdjustment = false,
    offerGridJoin = false,
  }: Props = $props();

  const joinFollower = followGridJoin();

  const visibilityManager = getVisibilityStateManager();

  let menuState: ContextMenuState = $state({ open: false });

  // Increments on every visibility change so $derived rebuilds menu items with fresh checked states
  let version = $state(0);

  function bumpVersion() {
    version++;
  }

  onMount(() => {
    visibilityManager.registerObserver(bumpVersion, ["all"]);
    return () => visibilityManager.unregisterObserver(bumpVersion);
  });

  function closeContextMenu(): void {
    menuState = { open: false };
  }

  const menuItems: ContextMenuEntry[] = $derived.by(() => {
    void version;
    void joinFollower.version();
    return buildPictographContextMenuItems({
      visibilityManager,
      onAdjustArrow: onAdjustArrow
        ? (color) => {
            closeContextMenu();
            onAdjustArrow(color);
          }
        : undefined,
      showArrowAdjustment,
      gridJoin: offerGridJoin ? joinFollower.controller : null,
    });
  });

  export function openContextMenu(x: number, y: number): void {
    version++;
    menuState = { open: true, x, y };
  }
</script>

<ContextMenu {menuState} items={menuItems} onClose={closeContextMenu} />
