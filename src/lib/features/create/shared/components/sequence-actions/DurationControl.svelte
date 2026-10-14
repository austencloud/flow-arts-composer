<!--
  DurationControl.svelte

  Beat duration stepper. Same grammar as the turns stepper (− value +), with a
  coarse ≪ ≫ pair (±0.5) beside the fine ± pair (±0.1). Tap the value to type
  an exact number (e.g. 1.67). Minimum duration is 1.0 (square pictograph).

  Layouts:
    row     — one line: ≪ − value + ≫ (default)
    stacked — fine pair over coarse pair, for a short landscape drawer where
              the control sits beside the preview instead of under it
  Compact mode tightens spacing and, in a drawer at least 300px wide, keeps the
  label beside the row so the pictograph gets the height back.
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { formatDurationDisplay } from "../../utils/duration-display";
  import {
    MIN_DURATION,
    MAX_DURATION,
    DURATION_STEP_FINE,
    DURATION_STEP_COARSE,
  } from "../../services/step-operations/duration-handler";

  interface Props {
    duration: number;
    /** Compact mode: tighter layout for a narrow drawer */
    compact?: boolean;
    /** Stacked puts the coarse pair under the fine pair (short landscape). */
    layout?: "row" | "stacked";
    onDurationChange: (newDuration: number) => void;
  }

  let {
    duration,
    compact = false,
    layout = "row",
    onDurationChange,
  }: Props = $props();

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

<div
  class="duration-control"
  class:compact
  class:stacked={layout === "stacked"}
