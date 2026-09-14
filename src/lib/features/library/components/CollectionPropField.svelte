<script lang="ts">
  import type { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import { getPropTypeDisplayInfo } from "$lib/shared/pictograph/prop/domain/prop-type-display-registry";
  import BentoPropGrid from "$lib/shared/settings/components/tabs/prop-type/BentoPropGrid.svelte";
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";
  import PropCompositionPreview from "$lib/shared/pictograph/prop/components/PropCompositionPreview.svelte";

  let {
    value = $bindable<PropType | null>(null),
    disabled = false,
  }: { value?: PropType | null; disabled?: boolean } = $props();
  let choosing = $state(false);
</script>

<div class="collection-prop-field">
  <span class="label">Collection prop</span>
  <p>Used for every sequence when a viewer chooses As saved.</p>
  <div class="actions">
    <PanelButton
      variant="secondary"
      {disabled}
      onclick={() => (choosing = !choosing)}
      ariaExpanded={choosing}
      ariaLabel="Choose collection prop"
    >
      {#if value}
        <span class="preview"
          ><PropCompositionPreview propType={value} size={32} neutral /></span
        >
      {/if}
      {value
        ? getPropTypeDisplayInfo(value).label
        : "Use each sequence’s saved props"}
      <i class="fas fa-chevron-down" aria-hidden="true"></i>
    </PanelButton>
    {#if value}
      <PanelButton
        variant="secondary"
        {disabled}
        onclick={() => {
          value = null;
          choosing = false;
        }}
      >
        Clear
      </PanelButton>
    {/if}
  </div>
  {#if choosing && !disabled}
    <BentoPropGrid
      selectedPropType={value}
      variant="inline"
      scrollMode="host"
      showAppearance={false}
      onSelect={(prop) => {
        value = prop;
        choosing = false;
      }}
    />
  {/if}
</div>

<style>
  .collection-prop-field {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .label {
    font-size: var(--font-size-sm, 14px);
    font-weight: 600;
    color: var(--theme-text);
  }
  p {
    margin: 0;
    font-size: var(--font-size-sm, 14px);
    color: var(--theme-text-dim);
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .preview {
    width: 32px;
    height: 32px;
    display: inline-flex;
  }
</style>
