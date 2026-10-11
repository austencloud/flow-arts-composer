<script lang="ts">
  import Drawer from "#lib/shared/foundation/ui/Drawer.svelte";
  import type { ShareActionMenuItem } from "#lib/shared/share/domain/models/share-action-menu.js";
  import ShareActionMenu from "./ShareActionMenu.svelte";

  let viewerOpen = $state(true);
  let selectedAction = $state("");

  const actions: readonly ShareActionMenuItem[] = [
    {
      id: "share-sequence",
      label: "Share Sequence…",
      icon: "fa-share-nodes",
    },
  ];
</script>

<Drawer
  bind:isOpen={viewerOpen}
  placement="bottom"
  showHandle={false}
  ariaLabel="Sequence Viewer"
  class="share-menu-regression-viewer"
>
  <ShareActionMenu
    {actions}
    ariaLabel="Share sequence"
    menuSide="bottom"
    containDesktopMenu={true}
    onActionSelect={(actionId) => (selectedAction = actionId)}
  />
</Drawer>

<output data-testid="viewer-open-state">{viewerOpen}</output>
<output data-testid="selected-share-action">{selectedAction}</output>
