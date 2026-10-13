<!--
  LayerTabBar.svelte

  Three-button tab bar for selecting which global adjustment layer to edit.
  Shows dot indicators for layers that have values.
-->
<script lang="ts">
  interface Props {
    activeLayer: 1 | 2 | 3;
    onLayerChange: (layer: 1 | 2 | 3) => void;
    layer1HasValue: boolean;
    layer2HasValue: boolean;
    layer3HasValue: boolean;
    thisPropType: string;
    otherPropType: string;
  }

  let {
    activeLayer,
    onLayerChange,
    layer1HasValue,
    layer2HasValue,
    layer3HasValue,
    thisPropType,
    otherPropType,
  }: Props = $props();

  const layer2Label = $derived(`Prop (${thisPropType})`);
  const layer3Label = $derived(`Combo (${thisPropType}+${otherPropType})`);
</script>

<div class="layer-tabs" role="tablist" aria-label="Adjustment layer">
  <button
    class="layer-tab"
    class:active={activeLayer === 1}
    role="tab"
    aria-selected={activeLayer === 1}
    onclick={() => onLayerChange(1)}
  >
    Base
    {#if layer1HasValue}<span class="dot" aria-label="has value"></span>{/if}
  </button>
  <button
    class="layer-tab"
    class:active={activeLayer === 2}
    role="tab"
    aria-selected={activeLayer === 2}
    onclick={() => onLayerChange(2)}
  >
    {layer2Label}
    {#if layer2HasValue}<span class="dot" aria-label="has value"></span>{/if}
  </button>
  <button
    class="layer-tab"
    class:active={activeLayer === 3}
    role="tab"
    aria-selected={activeLayer === 3}
    onclick={() => onLayerChange(3)}
  >
    {layer3Label}
    {#if layer3HasValue}<span class="dot" aria-label="has value"></span>{/if}
  </button>
</div>

<style>
  .layer-tabs {
    display: flex;
    gap: 4px;
    padding: 4px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border-radius: 8px;
  }

  .layer-tab {
    flex: 1 1 auto;
    min-width: max-content;
    position: relative;
    min-height: var(--min-touch-target, 44px);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 8px 14px;
    border: 1px solid transparent;
    border-radius: 6px;
    background: transparent;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.5));
    font-size: var(--font-size-compact, 12px);
    font-weight: 500;
    cursor: pointer;
    transition:
      background var(--duration-fast) var(--ease-standard),
      color var(--duration-fast) var(--ease-standard),
      border-color var(--duration-fast) var(--ease-standard);
    white-space: nowrap;
  }

  .layer-tab:hover {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.06));
    color: var(--theme-text, #ffffff);
  }

  .layer-tab.active {
    background: var(--theme-accent, #3b82f6);
    color: #ffffff;
    border-color: transparent;
  }

  .dot {
    display: inline-block;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--semantic-success, #22c55e);
    margin-left: 4px;
    vertical-align: middle;
  }

  .layer-tab.active .dot {
    background: #ffffff;
  }
</style>
