<!--
  Audit harness: a real trigger button that opens a Drawer or a BaseModal, so
  focus restoration can be observed the way a keyboard user experiences it —
  activate the trigger, dismiss the surface, check where focus landed.

  Owned by tests/opus-accessibility-audit. No production behavior lives here.
-->
<script lang="ts">
  import Drawer from "$lib/shared/foundation/ui/Drawer.svelte";
  import BaseModal from "$lib/shared/foundation/ui/modal/BaseModal.svelte";

  let { surface = "drawer" }: { surface?: "drawer" | "modal" } = $props();

  let drawerOpen = $state(false);
  let modalOpen = $state(false);
</script>

<button type="button" data-testid="before">Before</button>

{#if surface === "drawer"}
  <button
    type="button"
    data-testid="trigger"
    onclick={() => (drawerOpen = true)}
  >
    Open sheet
  </button>
  <Drawer bind:isOpen={drawerOpen} ariaLabel="Audit sheet" placement="bottom">
    <button type="button" data-testid="surface-action">Sheet action</button>
  </Drawer>
{:else}
  <button
    type="button"
    data-testid="trigger"
    onclick={() => (modalOpen = true)}
  >
    Open modal
  </button>
  <BaseModal bind:open={modalOpen} labelledBy="audit-restore-title" size="sm">
    {#snippet header()}
      <h2 id="audit-restore-title">Audit modal</h2>
    {/snippet}
    <button type="button" data-testid="surface-action">Modal action</button>
  </BaseModal>
{/if}

<button type="button" data-testid="after">After</button>
