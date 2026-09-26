<!--
  DurationControl.svelte

  Full-width integrated banner for adjusting beat duration.
  Dual controls: fine (±0.1) and coarse (±0.5) stepping.
  Tap the value to type any exact number (e.g. 1.67).
  Minimum duration is 1.0 (square pictograph). Durations only extend wider.

  Visually integrates with prop control cards via matching padding and border-bottom divider.
  Compact mode: Smaller buttons and tighter spacing for mobile.
-->
<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import { formatDurationDisplay } from "../../utils/duration-display";
  import {
    MIN_DURATION,
    MAX_DURATION,
    DURATION_STEP_FINE,
    DURATION_STEP_COARSE,
  } from "../../services/step-operations/duration-handler";

  interface Props {
    duration: number;
    /** Compact mode: smaller buttons and tighter layout */
    compact?: boolean;
    onDurationChange: (newDuration: number) => void;
  }

  let { duration, compact = false, onDurationChange }: Props = $props();

  const displayDuration = $derived(formatDurationDisplay(duration));
  const canDecrease = $derived(duration > MIN_DURATION);
  const canIncrease = $derived(duration < MAX_DURATION);

  let editing = $state(false);
  let editValue = $state("");
  let inputEl: HTMLInputElement | undefined = $state();

  function handleChange(delta: number) {
    const newDuration = Math.max(
      MIN_DURATION,
      Math.min(MAX_DURATION, duration + delta)
    );
    if (newDuration !== duration) {
      onDurationChange(newDuration);
    }
  }

  function startEditing() {
    editValue = duration.toString();
    editing = true;
    requestAnimationFrame(() => {
      inputEl?.select();
    });
  }

  function commitEdit() {
    editing = false;
    const parsed = parseFloat(editValue);
    if (isNaN(parsed)) return;
    const clamped = Math.max(MIN_DURATION, Math.min(MAX_DURATION, parsed));
    const rounded = Math.round(clamped * 100) / 100;
    if (rounded !== duration) {
      onDurationChange(rounded);
    }
  }

  function handleEditKeydown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      commitEdit();
    } else if (e.key === "Escape") {
      editing = false;
    }
  }
</script>

