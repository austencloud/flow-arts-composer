<script lang="ts">
  import type { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";
  import BentoPropGrid from "$lib/shared/settings/components/tabs/prop-type/BentoPropGrid.svelte";

  let {
    selectedPropType,
    onSelect,
    onDone,
    docked = false,
  }: {
    selectedPropType: PropType;
    onSelect: (propType: PropType) => void;
    onDone?: () => void;
    /** Lets a containing workspace supply the surface chrome. */
    docked?: boolean;
  } = $props();
</script>

<section class="inline-prop-picker" class:docked aria-label="Choose props">
  {#if onDone}
    <div class="picker-heading">
      <span>Props</span>
      <PanelButton onclick={onDone}>Done</PanelButton>
    </div>
  {/if}
  <BentoPropGrid
    {selectedPropType}
    variant="inline"
    flat={true}
    tileDensity="comfortable"
    scrollMode="internal"
    showAppearance={false}
    {onSelect}
  />
</section>

<style>
  .inline-prop-picker {
    container-type: inline-size;
    box-sizing: border-box;
    block-size: clamp(17rem, 31vw, 27rem);
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    padding: 0.75rem;
    border: 1px solid var(--theme-stroke);
    border-radius: var(--settings-radius-lg, 0.85rem);
    background: var(--theme-card-bg);
  }

  /* The practice workspace owns one continuous surface. Its prop rail should
     be a region of that surface, not another floating card inside it. */
  .inline-prop-picker.docked {
    block-size: 100%;
    padding: 0.75rem;
    border: 0;
    border-radius: 0;
    background: transparent;
  }

  .picker-heading {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.5rem;
    font-size: var(--font-size-min, 0.875rem);
    font-weight: 700;
  }

  .inline-prop-picker :global(.prop-grid-root) {
    flex: 1;
    min-height: 0;
  }
</style>
