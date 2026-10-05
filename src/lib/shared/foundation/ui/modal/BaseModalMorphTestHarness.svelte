<script lang="ts">
  import { flushSync } from "svelte";
  import BaseModal from "./BaseModal.svelte";

  let isOpen = $state(false);
  let closeRequests = $state<string[]>([]);
  let closedCount = $state(0);

  /**
   * Flip `open` the way a view transition's update callback does, and report
   * whether the native dialog is in the top layer when the flush returns.
   */
  export function setOpenNow(next: boolean): boolean {
    flushSync(() => {
      isOpen = next;
    });
    return (
      document.querySelector<HTMLDialogElement>("dialog.base-modal")?.open ??
      false
    );
  }
</script>

<BaseModal
  open={isOpen}
  animation="morph"
  size="md"
  labelledBy="base-modal-morph-title"
  onclose={(reason) => (closeRequests = [...closeRequests, reason])}
  onclosed={() => (closedCount += 1)}
>
  <h2 id="base-modal-morph-title">Morphing modal</h2>
  <button type="button">Inside the modal</button>
</BaseModal>

<output data-testid="base-modal-morph-requests">{closeRequests.join(",")}</output>
<output data-testid="base-modal-morph-closed">{closedCount}</output>
