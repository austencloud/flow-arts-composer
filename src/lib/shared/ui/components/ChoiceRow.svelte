<!--
ChoiceRow.svelte - one setting as a row: its name, and a SegmentedControl of
every choice it has.

Rows line up into a form. Used by GenerationStylePanel (`rows` arrangement) and
Fuse's settings for new paths, so a setting looks the same in both.

`beside` puts the name left of the control; `above` puts it over the control.
A hint says what the current choice does. Every hint is stacked in one cell, so
the row is as tall as its longest one and a new choice moves nothing.

`swapKey` names the set of choices. When the set itself changes (the points of
another grid, the turns of another level) the control crosses over.
-->
<script lang="ts" generics="T extends string">
  import { Crossfade } from "#lib/shared/transitions/motion.js";
  import { DURATION } from "#lib/shared/transitions/transitions.js";
  import type { Snippet } from "svelte";
  import SegmentedControl from "./SegmentedControl.svelte";

  type Choice = {
    value: T;
    label: string;
    shortLabel?: string;
    ariaLabel?: string;
  };

  let {
    label,
    options,
    value,
    onchange,
    hint = "",
    hints = [],
    showHint = false,
    arrangement = "beside",
    phone = false,
    fitLabels = false,
    swapKey = "",
    optionContent,
    empty = "",
  }: {
    label: string;
    options: readonly Choice[];
    value: T;
    onchange: (value: T) => void;
    /** What the current choice does. */
    hint?: string;
    /** Every hint this row can show, which sizes it. */
    hints?: readonly string[];
    showHint?: boolean;
    arrangement?: "beside" | "above";
    /** The phone tap size (36px) instead of 44px. */
    phone?: boolean;
    /** Segments take their label's width instead of equal shares. */
    fitLabels?: boolean;
    swapKey?: string | number;
    optionContent?: Snippet<[T]>;
    /** Said in the control's place when there is nothing to choose. */
    empty?: string;
  } = $props();

  const uid = $props.id();
</script>

<div
  class="choice-row {arrangement}"
  class:roomy={showHint}
  class:fit-labels={fitLabels}
>
  <span class="choice-name" id="{uid}-name">{label}</span>
  {#if showHint}
    <span class="choice-hint">
      {#each hints.length > 0 ? hints : [hint] as line (line)}
        <span class="hint-layer" class:live={line === hint}>{line}</span>
      {/each}
    </span>
  {/if}
  <div class="choice-control">
    <Crossfade key={swapKey} duration={DURATION.fast}>
      {#if options.length > 0}
        <SegmentedControl
          options={[...options]}
          {value}
          {onchange}
          color="accent"
          size={phone ? "phone" : "md"}
          density={options.length > 3 ? "tight" : "compact"}
          semantics="radiogroup"
          ariaLabelledby="{uid}-name"
          {optionContent}
        />
      {:else}
        <p class="choice-empty" class:phone>{empty}</p>
      {/if}
    </Crossfade>
  </div>
</div>

<style>
  .choice-row {
    display: grid;
    align-content: center;
    align-items: center;
    min-width: 0;
  }

  .beside {
    grid-template-columns:
      var(--choice-name-column, 5rem)
      var(--choice-control-column, minmax(0, 1fr));
    grid-template-areas: "name control";
    column-gap: var(--choice-column-gap, 0.5rem);
  }

  .beside.roomy {
    grid-template-areas:
      "name control"
      "hint control";
    row-gap: 0.25rem;
  }

  .above {
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas:
      "name"
      "control";
    row-gap: 0.25rem;
  }

  .above.roomy {
    grid-template-areas:
      "name"
      "hint"
      "control";
  }

  .above.roomy .choice-hint {
    margin-bottom: 0.25rem;
  }

  .choice-name {
    grid-area: name;
    color: var(--theme-text, white);
    font-size: var(--font-size-sm, 0.875rem);
    font-weight: 600;
    line-height: 1.25;
  }

  .roomy .choice-name {
    font-size: var(--font-size-base, 1rem);
  }

  .beside.roomy .choice-name {
    align-self: end;
  }

  .choice-hint {
    grid-area: hint;
    display: grid;
    align-self: start;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
    font-size: var(--font-size-sm, 0.875rem);
    line-height: 1.4;
  }

  .hint-layer {
    grid-area: 1 / 1;
    visibility: hidden;
  }

  .hint-layer.live {
    visibility: visible;
  }

  .choice-control {
    grid-area: control;
    min-width: 0;
  }

  .choice-control :global(.segment) {
    font-variant-numeric: tabular-nums;
    font-weight: 600;
    white-space: nowrap;
  }

  .fit-labels .choice-control :global(.segment) {
    flex: 1 1 auto;
  }

  .roomy .choice-control :global(.segment) {
    min-height: 3.5rem;
  }

  .choice-control :global(.segment.selected) {
    color: var(--theme-text, white);
  }

  /* Holds the control's own height, so the row does not move when there is
     nothing to choose. */
  .choice-empty {
    display: flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    min-height: 3.25rem;
    margin: 0;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    border-radius: 8px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
    font-size: var(--font-size-sm, 0.875rem);
  }

  .choice-empty.phone {
    min-height: 42px;
  }

  .roomy .choice-empty {
    min-height: 4rem;
  }
</style>
