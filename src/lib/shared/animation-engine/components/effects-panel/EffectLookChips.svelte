<script lang="ts">
  import { effectUiLabel } from "./effect-ui-label";
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import type { EffectPresetGroup } from "./presets/types";
  import { DEFAULT_EFFECTS_CONFIG } from "$lib/shared/effects/domain/defaults";

  /**
   * The compact presentation of "choose a Look for this effect".
   *
   * `EffectPresetsSection` owns the big thumbnail-card presentation used inside
   * the inspector. This owns the dense chip rail used wherever the roster stays
   * on screen. Both delegate the actual apply to the caller's onSelect, so the
   * two presentations never diverge on behaviour.
   *
   * Original keeps the rail useful even without named presets. Your look joins
   * it once tuning has captured settings that can actually be restored.
   */
  interface Props {
    presetGroup: EffectPresetGroup;
    activePresetId: string | null;
    defaultChipId: string;
    customChipId: string;
    customDisabled?: boolean;
    /** Trails shows its captured blue/red on the Custom chip. */
    customColors?: { left: string; right: string } | null;
    accentColor: string;
    effectLabel: string;
    onSelect: (presetId: string) => void;
    /**
     * Wrap every chip onto as many rows as it takes instead of scrolling one
     * row. Callers with vertical room to spare pass this so all looks are
     * visible at once - the point of the dock is browsing without navigation,
     * and a hidden look is one you will not try.
     */
    wrap?: boolean;
  }

  const {
    presetGroup,
    activePresetId,
    defaultChipId,
    customChipId,
    customDisabled = false,
    customColors = null,
    accentColor,
    effectLabel,
    onSelect,
    wrap = false,
  }: Props = $props();

  // A clipped chip against a hard edge reads as broken, not as scrollable, so
  // the rail fades its overflowing edges - but only the edges that actually
  // overflow, so a rail whose chips fit keeps its last chip crisp.
  let rail = $state<HTMLElement | null>(null);
  let overflowStart = $state(false);
  let overflowEnd = $state(false);

  function measure(): void {
    if (!rail || wrap) {
      overflowStart = false;
      overflowEnd = false;
      return;
    }
    const max = rail.scrollWidth - rail.clientWidth;
    overflowStart = rail.scrollLeft > 1;
    overflowEnd = rail.scrollLeft < max - 1;
  }

  $effect(() => {
    // Re-measure when the effect (and therefore the chip count) changes.
    void presetGroup.effectType;
    void wrap;
    void customDisabled;
    if (!rail) return;
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(rail);
    return () => observer.disconnect();
  });

  // Trails' factory Default IS the matched blue/red, so its Default chip shows
  // those dots rather than a generic accent dot. Static by design.
  const trailDefaultColors = $derived(
    presetGroup.effectType === "trails"
      ? {
          left: DEFAULT_EFFECTS_CONFIG.trails.leftColor,
          right: DEFAULT_EFFECTS_CONFIG.trails.rightColor,
        }
      : null
  );
</script>

