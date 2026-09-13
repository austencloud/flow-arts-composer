<!--
  DrawerKeyboardTestHarness.svelte

  Harness for Drawer.svelte.test.ts. Renders a real Drawer holding the two
  kinds of control whose Escape ownership differs: a text field (which owns the
  first press) and a plain button (which does not).

  `title` is forwarded so one harness covers both the keyboard and the naming
  assertions.
-->
<script lang="ts">
  import Drawer from "./Drawer.svelte";

  let {
    isOpen = $bindable(true),
    title,
    ariaLabel,
    labelledBy,
  }: {
    isOpen?: boolean;
    title?: string;
    ariaLabel?: string;
    labelledBy?: string;
  } = $props();
</script>

<button type="button" data-testid="outside">Outside</button>

<Drawer bind:isOpen {title} {ariaLabel} {labelledBy} placement="bottom">
  {#if labelledBy}
    <h2 id={labelledBy}>Header title</h2>
  {/if}
  <label for="drawer-search">Search</label>
  <input id="drawer-search" type="text" />
  <button type="button" data-testid="inside">Inside action</button>
</Drawer>
