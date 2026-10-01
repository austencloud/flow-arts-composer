<!--
  A reading you can press to type an exact value: an amount beside a slider,
  a clock, a trim point or a size. It shows `text` in a box; pressing the box
  swaps in a text field holding the number, selected, so typing replaces it.
  Enter or leaving the field sets the value and Escape keeps the old one. A
  field that holds no value stays open, marked, until it does or is left.

  `parse` reads what was typed, or returns null when it is not a value; the
  default takes the first number, so "120", "120%" and "1,5" all work, and
  opens on the number in `text` with its unit beside the field. The owner
  clamps and converts: this box only reports what was typed.

  Sliders pair it with their track (ValueSlider). Dense tools that also scrub
  a number by dragging use ScrubbableNumber.
-->
<script lang="ts">
  import { flushSync, tick } from "svelte";
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import { parseTypedNumber, splitReading } from "../typed-number";

  interface Props {
    /** What the value is: the box's and the field's name. */
    label: string;
    /** The reading as shown. */
    text: string;
    /** What the field opens with; defaults to the number in `text`. */
    draft?: string;
    /** The unit beside the field; defaults to the one after that number. */
    unit?: string;
    /** What was typed as a value, or null when it is not one. */
    parse?: (typed: string) => number | null;
    /** The widest reading, so the box keeps one width as the value changes. */
    sizer?: string;
    /**
     * The value can be below zero. A phone's number pad has no minus key, so
     * the field opens the full keyboard instead.
     */
    signed?: boolean;
    disabled?: boolean;
    oncommit: (value: number) => void;
  }

  let {
    label,
    text,
    draft,
    unit,
    parse,
    sizer,
    signed = false,
    disabled = false,
    oncommit,
  }: Props = $props();

  let editing = $state(false);
  let typed = $state("");
  let invalid = $state(false);
  let opened = "";
  let box = $state<HTMLButtonElement | null>(null);
  let field = $state<HTMLInputElement | null>(null);

  const reading = $derived.by(() => {
    const shown = splitReading(text);
    return {
      draft: draft ?? shown.draft,
      unit: unit ?? (draft === undefined ? shown.unit : ""),
    };
  });

  function begin(): void {
    if (disabled) return;
    opened = reading.draft;
    typed = opened;
    invalid = false;
    editing = true;
    // Focus inside the press itself, so a phone opens its keyboard.
    flushSync();
    field?.focus();
    field?.select();
  }

  /** Sets the typed value. False when the field holds no value. */
  function commit(): boolean {
    if (!editing) return true;
    if (typed.trim() === opened) {
      editing = false;
      return true;
    }
    const value = (parse ?? parseTypedNumber)(typed);
    if (value === null) return false;
    editing = false;
    oncommit(value);
    return true;
  }

  async function refocus(): Promise<void> {
    await tick();
    box?.focus();
  }

  function handleKey(event: KeyboardEvent): void {
    if (event.key === "Enter") {
      event.preventDefault();
      if (commit()) void refocus();
      else invalid = true;
    } else if (event.key === "Escape") {
      // Escape here only leaves the field: the tool, crop or dialog behind
      // it stays as it is.
      event.preventDefault();
      event.stopPropagation();
      editing = false;
      void refocus();
    }
  }

  function handleBlur(): void {
    if (!commit()) editing = false;
  }
</script>

<span class="typeable" class:editing>
  <span class="sizer" aria-hidden="true">{sizer ?? text}</span>
  {#if editing}
    <span class="field" class:invalid>
      <input
        bind:this={field}
        bind:value={typed}
        type="text"
        inputmode={signed ? "text" : "decimal"}
        enterkeyhint="done"
        autocomplete="off"
        autocapitalize="off"
        autocorrect="off"
        spellcheck="false"
        size="1"
        aria-label={reading.unit ? `${label}, ${reading.unit}` : label}
        aria-invalid={invalid || undefined}
        oninput={() => (invalid = false)}
        onkeydown={handleKey}
        onblur={handleBlur}
      />
      {#if reading.unit}
        <span class="unit" aria-hidden="true">{reading.unit}</span>
      {/if}
    </span>
  {:else}
    <button
      bind:this={box}
      type="button"
      class="box"
      aria-label={`${label}: ${text}`}
      title={t("common_type_value")}
      {disabled}
      onclick={begin}
    >
      {text}
    </button>
  {/if}
</span>

<style>
  /* The box, the field and a hidden copy of the widest reading share one
     cell, so the width holds while the value changes or is typed. */
  .typeable {
    display: inline-grid;
    min-width: var(--typeable-min-width, 3.5rem);
    font-size: var(--typeable-font-size, 0.875rem);
    font-variant-numeric: tabular-nums;
  }

  /* A phone zooms the whole page into a field whose text is under 16px. */
  @media (pointer: coarse) {
    .typeable {
      font-size: max(16px, var(--typeable-font-size, 0.875rem));
    }
  }

  .typeable > * {
    grid-area: 1 / 1;
  }

  .sizer,
  .box,
  .field {
    box-sizing: border-box;
    min-height: var(--min-touch-target, 44px);
    padding: 0 0.625rem;
    border: 1px solid transparent;
    border-radius: 0.5rem;
    white-space: nowrap;
  }

  .sizer {
    display: flex;
    align-items: center;
    visibility: hidden;
  }

  .box {
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0;
    border-color: var(--theme-stroke, #484755);
    color: var(--theme-text, #fff);
    background: var(--theme-card-bg, rgb(255 255 255 / 0.06));
    font: inherit;
    cursor: text;
    transition:
      border-color var(--transition-fast),
      background-color var(--transition-fast);
  }

  @media (hover: hover) {
    .box:hover:not(:disabled) {
      border-color: var(--theme-accent, #d4813a);
    }
  }

  .box:focus-visible {
    outline: 2px solid var(--theme-accent, currentColor);
    outline-offset: 2px;
  }

  .box:disabled {
    cursor: not-allowed;
  }

  .field {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    min-width: 0;
    border-color: var(--theme-accent, #d4813a);
    background: var(--theme-panel-bg, #111);
  }

  .field:focus-within {
    outline: 2px solid var(--theme-accent, currentColor);
    outline-offset: 2px;
  }

  .field.invalid {
    border-color: var(--semantic-error, #f87171);
  }

  .field.invalid:focus-within {
    outline-color: var(--semantic-error, #f87171);
  }

  input {
    flex: 1 1 auto;
    width: 100%;
    min-width: 0;
    margin: 0;
    padding: 0;
    border: 0;
    color: var(--theme-text, #fff);
    background: transparent;
    font: inherit;
    text-align: center;
  }

  input:focus {
    outline: none;
  }

  .unit {
    flex: none;
    color: var(--theme-text-secondary, #aaa);
  }

  @media (forced-colors: active) {
    .box,
    .field {
      border-color: ButtonText;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .box {
      transition: none;
    }
  }
</style>
