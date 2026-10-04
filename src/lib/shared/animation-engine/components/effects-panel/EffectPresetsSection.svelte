<script lang="ts">
  import { effectUiLabel, effectUiTrait } from "./effect-ui-label";
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import type { EffectPresetGroup } from "./presets/types";
  import { DEFAULT_EFFECTS_CONFIG } from "$lib/shared/effects/domain/defaults";
  import EffectPresetThumbnail from "./EffectPresetThumbnail.svelte";
  import { createEffectLookPreview } from "./effect-look-preview";
  import { describeLook } from "./thumbnails/look-copy";

  interface Props {
    presetGroup: EffectPresetGroup;
    activePresetId: string | null;
    /** Sentinel id for the synthetic Default chip (the factory default look). */
    defaultChipId?: string;
    /** Sentinel id for the synthetic Custom chip (your auto-captured look). */
    customChipId?: string;
    /** Hide Your look until custom settings have been captured. */
    customDisabled?: boolean;
    /** Trail's captured custom blue/red for the Custom chip preview (else null). */
    customColors?: { left: string; right: string } | null;
    onSelectPreset: (presetId: string) => void;
    onCustomize?: () => void;
    effectLabel: string;
    accentColor: string;
    /** Only read when `showSummary`; hosts with their own controls omit it. */
    summary?: string;
    /** Compact consumers already expose the raw controls directly. */
    showSummary?: boolean;
    showCustomize?: boolean;
    customizeTarget?: string;
  }

  const {
    presetGroup,
    activePresetId,
    defaultChipId,
    customChipId,
    customDisabled = false,
    customColors = null,
    onSelectPreset,
    onCustomize,
    effectLabel,
    accentColor,
    summary = "",
    showSummary = true,
    showCustomize = true,
    customizeTarget,
  }: Props = $props();

  // Trail's Default IS the colour-matched factory blue/red, so its Default chip
  // shows those dots instead of the generic accent dot. Static (the factory look),
  // not the live config — Default always reads as the matched red/blue.
  const trailDefaultColors = $derived(
    presetGroup.effectType === "trails"
      ? {
          left: DEFAULT_EFFECTS_CONFIG.trails.leftColor,
          right: DEFAULT_EFFECTS_CONFIG.trails.rightColor,
        }
      : null
  );

  const presetModels = $derived(
    presetGroup.presets.map((preset) => {
      const preview = createEffectLookPreview(presetGroup.effectType, preset);
      return {
        preset,
        preview,
        description: describeLook(preset.id) ?? preview.trait,
      };
    })
  );

  /**
   * Columns at the widest tier. Three is the denser, preferred answer, but Fire
   * has four looks and three columns strand the fourth alone on its own row -
   * the "never a row of one" case in 4k-native-layout.md. Two columns only wins
   * when it actually clears the orphan: seven looks orphan either way, so those
   * stay at three rather than getting taller for nothing.
   */
  const wideCols = $derived(
    presetModels.length % 3 === 1 && presetModels.length % 2 === 0 ? 2 : 3
  );

  /* Fourth column on genuinely wide docks (the performer hub at 4K). Skip it
   * when it would strand one card on the last row - those counts stay at 3. */
  const ultraCols = $derived(
    presetModels.length >= 4 && presetModels.length % 4 !== 1 ? 4 : 3
  );
</script>

