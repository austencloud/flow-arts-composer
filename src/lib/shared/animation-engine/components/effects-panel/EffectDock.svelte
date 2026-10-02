<script lang="ts">
  import { effectUiLabel } from "./effect-ui-label";
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import EffectLookChips from "./EffectLookChips.svelte";
  import EffectPresetsSection from "./EffectPresetsSection.svelte";
  import type { EffectRegistration } from "./effect-registry";
  import type { PrimaryParamSpec } from "./effect-primary-param";

  /**
   * The active effect's controls, docked beneath the roster.
   *
   * The roster is the point: browsing effects must never navigate. So the one
   * thing you reach for right after picking an effect - its Look, and its
   * headline knob - lives here, under the grid, instead of behind a screen
   * transition. Deep tuning stays one click away via Tune.
   *
   * How the looks present themselves is the host's call, because it depends
   * entirely on the vertical room the host has - see `looks`.
   */
  interface Props {
    registration: EffectRegistration;
    activePresetId: string | null;
    defaultChipId: string;
    customChipId: string;
    customDisabled?: boolean;
    customColors?: { left: string; right: string } | null;
    primarySpec?: PrimaryParamSpec;
    primaryValue: number;
    onSelectPreset: (presetId: string) => void;
    onPrimaryInput: (value: number) => void;
    onTune: () => void;
    tuneLoading?: boolean;
    tuneError?: boolean;
    /** Sidebar opens the full inspector; the popover opens deep tuning. */
    tuneLabel?: string;
    /**
     * How much of each look to show, chosen by how much vertical room the host
     * has:
     *
     * - `rail`  one scrolling row of chips. Constant height whatever the effect,
     *           for the phone tray and the popover, which cannot spare rows.
     * - `wrap`  the same chips on as many rows as it takes.
     * - `tiles` the full thumbnail cards, the same presentation the inspector
     *           uses. The desktop sidebar passes this: it had 250px of dead
     *           space under the dock while the looks were reduced to a word and
     *           a 10px dot, which is the one place a look cannot be judged. A
     *           look you cannot see is a look you will not try.
     *
     * Height varies with the effect under `wrap` and `tiles` (looks run 2..10).
     * The roster above the dock holds still either way and the panel footer is
     * the only thing that moves, which is the arrangement no-layout-shift.md
     * already settled on for this panel.
     */
    looks?: "rail" | "wrap" | "tiles";
  }

  const {
    registration,
    activePresetId,
    defaultChipId,
    customChipId,
    customDisabled = false,
    customColors = null,
    primarySpec,
    primaryValue,
    onSelectPreset,
    onPrimaryInput,
    onTune,
    tuneLoading = false,
    tuneError = false,
    tuneLabel = "",
    looks = "rail",
  }: Props = $props();

  function handleSliderInput(ev: Event): void {
    onPrimaryInput(parseFloat((ev.currentTarget as HTMLInputElement).value));
  }
</script>

<section
  class="effect-dock"
  style:--effect-accent={registration.meta.color}
  aria-label={t("effect_deep_effect_controls", {
    effect: effectUiLabel(registration.meta.label),
  })}