{#snippet dualSwatch(left, right)}
  <span class="swatch dual" aria-hidden="true">
    <span class="half" style:background={left}></span>
    <span class="half" style:background={right}></span>
  </span>
{/snippet}

<div
  bind:this={rail}
  onscroll={measure}
  class="look-chips"
  class:wrap
  class:fade-start={overflowStart}
  class:fade-end={overflowEnd}
  role="radiogroup"
  aria-label={t("effect_deep_choose_look", {
    effect: effectUiLabel(effectLabel),
  })}
>
  <button
    type="button"
    class="look-chip"
    class:active={activePresetId === defaultChipId}
    role="radio"
    aria-checked={activePresetId === defaultChipId}
    onclick={() => onSelect(defaultChipId)}
  >
    {#if trailDefaultColors}
      {@render dualSwatch(trailDefaultColors.left, trailDefaultColors.right)}
    {:else}
      <span class="swatch" style:background={accentColor} aria-hidden="true"
      ></span>
    {/if}
    {t("effect_deep_original")}
  </button>

  {#if !customDisabled}<button
      type="button"
      class="look-chip"
      class:active={activePresetId === customChipId}
      role="radio"
      aria-checked={activePresetId === customChipId}
      onclick={() => onSelect(customChipId)}
    >
      {#if customColors}
        {@render dualSwatch(customColors.left, customColors.right)}
      {:else}
        <span class="swatch custom" aria-hidden="true"></span>
      {/if}
      {t("effect_deep_your_look")}
    </button>{/if}

  {#each presetGroup.presets as preset (preset.id)}
    {@const isActive = activePresetId === preset.id}
    <button
      type="button"
      class="look-chip"
      class:active={isActive}
      role="radio"
      aria-checked={isActive}
      onclick={() => onSelect(preset.id)}
    >
      {#if preset.previewColor === "rainbow"}
        <span class="swatch rainbow" aria-hidden="true"></span>
      {:else if preset.previewColor === "custom"}
        <span class="swatch custom" aria-hidden="true"></span>
      {:else if preset.previewColor2}
        {@render dualSwatch(preset.previewColor, preset.previewColor2)}
      {:else}
        <span
          class="swatch"
          style:background={preset.previewColor}
          aria-hidden="true"
        ></span>
      {/if}
      {effectUiLabel(preset.name)}
    </button>
  {/each}
</div>

<style>
  /* Chip count varies 2..10 across effects. Where vertical room is scarce the
     rail scrolls (constant height whatever the effect); where it is plentiful
     the caller passes `wrap` and every look is on screen at once. */
  .look-chips {
    display: flex;
    gap: 0.375rem;
    overflow-x: auto;
    scrollbar-width: none;
    /* Room for the focus ring, which would otherwise clip against overflow. */
    padding: 2px;
    margin: -2px;
  }
  .look-chips::-webkit-scrollbar {
    display: none;
  }

  .look-chips.wrap {
    flex-wrap: wrap;
    overflow-x: visible;
  }

  /* Only the overflowing edge fades, so nothing softens a chip that is fully
     in view. Two-sided once you have scrolled away from the start. */
  .look-chips.fade-end {
    mask-image: linear-gradient(
      to right,
      #000 calc(100% - 1.75rem),
      transparent
    );
  }
  .look-chips.fade-start {
    mask-image: linear-gradient(to right, transparent, #000 1.75rem);
  }
  .look-chips.fade-start.fade-end {
    mask-image: linear-gradient(
      to right,
      transparent,
      #000 1.75rem,
      #000 calc(100% - 1.75rem),
      transparent
    );
  }

  .look-chip {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    height: 2rem;
    padding: 0 0.625rem;
    border-radius: 0.5rem;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.03));
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.65));
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    white-space: nowrap;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    transition: all 150ms ease;
  }

  .look-chip:hover:not(:disabled) {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.07));
    color: var(--theme-text, #fff);
  }

  /* Selected state marks the WHOLE chip — tinted fill plus a full accent edge.
     Never an inset bar down one side (no-left-edge-accent-bar.md). */
  .look-chip.active {
    background: color-mix(
      in srgb,
      var(--fx-accent, #4a9eff) 18%,
      var(--theme-panel-bg, rgba(20, 22, 32, 0.6))
    );
    border-color: color-mix(
      in srgb,
      var(--fx-accent, #4a9eff) 45%,
      transparent
    );
    color: var(--fx-accent-text, #c5ddff);
  }

  .look-chip:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .look-chip:focus-visible {
    outline: 2px solid var(--fx-accent, #4a9eff);
    outline-offset: 2px;
  }

  .swatch {
    width: 0.625rem;
    height: 0.625rem;
    border-radius: 50%;
    flex-shrink: 0;
  }

  /* Effect-colour data, not UI chrome: these hexes preview the rainbow and
     custom looks themselves, so they stay literal rather than tokenised. */
  .swatch.rainbow {
    background: conic-gradient(
      from 0deg,
      #ef4444,
      #f59e0b,
      #eab308,
      #22c55e,
      #06b6d4,
      #3b82f6,
      #8b5cf6,
      #ef4444
    );
  }
  .swatch.custom {
    background: linear-gradient(135deg, #666 50%, #aaa 50%);
  }
  .swatch.dual {
    display: flex;
    overflow: hidden;
    border-radius: 50%;
  }
  .swatch.dual .half {
    flex: 1;
  }

  @media (prefers-reduced-motion: reduce) {
    .look-chip {
      transition: none;
    }
  }
</style>
