<!--
  Audit harness: the exact Drawer + DrawerHeader composition used by the Browse
  Filters sheet (src/lib/features/browse/gallery-home/GalleryFilterSheet.svelte:
  `<Drawer {isOpen} placement=... class=...>` with no `labelledBy`/`ariaLabel`,
  and a `<DrawerHeader {title} onClose=... />` as its first child).

  Owned by tests/opus-accessibility-audit. No production behavior lives here.
-->
<script lang="ts">
  import Drawer from "$lib/shared/foundation/ui/Drawer.svelte";
  import DrawerHeader from "$lib/shared/foundation/ui/DrawerHeader.svelte";

  let { isOpen = $bindable(true) }: { isOpen?: boolean } = $props();
</script>

<Drawer bind:isOpen placement="bottom">
  <DrawerHeader title="Filters" onClose={() => (isOpen = false)} />
  <button type="button" data-testid="sheet-action">Apply</button>
</Drawer>
