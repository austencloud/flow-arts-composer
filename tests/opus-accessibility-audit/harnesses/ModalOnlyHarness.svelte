<!--
  Audit control harness: the same BaseModal as DrawerUnderModalHarness, with no
  Drawer underneath. Isolates whether a failure belongs to BaseModal itself or
  to the Drawer sharing the page with it.

  Owned by tests/opus-accessibility-audit. No production behavior lives here.
-->
<script lang="ts">
  import BaseModal from "$lib/shared/foundation/ui/modal/BaseModal.svelte";

  let modalOpen = $state(true);
</script>

<BaseModal bind:open={modalOpen} labelledBy="audit-modal-title" size="sm">
  {#snippet header()}
    <h2 id="audit-modal-title">Audit modal</h2>
  {/snippet}
  <label for="audit-modal-field">Modal field</label>
  <input id="audit-modal-field" type="text" />
</BaseModal>