<div class="presets-section">
  <div class="section-heading" class:with-tune={showCustomize && !!onCustomize}>
    <span class="section-label">{t("effect_deep_looks")}</span>
    {#if showCustomize && onCustomize}
      <button
        class="customize-btn"
        type="button"
        style:--btn-accent={accentColor}
        aria-controls={customizeTarget}
        onclick={onCustomize}
      >
        <i class="fas fa-sliders" aria-hidden="true"></i>
        {t("effect_deep_tune")}
      </button>
    {/if}
  </div>

  <div
    class="look-choices"
    role="radiogroup"
    aria-label={t("effect_deep_choose_look", {
      effect: effectUiLabel(effectLabel),
    })}
  >
    {#if presetModels.length > 0}
      <div class="preset-grid" data-cols={wideCols} data-cols-wide={ultraCols}>
        {#each presetModels as item (item.preset.id)}
          {@const isActive = item.preset.id === activePresetId}
          <button
            class="preset-card"
            class:active={isActive}
            type="button"
            role="radio"
            aria-checked={isActive}
            style:--card-accent={accentColor}
            onclick={() => onSelectPreset(item.preset.id)}
          >
            <div class="preview-area">
              <EffectPresetThumbnail
                effectType={presetGroup.effectType}
                preset={item.preset}
                legacyModel={item.preview}
                active={isActive}
              />
            </div>
            <span class="preset-name">{effectUiLabel(item.preset.name)}</span>
            <span class="preset-trait">{effectUiTrait(item.description)}</span>
          </button>
        {/each}
      </div>
    {/if}

    {#if defaultChipId || customChipId}
      <div class="anchor-grid">
        {#if defaultChipId}
          {@const isDefaultActive = activePresetId === defaultChipId}
          <button
            class="anchor-card"
            class:active={isDefaultActive}
            type="button"
            role="radio"
            aria-checked={isDefaultActive}
            style:--card-accent={accentColor}
            onclick={() => onSelectPreset(defaultChipId)}
          >
            <span class="anchor-mark" aria-hidden="true">
              {#if trailDefaultColors}
                <span class="dual-dots">
                  <span class="dot" style:background={trailDefaultColors.left}
                  ></span>
                  <span class="dot" style:background={trailDefaultColors.right}
                  ></span>
                </span>
              {:else}
                <i class="fas fa-rotate-left"></i>
              {/if}
            </span>
            <span class="anchor-copy">
              <span class="anchor-name">{t("effect_deep_original")}</span>
              <span class="anchor-description"
                >{t("effect_deep_factory_settings")}</span
              >
            </span>
          </button>
        {/if}

        {#if customChipId && !customDisabled}
          {@const isCustomActive = activePresetId === customChipId}
          <button
            class="anchor-card"
            class:active={isCustomActive}
            type="button"
            role="radio"
            aria-checked={isCustomActive}
            style:--card-accent={accentColor}
            onclick={() => onSelectPreset(customChipId)}
          >
            <span class="anchor-mark" aria-hidden="true">
              {#if customColors}
                <span class="dual-dots">
                  <span class="dot" style:background={customColors.left}></span>
                  <span class="dot" style:background={customColors.right}
                  ></span>
                </span>
              {:else}
                <i class="fas fa-wand-magic-sparkles"></i>
              {/if}
            </span>
            <span class="anchor-copy">
              <span class="anchor-name">{t("effect_deep_your_look")}</span>
              <span class="anchor-description">
                {t("effect_deep_updates_controls")}
              </span>
            </span>
          </button>
        {/if}
      </div>
    {/if}
  </div>

  {#if showSummary}
    <div class="summary-row">
      <span class="summary-label">{t("effect_deep_current")}</span>
      <span class="summary-text">{summary}</span>
    </div>
  {/if}
</div>

<style>
  .presets-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
    container: looks / inline-size;
  }

  .section-label {
    font-size: var(--font-size-min, 14px);
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--theme-text, white);
  }

  .section-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .section-heading.with-tune {
    min-height: 44px;
  }

  .look-choices {
    display: grid;
    gap: 8px;
  }

  .preset-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 8px;
  }

  .preset-card {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 5px;
    min-width: 0;
    min-height: 0;
    padding: 9px;
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 12px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    color: var(--theme-text, white);
    cursor: pointer;
    transition:
      transform var(--duration-fast, 100ms) ease,
      border-color var(--duration-fast, 100ms) ease,
      background var(--duration-fast, 100ms) ease;
    -webkit-tap-highlight-color: transparent;
  }

  .preset-card:hover {
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
    transform: translateY(-1px);
  }

  .preset-card.active {
    border-color: var(--card-accent);
    background: color-mix(in srgb, var(--card-accent) 8%, transparent);
  }

  .preset-card:focus-visible {
    outline: 2px solid var(--card-accent, var(--theme-accent, #8b5cf6));
    outline-offset: 2px;
  }

  .preview-area {
    width: 100%;
    aspect-ratio: 8 / 3;
  }

  .preview-area :global(.look-preview) {
    height: 100%;
    aspect-ratio: auto;
  }

  .preset-name {
    font-size: var(--font-size-min, 14px);
    font-weight: 700;
    color: var(--theme-text, white);
    text-align: left;
    line-height: 1.2;
  }

  .preset-trait {
    min-width: 0;
    overflow: hidden;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    text-align: left;
    line-height: 1.25;
  }

  .anchor-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 8px;
  }

  .anchor-card {
    min-width: 0;
    min-height: 58px;
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 8px 10px;
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 10px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    color: var(--theme-text, white);
    cursor: pointer;
    text-align: left;
  }

  .anchor-card.active {
    border-color: var(--card-accent);
    background: color-mix(in srgb, var(--card-accent) 8%, transparent);
  }

  .anchor-card:focus-visible {
    outline: 2px solid var(--card-accent, var(--theme-accent, #8b5cf6));
    outline-offset: 2px;
  }

  .anchor-mark {
    width: 30px;
    height: 30px;
    flex: 0 0 30px;
    display: grid;
    place-items: center;
    border-radius: 9px;
    background: color-mix(in srgb, var(--card-accent) 10%, transparent);
    color: var(--card-accent);
  }

  .anchor-copy {
    min-width: 0;
    display: grid;
    gap: 2px;
  }

  .anchor-name {
    font-size: var(--font-size-min, 14px);
    font-weight: 700;
  }

  .anchor-description {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.58));
  }

  .dual-dots {
    display: inline-flex;
    gap: 3px;
  }

  .dot {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    box-shadow: 0 0 5px currentColor;
  }

  .summary-row {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    gap: 8px;
    padding: 7px 9px;
    border-radius: 8px;
    background: color-mix(in srgb, var(--theme-card-bg) 70%, transparent);
  }

  .summary-label {
    font-size: var(--font-size-compact, 12px);
    font-weight: 700;
    color: var(--theme-text, white);
  }

  .summary-text {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .customize-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: 44px;
    padding: 10px 16px;
    border: 1.5px solid color-mix(in srgb, var(--btn-accent) 40%, transparent);
    border-radius: 10px;
    background: color-mix(in srgb, var(--btn-accent) 8%, transparent);
    color: var(--btn-accent);
    font-size: var(--font-size-min, 14px);
    font-weight: 650;
    cursor: pointer;
    transition:
      background var(--duration-fast, 100ms) ease,
      border-color var(--duration-fast, 100ms) ease;
    -webkit-tap-highlight-color: transparent;
  }

  .customize-btn:hover {
    background: color-mix(in srgb, var(--btn-accent) 14%, transparent);
    border-color: color-mix(in srgb, var(--btn-accent) 60%, transparent);
  }

  .customize-btn:focus-visible {
    outline: 2px solid var(--btn-accent);
    outline-offset: 2px;
  }

  /* 17rem, not 30rem. The effects side panel is ~22rem, so a 30rem seam never
     fired there and every effect shipped as a single column - five stacked
     cards that pushed Customize and the controls below the fold for no reason.
     Two 8:3 previews fit comfortably at 17rem. */
  @container looks (min-width: 17rem) {
    .preset-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .anchor-grid {
      grid-template-columns: 1fr 1fr;
    }
  }

  /* 26rem, not 33rem. The sidebar inspector's looks container is ~28rem, so a
     33rem seam never fired there: eight looks stacked into four tall rows and
     pushed the tuning controls, fine tuning and the footer below the fold. The
     whole inspector has to fit one screen without scrolling, and a third column
     is where that height comes from - three 8:3 previews are still legible at
     ~9rem each.

     Odd counts (bloom, ink and zap have 3) end on a half-filled final row.
     Spanning the last card across the row was tried and reverted: the preview
     keeps its 8:3 ratio, so a double-wide card grows 53% taller than its
     siblings and dominates the group. */
  @container looks (min-width: 26rem) {
    .preset-grid[data-cols="3"] {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }

  /* Fourth column on genuinely wide docks (the performer hub at 4K, content up
     to ~1070px). 40rem so this only fires on containers well past the 26rem
     three-column tier - other EffectPresetsSection consumers only gain this
     tier if their container also clears 40rem. */
  @container looks (min-width: 40rem) {
    .preset-grid[data-cols-wide="4"] {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .preset-card,
    .customize-btn {
      transition: none;
    }
  }
</style>
