<!--
  Audit harness: a Drawer whose body contains a text input, matching the shape
  of every real filter/search sheet in Browse (GalleryFilterSheet -> GalleryDrill
  search field) and Create (SavePromptDialog name field).

  Owned by tests/opus-accessibility-audit. No production behavior lives here.
-->
<script lang="ts">
  import Drawer from "$lib/shared/foundation/ui/Drawer.svelte";

  let { isOpen = $bindable(true) }: { isOpen?: boolean } = $props();
</script>

<button type="button" data-testid="outside-trigger">Outside trigger</button>

<Drawer bind:isOpen ariaLabel="Audit drawer" placement="bottom">
  <label for="audit-search">Search</label>
  <input id="audit-search" type="text" placeholder="Search" />
  <button type="button" data-testid="drawer-action">Drawer action</button>
</Drawer>
