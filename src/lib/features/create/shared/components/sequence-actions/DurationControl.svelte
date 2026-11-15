<!--
  DurationControl.svelte

  Beat duration stepper. Same grammar as the turns stepper (− value +), with a
  coarse ≪ ≫ pair (±0.5) beside the fine ± pair (±0.1). Holding a button
  repeats its step through the shared holdRepeat action, and a held fine
  button moves to the coarse step after two seconds, so 1× to 3× is one
  press, not twenty taps. Tap the value to type
  an exact number (e.g. 1.67). Minimum duration is 1.0 (square pictograph).

  Layouts:
    row     — one line: ≪ − value + ≫ (default)
    stacked — fine pair over coarse pair, for a short landscape drawer where
              the control sits beside the preview instead of under it
  Compact mode uses the 36px phone controls in a 44px card and, in a drawer at
  least 300px wide, keeps the label beside the row so the pictograph gets the
  height back. Fill is the phone step editor's column beside the picture:
  the card spans that column, the label is visually hidden (it still names
  the group), and the value takes whatever the buttons leave. Fill with the
  row layout puts all five in one line (a column about 200 wide); with the
  stacked layout the fine pair stands over the coarse pair (about 150 wide).
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { holdRepeat } from "#lib/shared/ui/hold-repeat.js";
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
    /** Span the column beside the phone editor's picture (see header). */
    fill?: boolean;
    onDurationChange: (newDuration: number) => void;
  }

  let {
    duration,
    compact = false,
    layout = "row",
    fill = false,
    onDurationChange,
  }: Props = $props();

  const displayDuration = $derived(formatDurationDisplay(duration));
  const canDecrease = $derived(duration > MIN_DURATION);
  const canIncrease = $derived(duration < MAX_DURATION);

  const labelId = $props.id();

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
  class:fill
  role="group"
  aria-labelledby="{labelId}-label"
>
  <span class="duration-label" id="{labelId}-label">{t("clip_duration")}</span>

  <div class="duration-row">
    <!-- Coarse decrease (−0.5) -->
    <button
      class="ctrl-btn coarse-down"
      aria-label={t("create_ui_decrease_duration_by_half_beat")}
      use:holdRepeat={{
        step: DURATION_STEP_COARSE,
        onStep: (step) => handleChange(-step),
      }}
      disabled={!canDecrease}
    >
      <i class="fas fa-angles-left" aria-hidden="true"></i>
    </button>

    <!-- Fine decrease (−0.1) -->
    <button
      class="ctrl-btn fine-down"
      aria-label={t("create_ui_decrease_duration_by_tenth")}
      use:holdRepeat={{
        step: DURATION_STEP_FINE,
        fastStep: DURATION_STEP_COARSE,
        onStep: (step) => handleChange(-step),
      }}
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
      use:holdRepeat={{
        step: DURATION_STEP_FINE,
        fastStep: DURATION_STEP_COARSE,
        onStep: (step) => handleChange(step),
      }}
      disabled={!canIncrease}
    >
      <i class="fas fa-plus" aria-hidden="true"></i>
    </button>

    <!-- Coarse increase (+0.5) -->
    <button
      class="ctrl-btn coarse-up"
      aria-label={t("create_ui_increase_duration_by_half_beat")}
      use:holdRepeat={{
        step: DURATION_STEP_COARSE,
        onStep: (step) => handleChange(step),
      }}
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
    /* A card like the Left and Right hand cards below it (PropControlPair),
       in the neutral tone because duration belongs to the step, not a hand.
       It sits on the same theme ground so its controls read over any
       backdrop the see-through editor shows. No blur. */
    box-sizing: border-box;
    width: fit-content;
    max-width: 100%;
    margin: 0 auto 12px;
    border-radius: 12px;
    border: 1px solid var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
    background:
      linear-gradient(
        135deg,
        rgba(255, 255, 255, 0.08) 0%,
        rgba(255, 255, 255, 0.03) 100%
      ),
      var(--theme-panel-elevated-bg, rgba(0, 0, 0, 0.5));
  }

  /* Compact mode: tighter layout matching prop cards */
  .duration-control.compact {
    gap: 6px;
    padding: 8px;
    margin-bottom: 6px;
    border-radius: 10px;
  }

  /* On a phone the hand card below spans the controls zone inside its 8px
     padding (StepControlsZone .stacked), so this card spans the same width and
     their edges line up. Beside the preview (stacked) it keeps its own size. */
  .duration-control.compact:not(.stacked) {
    width: auto;
    margin-inline: 8px;
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
      "cdown value cup";
  }

  /* The value spans both rows, centred, so no hole sits under it. */
  .duration-control.stacked .value-slot {
    align-self: center;
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
    /* Repeated taps must each land: without this a phone takes the second of
       two quick taps as a double-tap zoom and drops it. A held press must not
       start a text selection or the iOS callout either. */
    touch-action: manipulation;
    user-select: none;
    -webkit-user-select: none;
    -webkit-touch-callout: none;
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

  /* The 36px phone control; the global button floor is lifted with it. */
  .duration-control.compact .ctrl-btn {
    width: var(--alt-touch-target, 36px);
    height: var(--alt-touch-target, 36px);
    min-width: 0;
    min-height: 0;
    border-radius: 8px;
    font-size: 0.95rem;
  }

  .duration-control.compact .duration-value,
  .duration-control.compact .duration-input {
    min-height: var(--alt-touch-target, 36px);
    min-width: 0;
    padding-block: 0;
  }

  /* The iPhone-width editor has room for one clear toolbar. Keeping the label
     beside the controls returns an entire row to the pictograph stage: 36px
     buttons in 3px of padding and a 1px border make a 44px card. */
  @container step-editor (min-width: 300px) {
    .duration-control.compact:not(.stacked) {
      flex-direction: row;
      justify-content: center;
      gap: 4px;
      padding: 3px 8px;
      margin-bottom: 0;
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
      }
    }
  }

  /* Fill: the card spans the column beside the phone editor's picture. The
     label leaves the screen but still names the group. */
  .duration-control.compact.fill {
    width: 100%;
    margin: 0;
    padding: 3px;
  }

  .duration-control.compact.fill .duration-label {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    padding: 0;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  .duration-control.compact.fill .value-slot {
    min-width: 0;
  }

  /* One line, about 200px: four 36px buttons, 2px gaps and the value in what
     is left. */
  .duration-control.compact.fill:not(.stacked) .duration-row {
    width: 100%;
    grid-template-columns:
      var(--alt-touch-target, 36px) var(--alt-touch-target, 36px)
      minmax(0, 1fr) var(--alt-touch-target, 36px)
      var(--alt-touch-target, 36px);
    gap: 2px;
  }

  .duration-control.compact.fill:not(.stacked) .duration-value,
  .duration-control.compact.fill:not(.stacked) .duration-input {
    padding-inline: 2px;
    overflow: hidden;
    font-size: var(--font-size-min, 14px);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* Fine pair over coarse pair, 84px tall (3 + 36 + 4 + 36 + 3 and the
     border): the value keeps the middle column at its compact size. */
  .duration-control.compact.fill.stacked .duration-row {
    width: 100%;
    grid-template-columns:
      var(--alt-touch-target, 36px) minmax(0, 1fr)
      var(--alt-touch-target, 36px);
  }

  /* Beside the preview there is no row under it to separate from. */
  .duration-control.stacked {
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
