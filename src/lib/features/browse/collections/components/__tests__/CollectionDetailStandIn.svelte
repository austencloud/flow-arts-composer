<!--
  Stands in for CollectionDetailView in CommunityCollectionsPanel's test.

  Keeps the one thing that matters for the back-navigation guard: like the
  real detail view, it hands the Browse header bar a snippet that reads its
  own props. The bar renders that snippet above the panel, so the snippet's
  blocks run before the panel's {#if} has unmounted the detail.
-->
<script lang="ts">
  import BrowseHeaderSlot from "#lib/features/browse/shared/components/BrowseHeaderSlot.svelte";

  let {
    collectionId,
    foreignOwnerId = null,
    ownerName,
  }: {
    collectionId: string;
    foreignOwnerId?: string | null;
    ownerName?: string;
    onBack?: () => void;
  } = $props();
</script>

{#snippet headerActions()}
  {#if foreignOwnerId}
    <button type="button">Follow {collectionId}</button>
  {/if}
{/snippet}

<BrowseHeaderSlot leaf={collectionId} actions={headerActions} />

<p data-testid="detail">Detail {collectionId} by {ownerName}</p>