>
  <span class="duration-label">{t("clip_duration")}</span>

  <div class="duration-row">
    <!-- Coarse decrease (−0.5) -->
    <button
      class="ctrl-btn coarse-down"
      aria-label={t("create_ui_decrease_duration_by_half_beat")}
      onclick={() => handleChange(-DURATION_STEP_COARSE)}
      disabled={!canDecrease}
    >
      <i class="fas fa-angles-left" aria-hidden="true"></i>
    </button>

    <!-- Fine decrease (−0.1) -->
    <button
      class="ctrl-btn fine-down"
      aria-label={t("create_ui_decrease_duration_by_tenth")}
      onclick={() => handleChange(-DURATION_STEP_FINE)}
      disabled={!canDecrease}
    >
      <i class="fas fa-minus" aria-hidden="true"></i>
    </button>

    <!-- Current value display / direct input. The two share one slot so the
         row never moves when editing starts. -->
    <div class="value-slot">
      {#if editing}
        <input
          bind:this={inputEl}
          class="duration-input"
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
          onclick={startEditing}
          aria-label={t("create_ui_edit_duration_value")}
        >
          {displayDuration}
        </button>
      {/if}
    </div>

    <!-- Fine increase (+0.1) -->
    <button
      class="ctrl-btn fine-up"
      aria-label={t("create_ui_increase_duration_by_tenth")}
      onclick={() => handleChange(DURATION_STEP_FINE)}
      disabled={!canIncrease}
    >
      <i class="fas fa-plus" aria-hidden="true"></i>
    </button>

    <!-- Coarse increase (+0.5) -->
    <button
      class="ctrl-btn coarse-up"
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

  /* Duration label - matches LEFT/RIGHT label styling */
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

  /* One grid for both layouts: the coarse pair flanks the fine pair in a row,
     or drops under it when stacked, so every button keeps its column. */
  .duration-row {
    display: grid;
    grid-template-columns: repeat(5, auto);
    grid-template-areas: "cdown fdown value fup cup";
    align-items: center;
    justify-content: center;
    gap: 8px;
  }

  .duration-control.compact .duration-row {
    gap: 4px;
  }

  .duration-control.stacked .duration-row {
    grid-template-columns: repeat(3, auto);
    grid-template-areas:
      "fdown value fup"
      "cdown . cup";
  }

  .coarse-down {
    grid-area: cdown;
  }
  .fine-down {
    grid-area: fdown;
  }
  .value-slot {
    grid-area: value;
  }
  .fine-up {
    grid-area: fup;
  }
  .coarse-up {
    grid-area: cup;
  }

  .value-slot {
    display: flex;
    justify-content: center;
    min-width: 64px;
  }

  .duration-value,
  .duration-input {
    box-sizing: border-box;
    width: 100%;
    min-height: var(--min-touch-target, 44px);
    font-size: 1.75rem;
    font-weight: 700;
    color: var(--theme-text, #ffffff);
    text-align: center;
    font-variant-numeric: tabular-nums;
    border-radius: 10px;
    padding: 2px 4px;
  }

  /* The value is an editable field, so it reads as one before hover: a faint
     ring at rest, a stronger one on hover, and a focus ring for the keyboard. */
  .duration-value {
    background: transparent;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    cursor: text;
    transition: border-color var(--duration-fast) var(--ease-standard);
  }

  .duration-value:hover {
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.25));
  }

  .duration-value:focus-visible {
    outline: 2px solid var(--theme-text, #fff);
    outline-offset: 2px;
  }

  .duration-input {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.08));
    border: 1px solid var(--theme-accent, rgba(255, 255, 255, 0.3));
    outline: none;
    -moz-appearance: textfield;
    appearance: textfield;
  }

  .duration-input::-webkit-inner-spin-button,
  .duration-input::-webkit-outer-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }

  .duration-control.compact .value-slot {
    min-width: 56px;
  }

  .duration-control.compact .duration-value,
  .duration-control.compact .duration-input {
    font-size: 1.35rem;
  }

  /* Same geometry as the turns stepper buttons, in the neutral tint: the
     duration belongs to the step, not to a hand. */
  .ctrl-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--min-touch-target, 44px);
    height: var(--min-touch-target, 44px);
    border-radius: 10px;
    border: 1px solid var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.08));
    color: var(--theme-text, rgba(255, 255, 255, 0.9));
    font-size: 1.1rem;
    cursor: pointer;
    transition:
      background var(--duration-fast) var(--ease-standard),
      border-color var(--duration-fast) var(--ease-standard),
      color var(--duration-fast) var(--ease-standard),
      transform var(--duration-fast) var(--ease-standard),
      box-shadow var(--duration-fast) var(--ease-standard);
  }

  .ctrl-btn:hover:not(:disabled) {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.12));
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.3));
    box-shadow: 0 2px 8px rgba(255, 255, 255, 0.1);
  }

  .ctrl-btn:active:not(:disabled) {
    transform: scale(0.95);
  }

  .ctrl-btn:focus-visible {
    outline: 2px solid var(--theme-text, #fff);
    outline-offset: 2px;
  }

  /* At a limit the button sits pressed flat and keeps its slot. */
  .ctrl-btn:disabled {
    background: transparent;
    border-color: var(--theme-stroke, rgba(255, 255, 255, 0.1));
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.4));
    box-shadow: none;
    cursor: default;
  }

  .duration-control.compact .ctrl-btn {
    border-radius: 8px;
    font-size: 0.95rem;
  }

  /* The iPhone-width editor has room for one clear toolbar. Keeping the label
     beside the controls returns an entire row to the pictograph stage. */
  @container step-editor (min-width: 300px) {
    .duration-control.compact:not(.stacked) {
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
      .duration-control.compact:not(.stacked) {
        flex-direction: row;
        justify-content: center;
        gap: 4px;
        padding: 8px;
        margin-bottom: 0;
        border-bottom: 0;
      }
    }
  }

  /* Beside the preview there is no row under it to separate from. */
  .duration-control.stacked {
    border-bottom: 0;
    margin-bottom: 0;
  }

  @media (max-width: 360px) {
    .duration-row {
      gap: 4px;
    }

    .value-slot {
      min-width: 56px;
    }

    .duration-value,
    .duration-input {
      font-size: 1.25rem;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .ctrl-btn,
    .duration-value {
      transition: none;
    }

    .ctrl-btn:active:not(:disabled) {
      transform: none;
    }
  }
</style>
