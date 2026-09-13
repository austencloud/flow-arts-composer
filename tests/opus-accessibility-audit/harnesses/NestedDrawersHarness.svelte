<!--
  Audit harness: a Drawer opened from inside another Drawer — the shape of
  Browse's gallery sheet opening a sort/jump sheet, and Create's step editor
  opening the prop sheet from an already-open panel.

  Owned by tests/opus-accessibility-audit. No production behavior lives here.
-->
<script lang="ts">
  import { onMount } from "svelte";
  import Drawer from "$lib/shared/foundation/ui/Drawer.svelte";

  let outerOpen = $state(true);
  let innerOpen = $state(false);

  // Open the inner sheet once, after the outer one has registered, so the
  // inner one is genuinely the most-recently-opened layer. Deliberately NOT an
  // $effect keyed on the open flags: that would re-open the inner sheet the
  // moment a test dismissed it, and the test would read the re-opened sheet as
  // "never dismissed".
  onMount(() => {
    const id = setTimeout(() => (innerOpen = true), 60);
    return () => clearTimeout(id);
  });
</script>

<Drawer bind:isOpen={outerOpen} ariaLabel="Outer sheet" placement="bottom">
  <button type="button" data-testid="outer-action">Outer action</button>
</Drawer>

<Drawer bind:isOpen={innerOpen} ariaLabel="Inner sheet" placement="bottom">
  <button type="button" data-testid="inner-action">Inner action</button>
</Drawer>
