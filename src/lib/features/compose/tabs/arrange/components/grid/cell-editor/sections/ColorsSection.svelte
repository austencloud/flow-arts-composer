<!--
  ColorsSection.svelte

  Prop color combo selector. 4 fixed pairings from TUNNEL_LAYER_COLORS,
  displayed in a 2×2 chip grid matching the v4 mockup.
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import {
    TUNNEL_LAYER_COLORS,
    type PropColors,
  } from "#lib/shared/animation-engine/domain/compose-types.js";

  let {
    currentColors,
    onSetColors,
  }: {
    currentColors: PropColors;
    onSetColors: (colors: PropColors) => void;
  } = $props();

  const combos: { label: string; colors: PropColors }[] = [
    { label: "Default", colors: TUNNEL_LAYER_COLORS[0]! },
    { label: "Alt 1", colors: TUNNEL_LAYER_COLORS[1]! },
    { label: "Alt 2", colors: TUNNEL_LAYER_COLORS[2]! },
    { label: "Alt 3", colors: TUNNEL_LAYER_COLORS[3]! },
  ];

  function isSelected(combo: PropColors): boolean {
    return (
      combo.left === currentColors.left && combo.right === currentColors.right
    );
  }
</script>

<div class="colors-section">
  <span class="section-header">COLORS</span>

  <div
    class="combo-grid"
    role="radiogroup"
    aria-label={t("compose_ui_prop_color_combo")}
  >
    {#each combos as combo}
      {@const active = isSelected(combo.colors)}
      <button
        class="combo-chip"
        class:active
        role="radio"
        aria-checked={active}
        style:--chip-color={combo.colors.left}
        onclick={() => onSetColors(combo.colors)}
      >
        <span class="color-pair">
          <span class="color-swatch" style:background={combo.colors.left}
          ></span>
          <span class="color-swatch" style:background={combo.colors.right}
          ></span>
        </span>
        <span class="combo-label">{combo.label}</span>
      </button>
    {/each}
  </div>
</div>

<style>
  .colors-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
    animation: slideDown 180ms ease-out;
  }

  @keyframes slideDown {
    from {
      opacity: 0;
      transform: translateY(-6px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .section-header {
    font-size: 13px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: rgba(255, 255, 255, 0.7);
  }

  /* 2×2 wrap grid */
  .combo-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .combo-chip {
    flex: 1;
    min-width: calc(50% - 3px);
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px;
    min-height: 44px;
    border-radius: 8px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
    color: rgba(255, 255, 255, 0.6);
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition:
      background 150ms ease,
      border-color 150ms ease,
      color 150ms ease;
  }

  .combo-chip:hover:not(.active) {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.07));
    border-color: var(--theme-stroke, rgba(255, 255, 255, 0.15));
    color: rgba(255, 255, 255, 0.9);
  }

  .combo-chip.active {
    background: color-mix(in srgb, var(--chip-color) 8%, transparent);
    border: 1.5px solid color-mix(in srgb, var(--chip-color) 35%, transparent);
    color: white;
  }

  .color-pair {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
  }

  .color-swatch {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.15));
  }

  .combo-label {
    line-height: 1;
    white-space: nowrap;
  }

  @media (prefers-reduced-motion: reduce) {
    .colors-section {
      animation: none;
    }
    .combo-chip {
      transition: none;
    }
  }
</style>