>
  <div class="dock-head">
    <span class="dock-identity">
      <i class="fas {registration.meta.icon} dock-icon" aria-hidden="true"></i>
      <span class="dock-name">{effectUiLabel(registration.meta.label)}</span>
    </span>
    <button
      type="button"
      class="tune-btn"
      onclick={onTune}
      disabled={tuneLoading}
    >
      <i class="fas fa-sliders" aria-hidden="true"></i>
      <span
        >{tuneLoading
          ? t("effect_deep_tune_loading")
          : tuneLabel || t("effect_deep_tune")}</span
      >
    </button>
  </div>
  {#if tuneError}
    <p class="tune-error" role="alert">{t("effect_deep_tune_load_failed")}</p>
  {/if}

  {#if looks === "tiles"}
    <!-- The inspector's own Looks section, rendered here rather than
         reimplemented: one owner for the thumbnail presentation, so the dock and
         the inspector can never drift apart on what a look looks like
         (never-hand-roll.md). The dock supplies its own identity header and
         primary slider, so the summary row and the Customize button stay off -
         Tune in the header already goes there. -->
    <EffectPresetsSection
      presetGroup={registration.presetGroup}
      {activePresetId}
      {defaultChipId}
      {customChipId}
      {customDisabled}
      {customColors}
      accentColor={registration.meta.color}
      effectLabel={registration.meta.label}
      {onSelectPreset}
      showSummary={false}
      showCustomize={false}
    />
  {:else}
    <EffectLookChips
      presetGroup={registration.presetGroup}
      {activePresetId}
      {defaultChipId}
      {customChipId}
      {customDisabled}
      {customColors}
      accentColor={registration.meta.color}
      effectLabel={registration.meta.label}
      onSelect={onSelectPreset}
      wrap={looks === "wrap"}
    />
  {/if}

  {#if primarySpec}
    <div class="slider-row">
      <span class="slider-label">{effectUiLabel(primarySpec.label)}</span>
      <input
        type="range"
        class="slider"
        min={primarySpec.min}
        max={primarySpec.max}
        step={primarySpec.step}
        value={primaryValue}
        oninput={handleSliderInput}
        aria-label={t("effect_deep_param_for_effect", {
          param: effectUiLabel(primarySpec.label),
          effect: effectUiLabel(registration.meta.label),
        })}
      />
      <span class="slider-val">{primarySpec.format(primaryValue)}</span>
    </div>
  {/if}
</section>

<style>
  .effect-dock {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.625rem;
    border-radius: 0.75rem;
    border: 1px solid color-mix(in srgb, var(--effect-accent) 28%, transparent);
    background: color-mix(in srgb, var(--effect-accent) 7%, transparent);
    min-width: 0;
  }

  .dock-head {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
  }

  .dock-identity {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    flex: 1 1 auto;
    min-width: 0;
  }

  .dock-icon {
    font-size: 1rem;
    color: var(--effect-accent);
    flex-shrink: 0;
  }

  .dock-name {
    font-size: 0.8125rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--theme-text, white);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* A real button, not a text link - it is the primary action of this dock
     (clickables-look-like-buttons.md). */
  .tune-btn {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.375rem;
    min-height: var(--min-touch-target, 44px);
    padding: 0 0.75rem;
    border-radius: 0.5rem;
    border: 1px solid color-mix(in srgb, var(--effect-accent) 45%, transparent);
    background: color-mix(in srgb, var(--effect-accent) 16%, transparent);
    color: var(--theme-text, white);
    font-size: var(--font-size-compact, 12px);
    font-weight: 650;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    transition: all 150ms ease;
  }

  .tune-btn:hover {
    background: color-mix(in srgb, var(--effect-accent) 26%, transparent);
    border-color: color-mix(in srgb, var(--effect-accent) 70%, transparent);
  }

  .tune-btn:focus-visible {
    outline: 2px solid var(--effect-accent);
    outline-offset: 2px;
  }

  .tune-btn:disabled {
    cursor: wait;
    opacity: 0.7;
  }

  .tune-error {
    margin: 0;
    color: var(--theme-error, #ff8b8b);
    font-size: var(--font-size-compact, 12px);
  }

  .slider-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
  }

  .slider-label {
    font-size: var(--font-size-compact, 12px);
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.55));
    flex-shrink: 0;
  }

  .slider {
    flex: 1 1 auto;
    min-width: 0;
    height: 22px;
    appearance: none;
    -webkit-appearance: none;
    background: transparent;
    cursor: pointer;
  }
  .slider::-webkit-slider-runnable-track {
    height: 6px;
    border-radius: 3px;
    background: var(--theme-stroke, rgba(255, 255, 255, 0.08));
  }
  .slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 16px;
    height: 16px;
    margin-top: -5px;
    border-radius: 50%;
    background: var(--theme-text, white);
    box-shadow: 0 2px 6px var(--theme-shadow, rgba(0, 0, 0, 0.4));
    cursor: pointer;
  }
  .slider::-moz-range-track {
    height: 6px;
    border-radius: 3px;
    background: var(--theme-stroke, rgba(255, 255, 255, 0.08));
  }
  .slider::-moz-range-progress {
    height: 6px;
    border-radius: 3px;
    background: var(--effect-accent);
  }
  .slider::-moz-range-thumb {
    width: 16px;
    height: 16px;
    border: none;
    border-radius: 50%;
    background: var(--theme-text, white);
    box-shadow: 0 2px 6px var(--theme-shadow, rgba(0, 0, 0, 0.4));
    cursor: pointer;
  }

  /* Tabular figures: the value changes as you drag, and a proportional 0.55 is
     a different width from 0.11 - which would shove the slider (no-layout-shift). */
  .slider-val {
    font-size: var(--font-size-compact, 12px);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: var(--theme-text, white);
    min-width: 2.75rem;
    text-align: right;
    flex-shrink: 0;
  }

  @media (prefers-reduced-motion: reduce) {
    .tune-btn {
      transition: none;
    }
  }
</style>
