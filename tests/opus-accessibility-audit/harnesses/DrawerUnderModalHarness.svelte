<!--
  Audit harness: a Drawer with a BaseModal opened on top of it — the shape of
  every "open a sheet, then confirm/name something" flow in the product
  (e.g. Browse collections sheet -> rename modal, Create save prompt ->
  overwrite confirm).

  Owned by tests/opus-accessibility-audit. No production behavior lives here.
-->
<script lang="ts">
  import { onMount } from "svelte";
  import Drawer from "$lib/shared/foundation/ui/Drawer.svelte";
  import BaseModal from "$lib/shared/foundation/ui/modal/BaseModal.svelte";

  let drawerOpen = $state(true);
  let modalOpen = $state(false);

  // Open the modal once, after the drawer has registered, so the modal is
  // genuinely the most-recently-opened layer. Deliberately NOT an $effect keyed
  // on the open flags: that would re-open the modal the moment a test dismissed
  // it, and the test would read the re-opened modal as "never dismissed".
  onMount(() => {
    const id = setTimeout(() => (modalOpen = true), 60);
    return () => clearTimeout(id);
  });
</script>

<Drawer bind:isOpen={drawerOpen} ariaLabel="Audit drawer" placement="bottom">
  <button type="button" data-testid="drawer-action">Drawer action</button>
</Drawer>

<BaseModal bind:open={modalOpen} labelledBy="audit-modal-title" size="sm">
  {#snippet header()}
    <h2 id="audit-modal-title">Audit modal</h2>
  {/snippet}
  <label for="audit-modal-field">Modal field</label>
  <input id="audit-modal-field" type="text" />
  <button type="button" data-testid="modal-action">Modal action</button>
</BaseModal>
