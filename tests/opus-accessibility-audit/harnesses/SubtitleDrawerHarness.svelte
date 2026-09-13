<!--
  Audit harness: DrawerHeader with a subtitle inside a Drawer, matching the
  PropSelectionSheet composition on /create
  ("Pick a prop or open a family to choose its style.").

  Owned by tests/opus-accessibility-audit. No production behavior lives here.
-->
<script lang="ts">
  import Drawer from "$lib/shared/foundation/ui/Drawer.svelte";
  import DrawerHeader from "$lib/shared/foundation/ui/DrawerHeader.svelte";

  let { isOpen = $bindable(true) }: { isOpen?: boolean } = $props();
</script>

<Drawer bind:isOpen ariaLabel="Select Prop" placement="bottom">
  <DrawerHeader
    title="Select Prop"
    subtitle="Pick a prop or open a family to choose its style."
    onClose={() => (isOpen = false)}
  />
</Drawer>
