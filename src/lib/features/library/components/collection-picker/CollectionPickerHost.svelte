<!--
CollectionPickerHost.svelte

Always-mounted host for the collections picker, sitting at app level in
MainApplication next to the other global sheets. Card menus call
openCollectionPicker() instead of rendering their own sheet, so the drawer
survives the card that opened it disappearing (which is exactly what happens
when you untick the collection you're currently browsing).
-->
<script lang="ts">
  import { collectionPickerState } from "#lib/features/library/state/collection-picker-state.svelte.js";
  import LazyMount from "#lib/shared/components/LazyMount.svelte";
</script>

{#if collectionPickerState.sequenceIds.length > 0}
  <LazyMount
    loader={() => import("./CollectionPickerSheet.svelte")}
    active={true}
    debugName="collection picker"
    props={{
      isOpen: collectionPickerState.isOpen,
      sequenceIds: collectionPickerState.sequenceIds,
      isBulk: collectionPickerState.isBulk,
      sequenceLabel: collectionPickerState.sequenceLabel,
      currentCollectionId: collectionPickerState.currentCollectionId,
      onClose: () => collectionPickerState.close(),
      onBulkComplete: () => collectionPickerState.completeBulk(),
    }}
  />
{/if}