<div class="duration-control" class:compact>
  <span class="duration-label">{t("clip_duration")}</span>

  <div class="duration-row">
    <!-- Coarse decrease (−0.5) -->
    <button
      class="ctrl-btn coarse"
      aria-label={t("create_ui_decrease_duration_by_half_beat")}
      onclick={() => handleChange(-DURATION_STEP_COARSE)}
      disabled={!canDecrease}
    >
      <i class="fas fa-angles-left" aria-hidden="true"></i>
    </button>

    <!-- Fine decrease (−0.1) -->
    <button
      class="ctrl-btn fine"
      aria-label={t("create_ui_decrease_duration_by_tenth")}
      onclick={() => handleChange(-DURATION_STEP_FINE)}
      disabled={!canDecrease}
    >
      <i class="fas fa-minus" aria-hidden="true"></i>
    </button>

    <!-- Current value display / direct input -->
    {#if editing}
      <input
        bind:this={inputEl}
        class="duration-input"
        class:compact
        type="number"
        min={MIN_DURATION}
        max={MAX_DURATION}
        step="0.01"
        bind:value={editValue}
        onblur={commitEdit}
        onkeydown={handleEditKeydown}
      />
    {:else}
      <button
        class="duration-value"
        class:compact
        onclick={startEditing}
        aria-label={t("create_ui_edit_duration_value")}
      >
        {displayDuration}
      </button>
    {/if}

    <!-- Fine increase (+0.1) -->
    <button
      class="ctrl-btn fine"
      aria-label={t("create_ui_increase_duration_by_tenth")}
      onclick={() => handleChange(DURATION_STEP_FINE)}
      disabled={!canIncrease}
    >
      <i class="fas fa-plus" aria-hidden="true"></i>
    </button>

    <!-- Coarse increase (+0.5) -->
    <button
      class="ctrl-btn coarse"
      aria-label={t("create_ui_increase_duration_by_half_beat")}
      onclick={() => handleChange(DURATION_STEP_COARSE)}
      disabled={!canIncrease}
    >
      <i class="fas fa-angles-right" aria-hidden="true"></i>
    </button>
  </div>
</div>

<style>
  .duration-control {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    padding: 14px;
    background: transparent;
    border: none;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    margin: 0 0 12px 0; /* Bottom margin creates separation from prop cards */
  }

  /* Compact mode: tighter layout matching prop cards */
  .duration-control.compact {
    gap: 6px;
    padding: 8px;
    margin-bottom: 6px;
  }

  /* Duration label - matches BLUE/RED label styling */
  .duration-label {
    font-size: 0.75rem;
    font-weight: 700;
    color: rgba(255, 255, 255, 0.8);
    text-transform: uppercase;
    letter-spacing: 0.75px;
  }

  .duration-control.compact .duration-label {
    font-size: var(--font-size-compact, 12px);
    letter-spacing: 0.5px;
  }

  .duration-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .duration-control.compact .duration-row {
    gap: 4px;
  }

  .duration-value {
    min-height: var(--min-touch-target, 44px);
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--theme-text, #ffffff);
    min-width: 64px;
    text-align: center;
    font-feature-settings: "tnum";
    background: none;
    border: 1px solid transparent;
    border-radius: 6px;
    padding: 2px 4px;
    cursor: pointer;
    transition: border-color var(--duration-fast) ease;
  }

  .duration-value:hover {
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
  }

  .duration-value.compact {
    font-size: 1.1rem;
    min-width: 48px;
  }

  .duration-input {
    box-sizing: border-box;
    min-height: var(--min-touch-target, 44px);
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--theme-text, #ffffff);
    width: 72px;
    text-align: center;
    font-feature-settings: "tnum";
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.08));
    border: 1px solid var(--theme-accent, rgba(255, 255, 255, 0.3));
    border-radius: 6px;
    padding: 2px 4px;
    outline: none;
    -moz-appearance: textfield;
    appearance: textfield;
  }

  .duration-input::-webkit-inner-spin-button,
  .duration-input::-webkit-outer-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }

  .duration-input.compact {
    font-size: 1.1rem;
    width: 56px;
  }

  .ctrl-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--min-touch-target, 44px);
    height: var(--min-touch-target, 44px);
    border-radius: 10px;
    border: 1px solid;
    cursor: pointer;
    font-size: 1rem;
    transition: all var(--duration-fast) ease;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.08));
    border-color: var(--theme-stroke, rgba(255, 255, 255, 0.15));
    color: rgba(255, 255, 255, 0.7);
  }

  .ctrl-btn:hover:not(:disabled) {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.12));
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.25));
    color: rgba(255, 255, 255, 0.9);
  }

  .ctrl-btn:active:not(:disabled) {
    transform: scale(0.95);
  }

  .ctrl-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  /* Coarse buttons (±0.5) - neutral styling, no orange accent */
  .ctrl-btn.coarse {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.1));
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
    color: rgba(255, 255, 255, 0.8);
  }

  .ctrl-btn.coarse:hover:not(:disabled) {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.15));
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.3));
    box-shadow: 0 2px 8px rgba(255, 255, 255, 0.1);
  }

  /* Fine buttons (±0.1) - subtle */
  .ctrl-btn.fine {
    width: var(--min-touch-target, 44px);
    height: var(--min-touch-target, 44px);
    font-size: 0.9rem;
  }

  .duration-control.compact .ctrl-btn {
    width: var(--min-touch-target, 44px);
    height: var(--min-touch-target, 44px);
    font-size: 0.85rem;
    border-radius: 8px;
  }

  .duration-control.compact .ctrl-btn.fine {
    width: var(--min-touch-target, 44px);
    height: var(--min-touch-target, 44px);
    font-size: 0.75rem;
  }

  /* The iPhone-width editor has room for one clear toolbar. Keeping the label
     beside the controls returns an entire row to the pictograph stage. */
  @container step-editor (min-width: 300px) {
    .duration-control.compact {
      flex-direction: row;
      justify-content: center;
      gap: 4px;
      padding: 8px;
      margin-bottom: 0;
      border-bottom: 0;
    }
  }

  @supports not (container-type: size) {
    @media (min-width: 300px) and (max-width: 1023px) {
      .duration-control.compact {
        flex-direction: row;
        justify-content: center;
        gap: 4px;
        padding: 8px;
        margin-bottom: 0;
        border-bottom: 0;
      }
    }
  }

  @media (max-width: 360px) {
    .duration-row {
      gap: 4px;
    }

    .ctrl-btn {
      width: var(--min-touch-target, 44px);
      height: var(--min-touch-target, 44px);
    }

    .ctrl-btn.fine {
      width: var(--min-touch-target, 44px);
      height: var(--min-touch-target, 44px);
    }

    .duration-value {
      min-width: 56px;
      font-size: 1.25rem;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .ctrl-btn {
      transition: none;
    }

    .ctrl-btn:active:not(:disabled) {
      transform: none;
    }
  }
</style>
