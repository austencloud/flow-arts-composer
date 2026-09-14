<script lang="ts">
  import { onMount } from "svelte";
  import CollectionDetailsDialog from "$lib/features/browse/collections/components/CollectionDetailsDialog.svelte";
  import {
    createCollection,
    type LibraryCollection,
  } from "$lib/shared/library/domain/models/collection";
  import { collectionsState } from "$lib/features/library/state/collections-state.svelte";
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";
  import { getPropTypeDisplayInfo } from "$lib/shared/pictograph/prop/domain/prop-type-display-registry";

  let open = $state(false);
  let collection = $state<LibraryCollection>({
    ...createCollection("Fan practice", "local-review", {
      description: "Sequences for this week's practice.",
    }),
    id: "local-review",
  });
  onMount(() => {
    const original = collectionsState.saveDetails;
    collectionsState.saveDetails = async (_id, details) => {
      collection = { ...collection, ...details };
      return true;
    };
    open = true;
    return () => {
      collectionsState.saveDetails = original;
    };
  });
</script>

<svelte:head
  ><title>Collection prop review</title><meta
    name="robots"
    content="noindex, nofollow"
  /></svelte:head
>
<main>
  <h1>{collection.name}</h1>
  <p>
    Saved prop: {collection.propType
      ? getPropTypeDisplayInfo(collection.propType).label
      : "Normal selection"}
  </p>
  <PanelButton onclick={() => (open = true)}>Collection details</PanelButton>
</main>
<CollectionDetailsDialog {collection} bind:open />

<style>
  main {
    padding: 24px;
    color: var(--theme-text);
  }
</style>
