<!--
  DrawerKeyboardTestHarness.svelte

  Harness for Drawer.svelte.test.ts. Renders a real Drawer holding the two
  kinds of control whose Escape ownership differs: a text field (which owns the
  first press) and a plain button (which does not).

  `title` is forwarded so one harness covers both the keyboard and the naming
  assertions, and `holdOpen` so it covers the held opening slide too.
-->
<script lang="ts">
  import Drawer from "./Drawer.svelte";
	import type { CloseReason } from "@austencloud/drawer";

  let {
    isOpen = $bindable(true),
    title,
    ariaLabel,
    labelledBy,
    holdOpen = false,
    onBeforeClose,
    onclose,
  }: {
    isOpen?: boolean;
    title?: string;
    ariaLabel?: string;
    labelledBy?: string;
    holdOpen?: boolean;
    onBeforeClose?: (reason: CloseReason) => boolean | void;
    onclose?: (event: CustomEvent<{ reason: CloseReason }>) => void;
  } = $props();
	let drawerRef: { requestClose: (reason?: CloseReason) => boolean } | undefined;
</script>

<button type="button" data-testid="outside">Outside</button>

<Drawer
  bind:this={drawerRef}
  bind:isOpen
  {title}
  {ariaLabel}
  {labelledBy}
  {holdOpen}
  {onBeforeClose}
  {onclose}
  placement="bottom"
>
  {#if labelledBy}
    <h2 id={labelledBy}>Header title</h2>
  {/if}
  <label for="drawer-search">Search</label>
  <input id="drawer-search" type="text" />
  <button type="button" data-testid="inside">Inside action</button>
  <button type="button" data-testid="request-close" onclick={() => drawerRef?.requestClose()}>Request close</button>
</Drawer>
