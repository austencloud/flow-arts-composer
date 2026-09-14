<script lang="ts">
  import { COLOR_PRESETS } from "$lib/shared/ui/color-presets";
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";

  export interface ColorPreset {
    hex: string;
    name: string;
  }

  interface Props {
    label: string;
    description: string;
    value: string | null;
    fallbackColor: string;
    onchange: (value: string | null) => void;
    presets?: readonly ColorPreset[];
  }

  let {
    label,
    description,
    value,
    fallbackColor,
    onchange,
    presets = COLOR_PRESETS,
  }: Props = $props();
  let expanded = $state(false);
  let nativePicker = $state<HTMLInputElement>();
  const currentColor = $derived(value ?? fallbackColor);

  function choose(color: string): void {
    onchange(color.toLowerCase());
  }
</script>

<section class="color-override" aria-label={label}>
  <div>
    <span class="label">{label}</span>
    <span class="description">{description}</span>
    <span class="status"
      >{value ? `Solid color ${value.toUpperCase()}` : "Original colors"}</span
    >
  </div>
  <div class="actions">
    <button
      type="button"
      class="color-button"
      style:--color={currentColor}
      aria-label={`Choose ${label.toLowerCase()}; ${value ? `solid ${value}` : "original colors"}`}
      aria-expanded={expanded}
      onclick={() => (expanded = !expanded)}
      ><span aria-hidden="true"></span>{value
        ? "Change solid color"
        : "Choose solid color"}</button
    >
    {#if value}
      <PanelButton variant="secondary" onclick={() => onchange(null)}
        >Restore original colors</PanelButton
      >
    {/if}
  </div>
  {#if expanded}
    <div class="picker" role="radiogroup" aria-label={`${label} presets`}>
      {#each presets as preset (preset.hex)}
        <button
          type="button"
          class="swatch"
          class:selected={currentColor.toLowerCase() ===
            preset.hex.toLowerCase()}
          style:--swatch={preset.hex}
          role="radio"
          aria-checked={currentColor.toLowerCase() === preset.hex.toLowerCase()}
          aria-label={preset.name}
          title={preset.name}
          onclick={() => choose(preset.hex)}
          >{#if currentColor.toLowerCase() === preset.hex.toLowerCase()}<i
              class="fas fa-check"
              aria-hidden="true"
            ></i>{/if}</button
        >
      {/each}
      <button
        type="button"
        class="custom"
        onclick={() => nativePicker?.click()}
        aria-label={`Pick a custom ${label.toLowerCase()}`}
        ><i class="fas fa-eyedropper" aria-hidden="true"></i> Custom</button
      >
      <input
        bind:this={nativePicker}
        class="native"
        type="color"
        value={currentColor}
        tabindex="-1"
        aria-hidden="true"
        oninput={(event) => choose(event.currentTarget.value)}
      />
    </div>
  {/if}
</section>

<style>
  .color-override {
    display: grid;
    gap: 0.5rem;
  }
  .label,
  .description,
  .status {
    display: block;
  }
  .label {
    color: var(--theme-text);
    font-size: var(--font-size-min, 14px);
    font-weight: 600;
  }
  .description,
  .status {
    color: var(--theme-text-dim);
    font-size: var(--font-size-min, 14px);
  }
  .status {
    color: var(--theme-text);
    margin-top: 0.15rem;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .color-button {
    display: inline-flex;
    align-items: center;
    min-height: var(--min-touch-target, 44px);
    gap: 0.5rem;
    border: 1px solid var(--theme-stroke);
    border-radius: var(--radius-sm, 6px);
    padding: 0.45rem 0.7rem;
    background: var(--theme-card-bg);
    color: var(--theme-text);
    cursor: pointer;
    font: inherit;
    font-size: var(--font-size-min, 14px);
  }
  .color-button span {
    width: 1.5rem;
    height: 1.5rem;
    border: 1px solid color-mix(in srgb, var(--theme-text) 35%, transparent);
    border-radius: 4px;
    background: var(--color);
  }
  .color-button:focus-visible,
  .swatch:focus-visible,
  .custom:focus-visible {
    outline: 3px solid var(--theme-accent);
    outline-offset: 2px;
  }
  .picker {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    padding: 0.5rem;
    border: 1px solid var(--theme-stroke);
    border-radius: var(--radius-sm, 6px);
    background: var(--theme-card-bg);
  }
  .swatch {
    width: var(--min-touch-target, 44px);
    height: var(--min-touch-target, 44px);
    border: 2px solid transparent;
    border-radius: 6px;
    background: var(--swatch);
    color: white;
    cursor: pointer;
    text-shadow: 0 1px 2px #000;
  }
  .swatch.selected {
    border-color: var(--theme-text);
  }
  .custom {
    min-height: var(--min-touch-target, 44px);
    border: 1px solid var(--theme-stroke);
    border-radius: 6px;
    padding: 0 0.7rem;
    background: var(--theme-panel-bg);
    color: var(--theme-text);
    cursor: pointer;
    font: inherit;
    font-size: var(--font-size-min, 14px);
  }
  .native {
    position: absolute;
    width: 1px;
    height: 1px;
    opacity: 0;
    pointer-events: none;
  }
  @media (prefers-reduced-motion: reduce) {
    .color-button,
    .swatch {
      transition: none;
    }
  }
</style>
