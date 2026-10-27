<!--
  CommunityCollectionsPanel under a Browse header bar, the way BrowseModule
  mounts it: the bar comes first in the tree and renders whatever snippet the
  open screen registered.
-->
<script lang="ts">
  import { setBrowseNavigationContext } from "#lib/shared/browse/context/browse-navigation-context.js";
  import { setBrowseHeaderContext } from "#lib/shared/browse/context/browse-header-context.js";
  import { createBrowseHeaderState } from "#lib/shared/browse/state/browse-header-state.svelte.js";
  import type { BrowseNavigationState } from "#lib/shared/browse/state/browse-navigation-state.svelte.js";
  import CommunityCollectionsPanel from "../CommunityCollectionsPanel.svelte";

  let { navigation }: { navigation: BrowseNavigationState } = $props();

  setBrowseNavigationContext(navigation);
  const header = setBrowseHeaderContext(createBrowseHeaderState());
  const actions = $derived(header.actions);
</script>

<div data-testid="bar">
  {#if actions}
    {@render actions()}
  {/if}
</div>
<CommunityCollectionsPanel />
