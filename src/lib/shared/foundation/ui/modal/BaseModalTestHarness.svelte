<script lang="ts">
  import { onMount } from "svelte";
  import BaseModal from "./BaseModal.svelte";

  let {
    cancelBeforeOpen = false,
    allowExternalOverlays = false,
    shortContent = false,
    animation = "none",
  }: {
    cancelBeforeOpen?: boolean;
    allowExternalOverlays?: boolean;
    shortContent?: boolean;
    animation?: "pop" | "slide" | "none";
  } = $props();

  let isOpen = $state(true);
  let openedCount = $state(0);
  let wasNativeOpenWhenNotified = $state(false);
  let closedCount = $state(0);
  let wasNativeOpenWhenClosed = $state(true);

  function nativeDialogOpen(): boolean {
    const dialog =
      document.querySelector<HTMLDialogElement>("dialog.base-modal");
    return dialog?.open ?? false;
  }

  function handleOpened() {
    wasNativeOpenWhenNotified = nativeDialogOpen();
    openedCount += 1;
  }

  function handleClosed() {
    wasNativeOpenWhenClosed = nativeDialogOpen();
    closedCount += 1;
  }

  onMount(() => {
    if (cancelBeforeOpen) {
      isOpen = false;
    }
  });
</script>

<BaseModal
  bind:open={isOpen}
  size="fit"
  {animation}
  {allowExternalOverlays}
  labelledBy="base-modal-test-title"
  onopened={handleOpened}
  onclosed={handleClosed}
>
  <h2 id="base-modal-test-title">Scrollable modal</h2>
  <div
    class:short-content={shortContent}
    class:tall-content={!shortContent}
    aria-hidden="true"
  ></div>
  <button type="button" onclick={() => (isOpen = false)}>Close modal</button>
  <button type="button">End of modal</button>
</BaseModal>

<output data-testid="base-modal-opened-state">
  {openedCount}:{wasNativeOpenWhenNotified}
</output>
<output data-testid="base-modal-closed-state">
  {closedCount}:{wasNativeOpenWhenClosed}
</output>

<style>
  h2 {
    margin: 0;
  }

  .tall-content {
    height: 1200px;
  }

  .short-content {
    height: 32px;
  }
</style>
