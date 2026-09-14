<script lang="ts">
  import BaseModal from "$lib/shared/foundation/ui/modal/BaseModal.svelte";
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";
  import PropPairField from "$lib/shared/pictograph/prop/components/PropPairField.svelte";
  import type { ResolvedPropConfig } from "$lib/shared/foundation/services/recorded-prop-intent";
  let {
    value = $bindable(),
    onSave,
    onCancel,
  }: {
    value: ResolvedPropConfig;
    onSave: () => void;
    onCancel: () => void;
  } = $props();
  const titleId = $props.id();
</script>

<BaseModal open={true} onclose={onCancel} size="fit" labelledBy={titleId}>
  {#snippet header()}<h2 id={titleId}>Save to Library</h2>{/snippet}
  <div class="body">
    <PropPairField bind:value />
    <p>Used when someone chooses As saved.</p>
  </div>
  {#snippet footer()}
    <div class="actions">
      <PanelButton variant="secondary" onclick={onCancel}>Cancel</PanelButton>
      <PanelButton onclick={onSave}>Save</PanelButton>
    </div>
  {/snippet}
</BaseModal>

<style>
  .body {
    padding: 0 20px;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 20px;
  }
  h2 {
    padding: 20px;
    margin: 0;
    font-size: var(--font-size-lg, 18px);
  }
  p {
    color: var(--theme-text-dim);
    font-size: var(--font-size-sm, 14px);
  }
</style>
