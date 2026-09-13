<!--
  Audit harness: a Drawer with a BaseModal opened on top of it.

  SYNTHETIC. Corrected in review: this does not reproduce a known product route.
  No component renders both primitives at once — the only file containing both
  (ProfilePhotoPicker.svelte:243-316) puts them in mutually exclusive
  {#if isDesktop} branches. The harness exists to exercise the shared
  primitives' Escape arbitration when two layers are open, which is a real
  defect regardless of which route reaches it. See F2 in
  docs/reports/opus-batch-2026-09-12/accessibility-audit.md for what is and is
  not claimed about reachability.

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
